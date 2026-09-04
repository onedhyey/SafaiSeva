-- 0016_officer_analytics.sql
-- Backing schema for the Ward Officer dashboard (audit G7, follows 0015_ward_officers).
--
-- The officer screen shows five things: a ward KPI header, the AI verification split,
-- sub-district participation, a karmachari override-audit table, and algorithmic anomaly
-- flags. Until now every one of those numbers came from the client seed (src/lib/seed.ts).
-- This migration gives each a real table so the officer API serves server data.
--
-- Demo-data note: the live project has 1 ward / 3 households / 1 worker, so pure runtime
-- aggregates would be degenerate (0% or 100%). Following the pattern of 0007_seed_reference
-- and 0015's demo officer, each table is seeded with an operator-style baseline row set
-- (an "imported AMC ward snapshot"). The officer views expose the seeded baseline AND a
-- live-computed column beside it; the API prefers the live value once it is non-zero, so
-- the screen stays meaningful today and becomes fully real as households are onboarded.
--
-- All tables are closed (RLS on, no anon/authenticated policy) — the service-role officer
-- API is the only reader, exactly like ward_officers / fraud_flags.

-- ---------------------------------------------------------------------------------------
-- 1. Sub-districts (micro-pockets inside a ward)
-- ---------------------------------------------------------------------------------------
create table if not exists public.sub_districts (
  id                    uuid primary key default gen_random_uuid(),
  ward_id               uuid not null references public.wards(id) on delete cascade,
  name                  text not null,
  baseline_households    integer not null default 0,
  baseline_participation numeric(5,2) not null default 0,   -- percent
  target_participation   numeric(5,2) not null default 75,  -- percent
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  unique (ward_id, name)
);
create index if not exists sub_districts_ward_id_idx on public.sub_districts(ward_id);
alter table public.sub_districts enable row level security;

-- Optional household -> sub-district assignment. Nullable: unassigned households simply
-- don't contribute to the live participation rollup yet.
alter table public.households
  add column if not exists sub_district_id uuid references public.sub_districts(id) on delete set null;
create index if not exists households_sub_district_id_idx on public.households(sub_district_id);

-- ---------------------------------------------------------------------------------------
-- 2. Ward KPI baseline (one row per ward)
-- ---------------------------------------------------------------------------------------
create table if not exists public.ward_officer_baseline (
  ward_id                 uuid primary key references public.wards(id) on delete cascade,
  households_enrolled     integer not null default 0,
  participation_this_week numeric(5,2) not null default 0,
  participation_last_week numeric(5,2) not null default 0,
  ai_approved_pct         numeric(5,2) not null default 0,
  ai_in_review_pct        numeric(5,2) not null default 0,
  ai_rejected_pct         numeric(5,2) not null default 0,
  credits_issued_baseline integer not null default 0,
  rupee_value_baseline    integer not null default 0,
  handover_records_baseline integer not null default 0,
  updated_at              timestamptz not null default now()
);
alter table public.ward_officer_baseline enable row level security;

-- ---------------------------------------------------------------------------------------
-- 3. Karmachari override-audit snapshot
-- Not FK'd to public.workers: the demo has one real worker, and in production this is an
-- imported roster snapshot (reviews + override counts) refreshed by a nightly job. The
-- one real worker's row is recomputed live in v_officer_worker_audit.
-- ---------------------------------------------------------------------------------------
create table if not exists public.officer_worker_audit (
  id            uuid primary key default gen_random_uuid(),
  ward_id       uuid not null references public.wards(id) on delete cascade,
  audit_ref     text not null,              -- e.g. KAR-109
  worker_id     uuid references public.workers(id) on delete set null,
  name          text not null,
  route         text not null,
  reviews_done  integer not null default 0,
  overrides     integer not null default 0,
  flagged       boolean not null default false,
  flag_reason   text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (ward_id, audit_ref)
);
create index if not exists officer_worker_audit_ward_id_idx on public.officer_worker_audit(ward_id);
alter table public.officer_worker_audit enable row level security;

-- ---------------------------------------------------------------------------------------
-- 4. Algorithmic anomaly flags surfaced to the officer
-- Seeded rows are curated case studies; v_officer_anomalies also folds in live
-- fraud_flags aggregates so genuinely flagged demo households appear.
-- ---------------------------------------------------------------------------------------
create table if not exists public.officer_anomaly (
  id                uuid primary key default gen_random_uuid(),
  ward_id           uuid not null references public.wards(id) on delete cascade,
  household_ref     text not null,          -- household code (may be outside the 3 demo rows)
  household_id      uuid references public.households(id) on delete set null,
  name              text not null,
  address           text not null,
  approval_rate     numeric(5,2) not null default 0,
  total_submissions integer not null default 0,
  flag_reason       text not null,
  severity          text not null default 'medium' check (severity in ('high','medium')),
  created_at        timestamptz not null default now(),
  unique (ward_id, household_ref)
);
create index if not exists officer_anomaly_ward_id_idx on public.officer_anomaly(ward_id);
alter table public.officer_anomaly enable row level security;

