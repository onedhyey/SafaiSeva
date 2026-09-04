-- 0017_ward_leaderboard.sql
-- Backing schema for the resident-facing ward leaderboard (audit F1 / T3.3). Follows the
-- same pattern as 0016_officer_analytics: a seeded operator-style baseline row set plus a
-- view that overlays live per-household settled balances, so the demo stays coherent with
-- 3 households and becomes fully real as the ward onboards.
--
-- The leaderboard "credits" figure is a household's SETTLED balance (v_household_balance),
-- the same number the wallet shows — not lifetime earned.
--
-- Closed to anon/authenticated like ward_officers / officer_* — the service-role API is
-- the only reader (the endpoint anonymises before returning to the browser).

create table if not exists public.ward_leaderboard_baseline (
  id               uuid primary key default gen_random_uuid(),
  ward_id          uuid not null references public.wards(id) on delete cascade,
  household_ref    text not null,           -- household code, e.g. HH-NV-0112
  household_id     uuid references public.households(id) on delete set null,
  society          text not null,
  streak           integer not null default 0,
  baseline_credits integer not null default 0,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  unique (ward_id, household_ref)
);
create index if not exists ward_leaderboard_baseline_ward_id_idx
  on public.ward_leaderboard_baseline(ward_id);
alter table public.ward_leaderboard_baseline enable row level security;

-- Baseline rows, overlaid with the live settled balance for households that actually
-- exist. `credits` is the greater of the two, so a real household that has out-earned its
-- imported figure rises; unlisted real households in the ward with a positive balance are
-- appended after the baseline block.
create or replace view public.v_ward_leaderboard as
with live as (
  select
    h.id,
    h.code::text                          as code,
    h.ward_id,
    coalesce(h.address, h.code::text)     as address,
    coalesce(b.settled_balance, 0)::int   as settled
  from public.households h
  left join public.v_household_balance b on b.household_id = h.id
)
select
  base.ward_id,
  base.household_ref,
  base.society,
  base.streak,
  greatest(base.baseline_credits, coalesce(live.settled, 0)) as credits,
  base.sort_order
from public.ward_leaderboard_baseline base
left join live on live.code = base.household_ref
union all
select
  live.ward_id,
  live.code                              as household_ref,
  live.address                          as society,
  0                                     as streak,
  live.settled                          as credits,
  1000 + (row_number() over (order by live.settled desc))::int as sort_order
from live
where live.settled > 0
  and not exists (
    select 1 from public.ward_leaderboard_baseline b2
    where b2.household_ref = live.code
  );

-- Seed: Ward 12 - Navrangpura (mirrors the retired src/lib/seed.ts wardStats.leaderboard)
do $$
declare w12 uuid;
begin
  select id into w12 from public.wards where code = 'W12-NAVRANGPURA';
  if w12 is null then
    raise notice 'W12-NAVRANGPURA not found; skipping ward leaderboard seed';
    return;
  end if;

  insert into public.ward_leaderboard_baseline
    (ward_id, household_ref, society, streak, baseline_credits, sort_order)
  values
    (w12, 'HH-NV-0112', 'Shivalik Heights, CG Road',   28, 56, 1),
    (w12, 'HH-NV-0892', 'Prerna Vihar, Mithakhali',     26, 52, 2),
    (w12, 'HH-NV-0341', 'Goyal Terraces, Stadium Rd',   21, 42, 3),
    (w12, 'HH-NV-0921', 'Swastik Enclave, CG Road',     12, 31, 4),
    (w12, 'HH-NV-0482', 'Shivam Apts, Navrangpura',      9, 23, 5),
    (w12, 'HH-NV-0238', 'Arunodaya Society, Alkapuri',   8, 19, 6),
    (w12, 'HH-NV-0519', 'Panchamrut Flats, Stadium',     6, 14, 7),
    (w12, 'HH-NV-0740', 'Vandana Apts, Mithakhali',      5, 10, 8)
  on conflict (ward_id, household_ref) do nothing;

  -- Link the one baseline row that is a real household, so future joins can use the FK.
  update public.ward_leaderboard_baseline lb
     set household_id = h.id
    from public.households h
   where lb.ward_id = w12 and h.code::text = lb.household_ref and lb.household_id is null;
end $$;
