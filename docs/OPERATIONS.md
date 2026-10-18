# Operations

How to test, deploy, schedule and roll back SafaiSeva. Written alongside the production
hardening branch (`onedhyey/phase1-credit-integrity`); see `ARCHITECTURE.md` for design.

## Tests

| Command | What it runs | Needs |
|---|---|---|
| `npm test` | adjudicator, offline queue, server guards (identity mode, capture time, error mapping, QR secret, capture sizing) | nothing |
| `npm run test:db` | every migration on a fresh Postgres; credit decisions incl. concurrency; households/invites/dedupe/leaderboard; privacy | Postgres 16+ (`TEST_DATABASE_URL`, or local binaries — a throwaway cluster is started under the OS temp dir) |
| `npm run test:api` | the real Express server → PostgREST → Postgres, with fake Storage, Gemini and push endpoints | the above + a PostgREST binary (`POSTGREST_BIN` or on `PATH`); skipped otherwise |
| `npm run test:all` | all three | |

CI (`.github/workflows/ci.yml`) runs typecheck, unit tests and build, then the DB and API
suites against a `postgres:17` service container with PostgREST v12.2.12.

## Deploying this branch — order matters

1. **Apply migrations 0018 → 0021** to the target Supabase project, in order, *before*
   the new server code goes live (the routes call the new functions).
   - `0019` adds `unique (household_members.user_id)`. It fails if any user is in two
     households; check first:
     `select user_id from household_members group by 1 having count(*) > 1;`
   - Record them in `supabase_migrations.schema_migrations` the same way as 0015–0017
     (see `supabase/README.md`).
2. Set environment (see `.env.example`):
   - Real deployment: `VITE_AUTH_ENABLED=true`, Clerk keys, `QR_SIGNING_SECRET`,
     `GEMINI_API_KEY`, `SUPABASE_*`, VAPID keys, `TRUST_PROXY=1` behind a platform proxy.
     Leave `ALLOW_DEMO_IDENTITY` unset.
   - Public demo (separate project + database, no real rewards): `ALLOW_DEMO_IDENTITY=true`.
3. Build and start: `npm run build && NODE_ENV=production npm start`.
4. Smoke: `GET /api/health` → `identityMode` is `clerk` (or `demo` for the demo deploy);
   `npm run ops:check-ledger` → `ledger_ok`.

### Hosting (Vercel)

`vercel.json` builds with `npm run build:vercel`: the frontend goes to `dist/` (static,
served by Vercel) and the API is bundled from `server/vercel.ts` into `api/_app.mjs`, served
as one Vercel Function at `/api/*` (`api/index.mjs`, max 60 s). The same Express app runs
locally and in a container through `server.ts` (`server/app.ts` is shared). The old build put
`dist/server.cjs` and its source map into the public site — `build:vercel` no longer does.

Function limits to keep in mind: request bodies ≤ 4.5 MB (evidence goes straight to Supabase
Storage, so API bodies are small); in-memory rate limits are per instance.

## Scheduled jobs

| Job | Command | Schedule | Purpose |
|---|---|---|---|
| Evidence retention | `npm run ops:purge-evidence` | daily | delete photos/videos older than `EVIDENCE_RETENTION_DAYS` (default 90); hashes kept |
| Settled-leaves push | `npm run ops:notify-settled` | hourly (`SETTLED_WINDOW_MINUTES=60`) | "your leaves are ready" |
| Ledger reconciliation | `npm run ops:check-ledger` | daily (alert on exit 1) | `v_ledger_reconciliation` must be empty |

On Vercel all three run once a day from `GET /api/cron/daily` (03:00 IST, `vercel.json`
`crons`; Hobby plans allow daily crons), authorised by `CRON_SECRET`. The settled-leaves push
then uses a 24 h window.

Any scheduler works (host cron, GitHub Actions `schedule:` with the service-role env as
secrets, Supabase scheduled functions calling an endpoint).

## Rollback

- **Code:** redeploy the previous build. The service worker fetches navigations from the
  network first, so installed apps pick up the rollback on their next online open; the
  "new version" prompt appears for open sessions.
- **Database:** 0018–0021 only add functions, views, tables, columns and one unique index;
  the previous server code ignores them, so a code rollback needs no schema rollback.
- **Credits:** never edit `credit_ledger`; correct with `reversal` rows.
- **AI:** pin `GEMINI_MODEL`; revert the env var if a model change regresses.

## Open hardening items

- **Content-Security-Policy** ships as `Content-Security-Policy-Report-Only`
  (`server/http.ts`); violations are logged as `{"event":"csp_violation",…}` lines. After a
  week of clean production logs against the real Clerk instance, switch the header name to
  `Content-Security-Policy` to enforce.
- **Error tracking:** structured JSON logs exist (`server/http.ts`); a hosted tracker
  (e.g. Sentry) needs an account and DSN.
- **Rate limits** are in memory, per process — fine for one instance.