-- =====================================================================================
-- Views: baseline + live overlay. Officer API reads these, filtered by ward_id.
-- =====================================================================================

-- Ward KPI header + AI split. credits_issued_live counts ledger inflows recorded AFTER
-- the baseline snapshot, so seeded history isn't double counted.
create or replace view public.v_officer_dashboard as
select
  w.id                                as ward_id,
  w.name                              as ward_name,
  b.households_enrolled,
  b.participation_this_week,
  b.participation_last_week,
  b.ai_approved_pct,
  b.ai_in_review_pct,
  b.ai_rejected_pct,
  b.rupee_value_baseline,
  b.handover_records_baseline,
  b.credits_issued_baseline,
  b.credits_issued_baseline + coalesce((
    select sum(cl.amount)::int
    from public.credit_ledger cl
    join public.households hh on hh.id = cl.household_id
    where hh.ward_id = w.id
      and cl.entry_type in ('earn','milestone','adjustment')
      and cl.amount > 0
      and cl.effective_at > b.updated_at
  ), 0)                               as credits_issued_live,
  coalesce((select count(*) from public.handovers h
    join public.households hh on hh.id = h.household_id
    where hh.ward_id = w.id and h.status = 'verified'), 0) as handovers_verified_live,
  coalesce((select count(*) from public.handovers h
    join public.households hh on hh.id = h.household_id
    where hh.ward_id = w.id and h.status = 'in_review'), 0) as handovers_in_review_live,
  coalesce((select count(*) from public.handovers h
    join public.households hh on hh.id = h.household_id
    where hh.ward_id = w.id and h.status = 'rejected'), 0) as handovers_rejected_live
from public.wards w
left join public.ward_officer_baseline b on b.ward_id = w.id;

-- Sub-district participation. households_live / participation_live derived from actual
-- assignment + a verified handover in the trailing 7 days. `participation` applies the
-- override rule: live wins only once >= 10 households are actually assigned to the pocket,
-- otherwise the imported baseline stands.
create or replace view public.v_officer_subdistricts as
select
  sd.ward_id,
  sd.id                          as sub_district_id,
  sd.name,
  sd.sort_order,
  sd.baseline_households,
  sd.baseline_participation,
  sd.target_participation,
  coalesce(a.households_live, 0) as households_live,
  case when coalesce(a.households_live,0) = 0 then 0
       else round(100.0 * a.active_live / a.households_live, 1)
  end                           as participation_live,
  case when coalesce(a.households_live,0) >= 10
       then round(100.0 * a.active_live / a.households_live, 1)
       else sd.baseline_participation
  end                           as participation,
  case when coalesce(a.households_live,0) >= 10
       then a.households_live
       else sd.baseline_households
  end                           as households
from public.sub_districts sd
left join lateral (
  select
    count(distinct hh.id)                                              as households_live,
    count(distinct hh.id) filter (
      where exists (
        select 1 from public.handovers h
        where h.household_id = hh.id
          and h.status = 'verified'
          and h.collection_date >= (current_date - 7)
      )
    )                                                                  as active_live
  from public.households hh
  where hh.sub_district_id = sd.id
) a on true;

-- Karmachari override audit. The one demo worker (matched by worker_id) gets live
-- reviews_done / overrides recomputed from handovers they reviewed, but live only wins
-- once its review count has caught up to the imported snapshot — otherwise a worker who
-- has cleared 2 handovers in this environment would read as "2 reviews, 100% override".
create or replace view public.v_officer_worker_audit as
select
  wa.ward_id,
  wa.audit_ref,
  wa.name,
  wa.route,
  wa.sort_order,
  case when coalesce(live.reviews_done,0) >= wa.reviews_done and coalesce(live.reviews_done,0) > 0
       then live.reviews_done else wa.reviews_done end  as reviews_done,
  case when coalesce(live.reviews_done,0) >= wa.reviews_done and coalesce(live.reviews_done,0) > 0
       then live.overrides else wa.overrides end         as overrides,
  wa.flagged,
  wa.flag_reason
from public.officer_worker_audit wa
left join lateral (
  select
    count(*)                                                   as reviews_done,
    count(*) filter (where h.status = 'rejected')              as overrides
  from public.handovers h
  where wa.worker_id is not null
    and h.reviewed_by = (select user_id from public.workers wk where wk.id = wa.worker_id)
) live on wa.worker_id is not null;

