-- 0020_privacy.sql
-- Consent record, evidence retention, and "delete my data" (audit F8; DPDP Act 2023).
--
-- Evidence photos/videos show the inside or doorstep of people's homes. They are kept only
-- as long as disputes and fraud review need them (the retention window is set by the job
-- that calls media_due_for_purge — 90 days by default). Purging removes the storage
-- object but keeps the row's perceptual and content hashes, so duplicate detection still
-- works on old evidence without retaining the image.
--
-- forget_user anonymises a person: their identity links, display name, consent, device
-- rows, household membership and the locations on handovers they submitted are removed,
-- and their evidence is marked purged (the caller deletes the returned storage objects).
-- The household's credit ledger and handover outcomes stay, because they belong to the
-- household and are needed for redemption integrity and audit.

alter table public.users
  add column if not exists consent_version text,
  add column if not exists consent_at      timestamptz,
  add column if not exists deleted_at      timestamptz;

alter table public.handover_media
  add column if not exists purged_at timestamptz;

create index if not exists handover_media_purge_idx
  on public.handover_media (created_at)
  where purged_at is null;

-- ---------------------------------------------------------------------------------------
create or replace function public.record_consent(p_user uuid, p_version text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.users
     set consent_version = p_version, consent_at = now()
   where id = p_user;
$$;

-- ---------------------------------------------------------------------------------------
create or replace function public.media_due_for_purge(p_days integer, p_limit integer)
returns table (id uuid, storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.storage_path
  from public.handover_media m
  where m.purged_at is null
    and m.storage_path <> 'not-stored'
    and m.created_at < now() - make_interval(days => greatest(p_days, 1))
  order by m.created_at
  limit greatest(p_limit, 0);
$$;

create or replace function public.mark_media_purged(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.handover_media
     set purged_at = now()
   where id = any (p_ids) and purged_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

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

  -- Evidence this person submitted: hand back the object keys, mark the rows purged.
  select coalesce(array_agg(m.storage_path order by m.created_at), '{}')
    into v_paths
  from public.handover_media m
  join public.handovers h on h.id = m.handover_id
  where h.submitted_by = p_user and m.purged_at is null and m.storage_path <> 'not-stored';

  update public.handover_media m
     set purged_at = now()
    from public.handovers h
   where h.id = m.handover_id and h.submitted_by = p_user and m.purged_at is null;

  -- Where they stood when capturing is personal data; the outcome is the household's.
  update public.handovers
     set client_lat = null, client_lng = null, client_accuracy_m = null, device_id = null
   where submitted_by = p_user;

  -- Household membership: an owner's role passes to the longest-standing member.
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

-- ---------------------------------------------------------------------------------------
revoke all on function
  public.record_consent(uuid, text),
  public.media_due_for_purge(integer, integer),
  public.mark_media_purged(uuid[]),
  public.forget_user(uuid)
from public, anon, authenticated;

grant execute on function
  public.record_consent(uuid, text),
  public.media_due_for_purge(integer, integer),
  public.mark_media_purged(uuid[]),
  public.forget_user(uuid)
to service_role;
