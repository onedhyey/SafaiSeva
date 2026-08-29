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
supabase db push
```

**Option C — psql:**
```bash
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

> Not yet run against a live database in this environment (no local Postgres / Docker /
> Supabase CLI available). First checkpoint task: apply to your project and report errors.

## After applying, set in `.env`

```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