-- Anomalies: curated seed rows + any live household with >= 2 fraud flags.
create or replace view public.v_officer_anomalies as
select
  oa.ward_id,
  oa.household_ref,
  oa.name,
  oa.address,
  oa.approval_rate,
  oa.total_submissions,
  oa.flag_reason,
  oa.severity
from public.officer_anomaly oa
union all
select
  hh.ward_id,
  hh.code::text                                        as household_ref,
  coalesce(hh.address, hh.code::text)                  as name,
  coalesce(hh.address, '')                             as address,
  0                                                   as approval_rate,
  count(*)::int                                        as total_submissions,
  'Live: ' || count(*)::text || ' fraud signals recorded ('
    || string_agg(distinct ff.signal, ', ') || ')'    as flag_reason,
  case when count(*) >= 4 then 'high' else 'medium' end as severity
from public.fraud_flags ff
join public.households hh on hh.id = ff.household_id
where not exists (
  select 1 from public.officer_anomaly oa2
  where oa2.household_id = hh.id
)
group by hh.ward_id, hh.code, hh.address
having count(*) >= 2;

-- =====================================================================================
-- Seed: Ward 12 - Navrangpura baseline (mirrors the retired src/lib/seed.ts wardStats)
-- =====================================================================================
do $$
declare w12 uuid;
begin
  select id into w12 from public.wards where code = 'W12-NAVRANGPURA';
  if w12 is null then
    raise notice 'W12-NAVRANGPURA not found; skipping officer analytics seed';
    return;
  end if;

  insert into public.ward_officer_baseline (
    ward_id, households_enrolled, participation_this_week, participation_last_week,
    ai_approved_pct, ai_in_review_pct, ai_rejected_pct,
    credits_issued_baseline, rupee_value_baseline, handover_records_baseline
  ) values (
    w12, 1840, 78.4, 72.1, 84.6, 10.2, 5.2, 3680, 18400, 3680
  ) on conflict (ward_id) do nothing;

  insert into public.sub_districts (ward_id, name, baseline_households, baseline_participation, target_participation, sort_order) values
    (w12, 'Navrangpura North',              420, 84.5, 75, 1),
    (w12, 'CG Road Commercial & Mixed',     380, 81.2, 75, 2),
    (w12, 'Mithakhali Six Roads',           310, 76.8, 75, 3),
    (w12, 'Stadium Ward / Swastik',         390, 74.3, 75, 4),
    (w12, 'Vijay Cross Roads Sector',       340, 68.9, 75, 5)
  on conflict (ward_id, name) do nothing;

  -- Assign the three demo households to plausible sub-districts.
  update public.households h set sub_district_id = sd.id
  from public.sub_districts sd
  where sd.ward_id = w12 and h.ward_id = w12
    and (
      (h.code::text = 'HH-NV-0482' and sd.name = 'CG Road Commercial & Mixed') or
      (h.code::text = 'HH-NV-0188' and sd.name = 'Mithakhali Six Roads') or
      (h.code::text = 'HH-NV-0245' and sd.name = 'Navrangpura North')
    )
    and h.sub_district_id is null;

  insert into public.officer_worker_audit (ward_id, audit_ref, worker_id, name, route, reviews_done, overrides, flagged, flag_reason, sort_order) values
    (w12, 'KAR-109', (select id from public.workers where worker_code = 'AMC-WZ-109'),
      'Ramesh Bhai (You)', 'Route W-12A (CG Road)', 18, 11, false, null, 1),
    (w12, 'KAR-204', null, 'Paresh Parmar',  'Route W-12B (Stadium)',   24, 14, false, null, 2),
    (w12, 'KAR-301', null, 'Suresh Rathod',  'Route W-12C (Mithakhali)', 32, 31, true,
      'High override rate (>95%) — review required', 3),
    (w12, 'KAR-412', null, 'Kanti Solanki',  'Route W-12D (Vijay XR)',   15, 5,  true,
      'Low override rate (<40%) — review required', 4)
  on conflict (ward_id, audit_ref) do nothing;

  insert into public.officer_anomaly (ward_id, household_ref, name, address, approval_rate, total_submissions, flag_reason, severity) values
    (w12, 'HH-NV-0199', 'Royal Orchid Tower Flat 901', 'Near Commerce Six Roads', 100, 31,
      '31 consecutive 100% approvals with identical timestamps (06:30:02 AM). Potential automated script or duplicate capture.', 'high'),
    (w12, 'HH-NV-0824', 'Ketan B. Shah', 'B-12 Paras Society, Stadium Road', 98, 28,
      'Submitted 4 handovers within 2 hours from differing GPS clusters on 24 Aug.', 'medium')
  on conflict (ward_id, household_ref) do nothing;
end $$;
