-- 0015_ward_officers.sql
-- Ward Officer as a real server-side principal (audit G7). Mirrors `workers` /
-- `resolveWorker` (0002 + Phase 3) but for the administrative role: an officer oversees a
-- ward's aggregates (participation, credits issued, anomaly flags). An officer does not
-- document handovers or issue doorstep credit and has no daily cap, so it is its own
-- table rather than a role flag on `workers`.

create table if not exists public.ward_officers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.users(id) on delete set null,
  officer_code citext unique not null,          -- e.g. AMC-WO-12
  name         text not null,
  ward_id      uuid references public.wards(id),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists ward_officers_ward_id_idx on public.ward_officers(ward_id);

-- Closed to anon/authenticated (like `fraud_flags`): the service-role API is the only
-- reader. Add an own-row SELECT policy here if direct-from-browser access is ever needed.
alter table public.ward_officers enable row level security;

-- Demo officer for Ward 12, so the officer view has a real principal in the open demo
-- (VITE_AUTH_ENABLED=false). Guarded on fixed ids; safe to re-run.
insert into public.users (id, device_id, display_name)
values ('00000000-0000-0000-0000-000000000003', 'seed-demo-officer-device', 'Anjali Desai')
on conflict (id) do nothing;

insert into public.ward_officers (id, user_id, officer_code, name, ward_id)
select
  '00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-000000000003',
  'AMC-WO-12', 'Anjali Desai', w.id
from public.wards w
where w.code = 'W12-NAVRANGPURA'
on conflict (officer_code) do nothing;
