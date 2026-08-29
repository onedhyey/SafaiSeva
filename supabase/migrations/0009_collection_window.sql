-- 0009_collection_window.sql
-- Collection window is 6:00 AM – 12:00 PM (was 6–11). Interim value until real AMC route
-- schedules exist (G4); the reason messages name whatever this is set to.

alter table public.households alter column collection_end_hour set default 12;

update public.households
   set collection_end_hour = 12
 where collection_end_hour < 12;
