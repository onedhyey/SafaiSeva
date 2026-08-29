-- 0003_handovers.sql
-- Submissions, their evidence media, the AI's structured findings, and fraud signals.
--
-- Authority model (audit C2 / C3): the AI writes only to `verification_events` as
-- *evidence*. The backend sets `handovers.status`, `confirmed_streams`, and
-- `credits_awarded` from `reward_rules` + the evidence. The client never sets any of them.

-- ---------------------------------------------------------------------------------------
-- handovers
-- ---------------------------------------------------------------------------------------
create table if not exists public.handovers (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references public.households(id) on delete cascade,
  submitted_by          uuid not null references public.users(id),
  device_id             text,

  -- Server-derived local (Asia/Kolkata) date; the basis for the one-per-day rule.
  collection_date       date not null default (timezone('Asia/Kolkata', now()))::date,

  attempt               smallint not null default 1,        -- 1 = photo, 2 = video/photo
  media_kind            text,                               -- 'photo' | 'video'
  declared_streams      text[] not null default '{}',       -- what the resident claimed
  confirmed_streams     text[] not null default '{}',       -- what the backend accepted

  -- Client capture attestation (audit I8). Validated server-side; stored for audit.
  client_captured_at    timestamptz,
  client_lat            double precision,
  client_lng            double precision,
  client_accuracy_m     double precision,
  attestation_nonce     text,

  status                text not null default 'pending',
  decision_reason_code  text,        -- enum-like; maps to a localized message
  decision_reason_text  text,        -- resolved human message actually shown

  credits_awarded       integer not null default 0,
  reward_rules_version  integer,     -- which rules produced the award (reproducibility)

  -- 24h settlement hold (audit C6 / assumption E). Credits become spendable at settle_at.
  settle_at             timestamptz,

  idempotency_key       text,        -- one per submission attempt from the client
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint handovers_status_valid
    check (status in ('pending','verified','needs_video','in_review','rejected')),
  constraint handovers_attempt_valid check (attempt in (1,2)),
  constraint handovers_media_kind_valid
    check (media_kind is null or media_kind in ('photo','video')),
  constraint handovers_credits_nonneg check (credits_awarded >= 0)
);

-- One approved handover per household per local day (audit C5).
create unique index if not exists handovers_one_verified_per_day
  on public.handovers (household_id, collection_date)
  where status = 'verified';

-- Idempotency: a retried submission cannot create a second row (audit B3).
create unique index if not exists handovers_idempotency_key_uniq
  on public.handovers (idempotency_key)
  where idempotency_key is not null;

create index if not exists handovers_household_date_idx
  on public.handovers (household_id, collection_date desc);
create index if not exists handovers_status_idx on public.handovers (status);
create index if not exists handovers_submitted_by_idx on public.handovers (submitted_by);

-- ---------------------------------------------------------------------------------------
-- handover_media  (audit B2: evidence lives in Storage; rows hold keys + hashes)
-- ---------------------------------------------------------------------------------------
create table if not exists public.handover_media (
  id            uuid primary key default gen_random_uuid(),
  handover_id   uuid not null references public.handovers(id) on delete cascade,
  attempt       smallint not null default 1,
  kind          text not null,                 -- 'photo' | 'video' | 'keyframe'
  storage_path  text not null,                 -- object key in the private 'evidence' bucket
  content_hash  text,                          -- sha-256 of the bytes (exact-dup detection)
  phash         text,                          -- perceptual hash (near-dup, cross-user)
  bytes         integer,
  width         integer,
  height        integer,
  created_at    timestamptz not null default now(),
  constraint handover_media_kind_valid check (kind in ('photo','video','keyframe'))
);

create index if not exists handover_media_handover_idx on public.handover_media(handover_id);
create index if not exists handover_media_phash_idx on public.handover_media(phash)
  where phash is not null;
create index if not exists handover_media_content_hash_idx on public.handover_media(content_hash)
  where content_hash is not null;

-- ---------------------------------------------------------------------------------------
-- verification_events  (append-only; the AI's evidence, never its verdict)
-- ---------------------------------------------------------------------------------------
create table if not exists public.verification_events (
  id                   uuid primary key default gen_random_uuid(),
  handover_id          uuid not null references public.handovers(id) on delete cascade,
  attempt              smallint not null default 1,
  model                text not null,
  model_response_ms    integer,

  raw_evidence         jsonb not null,        -- full structured response from the model

  -- Denormalized signal columns for cheap querying / rules evaluation.
  waste_present        boolean,
  recapture_likelihood numeric(4,3),          -- 0.000..1.000 (audit A1)
  image_quality        text,                  -- 'good' | 'poor' | 'unusable'
  overall_confidence   numeric(4,3),
  tamper_signals       text[] not null default '{}',
  per_stream           jsonb not null default '{}'::jsonb,  -- {wet:{visible,contamination,notes}, ...}

  created_at           timestamptz not null default now()
);

create index if not exists verification_events_handover_idx
  on public.verification_events(handover_id);

-- ---------------------------------------------------------------------------------------
-- fraud_flags  (every automated block or warning is recorded with a reason)
-- ---------------------------------------------------------------------------------------
create table if not exists public.fraud_flags (
  id            uuid primary key default gen_random_uuid(),
  handover_id   uuid references public.handovers(id) on delete cascade,
  household_id  uuid references public.households(id) on delete cascade,
  user_id       uuid references public.users(id) on delete set null,
  signal        text not null,      -- 'duplicate_phash' | 'geo_outside' | 'window_outside'
                                    -- | 'velocity' | 'burst' | 'recapture_suspected'
                                    -- | 'no_waste' | 'stream_unconfirmed' | 'worker_cap' ...
  severity      text not null default 'warn',   -- 'info' | 'warn' | 'block'
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  constraint fraud_flags_severity_valid check (severity in ('info','warn','block'))
);

create index if not exists fraud_flags_handover_idx on public.fraud_flags(handover_id);
create index if not exists fraud_flags_household_idx on public.fraud_flags(household_id);
create index if not exists fraud_flags_signal_idx on public.fraud_flags(signal);

drop trigger if exists trg_handovers_touch on public.handovers;
create trigger trg_handovers_touch before update on public.handovers
  for each row execute function app.touch_updated_at();
