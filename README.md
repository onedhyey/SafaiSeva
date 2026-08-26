# SafaiSeva — Ahmedabad Civic Waste Segregation & Transit Reward PWA

SafaiSeva is a civic Progressive Web App for Ahmedabad Municipal Corporation (AMC). Households document their daily 4-stream waste segregation (Wet, Dry, Sanitary, Special care) by photographing their bins. An edge verification engine analyzes the submission and awards **2 leaf credits** upon approval. Accumulated credits (20 leaves = 1 free ride) can be redeemed for tickets on Janmarg BRTS and Ahmedabad Metro.

---

## 60-Second Demo Script (For Jury Presentation)

Follow these exact steps on one mobile device or viewport:

### Step 1: Resident Role — Wallet & Balance (0–15s)
1. Ensure the header role switcher is on **Resident**.
2. Point out the hero segregation balance (**14 leaves**) and the goal tracker (**14 / 20 credits to your next free ride**).
3. Note the custom leaf glyph used across all credit numbers, the 9-day streak, and the past activity feed showing verified/rejected handovers.

### Step 2: Document & AI Analysis (15–30s)
1. Tap **"Document today's handover"**.
2. Review the 4-stream checklist: Wet (Green), Dry (Blue-grey), Sanitary (Amber), Special Care (Red).
3. Tap **"Verify with AI Analysis"**.
4. Watch the 3-stage computer vision sweep (~2.5 seconds total):
   - `Detecting waste streams`
   - `Checking for cross-contamination`
   - `Confirming location and time`
5. Show the itemized breakdown table and the **Approved (+2 Leaves)** banner with the balance count-up animation.

### Step 3: Redeem Public Transit Ticket (30–40s)
1. Switch to the **Rewards** tab at the bottom.
2. Note the updated balance (**16 leaves**).
3. Tap on an active **Janmarg BRTS Single Ride** ticket to reveal the offline QR code, ticket ID in IBM Plex Mono, and validity countdown timer.

### Step 4: Karmachari Role — Exception Clearance & Equity (40–50s)
1. In the top header segmented control, tap **Karmachari**.
2. Notice the instant shift to a dense, utilitarian work-tool register.
3. Review an AI-flagged item in the **Exception Review Queue** with the side-by-side photo and AI flag rationale.
4. Tap **"Approve & Release +2"** or select a reject chip (*Not separated at source*).
5. Tap **"Issue Credit (Without App)"** to demonstrate the offline equity guarantee for households without smartphones.

### Step 5: Ward Officer Role — Supervisory Audit (50–60s)
1. In the top header segmented control, tap **Ward Officer**.
2. Notice the sober, data-dense administrative console.
3. Show the **AI Decision Split** (84.6% Direct Pass, 10.2% In Review, 5.2% Rejected).
4. Tap the **Anomalies** tab to show anti-gaming flags (e.g. repetitive automated timestamps or geographic drift).
5. Tap **Worker Audit** to show per-karmachari override rates flagging fraud thresholds (&gt;95% or &lt;40%).

---

## What's Simulated / Faked (Honest Disclosure)

In accordance with the offline demo requirements:
1. **No Cloud Vision API**: Computer vision inference is executed through a deterministic local heuristic engine in `src/lib/verification.ts` (`// TODO: swap for on-device model (TF.js MobileNet fine-tune or similar)`). It calculates real perceptual 64-bit dHashes on an HTML5 canvas for duplicate-image detection, validates morning route collection windows, and checks AMC geographic bounds.
2. **Local Client-Side State**: No remote server or external database is queried. All state persists offline in the browser via IndexedDB (`idb-keyval`) and `localStorage`.
3. **Seeded Initial Data**: 3 weeks of historical collection logs, 3 pending Karmachari review items, 3 transit tickets, and Ward 12 leaderboard metrics are seeded on first load.
4. **Demo Control Switch**: The Settings panel (gear icon) provides a control to force the next AI result to `Force Approve`, `Force Needs Review`, or `Force Reject` for repeatable testing.

---

## Running & Building

### Development
```bash
npm install
npm run dev
```

### Production Build
```bash
npm run build
```

The output in `dist/` contains the service worker (`sw.js`), web manifest (`manifest.webmanifest`), all PNG icon sizes (192×192, 512×512, 512×512 maskable, 180×180 apple touch icon), and self-hosted IBM Plex font woff2 files.

---

## Design System & Registers

- **Palette**: `ink` (#0F1F17), `ink-soft` (#1B3226), `green` (#19A85B), `amber` (#F0A83C), `red` (#D2452C), `muted` (#5B6B61), `muted-l` (#8FA697), `tint` (#F0F4F1), `white` (#FFFFFF).
- **Typography**: Self-hosted IBM Plex Sans, IBM Plex Sans Devanagari, and IBM Plex Mono from `/public/fonts/`.
- **Identity Mark**: Single custom inline SVG Leaf glyph (`src/components/LeafGlyph.tsx`) used uniformly for all credit references.
- **Three Distinct Registers**:
  - *Resident*: Calm, spacious, consumer-grade with one dominant balance metric.
  - *Karmachari*: High-contrast, dense utilitarian tool with large physical action buttons.
  - *Ward Officer*: Data-dense, sober tabular console with anti-gaming audit metrics.
