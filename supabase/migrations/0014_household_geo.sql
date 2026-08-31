-- 0014_household_geo.sql
-- When a resident self-registers a household after signing in (auth-on path), we record
-- the GPS fix so a "someone here already registered — join them?" check can run and, later,
-- a per-household point geofence can replace the ward bbox (G1).

alter table public.households
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision;
