-- 0006_rls.sql
-- Row-level security. Default posture: DENY. The service-role key used by the SafaiSeva
-- API bypasses RLS (it is BYPASSRLS in Supabase), so all writes flow through the server,
-- which is the sole authority over status, credits, and fraud decisions (audit C2).
--
-- The policies below grant only SELECT, and only to a principal that app.uid() resolves
-- for — i.e. they are the read rules for any future direct-from-browser access and a
-- defense-in-depth layer today. Every table has RLS enabled, so anything without an
-- explicit policy is fully closed to anon/authenticated.

alter table public.users                enable row level security;
alter table public.devices              enable row level security;
alter table public.wards                enable row level security;
alter table public.households           enable row level security;
alter table public.household_members    enable row level security;
alter table public.workers              enable row level security;
alter table public.handovers            enable row level security;
alter table public.handover_media       enable row level security;
alter table public.verification_events  enable row level security;
alter table public.fraud_flags          enable row level security;
alter table public.reward_rules         enable row level security;
alter table public.credit_ledger        enable row level security;
alter table public.tickets              enable row level security;
alter table public.bin_milestones       enable row level security;
alter table public.worker_issuances     enable row level security;

-- Views should honour the RLS of their base tables.
alter view public.v_household_balance set (security_invoker = true);
alter view public.v_review_queue      set (security_invoker = true);

-- ---- users / devices : only your own row -------------------------------------------
create policy users_select_self on public.users
  for select to anon, authenticated
  using (id = app.uid());

create policy devices_select_self on public.devices
  for select to anon, authenticated
  using (user_id = app.uid());

-- ---- wards : public reference data -------------------------------------------------
create policy wards_select_all on public.wards
  for select to anon, authenticated
  using (true);

-- ---- reward_rules : app needs to show the current reward rate ---------------------
create policy reward_rules_select_all on public.reward_rules
  for select to anon, authenticated
  using (true);

-- ---- households & membership ----------------------------------------------------
create policy households_select_member on public.households
  for select to anon, authenticated
  using (app.is_household_member(id));

create policy household_members_select_self on public.household_members
  for select to anon, authenticated
  using (user_id = app.uid());

-- ---- handovers and their evidence : household members only ---------------------
create policy handovers_select_member on public.handovers
  for select to anon, authenticated
  using (app.is_household_member(household_id));

create policy handover_media_select_member on public.handover_media
  for select to anon, authenticated
  using (exists (
    select 1 from public.handovers h
    where h.id = handover_media.handover_id
      and app.is_household_member(h.household_id)
  ));

create policy verification_events_select_member on public.verification_events
  for select to anon, authenticated
  using (exists (
    select 1 from public.handovers h
    where h.id = verification_events.handover_id
      and app.is_household_member(h.household_id)
  ));

-- ---- credit ledger / tickets / milestones : household members only -------------
create policy credit_ledger_select_member on public.credit_ledger
  for select to anon, authenticated
  using (app.is_household_member(household_id));

create policy tickets_select_member on public.tickets
  for select to anon, authenticated
  using (app.is_household_member(household_id));

create policy bin_milestones_select_member on public.bin_milestones
  for select to anon, authenticated
  using (app.is_household_member(household_id));

-- ---- workers : only your own worker record & issuances -------------------------
create policy workers_select_self on public.workers
  for select to anon, authenticated
  using (user_id = app.uid());

create policy worker_issuances_select_self on public.worker_issuances
  for select to anon, authenticated
  using (exists (
    select 1 from public.workers w
    where w.id = worker_issuances.worker_id
      and w.user_id = app.uid()
  ));

-- fraud_flags: no anon/authenticated policy at all -> fully closed to the client.
