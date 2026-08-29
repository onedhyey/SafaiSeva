-- 0010_bins_onboarded.sql
-- Track whether a household has been asked about its bins yet, so onboarding shows once.
-- (bin_count / bin_target / bin_milestones already exist from 0002 + 0004.)

alter table public.households
  add column if not exists bins_onboarded_at timestamptz;
