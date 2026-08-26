# SafaiSeva

**Segregate today. Ride tomorrow.**

A mobile web app that rewards households for separating their waste — and pays them in public transport.

Photograph your four separated streams when the collection van arrives. AI checks they're genuinely sorted. Every approved handover earns 2 leaf credits, and 20 credits is a free ride on Janmarg BRTS or the Ahmedabad Metro.

---

## Why this exists

Ahmedabad was named India's cleanest big city in July 2025. Four-way segregation became compulsory here on 12 May 2026, under the national Solid Waste Management Rules 2026 and a Supreme Court direction.

The city still separates only **29%** of its waste at source.

Between January 2025 and May 2026, AMC issued 3.54 lakh notices and recovered **₹16.95 crore** in fines. It has spent **nothing** rewarding the households that get it right. Every rupee has gone into punishment; there is no reward loop anywhere in the system.

Research on household segregation in Indian cities finds the strongest reason people stop is that nothing ever comes back to them — no confirmation, no proof it stayed separate, no benefit. SafaiSeva is the missing half of that equation.

Meanwhile the waste goes to **Pirana** — roughly 84 acres, open since 1982, 126 lakh tonnes of accumulated waste piled up to 75 feet, with about 3 lakh people living beside it.

## How it works

```
Document  →  AI verifies  →  Earn credits  →  Redeem for transport
```

1. **Document** — At handover, photograph your four separated streams: wet, dry, sanitary, special care. GPS and timestamp attach automatically.
2. **Verify** — AI analyses the photo: are the streams genuinely separated? Is the wet waste clear of plastic? Is sanitary waste wrapped?
3. **Earn** — An approved handover earns **2 credits**, denominated in leaves.
4. **Ride** — **20 credits = 1 free ride** on Janmarg BRTS or the Ahmedabad Metro, redeemed through QR ticketing.

### Why a bus ticket and not cash

- **It closes a public loop.** Cutting the city's waste load earns you more access to its low-carbon transport. Cash rewards any spending; a fare rewards more of the behaviour we actually want.
- **It costs the city almost nothing.** Ahmedabad Janmarg Limited is a Special Purpose Vehicle of AMC itself. A seat on a bus already running that route is near-zero marginal cost, so the credit is an internal transfer rather than money leaving the corporation.
- **It reaches people a tax rebate cannot.** A property-tax rebate rewards owners. A bus fare reaches the chawl household, the student and the domestic worker — who generate the least waste per head and absorb the most fines.

## Anti-gaming design

A photograph can prove *what* is in the frame. It cannot prove the handover happened. So content and event are verified separately:

| Check | What it prevents |
|---|---|
| AI stream analysis | Waste that isn't actually separated |
| One approved handover per household per day | Farming credits with repeat submissions |
| Perceptual-hash duplicate detection | Re-submitting an old photo |
| Geotag within registered area | Photographing a neighbour's bins |
| Timestamp within the route's collection window | Submitting outside collection hours |
| Anomaly flagging to the ward officer | Sustained abnormal approval rates |

Any check failing routes the handover to **Needs review** rather than auto-approving. A human decides only the exceptions.

## Roles

| Role | What they do |
|---|---|
| **Resident** | Documents handovers, earns credits, redeems rides |
| **Safai karmachari** | Clears the AI's review queue, and issues credits at the door to households with no smartphone |
| **Ward officer** | Monitors participation, credits issued, and anomaly flags |

The demo build includes a role switcher in the header so the full loop can be shown on one device.

## Tech stack

- **Vite** + **React 18** + **TypeScript**
- **Tailwind CSS** — palette configured as named tokens
- **vite-plugin-pwa** — manifest, service worker, offline shell
- **idb-keyval** — local persistence
- **react-router-dom**, **lucide-react**
- **IBM Plex** (Sans / Sans Devanagari / Mono), self-hosted

Installable as a PWA. Works fully offline after first load.

## Getting started

```bash
git clone https://github.com/<your-org>/safaiseva.git
cd safaiseva
npm install
npm run dev
```

Open the printed local URL. For the best experience, use your browser's device toolbar at a 390×844 viewport, or open it on a phone over your local network.

```bash
npm run build     # production build
npm run preview   # serve the build — required to test the service worker and install prompt
```

> The install prompt and offline behaviour only work against a production build served over HTTPS or `localhost`. They will not appear in `npm run dev`.

## Demo script (60 seconds)

1. Open on **Resident** — point out the credit balance and the progress to the next ride.
2. Tap **Document today's handover**. Tick the four streams, take a photo.
3. Watch the **AI analysis** — the staged checks and the per-stream readout. Credit lands: **+2**.
4. Go to **Rewards**, redeem 20 credits, show the generated QR ticket.
5. Switch to **Karmachari** — show the review queue, and the *Issue credit without app* button for households with no smartphone.
6. Switch to **Ward Officer** — show ward participation and the anomaly flags.
7. Tap **Download as an App** in the footer to install it.

`Settings → Reset demo` restores the seeded state so the demo can be run again.

## What's faked

This is a working prototype built to demonstrate a concept, not a production system. In the interest of not overclaiming:

- **AI verification is simulated.** `src/lib/verification.ts` is a deterministic rule engine with realistic staging, plus the image checks that genuinely run locally (brightness, dimensions, perceptual-hash duplicate detection). It sits behind a clean interface so a real on-device model can replace it without touching the UI.
- **There is no backend.** All state lives in the browser via IndexedDB. Nothing syncs, nothing is shared between devices.
- **Demo data is seeded** — three weeks of prior activity, a ward leaderboard, previously redeemed tickets.
- **Transit redemption is not live.** Tickets are generated locally. Real redemption would need an agreement with Ahmedabad Janmarg Limited; a pilot could sidestep this by buying smart-card credit directly.
- **There is no authentication.** Households are selected, not logged in.

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
