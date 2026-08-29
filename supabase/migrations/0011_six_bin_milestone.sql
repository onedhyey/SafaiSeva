-- 0011_six_bin_milestone.sql
-- Reward changes:
--   * Per handover: +1 per confirmed stream, no combo / full-set bonus, ceiling 4.
--     A handover needs >= 2 declared streams (wet + dry), so the range is 2..4.
--   * Milestones: 2 bins -> +5, 4 bins -> +10, 6 bins -> +20.  Bin target moves to 6.

alter table public.bin_milestones
  drop constraint if exists bin_milestones_valid,
  add constraint bin_milestones_valid
    check (milestone in ('two_bins', 'four_bins', 'six_bins'));

alter table public.households alter column bin_target set default 6;
update public.households set bin_target = 6 where bin_target < 6;

update public.reward_rules
   set rules = (rules
     - 'combo_bonus'
     - 'full_four_bonus')
     || jsonb_build_object(
          'per_confirmed_stream', 1,
          'daily_cap_credits',    4,
          'min_declared_streams', 2,
          'milestones', jsonb_build_object('two_bins', 5, 'four_bins', 10, 'six_bins', 20)
        )
 where version = 1;
