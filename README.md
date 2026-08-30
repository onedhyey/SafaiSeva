# SafaiSeva

**Segregate today. Ride tomorrow.**

A mobile web app that rewards households for separating their waste — and pays them in public transport.

Set up separate bins at home, then photograph your sorted streams at handover. A vision model checks what's actually in the frame; the backend decides the outcome. Reaching 2 / 4 / 6 bins pays a one‑time bonus, each verified handover pays 1 leaf per confirmed stream (2–4), and 20 leaves is a free ride on Janmarg BRTS or the Ahmedabad Metro.

> **State of the build:** the resident loop — bin onboarding, handover verification, the
> credit ledger with a 24 h hold, and ticket redemption — runs against a real Supabase
> backend with a real Gemini vision check and server‑side fraud checks. The karmachari and
> ward‑officer screens still read seeded data. See **[ARCHITECTURE.md](ARCHITECTURE.md)**
> and **[GOVERNMENT_INTEGRATION.md](GOVERNMENT_INTEGRATION.md)**.

---

## Why this exists

Ahmedabad was named India's cleanest big city in July 2025. Four-way segregation became compulsory here on 12 May 2026, under the national Solid Waste Management Rules 2026 and a Supreme Court direction.

The city still separates only **29%** of its waste at source.

Between January 2025 and May 2026, AMC issued 3.54 lakh notices and recovered **₹16.95 crore** in fines. It has spent **nothing** rewarding the households that get it right. Every rupee has gone into punishment; there is no reward loop anywhere in the system.

Research on household segregation in Indian cities finds the strongest reason people stop is that nothing ever comes back to them — no confirmation, no proof it stayed separate, no benefit. SafaiSeva is the missing half of that equation.

Meanwhile the waste goes to **Pirana** — roughly 84 acres, open since 1982, 126 lakh tonnes of accumulated waste piled up to 75 feet, with about 3 lakh people living beside it.

## How it works

```
Set up bins  →  Document handover  →  AI evidence + backend verdict  →  Earn  →  Redeem
```

1. **Set up bins** — Say how many separate bins you keep at home. Reaching **2 / 4 / 6**
   bins pays **5 / 10 / 20** leaves, once each.
2. **Document** — At handover, select the streams present (at least wet + dry) and take a
   photo with the in‑app camera. GPS and a capture time attach automatically. There is no
   gallery upload.
3. **Verify** — The vision model reports what it sees (per‑stream, screen‑recapture
   likelihood, quality); the backend runs the fraud checks (one per day, geofence,
   collection window, cross‑user duplicate, velocity) and decides: **verified /
   needs a short video / in review / rejected**, with a plain reason and a "what to
   change" line.
4. **Earn** — A verified handover pays **1 leaf per confirmed stream (2–4)**. Earned
   leaves are spendable after a **24‑hour hold**.
5. **Ride** — **20 leaves = 1 free ride** on Janmarg BRTS or the Ahmedabad Metro; the
   ticket carries an HMAC‑signed QR.

### Why a bus ticket and not cash

- **It closes a public loop.** Cutting the city's waste load earns you more access to its low-carbon transport. Cash rewards any spending; a fare rewards more of the behaviour we actually want.
- **It costs the city almost nothing.** Ahmedabad Janmarg Limited is a Special Purpose Vehicle of AMC itself. A seat on a bus already running that route is near-zero marginal cost, so the credit is an internal transfer rather than money leaving the corporation.
- **It reaches people a tax rebate cannot.** A property-tax rebate rewards owners. A bus fare reaches the chawl household, the student and the domestic worker — who generate the least waste per head and absorb the most fines.

## Anti-gaming design

A photograph proves *what* is in the frame, not that the handover happened. Content and
event are checked separately, and **all of these run server‑side** (`server/fraud.ts`,
`src/lib/verification/adjudicator.ts`):

| Check | What it prevents | Where |
|---|---|---|
| Vision model reports per‑stream visibility / contamination | Credit for streams that aren't in frame | `server/gemini.ts` — evidence only |
| `recaptureLikelihood` + screen/print heuristics | Photographing a laptop showing an old photo | evidence + hash reuse |
| One verified handover per household per local day | Farming credits with repeat submissions | partial unique index |
| 64‑bit dHash compared **across all households** | Re‑submitting an old or a shared photo | `server/phash.ts` + `server/fraud.ts` |
| Point in the registered geofence (ward bbox interim) | Photographing a neighbour's bins | `app.point_in_geofence` |
| Capture time inside the collection window | Submitting outside collection hours | `app.in_collection_window` |
| Velocity / burst over the last 2 hours | One person feeding many households | `server/fraud.ts` |
| Resident "request a review" on a rejection | A wrong auto‑rejection with no recourse | `POST /api/handovers/:id/dispute` |

The backend reports the **most actionable** reason first (a bad photo before a wrong time),
with the rest listed as "also". Borderline confidence and conflicting signals route to
**in review** instead of auto‑approving.

