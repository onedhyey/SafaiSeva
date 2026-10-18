-- 0019_households_invites_dedupe.sql
-- Household onboarding, owner-approved joining, duplicate-evidence detection and a
-- leaderboard that identifies no one (audit F3 / F12 / F15).
--
-- F3: the household code was printed on the leaderboard AND accepted as a join code, so
--     anyone could join a top household and spend its balance. Joining now takes a
--     separate expiring invite token that only the owner can mint, and the owner approves
--     each request. The code stays a public, non-secret identifier.
-- F12: near-duplicate detection scanned only the latest 800 hashes in Node and treated the
--     same household photographing the same bins on another day as a duplicate (a block).
--     It now runs in SQL over all retained hashes: cross-household near-dups and exact
--     byte resubmissions block; a household's own similar photo is informational only.
-- F15: the leaderboard ranked by settled balance (spending lowered your rank) and returned
--     household codes and addresses. The live view ranks by credits earned in the last
--     30 days and carries no identifying columns.

-- ---------------------------------------------------------------------------------------
-- one household per account
-- ---------------------------------------------------------------------------------------
-- Every user belongs to at most one household; the API already assumed this
-- (householdForUser takes the first row). If this fails on an existing database, a user
-- is linked to two households — resolve that row by hand before re-running.
create unique index if not exists household_members_one_per_user
  on public.household_members (user_id);

-- ---------------------------------------------------------------------------------------
-- create_household — atomic create + owner membership
-- ---------------------------------------------------------------------------------------
create or replace function public.create_household(
  p_user      uuid,
  p_ward_code text,
  p_address   text,
  p_lat       double precision,
  p_lng       double precision
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ward    uuid;
  v_id      uuid;
  v_code    text;
  v_nearby  text;
  v_alpha   constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i         int;
begin
  perform pg_advisory_xact_lock(hashtext('user:' || p_user::text));

  if exists (select 1 from public.household_members where user_id = p_user) then
    raise exception 'already_member' using errcode = 'unique_violation';
  end if;

  select id into v_ward from public.wards where lower(code::text) = lower(p_ward_code);
  if v_ward is null then
    raise exception 'ward_not_found' using errcode = 'no_data_found';
  end if;

  -- Non-blocking hint: an existing household within ~25 m (bbox prefilter, then distance).
  if p_lat is not null and p_lng is not null then
    select h.code::text into v_nearby
    from public.households h
    where h.latitude between p_lat - 0.0005 and p_lat + 0.0005
      and h.longitude between p_lng - 0.0005 and p_lng + 0.0005
      and app.distance_m(p_lat, p_lng, h.latitude, h.longitude) <= 25
    limit 1;
  end if;

  for attempt in 1..8 loop
    v_code := 'HH-U-';
    for i in 1..6 loop
      v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1);
    end loop;
    insert into public.households
      (code, address, ward_id, latitude, longitude, bin_count, bin_target)
    values
      (v_code, coalesce(nullif(trim(p_address), ''), 'Address pending'), v_ward, p_lat, p_lng, 1, 6)
    on conflict (code) do nothing
    returning id into v_id;
    exit when v_id is not null;
  end loop;
  if v_id is null then
    raise exception 'code_exhausted';
  end if;

  insert into public.household_members (household_id, user_id, member_role)
  values (v_id, p_user, 'owner');

  return jsonb_build_object('household_id', v_id, 'code', v_code, 'nearby_existing', v_nearby);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- invites + join requests
-- ---------------------------------------------------------------------------------------
create table if not exists public.household_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  token        text not null unique,
  created_by   uuid not null references public.users(id),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);
create index if not exists household_invites_household_idx on public.household_invites(household_id);

create table if not exists public.household_join_requests (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  invite_id    uuid references public.household_invites(id) on delete set null,
  status       text not null default 'pending',
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references public.users(id),
  constraint household_join_requests_status_valid
    check (status in ('pending', 'approved', 'rejected', 'cancelled'))
);
create unique index if not exists household_join_requests_one_pending
  on public.household_join_requests (household_id, user_id) where status = 'pending';
create index if not exists household_join_requests_household_idx
  on public.household_join_requests (household_id, status);

-- Closed to anon/authenticated: only the service-role API reads or writes these.
alter table public.household_invites enable row level security;
alter table public.household_join_requests enable row level security;

