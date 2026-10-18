-- 0018_credit_decisions.sql
-- One transaction per credit-changing decision (audit F4 / F5 / F6 / F11).
--
-- Before this migration the API wrote a handover decision and its ledger row as separate
-- PostgREST calls: the earn row went in first, then the handover was marked verified. When
-- two same-day submissions raced, the loser hit handovers_one_verified_per_day *after* its
-- append-only earn row was already written — a credit for a rejected handover that nothing
-- could remove. Review approval and doorstep issuance had the same shape.
--
-- Each function below takes the same per-household advisory lock as redeem_ticket (0012),
-- re-checks every rule under that lock, and writes the handover + ledger (+ issuance /
-- milestone) rows together or not at all. Credit *amounts* still come from the API (the
-- adjudicator owns the rules); these functions own ordering, ownership, scope and limits.
--
-- Errors are raised with a stable snake_case message the API maps to an HTTP status:
--   handover_not_owned, handover_not_found, not_in_review, ward_scope, daily_limit,
--   worker_inactive, worker_unlinked, worker_cap, worker_location_required,
--   worker_too_far, household_not_found, too_few_streams, invalid_status.

-- ---------------------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------------------
create or replace function app.lock_household(p_household uuid)
returns void
language sql
as $$
  -- Same key as public.redeem_ticket, so redemption and earning serialize per household.
  select pg_advisory_xact_lock(hashtext(p_household::text));
$$;

create or replace function app.ist_today()
returns date
language sql
stable
as $$
  select (timezone('Asia/Kolkata', now()))::date;
$$;

