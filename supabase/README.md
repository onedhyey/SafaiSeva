# SafaiSeva — Supabase backend (Phase 1)

Migration-first schema for the real backend described in the audit. Nothing in the app
imports Supabase yet — that wiring is Phase 2, after this schema is reviewed.

## What is here

| File | Purpose |
|---|---|
| `migrations/0001_extensions.sql` | `pgcrypto`, `citext`, and the `app` helper schema |
| `migrations/0002_core.sql` | `users`, `devices`, `wards`, `households`, `household_members`, `workers` |
| `migrations/0003_handovers.sql` | `handovers`, `handover_media`, `verification_events`, `fraud_flags` |
| `migrations/0004_credits.sql` | `reward_rules`, `credit_ledger` (append-only), `tickets`, `bin_milestones`, `worker_issuances` |
| `migrations/0005_functions_views.sql` | `app.uid()` principal resolution, geofence / window helpers, `v_household_balance`, `v_review_queue` |
| `migrations/0006_rls.sql` | RLS enabled on every table; SELECT-only policies scoped by household membership |
| `migrations/0007_seed_reference.sql` | Ward 12 bbox + `reward_rules` v1 (runs in every environment) |
| `seed.sql` | Local-dev demo household / user / worker (runs only on `supabase db reset`) |

## Design decisions this schema encodes

- **The backend is the sole authority.** The service-role key bypasses RLS; all writes go
  through the SafaiSeva API. `anon` / `authenticated` get SELECT only, scoped to their own
  household. The client cannot set `handovers.status`, `credits_awarded`, or write to
  `credit_ledger`. (audit C2)
- **The AI produces evidence, not verdicts.** `verification_events` stores the structured
  model output. `handovers.confirmed_streams` / `credits_awarded` are computed by the
  backend from `reward_rules` and stamped with `reward_rules_version`. (audit C3)
- **Auth on/off is a claims change, not a migration.** Every policy calls `app.uid()`,
  which resolves a request to a `users` row from **either** a Clerk `sub` **or** a
  `device_id` in the JWT claims. The open demo passes `device_id`; enabling Clerk later
  passes `sub`. No table changes. (audit I4)
- **Credits are a ledger, not a number.** `credit_ledger` is append-only (guarded by a
  trigger that blocks UPDATE/DELETE for every role). Balance = `SUM(amount)` where
  `effective_at <= now()`; earned credits sit in `pending_credits` for a 24 h hold. (audit C6)
- **Structural fraud checks have a home.** One-verified-per-household-per-day is a partial
  unique index. `app.point_in_geofence()` and `app.in_collection_window()` are ready for
  the verify endpoint. `fraud_flags` records every automated block with a reason. (audit C5)
- **The stated goal is modelled.** `households.bin_count` / `bin_target` and
  `bin_milestones` (`two_bins`, `four_bins`) support the onboarding + milestone rewards. (audit P1)

## Government-dependent gaps (stubbed, documented)

- `households.geofence_polygon` is `NULL` until AMC provides real polygons — the ward
  bounding box is used meanwhile (G1).
- `households.collection_start_hour` / `end_hour` are placeholders until real route
  schedules exist (G4).
- `workers` is seeded; the real roster is an AMC dependency (G3).
- `tickets.token` is `NULL` until the HMAC signer lands (Phase 3) and real BRTS/Metro
  validation is integrated (G2).

## Migration history

**Status:** `0001`–`0014` are applied to the live project (`vtqzyldosmpkxuqqlica`). They were
applied as raw SQL through the Management API, not `supabase db push`, so the CLI tracker
`supabase_migrations.schema_migrations` did not exist. On 2026-09-03 it was created and
backfilled with one row per file (`version` = `0001`…`0014`) — the effect of
`supabase migration repair --status applied 0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 0011 0012 0013 0014`
— so a fresh clone's `supabase db push` / `supabase migration list` see all 14 as applied.

Every file is **idempotent** (safe to replay against a partially- or fully-migrated DB):
`create … if not exists`, `create or replace`, `drop … if exists` before each
`create trigger` / `create policy` / `add constraint`, and `on conflict` on every seed
insert.

**Clean-rebuild reproduces prod — verified 2026-09-03.** All 14 files were replayed in
order into empty schemas on the live project (a `supabase db reset` equivalent; branching
is Pro-only on this org) and the result structurally diffed against `public`/`app`: zero
differences across tables, every column (type / default / nullability), indexes, all
constraint definitions, the 14 RLS policies (name / cmd / using / with-check), the 8 `app`
functions, and the 4 triggers. `0008_storage.sql` (one `storage.buckets` upsert) is the
only file not covered by that replay; it is a trivial idempotent insert.

**CLI prerequisite:** `supabase/config.toml` is committed (`supabase init`, CLI v2.116.0,
`project_id = "vtqzyldosmpkxuqqlica"`, `major_version = 17`). Run `supabase link` to point
the CLI at the project before `db push` / `db reset`.

## How to apply

**Option A — Supabase CLI (local dev):**
```bash
supabase start
supabase db reset          # runs migrations/*.sql then seed.sql
```

**Option B — hosted project:**
```bash
# migrations only (no seed.sql):
supabase link --project-ref <ref>
supabase db push           # a no-op now: the tracker lists 0001–0014 as applied
```

**Option C — psql:**
```bash
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

**Verifying a clean rebuild reproduces prod** (needs Docker or a scratch Postgres):
```bash
supabase db reset                                   # or: apply migrations/*.sql then seed.sql to an empty DB
supabase db diff --linked --schema public,app       # must report no differences
```

## After applying, set in `.env`

```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
