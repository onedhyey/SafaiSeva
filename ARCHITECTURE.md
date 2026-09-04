# SafaiSeva architecture

A civic reward app for household waste segregation in Ahmedabad. React PWA + an Express
API + Supabase (Postgres, Storage). The AI describes what it sees; the **backend decides**
everything that matters.

```
 browser (React PWA)
   │  x-device-id  (or Clerk bearer, when auth is on)
   ▼
 Express API  (server/*.ts)  —— service role ——▶  Supabase Postgres + Storage
   │                                               • RLS on every table
   ├─ resolvePrincipal   device_id ⇄ users row     • append-only credit_ledger
   ├─ gemini adapter     evidence only, no verdict  • reward_rules (versioned)
   ├─ fraud checks       daily / geo / window / dup / velocity
   └─ adjudicator (pure) evidence + rules + signals → decision
```

## The authority rule (audit C2 / C3)

- The vision model (`server/gemini.ts`, `gemini-3.6-flash`) returns **observations**:
  per‑stream visible/contamination, `recaptureLikelihood`, `imageQuality`,
  `tamperSignals`, `overallConfidence`. It never returns pass/fail or a credit number.
- `server/fraud.ts` returns **structural signals** (`daily_limit`, `geo_outside`,
  `window_outside`, `duplicate_phash`, `velocity`, `burst`) computed from the DB.
- `src/lib/verification/adjudicator.ts` is a **pure function**: `(evidence, declared
  streams, reward_rules, collection window, fraud signals) → decision`. It runs on the
  server. The client only renders the decision.
- The client cannot set `handovers.status`, `credits_awarded`, or write to
  `credit_ledger`. RLS gives `anon` / `authenticated` **SELECT only**, scoped to their
  household; all writes go through the service‑role API.

## Credits

- `credit_ledger` is **append‑only** — a trigger (`app.deny_ledger_mutation`) blocks
  UPDATE / DELETE for every role, service role included. Corrections are new `reversal`
  rows.
- Balance is never stored: `v_household_balance.settled_balance = SUM(amount)` over rows
  with `effective_at <= now()`. Earned handover credits sit in `pending_credits` for a
  **24 h settlement hold** (`reward_rules.settlement_hold_hours`); milestone and spend
  entries are effective immediately.
- **Per handover:** `+1` per AI‑confirmed stream, no bonuses, ceiling 4. A handover needs
  ≥ 2 declared streams (wet + dry), so the range is 2–4.
- **Bin milestones (audit P1):** reaching 2 / 4 / 6 separated bins pays 5 / 10 / 20 leaves,
  once each (`bin_milestones` unique per household+milestone), via
  `POST /api/household/bins`.
- **Redemption:** `POST /api/tickets/redeem` → `public.redeem_ticket()` takes a
  per‑household advisory lock, checks the settled balance, and writes the ticket + a
  `spend` row atomically. The QR token is HMAC‑signed (`server/qrToken.ts`, audit I6).

## Auth on / off (audit I4)

`VITE_AUTH_ENABLED` (default `false`) picks the provider in `src/lib/authContext.tsx`:

| Value | Provider | Principal |
|---|---|---|
| `false` | `DemoSessionProvider` | a stable per‑browser `device_id`, no gate |
| `true` + Clerk key | `ClerkAuthBridge` | Clerk user; `<LoginView>` gates |
| `true`, no key | `LocalDevAuthProvider` | local manual sign‑in |

`VITE_AUTH_GATE` (`before_role` | `after_role`) orders the sign‑in screen vs. the
resident / karmachari / officer picker.

The whole seam is one function: `server/principal.ts` → `resolvePrincipal(req)` returns
`{ userId }` from **either** an `x-device-id` header (demo) **or** a Clerk bearer token
(`resolveClerk()` verifies it with `@clerk/backend` and maps `sub` → `users.clerk_user_id`,
get-or-creating the row — complete as of `303be71`; enabling it is `VITE_AUTH_ENABLED=true` +
rebuild). Every RLS policy calls `app.uid()`, which resolves a request from
`users.clerk_user_id` **or** `users.device_id` — so turning auth on needs no schema
change and no query rewrite.

## What is server‑authoritative vs. still local

| Path | State |
|---|---|
| Handover submit → AI evidence → adjudicate → credit ledger | **server** |
| Wallet balance + handover history | **server** (`GET /api/wallet`) |
| Bin onboarding + milestone credits | **server** |
| Ticket redemption + `spend` ledger + signed QR | **server** |
| Resident dispute → routes handover to `in_review` | **server** (`POST /api/handovers/:id/dispute`) |
| Karmachari review queue (approve / reject) | **server** (`GET /api/review-queue`, `POST /api/review-queue/:id/decide`) — shipped `64ac176` |
| Manual "issue credit without app" | **server** (`POST /api/worker/issue`, daily cap via `workerCapExceeded()`) — shipped `64ac176` |
| Ward Officer dashboard + anomalies | **server** (`resolveOfficer`, `GET /api/officer/dashboard`, `GET /api/officer/anomalies`; schema `0015` + `0016`) — seed is offline fallback only |
| Offline capture queue | **client** (`src/lib/offlineQueue.ts` — `idb-keyval` store + idempotent replay via the verify endpoint's `idempotencyKey`; Outbox screen + `simulateOffline` toggle) — shipped (P6 / T3.1) |

## Key files

```
server/
  env.ts            normalized env (tolerates EXPO_PUBLIC_* / VITE_* / bare names)
  principal.ts      resolvePrincipal — the auth seam
  supabaseAdmin.ts  service-role client
  gemini.ts         evidence-only vision adapter
  fraud.ts          daily / geofence / window / cross-user pHash / velocity
  phash.ts          sha-256 + 64-bit dHash (sharp)
  qrToken.ts        HMAC-signed ticket tokens
  storage.ts        evidence media → private bucket
  routes.ts         all endpoints
src/lib/verification/
  contract.ts       evidence + decision + reward-rules types
  reasonCodes.ts    reason enum → EN + Gujarati messages + "what to change"
  adjudicator.ts    the pure decision function (14 unit tests: npm test)
src/lib/
  offlineQueue.ts   offline capture queue: idb-keyval store + idempotent replay (P6)
  useOnline.ts      navigator.onLine + online/offline events
supabase/migrations/  0001..0016  (see supabase/README.md)
```

## Running it

`npm run dev` (`tsx server.ts`) serves the API and Vite on `:3000`. Needs `GEMINI_API_KEY`,
`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, and `VITE_SUPABASE_URL` +
`VITE_SUPABASE_ANON_KEY` in `.env` (see `.env.example`). Apply `supabase/migrations/*` +
`supabase/seed.sql` first.

## Known toolchain notes

- `tsx` needs a clean `node_modules` on Node 26; mixing `bun install` and `npm install`
  corrupts it. The dev server can be slow to bind if a previous run left an orphan on
  Vite's HMR port 24678 — kill `tsx` / `esbuild --service` / `vite` and free that port.
- Migrations here were applied via the Supabase Management API, not `supabase db push`.
  Reconciled 2026-09-03 (commit 824a132): `supabase_migrations.schema_migrations` is
  backfilled with 0001..0014 and `0006_rls.sql` is now idempotent. `supabase/config.toml` is
  committed (CLI v2.116.0). Run `supabase link` before a CLI `db push` / `db reset`.
  See supabase/README.md "Migration history".