AI cannot catch everything — a high‑quality print or a good phone‑of‑a‑phone shot can pass
image analysis. Residual risk is bounded by the structural checks (daily cap, geofence,
cross‑user duplicate), and the rejection copy says so plainly.

## Roles

| Role | What they do |
|---|---|
| **Resident** | Documents handovers, earns credits, redeems rides |
| **Safai karmachari** | Clears the AI's review queue, and issues credits at the door to households with no smartphone |
| **Ward officer** | Monitors participation, credits issued, and anomaly flags |

The demo build includes a role switcher in the header so the full loop can be shown on one device.

## Tech stack

- **Vite** + **React 19** + **TypeScript**
- **Express** API (`server/*.ts`, run by `tsx`) — service‑role Supabase, the sole authority
- **Supabase** — Postgres (RLS on every table, append‑only credit ledger), private Storage
- **@google/genai** — `gemini-3.6-flash`, evidence‑only vision check
- **Leaflet** + OpenStreetMap — the location picker (India‑wide, opens on Gujarat)
- **Tailwind CSS**, **lucide-react**, **IBM Plex** (Sans / Sans Devanagari / Mono), self‑hosted
- **vite-plugin-pwa** — manifest, service worker (network‑first for `/api`, cache‑first for assets)

## Getting started

```bash
git clone https://github.com/<your-org>/safaiseva.git
cd safaiseva
npm install
cp .env.example .env      # fill in GEMINI_API_KEY, SUPABASE_* and VITE_SUPABASE_*
# apply supabase/migrations/*.sql + supabase/seed.sql to your project
npm run dev               # API + Vite on http://localhost:3000
```

```bash
npm test          # adjudicator unit tests
npm run lint      # tsc --noEmit
npm run build     # vite build + esbuild bundle of server.ts
```

Best viewed at a ~390px mobile width. The camera flow needs a real camera and a granted
permission; there is deliberately no file‑upload fallback.

## Demo script

1. **Resident** opens → the bin setup asks how many separate bins you keep. Pick **Four
   bins** → **+15 leaves** (2‑bin + 4‑bin milestones).
2. **Document today's handover** → the in‑app camera → select at least wet + dry → run the
   AI vision check → see the staged checks and the per‑stream readout. Outside 6 AM–12 PM
   you'll get *"outside your collection hours (6:00 AM – 12:00 PM)"*; a non‑waste photo
   gets *"the image does not contain identifiable waste"*.
3. **Rewards** → redeem 20 leaves → the QR ticket modal with the signed token, cost and
   24 h validity. Balance drops live.
4. Switch to **Karmachari** / **Ward Officer** to show those views (seeded data).

## Current state — what's real and what isn't

| | State |
|---|---|
| Bin onboarding + milestone credits | **real** — Supabase, `POST /api/household/bins` |
| Handover: camera → Gemini evidence → adjudicator → credit ledger | **real** — server‑authoritative, 24 h hold |
| Fraud checks (day limit, geofence, window, cross‑user dup, velocity) | **real** — `server/fraud.ts` |
| Wallet balance + handover history | **real** — `GET /api/wallet` |
| Ticket redemption + `spend` ledger + HMAC‑signed QR | **real** — no transit gate reads it yet (see G2) |
| Resident dispute → routes to human review | **real** — `POST /api/handovers/:id/dispute` |
| Geofence polygon | **ward bounding box** until AMC supplies polygons (G1) |
| Collection window | placeholder 6 AM–12 PM until real route schedules (G4) |
| Karmachari review queue, manual issuance | **seeded / local** — needs server roles (G3, I7) |
| Ward Officer dashboard, leaderboard, anomalies | **seeded fiction** (G7) |
| Authentication | **off** by design — anonymous per‑device session. Clerk is wired and dormant; flip `VITE_AUTH_ENABLED`. See ARCHITECTURE.md |
| Offline capture queue | **not built** (P6) |

`Settings → Reset local demo data` clears this device's cache; it does not touch the server.

## Project context

Built for the **Environment & Climate Change Studio** at **Ahmedabad University**, in response to the brief: *Where does our waste go? Why do people struggle to segregate waste? What happens to different types of waste? What existing waste-management systems are in place?*

**Group 5** — Dhyey, Krishna, Sakshi, Zia, Krishiv, Sarvam

## Sources

Figures used in this project and its accompanying presentation:

- Ministry of Environment, Forest and Climate Change — Solid Waste Management Rules, 2026 (notified 28 January 2026, in force 1 April 2026)
- AMC four-way segregation mandate, 12 May 2026
- AMC waste generation and segregation figures (~3,200 TPD; 29% segregated) and enforcement figures (3.54 lakh notices, ₹16.95 crore)
- Central Pollution Control Board — Pirana dumpsite status note, January 2025
- Land Conflict Watch — Pirana landfill and affected communities
- *Frontiers in Sustainable Cities* (2026) — multi-stakeholder study of household waste segregation in Indian cities
- Ahmedabad Janmarg Limited — network and ownership structure; QR ticketing since 2017
- Ahmedabad Metro — fare structure and network

## License

MIT