create or replace function app.distance_m(
  lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- ---------------------------------------------------------------------------------------
-- record_handover_decision — the resident verify pipeline's final write
-- ---------------------------------------------------------------------------------------
create or replace function public.record_handover_decision(
  p_handover          uuid,
  p_household         uuid,
  p_status            text,
  p_confirmed_streams text[],
  p_credits           integer,
  p_rules_version     integer,
  p_reason_code       text,
  p_reason_text       text,
  p_hold_hours        integer,
  p_actor             uuid,
  p_ledger_reason     text,
  p_daily_limit_text  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_h      public.handovers;
  v_settle timestamptz;
begin
  if p_status not in ('verified', 'needs_video', 'in_review', 'rejected') then
    raise exception 'invalid_status' using errcode = 'check_violation';
  end if;

  perform app.lock_household(p_household);

  select * into v_h from public.handovers where id = p_handover for update;
  if not found or v_h.household_id <> p_household then
    raise exception 'handover_not_owned' using errcode = 'insufficient_privilege';
  end if;

  -- Already settled as verified (e.g. a replayed request): report, change nothing.
  if v_h.status = 'verified' then
    return jsonb_build_object(
      'status', v_h.status, 'credits_awarded', v_h.credits_awarded,
      'settle_at', v_h.settle_at, 'daily_limit', false, 'replay', true);
  end if;

  if p_status = 'verified' then
    if exists (
      select 1 from public.handovers o
      where o.household_id = p_household
        and o.collection_date = v_h.collection_date
        and o.status = 'verified'
        and o.id <> p_handover
    ) then
      update public.handovers
         set status = 'rejected', confirmed_streams = '{}', credits_awarded = 0,
             reward_rules_version = p_rules_version,
             decision_reason_code = 'DAILY_LIMIT_REACHED',
             decision_reason_text = p_daily_limit_text, settle_at = null
       where id = p_handover;
      return jsonb_build_object(
        'status', 'rejected', 'credits_awarded', 0, 'settle_at', null, 'daily_limit', true);
    end if;

    v_settle := now() + make_interval(hours => greatest(p_hold_hours, 0));
    update public.handovers
       set status = 'verified', confirmed_streams = coalesce(p_confirmed_streams, '{}'),
           credits_awarded = greatest(p_credits, 0), reward_rules_version = p_rules_version,
           decision_reason_code = p_reason_code, decision_reason_text = p_reason_text,
           settle_at = v_settle
     where id = p_handover;

    if p_credits > 0 then
      insert into public.credit_ledger
        (household_id, entry_type, amount, handover_id, reason, effective_at, created_by)
      values (p_household, 'earn', p_credits, p_handover, p_ledger_reason, v_settle, p_actor);
    end if;

    return jsonb_build_object(
      'status', 'verified', 'credits_awarded', greatest(p_credits, 0),
      'settle_at', v_settle, 'daily_limit', false);
  end if;

  update public.handovers
     set status = p_status, confirmed_streams = coalesce(p_confirmed_streams, '{}'),
         credits_awarded = 0, reward_rules_version = p_rules_version,
         decision_reason_code = p_reason_code, decision_reason_text = p_reason_text,
         settle_at = null
   where id = p_handover;

  return jsonb_build_object(
    'status', p_status, 'credits_awarded', 0, 'settle_at', null, 'daily_limit', false);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- decide_review — karmachari approve / reject of an in_review handover (ward-scoped)
-- ---------------------------------------------------------------------------------------
create or replace function public.decide_review(
  p_handover      uuid,
  p_worker        uuid,
  p_decision      text,
  p_per_stream    integer,
  p_cap           integer,
  p_hold_hours    integer,
  p_rules_version integer,
  p_reason_text   text,
  p_note          text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_w       public.workers;
  v_h       public.handovers;
  v_ward    uuid;
  v_streams text[];
  v_credits integer;
  v_settle  timestamptz;
begin
  select * into v_w from public.workers where id = p_worker and active;
  if not found then
    raise exception 'worker_inactive' using errcode = 'insufficient_privilege';
  end if;
  if v_w.user_id is null then
    raise exception 'worker_unlinked' using errcode = 'insufficient_privilege';
  end if;

  select * into v_h from public.handovers where id = p_handover;
  if not found then
    raise exception 'handover_not_found' using errcode = 'no_data_found';
  end if;

  perform app.lock_household(v_h.household_id);
  select * into v_h from public.handovers where id = p_handover for update;

  select ward_id into v_ward from public.households where id = v_h.household_id;
  if v_w.ward_id is null or v_ward is distinct from v_w.ward_id then
    raise exception 'ward_scope' using errcode = 'insufficient_privilege';
  end if;

  if v_h.status <> 'in_review' then
    raise exception 'not_in_review' using errcode = 'check_violation';
  end if;

  if p_decision = 'reject' then
    update public.handovers
       set status = 'rejected', credits_awarded = 0, settle_at = null,
           decision_reason_code = 'IN_REVIEW_CONFLICT', decision_reason_text = p_reason_text,
           reviewed_by = v_w.user_id, reviewed_at = now(), review_note = p_note
     where id = p_handover;
    return jsonb_build_object('status', 'rejected', 'credits_awarded', 0,
                              'household_id', v_h.household_id);
  elsif p_decision <> 'approve' then
    raise exception 'invalid_status' using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.handovers o
    where o.household_id = v_h.household_id
      and o.collection_date = v_h.collection_date
      and o.status = 'verified'
      and o.id <> p_handover
  ) then
    raise exception 'daily_limit' using errcode = 'unique_violation';
  end if;

  v_streams := case when cardinality(v_h.confirmed_streams) > 0
                    then v_h.confirmed_streams else v_h.declared_streams end;
  v_credits := least(cardinality(v_streams) * p_per_stream, p_cap);
  v_settle  := now() + make_interval(hours => greatest(p_hold_hours, 0));

  update public.handovers
     set status = 'verified', confirmed_streams = v_streams, credits_awarded = v_credits,
         reward_rules_version = coalesce(v_h.reward_rules_version, p_rules_version),
         decision_reason_code = 'OK_VERIFIED', decision_reason_text = p_reason_text,
         settle_at = v_settle, reviewed_by = v_w.user_id, reviewed_at = now(),
         review_note = p_note
   where id = p_handover;

  if v_credits > 0 then
    insert into public.credit_ledger
      (household_id, entry_type, amount, handover_id, reason, effective_at, created_by)
    values (v_h.household_id, 'earn', v_credits, p_handover,
            'Handover ' || v_h.collection_date || ': approved on review ('
              || array_to_string(v_streams, '+') || ')',
            v_settle, v_w.user_id);
  end if;

  return jsonb_build_object(
    'status', 'verified', 'credits_awarded', v_credits, 'settle_at', v_settle,
    'household_id', v_h.household_id);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- issue_doorstep — karmachari credits a no-smartphone household at the door
-- ---------------------------------------------------------------------------------------
create or replace function public.issue_doorstep(
  p_worker         uuid,
  p_household_code text,
  p_streams        text[],
  p_credits        integer,
  p_worker_lat     double precision,
  p_worker_lng     double precision,
  p_max_distance_m integer,
  p_reason_text    text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_w     public.workers;
  v_hh    public.households;
  v_today date := app.ist_today();
  v_h     uuid;
begin
  select * into v_w from public.workers where id = p_worker and active;
  if not found then
    raise exception 'worker_inactive' using errcode = 'insufficient_privilege';
  end if;
  if v_w.user_id is null then
    raise exception 'worker_unlinked' using errcode = 'insufficient_privilege';
  end if;
  if cardinality(p_streams) < 2 then
    raise exception 'too_few_streams' using errcode = 'check_violation';
  end if;

  -- households.code is citext; compare case-insensitively without naming the citext type
  -- (it lives in `extensions` on Supabase but `public` on a plain Postgres).
  select * into v_hh from public.households where lower(code::text) = lower(trim(p_household_code));
  if not found then
    raise exception 'household_not_found' using errcode = 'no_data_found';
  end if;
  if v_w.ward_id is null or v_hh.ward_id is distinct from v_w.ward_id then
    raise exception 'ward_scope' using errcode = 'insufficient_privilege';
  end if;

  if v_hh.latitude is not null and v_hh.longitude is not null then
    if p_worker_lat is null or p_worker_lng is null then
      raise exception 'worker_location_required' using errcode = 'check_violation';
    end if;
    if app.distance_m(p_worker_lat, p_worker_lng, v_hh.latitude, v_hh.longitude) > p_max_distance_m then
      raise exception 'worker_too_far' using errcode = 'check_violation';
    end if;
  end if;

  -- Worker lock first, then household: a fixed order, and no other function takes the
  -- worker lock, so this cannot deadlock against the household-only callers.
  perform pg_advisory_xact_lock(hashtext('worker:' || p_worker::text));
  perform app.lock_household(v_hh.id);

  if (select count(*) from public.worker_issuances
       where worker_id = p_worker and issued_date = v_today) >= v_w.daily_issue_cap then
    raise exception 'worker_cap' using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.handovers
    where household_id = v_hh.id and collection_date = v_today and status = 'verified'
  ) then
    raise exception 'daily_limit' using errcode = 'unique_violation';
  end if;

  insert into public.handovers
    (household_id, submitted_by, collection_date, attempt, media_kind, declared_streams,
     confirmed_streams, status, credits_awarded, decision_reason_code, decision_reason_text,
     reviewed_by, reviewed_at, client_lat, client_lng)
  values
    (v_hh.id, v_w.user_id, v_today, 1, 'photo', p_streams, p_streams, 'verified', p_credits,
     'OK_VERIFIED', p_reason_text, v_w.user_id, now(), p_worker_lat, p_worker_lng)
  returning id into v_h;

  insert into public.worker_issuances
    (worker_id, household_id, household_code, issued_date, streams, worker_lat, worker_lng,
     credits, handover_id)
  values
    (p_worker, v_hh.id, v_hh.code, v_today, p_streams, p_worker_lat, p_worker_lng,
     p_credits, v_h);

  if p_credits > 0 then
    -- Physically verified at the door → no settlement hold.
    insert into public.credit_ledger
      (household_id, entry_type, amount, handover_id, reason, effective_at, created_by)
    values (v_hh.id, 'earn', p_credits, v_h, 'Doorstep issuance by ' || v_w.worker_code,
            now(), v_w.user_id);
  end if;

  return jsonb_build_object(
    'handover_id', v_h, 'household_id', v_hh.id, 'household_code', v_hh.code,
    'credits_awarded', p_credits);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- award_bin_milestones — milestones unlock from verified evidence, not self-report (F6)
-- ---------------------------------------------------------------------------------------
-- A milestone is awarded once, when the household has (a) reported at least `bins`
-- separated bins and (b) at least `verified` verified handovers that each confirmed at
-- least `streams` streams. Credits go through the normal settlement hold. Requirements
-- can be overridden per rules version via reward_rules.rules->'milestone_requirements'.
create or replace function public.award_bin_milestones(
  p_household  uuid,
  p_actor      uuid,
  p_hold_hours integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rules    jsonb;
  v_reqs     jsonb;
  v_bins     smallint;
  v_awarded  jsonb := '[]'::jsonb;
  v_settle   timestamptz := now() + make_interval(hours => greatest(p_hold_hours, 0));
  m          record;
  v_credits  integer;
  v_count    integer;
  v_evidence uuid;
  v_inserted uuid;
begin
  perform app.lock_household(p_household);

  select bin_count into v_bins from public.households where id = p_household;
  if not found then
    raise exception 'household_not_found' using errcode = 'no_data_found';
  end if;

  select rules into v_rules from public.reward_rules where active;
  v_reqs := coalesce(v_rules -> 'milestone_requirements', jsonb_build_object(
    'two_bins',  jsonb_build_object('bins', 2, 'verified', 1, 'streams', 2),
    'four_bins', jsonb_build_object('bins', 4, 'verified', 3, 'streams', 3),
    'six_bins',  jsonb_build_object('bins', 6, 'verified', 7, 'streams', 4)));

  for m in
    select key as milestone, value as req
    from jsonb_each(v_reqs)
    order by (value ->> 'bins')::int
  loop
    continue when v_bins < (m.req ->> 'bins')::int;
    continue when exists (
      select 1 from public.bin_milestones
      where household_id = p_household and milestone = m.milestone);

    v_credits := coalesce((v_rules -> 'milestones' ->> m.milestone)::int, 0);
    continue when v_credits <= 0;

    select count(*), (array_agg(id order by created_at desc))[1]
      into v_count, v_evidence
    from public.handovers
    where household_id = p_household
      and status = 'verified'
      and cardinality(confirmed_streams) >= (m.req ->> 'streams')::int;
    continue when v_count < (m.req ->> 'verified')::int;

    insert into public.bin_milestones (household_id, milestone, evidence_handover_id, credits_awarded)
    values (p_household, m.milestone, v_evidence, v_credits)
    on conflict (household_id, milestone) do nothing
    returning id into v_inserted;
    continue when v_inserted is null;

    insert into public.credit_ledger
      (household_id, entry_type, amount, reason, effective_at, created_by)
    values (p_household, 'milestone', v_credits,
            initcap(replace(m.milestone, '_', '-')) || ' setup milestone (verified)',
            v_settle, p_actor);

    v_awarded := v_awarded || jsonb_build_object(
      'milestone', m.milestone, 'credits', v_credits, 'settle_at', v_settle);
  end loop;

  return v_awarded;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- v_ledger_reconciliation — must always be empty; alert when it is not
-- ---------------------------------------------------------------------------------------
create or replace view public.v_ledger_reconciliation as
select 'earn_on_unverified'::text as problem, l.household_id, l.handover_id,
       l.amount as ledger_amount, h.credits_awarded as handover_credits
from public.credit_ledger l
join public.handovers h on h.id = l.handover_id
where l.entry_type = 'earn' and h.status <> 'verified'
union all
select 'amount_mismatch', l.household_id, l.handover_id, l.amount, h.credits_awarded
from public.credit_ledger l
join public.handovers h on h.id = l.handover_id
where l.entry_type = 'earn' and h.status = 'verified' and l.amount <> h.credits_awarded
union all
select 'verified_without_earn', h.household_id, h.id, null, h.credits_awarded
from public.handovers h
where h.status = 'verified' and h.credits_awarded > 0
  and not exists (
    select 1 from public.credit_ledger l
    where l.handover_id = h.id and l.entry_type = 'earn');

alter view public.v_ledger_reconciliation set (security_invoker = true);

-- ---------------------------------------------------------------------------------------
-- v_review_queue gains ward_id so the API can scope the queue to the worker's ward (F11).
-- Same definition as 0005 with the column appended (create or replace may only append).
-- ---------------------------------------------------------------------------------------
create or replace view public.v_review_queue as
select
  hv.id                as handover_id,
  hv.household_id,
  hh.code              as household_code,
  hh.address,
  wa.name              as ward_name,
  hv.collection_date,
  hv.attempt,
  hv.declared_streams,
  hv.decision_reason_code,
  hv.decision_reason_text,
  hv.created_at,
  ve.overall_confidence,
  ve.recapture_likelihood,
  ve.per_stream,
  coalesce(
    (select array_agg(distinct ff.signal)
       from public.fraud_flags ff
      where ff.handover_id = hv.id),
    '{}'::text[]
  )                    as fraud_signals,
  hh.ward_id
from public.handovers hv
join public.households hh on hh.id = hv.household_id
join public.wards wa on wa.id = hh.ward_id
left join lateral (
  select * from public.verification_events e
  where e.handover_id = hv.id
  order by e.created_at desc
  limit 1
) ve on true
where hv.status = 'in_review'
order by hv.created_at asc;

alter view public.v_review_queue set (security_invoker = true);

-- ---------------------------------------------------------------------------------------
-- grants: service role only (the API). Never callable with the anon key.
-- ---------------------------------------------------------------------------------------
revoke all on function
  public.record_handover_decision(uuid, uuid, text, text[], integer, integer, text, text, integer, uuid, text, text),
  public.decide_review(uuid, uuid, text, integer, integer, integer, integer, text, text),
  public.issue_doorstep(uuid, text, text[], integer, double precision, double precision, integer, text),
  public.award_bin_milestones(uuid, uuid, integer)
from public, anon, authenticated;

grant execute on function
  public.record_handover_decision(uuid, uuid, text, text[], integer, integer, text, text, integer, uuid, text, text),
  public.decide_review(uuid, uuid, text, integer, integer, integer, integer, text, text),
  public.issue_doorstep(uuid, text, text[], integer, double precision, double precision, integer, text),
  public.award_bin_milestones(uuid, uuid, integer)
to service_role;

revoke all on public.v_ledger_reconciliation from anon, authenticated;
