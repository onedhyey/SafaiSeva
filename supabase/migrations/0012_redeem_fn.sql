-- 0012_redeem_fn.sql
-- Atomic ticket redemption: lock the household, check the settled balance, write the
-- ticket + the spend ledger row together. Called by the API (service role) via
-- supabase-js .rpc(); it must live in `public` for PostgREST to see it, but execute is
-- granted to service_role only.

create or replace function public.redeem_ticket(
  p_household   uuid,
  p_redeemed_by uuid,
  p_transit     text,
  p_title       text,
  p_route       text,
  p_cost        integer,
  p_expires_at  timestamptz
)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
  v_ticket  public.tickets;
begin
  if p_cost <= 0 then
    raise exception 'invalid cost' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_household::text));

  select coalesce(sum(amount), 0) into v_balance
  from public.credit_ledger
  where household_id = p_household and effective_at <= now();

  if v_balance < p_cost then
    raise exception 'insufficient balance: have %, need %', v_balance, p_cost
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.tickets (household_id, redeemed_by, transit_type, title, route,
                              credits_spent, status, expires_at)
  values (p_household, p_redeemed_by, p_transit, p_title, p_route, p_cost, 'active', p_expires_at)
  returning * into v_ticket;

  insert into public.credit_ledger (household_id, entry_type, amount, ticket_id, reason,
                                    effective_at, created_by)
  values (p_household, 'spend', -p_cost, v_ticket.id,
          'Redeemed ' || p_title, now(), p_redeemed_by);

  return v_ticket;
end;
$$;

revoke all on function
  public.redeem_ticket(uuid, uuid, text, text, text, integer, timestamptz) from public, anon, authenticated;
grant execute on function
  public.redeem_ticket(uuid, uuid, text, text, text, integer, timestamptz) to service_role;

-- drop the earlier app-schema version if it was created
drop function if exists app.redeem_ticket(uuid, uuid, text, text, text, integer, timestamptz);
