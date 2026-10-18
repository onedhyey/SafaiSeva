-- 0024_advisor_fixes.sql
-- Supabase security advisor findings after 0018-0023 were applied to production.
--
-- 1. The officer analytics views (0016) and the old leaderboard view (0017) ran with their
--    owner's rights (no security_invoker) and Supabase's default grants let the public
--    `anon` / `authenticated` roles SELECT them — so anyone holding the public anon key
--    could read household codes, addresses and flagged-household names, bypassing RLS.
--    Only the service-role API reads these views: make them invoker-rights and revoke
--    the client roles.
-- 2. Helper functions without a pinned search_path.

alter view public.v_officer_dashboard    set (security_invoker = true);
alter view public.v_officer_subdistricts set (security_invoker = true);
alter view public.v_officer_worker_audit set (security_invoker = true);
alter view public.v_officer_anomalies    set (security_invoker = true);
alter view public.v_ward_leaderboard     set (security_invoker = true);

revoke all on
  public.v_officer_dashboard,
  public.v_officer_subdistricts,
  public.v_officer_worker_audit,
  public.v_officer_anomalies,
  public.v_ward_leaderboard,
  public.v_ward_leaderboard_live,
  public.v_ledger_reconciliation
from anon, authenticated;

alter function app.touch_updated_at()      set search_path = '';
alter function app.deny_ledger_mutation()  set search_path = '';
alter function app.lock_household(uuid)    set search_path = 'pg_catalog';
alter function app.ist_today()             set search_path = 'pg_catalog';
alter function app.distance_m(double precision, double precision, double precision, double precision)
                                           set search_path = 'pg_catalog';
alter function app.hamming64(text, text)   set search_path = 'pg_catalog';
