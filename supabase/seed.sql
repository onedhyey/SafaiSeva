-- supabase/seed.sql
-- Local-development seed only. Runs on `supabase db reset`, NOT on `supabase db push`
-- to a hosted project. Creates one demo household with a member and a demo worker so
-- the app has something to render before real onboarding exists.

-- Demo resident (anonymous-style principal; device_id matches nothing real).
insert into public.users (id, device_id, display_name)
values ('00000000-0000-0000-0000-000000000001', 'seed-demo-device', 'Demo Resident')
on conflict (id) do nothing;

-- Demo worker principal.
insert into public.users (id, device_id, display_name)
values ('00000000-0000-0000-0000-000000000002', 'seed-demo-worker-device', 'Ramesh Bhai Vaghela')
on conflict (id) do nothing;

-- Demo household in Ward 12.
insert into public.households (id, code, address, ward_id, bin_count, bin_target)
select
  '00000000-0000-0000-0000-0000000000a1',
  'HH-NV-0482',
  '402 Shivam Apts, CG Road, Navrangpura',
  w.id, 2, 4
from public.wards w
where w.code = 'W12-NAVRANGPURA'
on conflict (code) do nothing;

insert into public.household_members (household_id, user_id, member_role)
values ('00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000000001', 'owner')
on conflict do nothing;

-- Demo worker record.
insert into public.workers (id, user_id, worker_code, name, zone, ward_id)
select
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-000000000002',
  'AMC-WZ-109', 'Ramesh Bhai Vaghela', 'West Zone', w.id
from public.wards w
where w.code = 'W12-NAVRANGPURA'
on conflict (worker_code) do nothing;

-- A settled opening balance so redemption screens are demonstrable
-- (adjustment entry, effective immediately).
insert into public.credit_ledger (household_id, entry_type, amount, reason, effective_at)
values ('00000000-0000-0000-0000-0000000000a1', 'adjustment', 14,
        'Seed opening balance for local development', now())
on conflict do nothing;
