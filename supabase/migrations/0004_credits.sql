-- 0004_credits.sql
-- Append-only credit ledger, reward-rule versions, transit tickets, bin milestones,
-- and worker (no-app) issuances.
--
-- Balance is never stored (audit C6). It is SUM(credit_ledger.amount) over entries whose
-- effective_at has passed. `v_household_balance` exposes both settled and pending totals.

-- ---------------------------------------------------------------------------------------
-- reward_rules  (versioned; the backend records which version made each award)
-- ---------------------------------------------------------------------------------------
create table if not exists public.reward_rules (
  version     integer primary key,
  active      boolean not null default false,
  rules       jsonb not null,
  note        text,
  created_at  timestamptz not null default now()
);

-- Exactly one active version at a time.
create unique index if not exists reward_rules_one_active
  on public.reward_rules ((true)) where active;

-- ---------------------------------------------------------------------------------------
-- credit_ledger  (append-only: no UPDATE, no DELETE — enforced in RLS + a guard trigger)
-- ---------------------------------------------------------------------------------------
create table if not exists public.credit_ledger (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  entry_type    text not null,        -- 'earn' | 'spend' | 'reversal' | 'adjustment' | 'milestone'
  amount        integer not null,     -- signed: +earn / +milestone, -spend, +/- reversal|adjustment
  handover_id   uuid references public.handovers(id) on delete set null,
  ticket_id     uuid,                 -- FK added after tickets table below
  reason        text not null,
  effective_at  timestamptz not null default now(),   -- earn = handover.settle_at
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now(),
  constraint credit_ledger_entry_type_valid
    check (entry_type in ('earn','spend','reversal','adjustment','milestone')),
  constraint credit_ledger_amount_sign
    check (
      (entry_type in ('earn','milestone') and amount > 0) or
      (entry_type = 'spend' and amount < 0) or
      (entry_type in ('reversal','adjustment'))
    )
);

create index if not exists credit_ledger_household_idx
  on public.credit_ledger(household_id, effective_at);
create index if not exists credit_ledger_handover_idx on public.credit_ledger(handover_id);

-- Guard: block mutation of ledger history from any role (service_role included).
create or replace function app.deny_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'credit_ledger is append-only (attempted %)', tg_op
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_credit_ledger_no_update on public.credit_ledger;
create trigger trg_credit_ledger_no_update
  before update or delete on public.credit_ledger
  for each row execute function app.deny_ledger_mutation();

-- One earn row per verified handover (defensive; idempotency also enforced upstream).
create unique index if not exists credit_ledger_one_earn_per_handover
  on public.credit_ledger (handover_id)
  where entry_type = 'earn' and handover_id is not null;

-- ---------------------------------------------------------------------------------------
-- tickets  (transit redemptions; real issuance/validation is a gov dependency — G2)
-- ---------------------------------------------------------------------------------------
create table if not exists public.tickets (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  redeemed_by    uuid not null references public.users(id),
  transit_type   text not null,       -- 'janmarg_brts' | 'ahmedabad_metro' | 'janmarg_day_pass'
  title          text not null,
  route          text,
  credits_spent  integer not null check (credits_spent > 0),
  token          text,                -- HMAC-signed payload (Phase 3); NULL for now
  status         text not null default 'active',   -- 'active' | 'used' | 'expired' | 'void'
  redeemed_at    timestamptz not null default now(),
  expires_at     timestamptz not null,
  used_at        timestamptz,
  created_at     timestamptz not null default now(),
  constraint tickets_status_valid check (status in ('active','used','expired','void'))
);

create index if not exists tickets_household_idx on public.tickets(household_id, redeemed_at desc);

alter table public.credit_ledger
  drop constraint if exists credit_ledger_ticket_fk,
  add constraint credit_ledger_ticket_fk
    foreign key (ticket_id) references public.tickets(id) on delete set null;

-- ---------------------------------------------------------------------------------------
-- bin_milestones  (audit P1: reward reaching 2 bins, then 4 bins)
-- ---------------------------------------------------------------------------------------
create table if not exists public.bin_milestones (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references public.households(id) on delete cascade,
  milestone            text not null,     -- 'two_bins' | 'four_bins'
  reached_at           timestamptz not null default now(),
  evidence_handover_id uuid references public.handovers(id) on delete set null,
  credits_awarded      integer not null default 0,
  unique (household_id, milestone),
  constraint bin_milestones_valid check (milestone in ('two_bins','four_bins','six_bins'))
);

-- ---------------------------------------------------------------------------------------
-- worker_issuances  (no-app / feature-phone equity path — audit I7)
-- ---------------------------------------------------------------------------------------
create table if not exists public.worker_issuances (
  id             uuid primary key default gen_random_uuid(),
  worker_id      uuid not null references public.workers(id) on delete cascade,
  household_id   uuid references public.households(id) on delete set null,
  household_code citext,                 -- when the household is not yet registered
  issued_date    date not null default (timezone('Asia/Kolkata', now()))::date,
  streams        text[] not null default '{}',
  worker_lat     double precision,
  worker_lng     double precision,
  household_ack  boolean not null default false,
  credits        integer not null default 0 check (credits >= 0),
  handover_id    uuid references public.handovers(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- One issuance per worker per household per day (registered and unregistered variants).
create unique index if not exists worker_issuances_one_per_day_registered
  on public.worker_issuances (worker_id, household_id, issued_date)
  where household_id is not null;
create unique index if not exists worker_issuances_one_per_day_unregistered
  on public.worker_issuances (worker_id, household_code, issued_date)
  where household_id is null and household_code is not null;

create index if not exists worker_issuances_worker_date_idx
  on public.worker_issuances (worker_id, issued_date);
