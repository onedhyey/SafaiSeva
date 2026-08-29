import {
  HouseholdProfile,
  HandoverRecord,
  TicketRecord,
  KarmachariProfile,
  WardStats,
  DemoSettings,
} from '../types';

export function createBinPhotoSvg(label: string, isClean = true, accent = '#19A85B'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
    <rect width="400" height="300" fill="#0F1F17" />
    <rect x="20" y="20" width="360" height="260" rx="10" fill="#1B3226" stroke="#5B6B61" stroke-width="1.5"/>
    <g transform="translate(45, 60)">
      <!-- Stream bin 1 (Wet) -->
      <rect x="0" y="20" width="65" height="110" rx="6" fill="#19A85B" fill-opacity="0.25" stroke="#19A85B" stroke-width="2"/>
      <rect x="5" y="10" width="55" height="10" rx="3" fill="#19A85B"/>
      <text x="32" y="80" fill="#F0F4F1" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">WET</text>
      <text x="32" y="98" fill="#8FA697" font-family="sans-serif" font-size="9" text-anchor="middle">લીલો કચરો</text>
      
      <!-- Stream bin 2 (Dry) -->
      <rect x="80" y="20" width="65" height="110" rx="6" fill="#5B6B61" fill-opacity="0.3" stroke="#8FA697" stroke-width="2"/>
      <rect x="85" y="10" width="55" height="10" rx="3" fill="#8FA697"/>
      <text x="112" y="80" fill="#F0F4F1" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">DRY</text>
      <text x="112" y="98" fill="#8FA697" font-family="sans-serif" font-size="9" text-anchor="middle">સૂકો કચરો</text>

      <!-- Stream bin 3 (Sanitary) -->
      <rect x="160" y="20" width="65" height="110" rx="6" fill="#F0A83C" fill-opacity="0.2" stroke="#F0A83C" stroke-width="2"/>
      <rect x="165" y="10" width="55" height="10" rx="3" fill="#F0A83C"/>
      <text x="192" y="80" fill="#F0F4F1" font-family="sans-serif" font-size="10" font-weight="bold" text-anchor="middle">SANITARY</text>
      <text x="192" y="98" fill="#8FA697" font-family="sans-serif" font-size="9" text-anchor="middle">સેનિટરી</text>

      <!-- Stream bin 4 (Special) -->
      <rect x="240" y="20" width="65" height="110" rx="6" fill="#D2452C" fill-opacity="0.2" stroke="#D2452C" stroke-width="2"/>
      <rect x="245" y="10" width="55" height="10" rx="3" fill="#D2452C"/>
      <text x="272" y="80" fill="#F0F4F1" font-family="sans-serif" font-size="10" font-weight="bold" text-anchor="middle">HAZARD</text>
      <text x="272" y="98" fill="#8FA697" font-family="sans-serif" font-size="9" text-anchor="middle">વિશેષ કચરો</text>
    </g>
    <!-- Stamp header -->
    <text x="45" y="48" fill="#8FA697" font-family="monospace" font-size="11">SAFAISEVA VERIFIED CAPTURE // ${label}</text>
    <circle cx="355" cy="45" r="5" fill="${accent}" />
    <!-- Floor reflection marker -->
    <line x1="45" y1="210" x2="355" y2="210" stroke="#5B6B61" stroke-dasharray="4 4" stroke-width="1"/>
    <text x="200" y="245" fill="#8FA697" font-family="monospace" font-size="10" text-anchor="middle">AMC COMPLIANT SEGREGATION • 4-STREAM PROTOCOL</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function initialSeedData(): {
  household: HouseholdProfile;
  handovers: HandoverRecord[];
  tickets: TicketRecord[];
  karmachari: KarmachariProfile;
  wardStats: WardStats;
  settings: DemoSettings;
} {
  const today = new Date('2026-08-26T07:15:00.000Z');

  const household: HouseholdProfile = {
    id: 'HH-NV-0482',
    name: 'Patel Residence',
    address: '402 Shivam Apts, CG Road, Navrangpura',
    ward: 'Ward 12 - Navrangpura, Ahmedabad',
    registeredArea: {
      minLat: 23.030,
      maxLat: 23.045,
      minLng: 72.550,
      maxLng: 72.570,
    },
    collectionWindow: {
      startHour: 6,
      endHour: 12,
    },
    balance: 14, // 14 leaves, 6 away from 20 (free ride)
    streakDays: 9,
    totalKgDiverted: 68.4,
    ridesTaken: 4,
    lastHandoverDate: '2026-08-25',
  };

  // Generate 21 past handovers (3 weeks)
  const handovers: HandoverRecord[] = [];

  // Add 3 pending review items for Karmachari review queue
  handovers.push({
    id: 'HND-20260826-0912',
    householdId: 'HH-NV-0912',
    householdName: 'Mehta Bungalow, Mithakhali',
    ward: 'Ward 12 - Navrangpura',
    timestamp: '2026-08-26T06:45:10Z',
    dateString: '2026-08-26',
    photoUrl: createBinPhotoSvg('HH-NV-0912 / Low Contrast', false, '#F0A83C'),
    imageHash: 'd4a8e2b109f3c788',
    location: {
      lat: 23.0321,
      lng: 72.5614,
      address: 'Mithakhali Six Roads, Navrangpura',
      isFallback: false,
    },
    streamsConfirmed: { wet: true, dry: true, sanitary: false, special_care: false },
    verification: {
      status: 'in_review',
      decisionReason: 'Ambiguous boundary in dry stream — worker manual spot-check requested.',
      creditsAwarded: 2, // Held until approved
      confidence: 0.73,
      flags: ['ambiguous_dry_boundary'],
      imageHash: 'd4a8e2b109f3c788',
      stages: [
        { id: '1', label: 'Detecting waste streams', detail: 'Wet (green) and Dry (grey) streams detected.', passed: true },
        { id: '2', label: 'Checking for cross-contamination', detail: 'Shadows over Dry bin; possible non-segregated film.', passed: false },
        { id: '3', label: 'Confirming location and time', detail: 'Within collection window (06:45 AM) & registered radius.', passed: true },
      ],
      streams: {
        wet: { detected: true, status: 'clean', note: 'Clean organic kitchen waste', verdict: 'clean' },
        dry: { detected: true, status: 'marginal', note: 'Worker check needed: film plastic edge unclear', verdict: 'contaminated' },
        sanitary: { detected: false, status: 'none', note: 'None in this handover', verdict: 'none' },
        special_care: { detected: false, status: 'none', note: 'None in this handover', verdict: 'none' },
      },
    },
    status: 'in_review',
    creditsAwarded: 2,
    source: 'app',
  });

  handovers.push({
    id: 'HND-20260826-0845',
    householdId: 'HH-NV-0318',
    householdName: 'Trivedi Villa, Stadium Road',
    ward: 'Ward 12 - Navrangpura',
    timestamp: '2026-08-26T06:22:00Z',
    dateString: '2026-08-26',
    photoUrl: createBinPhotoSvg('HH-NV-0318 / Location Drift', false, '#F0A83C'),
    imageHash: 'f1e9c8a7b6d50244',
    location: {
      lat: 23.0482,
      lng: 72.5695,
      address: 'Near Sardar Patel Stadium (110m outside registered gate)',
      isFallback: true,
    },
    streamsConfirmed: { wet: true, dry: true, sanitary: true, special_care: false },
    verification: {
      status: 'in_review',
      decisionReason: 'GPS position (110m deviation) triggered geographic guardrail.',
      creditsAwarded: 2,
      confidence: 0.81,
      flags: ['gps_boundary_drift'],
      imageHash: 'f1e9c8a7b6d50244',
      stages: [
        { id: '1', label: 'Detecting waste streams', detail: 'Wet, Dry, and wrapped Sanitary streams detected.', passed: true },
        { id: '2', label: 'Checking for cross-contamination', detail: 'Bags securely separated with paper markings.', passed: true },
        { id: '3', label: 'Confirming location and time', detail: 'GPS 110m outside registered polygon; manual clearance needed.', passed: false },
      ],
      streams: {
        wet: { detected: true, status: 'clean', note: 'Clean kitchen waste', verdict: 'clean' },
        dry: { detected: true, status: 'clean', note: 'Paper and clean cardboard', verdict: 'clean' },
        sanitary: { detected: true, status: 'wrapped', note: 'Red dot marked packet', verdict: 'wrapped' },
        special_care: { detected: false, status: 'none', note: 'None in this handover', verdict: 'none' },
      },
    },
    status: 'in_review',
    creditsAwarded: 2,
    source: 'app',
  });

  handovers.push({
    id: 'HND-20260826-0730',
    householdId: 'HH-NV-0771',
    householdName: 'Shah Flats, Vijay Cross Roads',
    ward: 'Ward 12 - Navrangpura',
    timestamp: '2026-08-26T07:05:40Z',
    dateString: '2026-08-26',
    photoUrl: createBinPhotoSvg('HH-NV-0771 / Special Care', false, '#F0A83C'),
    imageHash: 'c90a1b2e3f4d5e6f',
    location: {
      lat: 23.0375,
      lng: 72.5541,
      address: 'Vijay Cross Roads, Navrangpura',
      isFallback: false,
    },
    streamsConfirmed: { wet: true, dry: true, sanitary: false, special_care: true },
    verification: {
      status: 'in_review',
      decisionReason: 'Special care stream item (mercury thermometer) requires worker confirmation.',
      creditsAwarded: 2,
      confidence: 0.88,
      flags: ['special_care_inspection'],
      imageHash: 'c90a1b2e3f4d5e6f',
      stages: [
        { id: '1', label: 'Detecting waste streams', detail: 'Wet, Dry, and hazardous Special Care box identified.', passed: true },
        { id: '2', label: 'Checking for cross-contamination', detail: 'Special care item properly isolated in red sealed box.', passed: true },
        { id: '3', label: 'Confirming location and time', detail: 'Within collection window & registered address.', passed: true },
      ],
      streams: {
        wet: { detected: true, status: 'clean', note: 'Vegetable peels & food waste', verdict: 'clean' },
        dry: { detected: true, status: 'clean', note: 'Cartons and milk bags rinsed', verdict: 'clean' },
        sanitary: { detected: false, status: 'none', note: 'None in this handover', verdict: 'none' },
        special_care: { detected: true, status: 'hazardous', note: 'Hazardous item flagged for safety verification', verdict: 'safe' },
      },
    },
    status: 'in_review',
    creditsAwarded: 2,
    source: 'app',
  });

  // Add past 20 daily handovers for Patel Residence (HH-NV-0482)
  for (let i = 1; i <= 20; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const isRejected = i === 10; // Day 10 had a plastic wrapper in wet waste
    const isManual = i === 14;

    const id = `HND-NV-${dateStr.replace(/-/g, '')}-0482`;
    handovers.push({
      id,
      householdId: 'HH-NV-0482',
      householdName: 'Patel Residence',
      ward: 'Ward 12 - Navrangpura',
      timestamp: `${dateStr}T07:22:${String(10 + (i % 40)).padStart(2, '0')}Z`,
      dateString: dateStr,
      photoUrl: createBinPhotoSvg(`HH-NV-0482 / ${dateStr}`, !isRejected, isRejected ? '#D2452C' : '#19A85B'),
      imageHash: `hash_${i}_${dateStr.replace(/-/g, '')}`,
      location: {
        lat: 23.0384,
        lng: 72.5592,
        address: '402 Shivam Apts, CG Road, Navrangpura',
        isFallback: i % 5 === 0,
      },
      streamsConfirmed: {
        wet: true,
        dry: true,
        sanitary: i % 4 === 0,
        special_care: i % 7 === 0,
      },
      verification: {
        status: isRejected ? 'rejected' : 'verified',
        decisionReason: isRejected
          ? 'Plastic wrapper detected in the wet stream. Organic waste must be 100% free of synthetic liners.'
          : 'All streams compliant. Wet and dry waste cleanly separated.',
        creditsAwarded: isRejected ? 0 : 2,
        confidence: isRejected ? 0.94 : 0.98,
        flags: isRejected ? ['cross_contamination_wet'] : [],
        imageHash: `hash_${i}_${dateStr.replace(/-/g, '')}`,
        stages: [
          { id: '1', label: 'Detecting waste streams', detail: 'Wet, Dry separation identified.', passed: true },
          { id: '2', label: 'Checking for cross-contamination', detail: isRejected ? 'Non-biodegradable pouch inside green bin.' : 'Zero cross-stream contamination detected.', passed: !isRejected },
          { id: '3', label: 'Confirming location and time', detail: 'Within registered CG Road polygon and morning collection route.', passed: true },
        ],
        streams: {
          wet: { detected: true, status: isRejected ? 'contaminated' : 'clean', note: isRejected ? 'Plastic wrapper detected in wet stream' : 'Clean organic waste', verdict: isRejected ? 'contaminated' : 'clean' },
          dry: { detected: true, status: 'clean', note: 'Clean paper, plastic bottles', verdict: 'clean' },
          sanitary: { detected: i % 4 === 0, status: i % 4 === 0 ? 'wrapped' : 'none', note: i % 4 === 0 ? 'Wrapped in newspaper with red mark' : 'None', verdict: i % 4 === 0 ? 'wrapped' : 'none' },
          special_care: { detected: i % 7 === 0, status: i % 7 === 0 ? 'safe' : 'none', note: i % 7 === 0 ? 'Battery in sealed bag' : 'None', verdict: i % 7 === 0 ? 'safe' : 'none' },
        },
      },
      status: isRejected ? 'rejected' : 'verified',
      creditsAwarded: isRejected ? 0 : 2,
      source: isManual ? 'manual_worker' : 'app',
      reviewedBy: isManual ? 'Karmachari Ramesh Bhai (ID: KAR-109)' : undefined,
    });
  }

  const tickets: TicketRecord[] = [
    {
      id: 'TKT-JM-91823',
      transitType: 'janmarg_brts',
      title: 'Janmarg BRTS Single Ride',
      route: 'Route 4D: RTO Circle → Gita Mandir',
      creditsSpent: 20,
      redeemedAt: '2026-08-25T14:30:00Z',
      expiresAt: '2026-08-26T23:59:59Z',
      qrPayload: 'SAFAISEVA-AMTS-BRTS-TKT-91823-VALID-20260826-ROUTE4D',
      status: 'active',
    },
    {
      id: 'TKT-METRO-40192',
      transitType: 'ahmedabad_metro',
      title: 'Metro Single Ride',
      route: 'East-West Corridor: Thaltej → Vastral Gam',
      creditsSpent: 20,
      redeemedAt: '2026-08-21T09:15:00Z',
      expiresAt: '2026-08-21T23:59:59Z',
      qrPayload: 'SAFAISEVA-GMRC-METRO-TKT-40192-USED',
      status: 'used',
    },
    {
      id: 'TKT-JM-38291',
      transitType: 'janmarg_brts',
      title: 'Janmarg BRTS Single Ride',
      route: 'Route 8U: Iskcon Cross Road → Maninagar',
      creditsSpent: 20,
      redeemedAt: '2026-08-16T18:00:00Z',
      expiresAt: '2026-08-16T23:59:59Z',
      qrPayload: 'SAFAISEVA-AMTS-BRTS-TKT-38291-USED',
      status: 'used',
    },
  ];

  const karmachari: KarmachariProfile = {
    id: 'KAR-109',
    name: 'Ramesh Bhai Vaghela',
    workerCode: 'AMC-WZ-109',
    zone: 'West Zone',
    ward: 'Ward 12 - Navrangpura',
    reviewsClearedToday: 18,
    manualCreditsIssued: 7,
    overrideRate: 64, // 64% within normal range
  };

  const wardStats: WardStats = {
    wardName: 'Ward 12 - Navrangpura',
    householdsEnrolled: 1840,
    participationRateThisWeek: 78.4,
    participationRateLastWeek: 72.1,
    creditsIssued: 3680,
    rupeeValue: 18400, // 3680 * ₹5 equivalent transit subsidy
    aiSplit: {
      approved: 84.6,
      inReview: 10.2,
      rejected: 5.2,
    },
    leaderboard: [
      { rank: 1, householdCode: 'HH-NV-0112', society: 'Shivalik Heights, CG Road', streak: 28, credits: 56 },
      { rank: 2, householdCode: 'HH-NV-0892', society: 'Prerna Vihar, Mithakhali', streak: 26, credits: 52 },
      { rank: 3, householdCode: 'HH-NV-0341', society: 'Goyal Terraces, Stadium Rd', streak: 21, credits: 42 },
      { rank: 4, householdCode: 'HH-NV-0482', society: 'Shivam Apts, Navrangpura (You)', streak: 9, credits: 14 },
      { rank: 5, householdCode: 'HH-NV-0921', society: 'Swastik Enclave, CG Road', streak: 8, credits: 16 },
      { rank: 6, householdCode: 'HH-NV-0238', society: 'Arunodaya Society, Alkapuri', streak: 7, credits: 14 },
      { rank: 7, householdCode: 'HH-NV-0519', society: 'Panchamrut Flats, Stadium', streak: 6, credits: 12 },
      { rank: 8, householdCode: 'HH-NV-0740', society: 'Vandana Apts, Mithakhali', streak: 5, credits: 10 },
    ],
    subDistricts: [
      { name: 'Navrangpura North', households: 420, participation: 84.5, status: 'optimal' },
      { name: 'CG Road Commercial & Mixed', households: 380, participation: 81.2, status: 'optimal' },
      { name: 'Mithakhali Six Roads', households: 310, participation: 76.8, status: 'optimal' },
      { name: 'Stadium Ward / Swastik', households: 390, participation: 74.3, status: 'attention' },
      { name: 'Vijay Cross Roads Sector', households: 340, participation: 68.9, status: 'low' },
    ],
    karmacharis: [
      { id: 'KAR-109', name: 'Ramesh Bhai (You)', route: 'Route W-12A (CG Road)', reviewsDone: 18, overrides: 11, overrideRate: 61.1, flagged: false },
      { id: 'KAR-204', name: 'Paresh Parmar', route: 'Route W-12B (Stadium)', reviewsDone: 24, overrides: 14, overrideRate: 58.3, flagged: false },
      { id: 'KAR-301', name: 'Suresh Rathod', route: 'Route W-12C (Mithakhali)', reviewsDone: 32, overrides: 31, overrideRate: 96.8, flagged: true, flagReason: 'High override rate (>95%) — review required' },
      { id: 'KAR-412', name: 'Kanti Solanki', route: 'Route W-12D (Vijay XR)', reviewsDone: 15, overrides: 5, overrideRate: 33.3, flagged: true, flagReason: 'Low override rate (<40%) — review required' },
    ],
    anomalies: [
      {
        householdId: 'HH-NV-0199',
        name: 'Royal Orchid Tower Flat 901',
        address: 'Near Commerce Six Roads',
        approvalRate: 100,
        totalSubmissions: 31,
        flagReason: '31 consecutive 100% approvals with identical timestamps (06:30:02 AM). Potential automated script or duplicate capture.',
        severity: 'high',
      },
      {
        householdId: 'HH-NV-0824',
        name: 'Ketan B. Shah',
        address: 'B-12 Paras Society, Stadium Road',
        approvalRate: 98,
        totalSubmissions: 28,
        flagReason: 'Submitted 4 handovers within 2 hours from differing GPS clusters on 24 Aug.',
        severity: 'medium',
      },
    ],
  };

  const settings: DemoSettings = {
    aiOutcomeOverride: 'auto',
    simulateOffline: false,
    theme: 'light',
  };

  return {
    household,
    handovers,
    tickets,
    karmachari,
    wardStats,
    settings,
  };
}
