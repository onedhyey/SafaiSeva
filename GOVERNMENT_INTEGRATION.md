# Government / municipal integration points

SafaiSeva runs end‑to‑end today on stub data for everything a municipal partner would
own. Each item below is a defined seam: what AMC (or AJL / GMRC) must provide, what the
code does in the meantime, and where it plugs in.

Nothing here blocks a pilot on a single ward with manually loaded data. Everything here
blocks a city‑wide rollout.

---

## G1 — Authoritative household registry & geofence

**Needed:** the list of registered households — address, ward, a stable id (the AMC
property‑tax id or the RFID bin id), and a real boundary polygon per household or per
society. From AMC property‑tax / door‑to‑door RFID bin data.

**Stub today:** `public.households` is seeded by hand (`supabase/seed.sql`). The geofence
check (`server/fraud.ts` → `geo_outside`) uses the **ward bounding box** from
`public.wards`, not a real polygon. `households.geofence_polygon` is `NULL`; when it is
populated (GeoJSON‑style `[[lng,lat], …]`) the SQL function `app.point_in_geofence()`
already does point‑in‑polygon and takes over automatically.

**Plug‑in:** bulk‑load `households` + `wards`; fill `geofence_polygon`. No code change.

---

## G2 — Transit ticket issuance & fare‑gate validation

**Needed:** a way to issue a ride entitlement that a Janmarg BRTS turnstile or a GMRC
Metro gate will actually accept, and the settlement accounting for the credit ↔ fare
subsidy between AMC and AJL / GMRC.

**Stub today:** `POST /api/tickets/redeem` mints a ticket row and an **HMAC‑signed token**
(`server/qrToken.ts`) rendered as a QR in the app. The token is tamper‑evident and
expiring, and `verifyTicket()` can validate it — but no transit system reads it. The
`spend` is real (it debits the credit ledger).

**Plug‑in:** replace the token format with whatever AJL / GMRC accept, or add an endpoint
they call to redeem `verifyTicket(token)`. Wire a settlement export from
`credit_ledger` where `entry_type = 'spend'`.

---

## G3 — Karmachari (sanitation worker) identity & routes

**Needed:** the worker roster — worker id, name, zone, assigned route/shift — from AMC
sanitation HR. Required before the manual "issue credit without app" path and the review
queue can be trusted.

**Stub today:** `public.workers` is seeded with one worker. The app's Karmachari / Ward
Officer roles are a **client‑side toggle** with mock access codes (`RoleSelectionModal`);
there is no server‑side role. The review‑queue and manual‑issuance screens still read /
write local seed data.

**Plug‑in:** load `workers`; when authentication is enabled (see `ARCHITECTURE.md`), map
the signed‑in principal to a `workers` row and gate the review / issuance API to it.

---

## G4 — Collection route schedule

**Needed:** the real per‑area collection window (when the van actually comes), replacing
the fixed 06:00–12:00.

**Stub today:** `households.collection_start_hour` / `collection_end_hour` (currently
6 and 12). The window check and the reason message both read these columns, so changing
them per household needs no code.

**Plug‑in:** a `route_schedules` table keyed by area + weekday, and a nightly job that
sets each household's window from it. Or just keep the two columns and update them.

---

## G5 — Legal basis & data protection

**Needed:**
- Authority for the reward scheme under the Solid Waste Management Rules and any AMC
  resolution.
- **DPDP Act 2023 compliance** for citizen PII and waste photos: consent capture,
  retention period, storage location (data residency), and a deletion path.

**Stub today:** evidence media goes to a **private** Supabase Storage bucket
(`evidence`); `handover_media` keeps the object key + hashes. There is no consent screen,
no retention job, no deletion endpoint.

**Plug‑in:** add a consent step to onboarding; add a scheduled purge of `handover_media`
+ storage objects older than the agreed retention; add a "delete my data" endpoint.

---

## G6 — Ground‑truth dataset

**Needed:** a labelled set of real Ahmedabad segregated‑waste photos and short videos —
all four (or six) streams, in apartment and chawl contexts, good and bad — to tune the
vision prompt, set the confidence thresholds, and defend the human‑review rate.

**Stub today:** thresholds in `reward_rules` (`recapture_block_at`,
`review_confidence_band`) are reasonable guesses. The model is `gemini-3.6-flash` with an
evidence‑only prompt.

**Plug‑in:** run the collected set through `POST /api/handovers/verify` in a dry‑run
mode, compare `verification_events` to labels, tune the `reward_rules` bands, and set a
target for the fraction routed to `in_review`.

---

## G7 — Officer / admin authority

**Needed:** who may see ward‑wide dashboards and anomaly data, and any link to the
existing notice / enforcement system.

**Stub today:** the Ward Officer view is a client role toggle over **entirely seeded**
ward stats, leaderboard and anomaly lists (`src/lib/seed.ts`). No server aggregates.

**Plug‑in:** server‑side officer role (with auth), and real aggregate views over
`handovers` / `credit_ledger` / `fraud_flags`.

---

## G8 — Funding line & pilot scope

**Needed:** the budget for the subsidy pool, the pilot ward, and the **registration unit**
— household vs building, and how shared society bins are handled.

**Stub today:** one demo household in Ward 12. `reward_rules.redeem` sets the leaf cost
per ticket; there is no pool cap.

**Plug‑in:** decide the registration unit before onboarding real households; add a
per‑ward monthly cap on `entry_type = 'spend'` if the pool is finite.

---

## Assumptions the pilot should test

- **"A seat already running is near‑zero marginal cost"** is false at peak — BRTS / Metro
  peak services are capacity‑constrained. Consider off‑peak‑only passes or a capped pool.
- **Reward size** (≈2–4 leaves/handover, 20 = 1 ride) may be too small to shift behaviour.
  Milestone credits (5 / 10 / 20 for 2 / 4 / 6 bins) front‑load it; calibrate with the pilot.
- **Photo‑at‑handover** assumes the resident is home at the bins during the window. A
  worker‑scan‑first model may fit real collection behaviour better.
- **Casual fraud** (reuse yesterday's photo, shoot the neighbour's bins) is what a small
  reward invites at scale. The structural checks (daily cap, geofence, server‑side
  cross‑user duplicate, velocity) matter more than model tuning.
