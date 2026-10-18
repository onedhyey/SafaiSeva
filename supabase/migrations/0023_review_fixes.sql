-- 0023_review_fixes.sql
-- Fixes from the code review of the hardening branch (findings #2 #4 #6 #7 #8 #9).

-- ---------------------------------------------------------------------------------------
-- #2  A handover whose award an officer reversed is final: it can never be verified again
--     (by a resident retry, a dispute + review, or anything else). One trigger covers all.
-- ---------------------------------------------------------------------------------------
create or replace function app.deny_reverify_reversed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'verified' and old.status is distinct from 'verified' and exists (
    select 1 from public.credit_ledger where handover_id = new.id and entry_type = 'reversal'
  ) then
    raise exception 'already_reversed' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_handovers_no_reverify on public.handovers;
create trigger trg_handovers_no_reverify
  before update of status on public.handovers
  for each row execute function app.deny_reverify_reversed();

-- ---------------------------------------------------------------------------------------
-- #4  Approving a request whose user has since joined another household closes it as
--     'cancelled' (a raise used to roll the cancellation back, leaving it pending forever).
-- ---------------------------------------------------------------------------------------
create or replace function public.decide_household_join(
  p_request uuid,
  p_owner   uuid,
  p_approve boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.household_join_requests;
begin
  select * into v_r from public.household_join_requests where id = p_request for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'no_data_found';
  end if;
  perform app.require_owner(v_r.household_id, p_owner);
  if v_r.status <> 'pending' then
    raise exception 'request_closed' using errcode = 'check_violation';
  end if;

  if p_approve then
    perform pg_advisory_xact_lock(hashtext('user:' || v_r.user_id::text));
    if exists (select 1 from public.household_members where user_id = v_r.user_id) then
      update public.household_join_requests
         set status = 'cancelled', decided_at = now(), decided_by = p_owner
       where id = p_request;
      return jsonb_build_object('status', 'cancelled', 'reason', 'already_member',
                                'user_id', v_r.user_id);
    end if;
    insert into public.household_members (household_id, user_id, member_role)
    values (v_r.household_id, v_r.user_id, 'member');
  end if;

  update public.household_join_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_at = now(), decided_by = p_owner
   where id = p_request;

  return jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end,
                            'user_id', v_r.user_id);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- #6  The leaderboard nets reversals against what was earned.
-- ---------------------------------------------------------------------------------------
create or replace view public.v_ward_leaderboard_live as
with recent as (
  select h.ward_id, h.id as household_id, sum(l.amount)::int as credits_30d
  from public.households h
  join public.credit_ledger l on l.household_id = h.id
  where l.entry_type in ('earn', 'milestone', 'reversal')
    and l.effective_at <= now()
    and l.effective_at > now() - interval '30 days'
  group by h.ward_id, h.id
)
select
  ward_id,
  household_id,
  credits_30d,
  rank() over (partition by ward_id order by credits_30d desc) as rank
from recent
where credits_30d > 0;

alter view public.v_ward_leaderboard_live set (security_invoker = true);

-- ---------------------------------------------------------------------------------------
-- #7  Erasure no longer marks evidence purged before the storage objects are gone. Media of
--     deleted users is due for purge immediately, and stays due until the purge job marks
--     it after a confirmed storage removal.
-- ---------------------------------------------------------------------------------------
create or replace function public.forget_user(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paths text[];
  v_m     record;
  v_heir  uuid;
begin
  perform pg_advisory_xact_lock(hashtext('user:' || p_user::text));

  select coalesce(array_agg(m.storage_path order by m.created_at), '{}')
    into v_paths
  from public.handover_media m
  join public.handovers h on h.id = m.handover_id
  where h.submitted_by = p_user and m.purged_at is null and m.storage_path <> 'not-stored';

  update public.handovers
     set client_lat = null, client_lng = null, client_accuracy_m = null, device_id = null
   where submitted_by = p_user;

  for v_m in
    select household_id, member_role from public.household_members where user_id = p_user
  loop
    if v_m.member_role = 'owner' then
      select user_id into v_heir
      from public.household_members
      where household_id = v_m.household_id and user_id <> p_user
      order by created_at
      limit 1;
      if v_heir is not null then
        update public.household_members
           set member_role = 'owner'
         where household_id = v_m.household_id and user_id = v_heir;
      end if;
    end if;
  end loop;
  delete from public.household_members where user_id = p_user;

  update public.household_join_requests
     set status = 'cancelled', decided_at = now()
   where user_id = p_user and status = 'pending';

  update public.workers set user_id = null, active = false where user_id = p_user;
  update public.ward_officers set user_id = null, active = false where user_id = p_user;

  delete from public.devices where user_id = p_user;

  update public.users
     set clerk_user_id   = null,
         device_id       = 'deleted:' || id::text,
         display_name    = 'Deleted user',
         consent_version = null,
         consent_at      = null,
         deleted_at      = now()
   where id = p_user;

  return jsonb_build_object('storage_paths', to_jsonb(v_paths));
end;
$$;

create or replace function public.media_due_for_purge(p_days integer, p_limit integer)
returns table (id uuid, storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.storage_path
  from public.handover_media m
  join public.handovers h on h.id = m.handover_id
  left join public.users u on u.id = h.submitted_by
  where m.purged_at is null
    and m.storage_path <> 'not-stored'
    and (m.created_at < now() - make_interval(days => greatest(p_days, 1))
         or u.deleted_at is not null)
  order by (u.deleted_at is not null) desc, m.created_at
  limit greatest(p_limit, 0);
$$;

-- ---------------------------------------------------------------------------------------
-- #8  Near-duplicate search on a precomputed 64-bit column, bounded to recent evidence.
--     Exact resubmits (content_hash, indexed) are still checked over all history.
-- ---------------------------------------------------------------------------------------
alter table public.handover_media
  add column if not exists phash_bits bit(64)
  generated always as (
    case when phash ~ '^[0-9a-f]{16}$' then ('x' || phash)::bit(64) end
  ) stored;

create index if not exists handover_media_created_idx on public.handover_media (created_at);

create or replace function public.media_duplicate_signals(
  p_household        uuid,
  p_phash            text,
  p_content_hash     text,
  p_max_distance     integer,
  p_exclude_handover uuid default null
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bits bit(64);
  v_since timestamptz := now() - interval '180 days';
begin
  if p_content_hash is not null and exists (
    select 1 from public.handover_media m
    where m.content_hash = p_content_hash
      and m.handover_id is distinct from p_exclude_handover
  ) then
    return array['duplicate_phash'];
  end if;

  if p_phash is null or p_phash !~ '^[0-9a-f]{16}$' then
    return '{}';
  end if;
  v_bits := ('x' || p_phash)::bit(64);

  if exists (
    select 1
    from public.handover_media m
    join public.handovers h on h.id = m.handover_id
    where m.created_at > v_since
      and m.phash_bits is not null
      and h.household_id <> p_household
      and bit_count(m.phash_bits # v_bits) <= p_max_distance
  ) then
    return array['duplicate_phash'];
  end if;

  if exists (
    select 1
    from public.handover_media m
    join public.handovers h on h.id = m.handover_id
    where m.created_at > v_since
      and m.phash_bits is not null
      and h.household_id = p_household
      and m.handover_id is distinct from p_exclude_handover
      and bit_count(m.phash_bits # v_bits) <= p_max_distance
  ) then
    return array['similar_own'];
  end if;

  return '{}';
end;
$$;

-- ---------------------------------------------------------------------------------------
-- #9  Milestones follow their evidence: a reversal that leaves a milestone unsupported
--     reverses that milestone too; it can be re-earned later.
-- ---------------------------------------------------------------------------------------
alter table public.bin_milestones
  add column if not exists reversed_at timestamptz;

create or replace function app.milestone_requirements()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select rules -> 'milestone_requirements' from public.reward_rules where active),
    jsonb_build_object(
      'two_bins',  jsonb_build_object('bins', 2, 'verified', 1, 'streams', 2),
      'four_bins', jsonb_build_object('bins', 4, 'verified', 3, 'streams', 3),
      'six_bins',  jsonb_build_object('bins', 6, 'verified', 7, 'streams', 4)));
$$;

create or replace function app.milestone_supported(p_household uuid, p_req jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.handovers
          where household_id = p_household
            and status = 'verified'
            and cardinality(confirmed_streams) >= (p_req ->> 'streams')::int)
         >= (p_req ->> 'verified')::int;
$$;

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
  v_bins     smallint;
  v_awarded  jsonb := '[]'::jsonb;
  v_settle   timestamptz := now() + make_interval(hours => greatest(p_hold_hours, 0));
  m          record;
  v_credits  integer;
  v_evidence uuid;
  v_id       uuid;
begin
  perform app.lock_household(p_household);

  select bin_count into v_bins from public.households where id = p_household;
  if not found then
    raise exception 'household_not_found' using errcode = 'no_data_found';
  end if;
  select rules into v_rules from public.reward_rules where active;

  for m in
    select key as milestone, value as req
    from jsonb_each(app.milestone_requirements())
    order by (value ->> 'bins')::int
  loop
    continue when v_bins < (m.req ->> 'bins')::int;
    continue when exists (
      select 1 from public.bin_milestones
      where household_id = p_household and milestone = m.milestone and reversed_at is null);
    v_credits := coalesce((v_rules -> 'milestones' ->> m.milestone)::int, 0);
    continue when v_credits <= 0;
    continue when not app.milestone_supported(p_household, m.req);

    select id into v_evidence from public.handovers
    where household_id = p_household and status = 'verified'
      and cardinality(confirmed_streams) >= (m.req ->> 'streams')::int
    order by created_at desc limit 1;

    v_id := null;
    insert into public.bin_milestones (household_id, milestone, evidence_handover_id, credits_awarded)
    values (p_household, m.milestone, v_evidence, v_credits)
    on conflict (household_id, milestone) do update
      set reversed_at = null, reached_at = now(),
          evidence_handover_id = excluded.evidence_handover_id,
          credits_awarded = excluded.credits_awarded
      where public.bin_milestones.reversed_at is not null
    returning id into v_id;
    continue when v_id is null;

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

create or replace function app.clawback_milestones(p_household uuid, p_actor uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  m        record;
  v_reqs   jsonb := app.milestone_requirements();
  v_total  integer := 0;
begin
  for m in
    select id, milestone, credits_awarded from public.bin_milestones
    where household_id = p_household and reversed_at is null
  loop
    continue when v_reqs -> m.milestone is null;
    continue when app.milestone_supported(p_household, v_reqs -> m.milestone);
    if m.credits_awarded > 0 then
      insert into public.credit_ledger
        (household_id, entry_type, amount, reason, effective_at, created_by)
      values (p_household, 'reversal', -m.credits_awarded,
              initcap(replace(m.milestone, '_', '-')) || ' milestone reversed: ' || left(p_reason, 150),
              now(), p_actor);
      v_total := v_total + m.credits_awarded;
    end if;
    update public.bin_milestones set reversed_at = now() where id = m.id;
  end loop;
  return v_total;
end;
$$;

create or replace function public.reverse_handover_credit(
  p_handover uuid,
  p_officer  uuid,
  p_reason   text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_h        public.handovers;
  v_earned   integer;
  v_at       timestamptz;
  v_actor    uuid;
  v_clawback integer;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = 'check_violation';
  end if;

  select * into v_h from public.handovers where id = p_handover;
  if not found then
    raise exception 'handover_not_found' using errcode = 'no_data_found';
  end if;
  perform app.require_officer_for_household(p_officer, v_h.household_id);
  perform app.lock_household(v_h.household_id);
  select * into v_h from public.handovers where id = p_handover for update;

  if exists (select 1 from public.credit_ledger
             where handover_id = p_handover and entry_type = 'reversal') then
    raise exception 'already_reversed' using errcode = 'unique_violation';
  end if;
  if v_h.status <> 'verified' then
    raise exception 'not_reversible' using errcode = 'check_violation';
  end if;

  select user_id into v_actor from public.ward_officers where id = p_officer;
  select coalesce(sum(amount), 0), max(effective_at) into v_earned, v_at
  from public.credit_ledger where handover_id = p_handover and entry_type = 'earn';

  if v_earned > 0 then
    insert into public.credit_ledger
      (household_id, entry_type, amount, handover_id, reason, effective_at, created_by)
    values (v_h.household_id, 'reversal', -v_earned, p_handover,
            'Reversed by ward officer: ' || left(trim(p_reason), 200),
            greatest(now(), v_at), v_actor);
  end if;

  update public.handovers
     set status = 'rejected', credits_awarded = 0, settle_at = null,
         decision_reason_code = 'REVERSED_BY_OFFICER',
         decision_reason_text = 'Reversed after review: ' || left(trim(p_reason), 200)
   where id = p_handover;

  v_clawback := app.clawback_milestones(v_h.household_id, v_actor, trim(p_reason));

  insert into public.moderation_actions (officer_id, action, target_id, reason, detail)
  values (p_officer, 'reverse_credit', p_handover, trim(p_reason),
          jsonb_build_object('household_id', v_h.household_id, 'amount', v_earned,
                             'milestones_reversed', v_clawback));

  return jsonb_build_object('reversed', v_earned, 'milestones_reversed', v_clawback,
                            'household_id', v_h.household_id);
end;
$$;

revoke all on function app.clawback_milestones(uuid, uuid, text) from public, anon, authenticated;
