-- 0022_moderation.sql
-- Officer tools to act on fraud (audit Phase 4): reverse an award, suspend a household.
-- Both are scoped to the officer's ward and written to moderation_actions. The ledger is
-- never edited — a reversal is a new negative row, so history stays auditable.

alter table public.households
  add column if not exists suspended_at     timestamptz,
  add column if not exists suspended_reason text;

create table if not exists public.moderation_actions (
  id          uuid primary key default gen_random_uuid(),
  officer_id  uuid not null references public.ward_officers(id),
  action      text not null,          -- 'reverse_credit' | 'suspend_household' | 'lift_suspension'
  target_id   uuid not null,          -- handover id or household id
  reason      text not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint moderation_actions_action_valid
    check (action in ('reverse_credit', 'suspend_household', 'lift_suspension'))
);
create index if not exists moderation_actions_target_idx on public.moderation_actions(target_id);
alter table public.moderation_actions enable row level security;

-- At most one reversal per handover.
create unique index if not exists credit_ledger_one_reversal_per_handover
  on public.credit_ledger (handover_id)
  where entry_type = 'reversal' and handover_id is not null;

-- ---------------------------------------------------------------------------------------
-- A suspended household cannot gain or spend credits — enforced at the ledger, so every
-- path (verify, review, doorstep, milestones, redemption) is covered in one place.
-- Reversals and adjustments still go through.
-- ---------------------------------------------------------------------------------------
create or replace function app.deny_suspended_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entry_type in ('earn', 'milestone', 'spend') and exists (
    select 1 from public.households where id = new.household_id and suspended_at is not null
  ) then
    raise exception 'household_suspended' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_credit_ledger_suspended on public.credit_ledger;
create trigger trg_credit_ledger_suspended
  before insert on public.credit_ledger
  for each row execute function app.deny_suspended_ledger();

-- ---------------------------------------------------------------------------------------
create or replace function app.require_officer_for_household(p_officer uuid, p_household uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ward uuid;
  v_hh_ward uuid;
begin
  select ward_id into v_ward from public.ward_officers where id = p_officer and active;
  if not found then
    raise exception 'officer_inactive' using errcode = 'insufficient_privilege';
  end if;
  select ward_id into v_hh_ward from public.households where id = p_household;
  if v_ward is null or v_hh_ward is distinct from v_ward then
    raise exception 'ward_scope' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.reverse_handover_credit(
  p_handover uuid,
  p_officer  uuid,
  p_reason   text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_h      public.handovers;
  v_earned integer;
  v_at     timestamptz;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = 'check_violation';
  end if;

  select * into v_h from public.handovers where id = p_handover;
  if not found then
    raise exception 'handover_not_found' using errcode = 'no_data_found';
  end if;
  perform app.require_officer_for_household(p_officer, v_h.household_id);
  perform app.lock_household(v_h.household_id);
  select * into v_h from public.handovers where id = p_handover for update;

  if exists (select 1 from public.credit_ledger
             where handover_id = p_handover and entry_type = 'reversal') then
    raise exception 'already_reversed' using errcode = 'unique_violation';
  end if;
  if v_h.status <> 'verified' then
    raise exception 'not_reversible' using errcode = 'check_violation';
  end if;

  select coalesce(sum(amount), 0), max(effective_at) into v_earned, v_at
  from public.credit_ledger where handover_id = p_handover and entry_type = 'earn';

  if v_earned > 0 then
    -- Effective together with the earn row (or now, if it already settled), so a held
    -- award nets to zero instead of briefly pushing the balance negative.
    insert into public.credit_ledger
      (household_id, entry_type, amount, handover_id, reason, effective_at, created_by)
    values (v_h.household_id, 'reversal', -v_earned, p_handover,
            'Reversed by ward officer: ' || left(trim(p_reason), 200),
            greatest(now(), v_at),
            (select user_id from public.ward_officers where id = p_officer));
  end if;

  update public.handovers
     set status = 'rejected', credits_awarded = 0, settle_at = null,
         decision_reason_code = 'REVERSED_BY_OFFICER',
         decision_reason_text = 'Reversed after review: ' || left(trim(p_reason), 200)
   where id = p_handover;

  insert into public.moderation_actions (officer_id, action, target_id, reason, detail)
  values (p_officer, 'reverse_credit', p_handover, trim(p_reason),
          jsonb_build_object('household_id', v_h.household_id, 'amount', v_earned));

  return jsonb_build_object('reversed', v_earned, 'household_id', v_h.household_id);
end;
$$;

create or replace function public.set_household_suspension(
  p_household uuid,
  p_officer   uuid,
  p_suspended boolean,
  p_reason    text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = 'check_violation';
  end if;
  perform app.require_officer_for_household(p_officer, p_household);

  update public.households
     set suspended_at     = case when p_suspended then now() else null end,
         suspended_reason = case when p_suspended then left(trim(p_reason), 300) else null end
   where id = p_household;

  insert into public.moderation_actions (officer_id, action, target_id, reason)
  values (p_officer, case when p_suspended then 'suspend_household' else 'lift_suspension' end,
          p_household, trim(p_reason));

  return jsonb_build_object('suspended', p_suspended);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Reconciliation and balance views learn about reversals.
-- ---------------------------------------------------------------------------------------
create or replace view public.v_ledger_reconciliation as
select 'earn_on_unverified'::text as problem, l.household_id, l.handover_id,
       l.amount as ledger_amount, h.credits_awarded as handover_credits
from public.credit_ledger l
join public.handovers h on h.id = l.handover_id
where l.entry_type = 'earn' and h.status <> 'verified'
  and not exists (
    select 1 from public.credit_ledger r
    where r.handover_id = l.handover_id and r.entry_type = 'reversal' and r.amount = -l.amount)
union all
select 'amount_mismatch', l.household_id, l.handover_id, l.amount, h.credits_awarded
from public.credit_ledger l
join public.handovers h on h.id = l.handover_id
where l.entry_type = 'earn' and h.status = 'verified' and l.amount <> h.credits_awarded
union all
select 'verified_without_earn', h.household_id, h.id, null, h.credits_awarded
from public.handovers h
where h.status = 'verified' and h.credits_awarded > 0
  and not exists (
    select 1 from public.credit_ledger l
    where l.handover_id = h.id and l.entry_type = 'earn');

alter view public.v_ledger_reconciliation set (security_invoker = true);

-- Pending = the net of not-yet-effective rows (a held award and its reversal cancel out).
create or replace view public.v_household_balance as
select
  h.id   as household_id,
  h.code as household_code,
  coalesce(sum(l.amount) filter (where l.effective_at <= now()), 0)                as settled_balance,
  greatest(coalesce(sum(l.amount) filter (where l.effective_at > now()), 0), 0)    as pending_credits,
  coalesce(sum(l.amount) filter (where l.entry_type in ('earn','milestone')), 0)   as lifetime_earned,
  coalesce(-sum(l.amount) filter (where l.entry_type = 'spend'), 0)                as lifetime_spent
from public.households h
left join public.credit_ledger l on l.household_id = h.id
group by h.id, h.code;

alter view public.v_household_balance set (security_invoker = true);

-- ---------------------------------------------------------------------------------------
revoke all on function
  public.reverse_handover_credit(uuid, uuid, text),
  public.set_household_suspension(uuid, uuid, boolean, text)
from public, anon, authenticated;

grant execute on function
  public.reverse_handover_credit(uuid, uuid, text),
  public.set_household_suspension(uuid, uuid, boolean, text)
to service_role;
