-- 0002_core.sql
-- Principals, devices, and the civic domain: wards, households, membership, workers.
--
-- Identity design (audit I4 / B1): every actor is a row in `users`. A user is identified
-- by a Clerk id, a device id, or both. Nothing else in the schema references Clerk or a
-- device directly, so turning authentication on later is a matter of populating
-- users.clerk_user_id and linking — never a migration of the tables below.

-- ---------------------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------------------
create table if not exists public.users (
  id             uuid primary key default gen_random_uuid(),
  clerk_user_id  text unique,
  device_id      text unique,
  display_name   text not null default 'Resident',
  is_service     boolean not null default false,   -- internal/system actors
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint users_has_identity
    check (clerk_user_id is not null or device_id is not null or is_service)
);

comment on table public.users is
  'One row per actor. Identified by clerk_user_id and/or device_id; both may coexist after an anonymous session is linked to a Clerk account.';

-- ---------------------------------------------------------------------------------------
-- devices  (a user may use several; anonymous demo creates one user per device)
-- ---------------------------------------------------------------------------------------
create table if not exists public.devices (
  id          uuid primary key default gen_random_uuid(),
  device_id   text unique not null,
  user_id     uuid not null references public.users(id) on delete cascade,
  user_agent  text,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

create index if not exists devices_user_id_idx on public.devices(user_id);

-- ---------------------------------------------------------------------------------------
-- wards  (interim geofence source until AMC provides real polygons — audit G1)
-- ---------------------------------------------------------------------------------------
create table if not exists public.wards (
  id           uuid primary key default gen_random_uuid(),
  code         citext unique not null,
  name         text not null,
  city         text not null default 'Ahmedabad',
  -- Coarse bounding box, used as the interim geofence.
  min_lat      double precision not null,
  max_lat      double precision not null,
  min_lng      double precision not null,
  max_lng      double precision not null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------
-- households
-- ---------------------------------------------------------------------------------------
create table if not exists public.households (
  id                    uuid primary key default gen_random_uuid(),
  code                  citext unique not null,        -- e.g. HH-NV-0482 (AMC QR / bin id)
  address               text not null,
  ward_id               uuid not null references public.wards(id),

  -- Authoritative per-household geofence polygon (GeoJSON-style [[lng,lat], ...]).
  -- NULL until AMC supplies it (G1); the ward bbox is used meanwhile.
  geofence_polygon      jsonb,

  -- Collection window in local (Asia/Kolkata) hours [start, end).
  -- Placeholder values until real route schedules exist (G4).
  collection_start_hour smallint not null default 6,
  collection_end_hour   smallint not null default 12,

  -- Behaviour-change tracking (audit P1).
  bin_count             smallint not null default 1,   -- self-reported at onboarding
  bin_target            smallint not null default 4,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint households_collection_window_valid
    check (collection_start_hour >= 0
           and collection_end_hour <= 24
           and collection_start_hour < collection_end_hour),
  constraint households_bin_count_valid
    check (bin_count between 0 and 8 and bin_target between 2 and 8)
);

create index if not exists households_ward_id_idx on public.households(ward_id);

-- ---------------------------------------------------------------------------------------
-- household_members  (which users act for which household)
-- ---------------------------------------------------------------------------------------
create table if not exists public.household_members (
  household_id  uuid not null references public.households(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  member_role   text not null default 'member',   -- 'owner' | 'member'
  created_at    timestamptz not null default now(),
  primary key (household_id, user_id),
  constraint household_members_role_valid check (member_role in ('owner','member'))
);

create index if not exists household_members_user_id_idx on public.household_members(user_id);

-- ---------------------------------------------------------------------------------------
-- workers  (roster is a government dependency — audit G3; seeded for the pilot)
-- ---------------------------------------------------------------------------------------
create table if not exists public.workers (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.users(id) on delete set null,
  worker_code      citext unique not null,          -- AMC-WZ-109
  name             text not null,
  zone             text,
  ward_id          uuid references public.wards(id),
  active           boolean not null default true,
  daily_issue_cap  smallint not null default 25,    -- manual issuances per day (audit I7)
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_users_touch on public.users;
create trigger trg_users_touch before update on public.users
  for each row execute function app.touch_updated_at();

drop trigger if exists trg_households_touch on public.households;
create trigger trg_households_touch before update on public.households
  for each row execute function app.touch_updated_at();
