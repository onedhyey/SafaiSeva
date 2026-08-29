-- 0007_seed_reference.sql
-- Reference / configuration data that belongs in every environment (runs on prod too).
-- Pilot-specific demo rows (a demo household, a demo user, fake history) live in
-- supabase/seed.sql instead, which only runs on local `supabase db reset`.

-- Ward 12 – Navrangpura. Bounding box is the INTERIM geofence until AMC supplies
-- real per-household polygons (audit G1).
insert into public.wards (code, name, city, min_lat, max_lat, min_lng, max_lng)
values ('W12-NAVRANGPURA', 'Ward 12 - Navrangpura', 'Ahmedabad',
        22.990, 23.075, 72.530, 72.600)
on conflict (code) do nothing;

-- Reward rules v1. The backend reads the single active version and stamps
-- handovers.reward_rules_version for reproducibility (audit C3).
insert into public.reward_rules (version, active, note, rules)
values (
  1, true, 'Pilot defaults. Milestone-weighted per audit assumption B.',
  jsonb_build_object(
    'per_confirmed_stream',   1,        -- 1 credit per stream the AI actually confirms
    'combo_bonus',            jsonb_build_object('wet_dry', 1),   -- +1 if wet AND dry both confirmed
    'full_four_bonus',        1,        -- +1 if all four streams confirmed
    'daily_cap_credits',      5,        -- max credits from a single daily handover
    'settlement_hold_hours',  24,       -- earned credits are spendable after this (audit C6/E)
    'milestones',             jsonb_build_object('two_bins', 10, 'four_bins', 20),
    'worker_issue_credits',   2,        -- flat credits for a verified no-app issuance (audit I7)
    'recapture_block_at',     0.75,     -- recapture_likelihood >= this -> auto-reject (audit A1)
    'review_confidence_band', jsonb_build_object('low', 0.45, 'high', 0.75),
    'redeem', jsonb_build_object(
      'janmarg_brts',     20,
      'ahmedabad_metro',  20,
      'janmarg_day_pass', 50
    )
  )
)
on conflict (version) do update
  set active = excluded.active,
      rules  = excluded.rules,
      note   = excluded.note;
