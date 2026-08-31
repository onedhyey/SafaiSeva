# Authentication — Clerk

The app ships with auth **off** (open demo). The full enforcement layer is built on both
sides; turning it on is a config flip + rebuild, no code changes.

## What each piece does

| Piece | File | Behaviour |
|---|---|---|
| Master switch | `VITE_AUTH_ENABLED` (`.env`) | `false` → anonymous `x-device-id` session. `true` → Clerk required. Read by the client at **build time** and by the server at **process start**. |
| Gate order | `VITE_AUTH_GATE` | `before_role` (default) or `after_role` — where sign-in sits vs. the role picker. |
| Frontend provider | `src/lib/authContext.tsx` | Flag on + publishable key → `ClerkProvider` + `ClerkAuthBridge` (real Clerk). Flag on, no key → `LocalDevAuthProvider` (manual local sign-in, for dev). Flag off → `DemoSessionProvider`. |
| Token → API | `authContext.tsx` `setAuthTokenGetter` / `getAuthToken`, consumed in `src/lib/api.ts` | When signed in, every request carries `Authorization: Bearer <clerk session token>` **and** `x-device-id`. |
| Token verification | `server/principal.ts` `verifyClerkToken` | `@clerk/backend` `verifyToken(secretKey)` — networkless after the first JWKS fetch. Bad/expired token → **401**. |
| User provisioning | `server/principal.ts` `getOrCreateClerkUser` | First authenticated call: (1) if `clerk_user_id` already mapped, reuse it; (2) else if this browser had an anonymous `x-device-id` user with no `clerk_user_id`, **claim that row** so its household/history carry over; (3) else insert a new `users` row (name backfilled from the Clerk Backend API). |
| Resident household | `server/routes.ts` `POST /api/household/create` \| `/join` + `src/components/resident/HouseholdSetupView.tsx` | A signed-in resident with no household lands on a create/join screen. Create → new `households` row + `household_members{owner}` + a shareable **join code** (`HH-U-XXXXXX`). Join → `household_members{member}` on an existing code. |
| Karmachari | `server/principal.ts` `resolveWorker` (Clerk branch) | Resolves `workers` where `user_id = <internal id>` and `active`. No self-serve — an operator runs `npm run link-worker`. The demo PIN screen still shows but the server is the real gate. |
| Anti-abuse | existing (`0003` unique index, `server/fraud.ts`) | `handovers_one_verified_per_day` is **per household**, as are the daily-limit / cap / velocity checks, so extra family accounts on one household can't multiply credits. `duplicate_phash` is cross-account and catches the same bins photographed from two households. On create, a soft "someone here already registered" check runs against `households.latitude/longitude` (0014). |

## Flip the switch

1. In `.env` set:
   ```
   VITE_AUTH_ENABLED=true
   VITE_CLERK_PUBLISHABLE_KEY=pk_live_...      # already set
   CLERK_SECRET_KEY=sk_live_...               # already set
   CLERK_AUTHORIZED_PARTIES=https://your-app-origin   # optional, recommended in prod
   ```
2. In the **Clerk dashboard**: add the app origin under *Allowed origins*; default session tokens work as-is (no JWT template needed — `verifyToken` reads `sub`).
3. Rebuild + redeploy the client (`npm run build`) and restart the server. `GET /api/health` should report `"authEnabled": true`.
4. Provision each karmachari once:
   ```
   npm run link-worker -- ramesh.vaghela@amc.gov.in AMC-WZ-109
   ```

## Verify

- Automated (no live session needed): `npm run test:auth` — boots the server with the flag on and asserts `health.authEnabled`, and that `/api/wallet`, `/api/household/create`, `/api/review-queue` reject a missing/bogus bearer with 401/403.
- Manual (needs a browser Clerk session):
  1. Sign in → land on **Set up your household** → *Create* → note the join code → *Continue* → wallet loads at 0 leaves, bin onboarding shows.
  2. Second browser, sign in as a different user → *Join* with that code → same wallet/balance; both users can open **Document**.
  3. Both submit the same morning → exactly one `verified` handover, one day's credits for the household.
  4. `link-worker` a user → after sign-in they get the Karmachari review queue.

## Not covered

- Ward Officer has no server-side auth (dashboard reads seed aggregates — G7).
- No admin UI for workers or for reassigning households (script only).
- Auto-provisioned households default to Ward 12 and address "Address pending" until a real
  AMC household registry / GPS-to-ward resolution replaces `POST /api/household/create`.