create or replace function app.require_owner(p_household uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.household_members
    where household_id = p_household and user_id = p_user and member_role = 'owner'
  ) then
    raise exception 'not_owner' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.create_household_invite(
  p_household uuid,
  p_owner     uuid,
  p_ttl_hours integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hex   text;
  v_token text;
  v_exp   timestamptz := now() + make_interval(hours => greatest(least(p_ttl_hours, 168), 1));
begin
  perform app.require_owner(p_household, p_owner);
  -- 48 random bits from a v4 UUID (gen_random_uuid uses a CSPRNG), shown as XXXX-XXXX-XXXX.
  v_hex := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_token := substr(v_hex, 1, 4) || '-' || substr(v_hex, 5, 4) || '-' || substr(v_hex, 9, 4);
  insert into public.household_invites (household_id, token, created_by, expires_at)
  values (p_household, v_token, p_owner, v_exp);
  return jsonb_build_object('token', v_token, 'expires_at', v_exp);
end;
$$;

create or replace function public.request_household_join(
  p_token text,
  p_user  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.household_invites;
  v_req uuid;
begin
  select * into v_inv
  from public.household_invites
  where token = upper(trim(p_token)) and revoked_at is null and expires_at > now();
  if not found then
    raise exception 'invite_invalid' using errcode = 'no_data_found';
  end if;

  if exists (select 1 from public.household_members where user_id = p_user) then
    raise exception 'already_member' using errcode = 'unique_violation';
  end if;

  select id into v_req from public.household_join_requests
  where household_id = v_inv.household_id and user_id = p_user and status = 'pending';
  if v_req is null then
    insert into public.household_join_requests (household_id, user_id, invite_id)
    values (v_inv.household_id, p_user, v_inv.id)
    returning id into v_req;
  end if;

  return jsonb_build_object('request_id', v_req, 'status', 'pending',
                            'household_id', v_inv.household_id);
end;
$$;

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
      raise exception 'already_member' using errcode = 'unique_violation';
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
-- media_duplicate_signals — near-duplicate / resubmitted evidence over all retained hashes
-- ---------------------------------------------------------------------------------------
create or replace function app.hamming64(a text, b text)
returns integer
language sql
immutable
as $$
  select bit_count(('x' || a)::bit(64) # ('x' || b)::bit(64))::int;
$$;

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
  v_valid boolean := coalesce(p_phash ~ '^[0-9a-f]{16}$', false);
begin
  -- Exact bytes seen before (any household, any day): a literal resubmission.
  if p_content_hash is not null and exists (
    select 1 from public.handover_media m
    where m.content_hash = p_content_hash
      and m.handover_id is distinct from p_exclude_handover
  ) then
    return array['duplicate_phash'];
  end if;

  if not v_valid then
    return '{}';
  end if;

  -- The same scene submitted by a different household: a shared or downloaded photo.
  if exists (
    select 1
    from public.handover_media m
    join public.handovers h on h.id = m.handover_id
    where m.phash ~ '^[0-9a-f]{16}$'
      and h.household_id <> p_household
      and app.hamming64(m.phash, p_phash) <= p_max_distance
  ) then
    return array['duplicate_phash'];
  end if;

  -- The household's own bins look alike from day to day; record it, don't block on it.
  if exists (
    select 1
    from public.handover_media m
    join public.handovers h on h.id = m.handover_id
    where m.phash ~ '^[0-9a-f]{16}$'
      and h.household_id = p_household
      and m.handover_id is distinct from p_exclude_handover
      and app.hamming64(m.phash, p_phash) <= p_max_distance
  ) then
    return array['similar_own'];
  end if;

  return '{}';
end;
$$;

-- ---------------------------------------------------------------------------------------
-- v_ward_leaderboard_live — recent earnings per household, nothing identifying
-- ---------------------------------------------------------------------------------------
create or replace view public.v_ward_leaderboard_live as
with recent as (
  select h.ward_id, h.id as household_id, sum(l.amount)::int as credits_30d
  from public.households h
  join public.credit_ledger l on l.household_id = h.id
  where l.entry_type in ('earn', 'milestone')
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
revoke all on public.v_ward_leaderboard_live from anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------------------
revoke all on function
  public.create_household(uuid, text, text, double precision, double precision),
  public.create_household_invite(uuid, uuid, integer),
  public.request_household_join(text, uuid),
  public.decide_household_join(uuid, uuid, boolean),
  public.media_duplicate_signals(uuid, text, text, integer, uuid)
from public, anon, authenticated;

grant execute on function
  public.create_household(uuid, text, text, double precision, double precision),
  public.create_household_invite(uuid, uuid, integer),
  public.request_household_join(text, uuid),
  public.decide_household_join(uuid, uuid, boolean),
  public.media_duplicate_signals(uuid, text, text, integer, uuid)
to service_role;
