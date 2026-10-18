# TDD evidence — production hardening (audit F1–F18)

Source plan: the audit and migration plan "Safai Seva — Production Audit & Migration Plan"
(Claude Docs, 2026-10-17), phases 0–3. Branch `onedhyey/phase1-credit-integrity`, off
`origin/main` at `278df2a`. Each fix was preceded by a committed failing test ("— RED"
commits) and followed by the commit that made it pass ("— GREEN").

## User journeys

- As a resident, I submit one photo a day and am paid exactly once, even if my phone
  retries or I tap twice; nobody else can change or claim my submissions.
- As a resident, my household's invite is mine to give; a stranger who sees our place on
  the leaderboard cannot join or spend our leaves, and the leaderboard does not show my
  address.
- As a karmachari, I review and credit households in my ward only, and only at the door.
- As a resident, I see what happens to photos of my home before I submit, and I can delete
  my data.
- As a resident on a poor connection, the installed app opens offline and tells me when a
  new version is ready; I am notified when a review finishes or my leaves are spendable.
- As the operator, a production deploy that forgot to enable sign-in refuses requests
  instead of handing out credits.

## Results (2026-10-18, local: Node 26, Postgres 17.11, PostgREST 12.2.12)

| Suite | Command | Result |
|---|---|---|
| Unit | `npm test` | 65 checks PASS |
| SQL | `npm run test:db` | 37 checks PASS (4 files) |
| API end to end | `POSTGREST_BIN=… npm run test:api` | 21 checks PASS |
| Typecheck | `npm run lint` | clean |
| Build | `npm run build` | OK; service worker precaches 29 entries incl. `index.html` |

**Before/after on the HTTP surface.** The API suite was also run unchanged against
`origin/main` (`278df2a`) in a temporary worktree: **12 of 15 then-existing checks
failed**. F1/F2: production served anonymous and demo-karmachari requests (200, expected
503). F3: the leaderboard returned household codes and addresses. F6: `binCount: 6` paid
`four_bins` + `six_bins` (30 leaves) at once. F11: cross-ward review and doorstep issuance
succeeded. F5: a review approval paid past the one-per-day limit. (The old verify cases
also failed, but only because the old Gemini client could not be pointed at the fake —
not counted as evidence.)

**Mutation check.** With the household advisory lock removed from
`record_handover_decision`, the concurrent same-day verify test fails (more than one earn
row); with it, exactly one.

## Guarantees

| # | Guarantee | Test | Type |
|---|---|---|---|
| 1 | Auth off in production without `ALLOW_DEMO_IDENTITY` → every route 503 (F1/F2) | `tests/serverGuards` identity; `tests/api` F1, F2 | unit, API |
| 2 | Five concurrent same-day verifies → one verified, one earn row (F5) | `tests/db/creditIntegrity` F5 | SQL |
| 3 | A handover of another household cannot be decided or re-submitted (F4) | `creditIntegrity` F4; `tests/api` F4 | SQL, API |
| 4 | Review approval and doorstep issuance are ward-scoped; doorstep needs the worker within 150 m of a geolocated household; cap holds under concurrency (F11) | `creditIntegrity` F11 ×4; `tests/api` F11 | SQL, API |
| 5 | Self-reported bins pay nothing without verified evidence; milestones pay once, on hold (F6) | `creditIntegrity` F6 ×3; `tests/api` F6 | SQL, API |
| 6 | Capture time trusted within 6 h / 2 min skew; otherwise server time + human review (F7) | `serverGuards` F7; `tests/api` F7 | unit, API |
| 7 | Household code is not a join secret; owner-only invites and approvals; one household per account, also under concurrency (F3) | `tests/db/households` ×7 | SQL |
| 8 | Leaderboard has no codes/addresses; ranks by 30-day earnings, spending does not lower rank (F3/F15) | `households` leaderboard; `tests/api` F3 | SQL, API |
| 9 | Cross-household near-dup and exact resubmits block; own similar photo does not; old hashes still count (F12) | `households` F12 ×4; `tests/api` F12 | SQL, API |
| 10 | No evidence accepted before consent; erasure anonymises, deletes evidence objects, keeps the ledger; retention keeps hashes (F8) | `tests/db/privacy` ×5; `tests/api` F8 ×2 | SQL, API |
| 11 | Unknown DB errors return a generic 500; unknown `/api` paths are JSON 404 (F10) | `serverGuards` mapping; `tests/api` leak check | unit, API |
| 12 | QR secret required outside development, checked before credits are spent (F18) | `serverGuards` QR | unit |
| 13 | Security headers on API and page responses | `tests/api` headers | API |
| 14 | Web Push: subscribe idempotent; review decision notifies the household; 410 removes the subscription | `tests/api` push ×3 | API |
| 15 | Photos ≤ 1280 px, keyframes keep aspect ratio (F13) | `serverGuards` sizing ×5 | unit |
| 16 | Ledger reconciles with handovers after each suite | `creditIntegrity`, `tests/api` | SQL, API |

## Verified by hand (browser, production build against the local test stack)

- Consent screen appears for a new resident; "I agree" records the current version.
- Service worker active; 29 entries precached including `index.html`.
- With the whole server stopped, reloading opens the full app from the cache (F9).

## Known gaps

- Coverage percentages were not measured (the suites are plain `tsx` scripts, no coverage
  tool configured).
- Not exercised: Clerk sign-in end to end (needs the real Clerk instance), camera capture in
  a real browser, push delivery on a real device, the CI workflow on GitHub (runs on first
  push), Gujarati/Hindi UI (not started), CSP.
