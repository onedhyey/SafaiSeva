-- 0013_handover_review.sql
-- Karmachari review trail on a handover (audit A4 / G3).

alter table public.handovers
  add column if not exists reviewed_by  uuid references public.users(id),
  add column if not exists reviewed_at  timestamptz,
  add column if not exists review_note  text;

-- Two "no smartphone" households in the same ward, for the doorstep-issuance demo.
insert into public.households (id, code, address, ward_id, bin_count, bin_target)
select v.id, v.code, v.addr, w.id, 2, 6
from public.wards w
cross join (values
  ('00000000-0000-0000-0000-0000000000a2'::uuid, 'HH-NV-0188', 'Chawl No. 4, Mithakhali, Navrangpura'),
  ('00000000-0000-0000-0000-0000000000a3'::uuid, 'HH-NV-0245', 'Block C-12, Navrangpura Gaam')
) as v(id, code, addr)
where w.code = 'W12-NAVRANGPURA'
on conflict (code) do nothing;

-- A couple of seeded in_review handovers so the demo queue isn't empty. Uses the demo
-- household; safe to re-run (guarded on the fixed ids).
insert into public.handovers
  (id, household_id, submitted_by, collection_date, attempt, media_kind,
   declared_streams, confirmed_streams, status, decision_reason_code, decision_reason_text,
   client_captured_at)
select
  x.id,
  h.id,
  '00000000-0000-0000-0000-000000000001',
  (timezone('Asia/Kolkata', now()))::date,
  1, 'photo',
  array['wet','dry']::text[], array[]::text[],
  'in_review', x.code, x.text,
  now() - interval '2 hours'
from public.households h
cross join (values
  ('00000000-0000-0000-0000-00000000e001'::uuid, 'IN_REVIEW_CONFLICT',
   'Confidence was borderline on the dry stream — a karmachari check was requested.'),
  ('00000000-0000-0000-0000-00000000e002'::uuid, 'VELOCITY_ANOMALY',
   'Two submissions from far apart in a short time — flagged for a human check.')
) as x(id, code, text)
where h.code = 'HH-NV-0482'
on conflict (id) do nothing;
