export type Role = 'resident' | 'karmachari' | 'officer';

export type WasteStream = 'wet' | 'dry' | 'sanitary' | 'special_care';

export interface StreamChecklist {
  wet: boolean;
  dry: boolean;
  sanitary: boolean;
  special_care: boolean;
}

export type HandoverStatus = 'verified' | 'in_review' | 'rejected' | 'needs_video';

export type ConfidenceLevel = 'high' | 'low';

export type StreamVerdict = 'clean' | 'contaminated' | 'wrapped' | 'unwrapped' | 'safe' | 'none';

export interface StreamAnalysisItem {
  detected: boolean;
  status: string;
  note: string;
  verdict: StreamVerdict;
}

export interface VerificationStageResult {
  id: string;
  label: string;
  detail: string;
  passed: boolean;
}

export interface VerificationResult {
  status: HandoverStatus;
  decisionReason: string;
  creditsAwarded: number;
  confidence: number;
  confidenceLevel?: ConfidenceLevel;
  detectedStreams?: string[];
  requiresVideo?: boolean;
  mediaType?: 'photo' | 'video';
  stages: VerificationStageResult[];
  streams: {
    wet: StreamAnalysisItem;
    dry: StreamAnalysisItem;
    sanitary: StreamAnalysisItem;
    special_care: StreamAnalysisItem;
  };
  flags: string[];
  imageHash: string;
  /** Server-generated handover id (present once the backend has created the row). */
  handoverId?: string;
  /** Secondary problems beyond the headline reason, each a full sentence. */
  secondaryReasons?: string[];
}

export interface LocationData {
  lat: number;
  lng: number;
  address: string;
  isFallback: boolean;
  accuracyMeters?: number;
  landmark?: string;
  ward?: string;
  zone?: string;
  source?: 'gps' | 'manual_pin' | 'manual_search' | 'fallback';
}

export interface HandoverRecord {
  id: string;
  householdId: string;
  householdName: string;
  ward: string;
  timestamp: string; // ISO string
  dateString: string; // YYYY-MM-DD
  photoUrl: string;
  imageHash: string;
  location: LocationData;
  streamsConfirmed: StreamChecklist;
  verification: VerificationResult;
  status: HandoverStatus;
  creditsAwarded: number;
  source: 'app' | 'manual_worker';
  reviewedBy?: string;
  reviewNotes?: string;
  reviewedAt?: string;
}

export type TransitType = 'janmarg_brts' | 'ahmedabad_metro' | 'janmarg_day_pass';

export interface TicketRecord {
  id: string;
  transitType: TransitType;
  title: string;
  route: string;
  creditsSpent: number;
  redeemedAt: string;
  expiresAt: string;
  qrPayload: string;
  status: 'active' | 'used' | 'expired';
}

export interface HouseholdProfile {
  id: string;
  name: string;
  address: string;
  ward: string;
  registeredArea: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  collectionWindow: {
    startHour: number;
    endHour: number;
  };
  balance: number;
  streakDays: number;
  totalKgDiverted: number;
  ridesTaken: number;
  lastHandoverDate?: string;
}

export interface KarmachariProfile {
  id: string;
  name: string;
  workerCode: string;
  zone: string;
  ward: string;
  reviewsClearedToday: number;
  manualCreditsIssued: number;
  overrideRate: number; // e.g. 64%
}

export interface WardLeaderboardEntry {
  rank: number;
  householdCode: string;
  society: string;
  streak: number;
  credits: number;
}

export interface SubDistrictStat {
  name: string;
  households: number;
  participation: number; // percentage
  status: 'optimal' | 'attention' | 'low';
}

export interface KarmachariAuditEntry {
  id: string;
  name: string;
  route: string;
  reviewsDone: number;
  overrides: number;
  overrideRate: number;
  flagged: boolean;
  flagReason?: string;
}

export interface AnomalyHousehold {
  householdId: string;
  name: string;
  address: string;
  approvalRate: number;
  totalSubmissions: number;
  flagReason: string;
  severity: 'high' | 'medium';
}

export interface WardStats {
  wardName: string;
  householdsEnrolled: number;
  participationRateThisWeek: number;
  participationRateLastWeek: number;
  creditsIssued: number;
  rupeeValue: number;
  aiSplit: {
    approved: number;
    inReview: number;
    rejected: number;
  };
  leaderboard: WardLeaderboardEntry[];
  subDistricts: SubDistrictStat[];
  karmacharis: KarmachariAuditEntry[];
  anomalies: AnomalyHousehold[];
}

export type DemoOutcomeOverride = 'auto' | 'force_approve' | 'force_review' | 'force_reject';

export type AppTheme = 'dark' | 'light';

export interface DemoSettings {
  aiOutcomeOverride: DemoOutcomeOverride;
  simulateOffline: boolean;
  theme?: AppTheme;
}
