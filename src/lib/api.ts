// Thin client for the SafaiSeva backend. Every call carries the anonymous device id in a
// header; when auth is enabled later, a Clerk bearer token is added alongside it and the
// server prefers that (see server/principal.ts).

import { getDeviceId, getAuthToken } from './authContext';

export interface BinsInfo {
  count: number;
  target: number;
  onboarded: boolean;
  milestoneCredits: { two_bins: number; four_bins: number; six_bins: number };
}

export interface ServerTicket {
  id: string;
  transit_type: string;
  title: string;
  route: string | null;
  credits_spent: number;
  token: string | null;
  status: 'active' | 'used' | 'expired' | 'void';
  redeemed_at: string;
  expires_at: string;
  used_at: string | null;
}

export interface WalletResponse {
  householdCode: string | null;
  balance: number;
  pending: number;
  lifetimeEarned?: number;
  handovers: ServerHandover[];
  tickets: ServerTicket[];
  bins?: BinsInfo;
  redeem?: Record<string, number>;
}

export interface RedeemResponse {
  ticket: ServerTicket & { token: string };
  balance: number;
}

export interface SetBinsResponse {
  binCount: number;
  binTarget: number;
  milestonesAwarded: { milestone: string; credits: number }[];
  balance: number;
}

export interface ServerHandover {
  id: string;
  collection_date: string;
  status: 'pending' | 'verified' | 'needs_video' | 'in_review' | 'rejected';
  credits_awarded: number;
  confirmed_streams: string[] | null;
  declared_streams: string[] | null;
  decision_reason_code: string | null;
  decision_reason_text: string | null;
  media_kind: 'photo' | 'video' | null;
  settle_at: string | null;
  created_at: string;
}

export interface VerifyRequest {
  declaredStreams: string[];
  attempt: 1 | 2;
  handoverId?: string;
  photo?: string;
  video?: string;
  videoFrames?: string[];
  clientCapturedAt?: string;
  clientLat?: number | null;
  clientLng?: number | null;
  clientAccuracyM?: number | null;
  attestationNonce?: string;
  idempotencyKey?: string;
}

export interface VerifyResponse {
  handoverId: string;
  status: 'verified' | 'needs_video' | 'in_review' | 'rejected';
  reasonCode: string;
  reasonText: string;
  otherReasons?: string[];
  fix?: string;
  creditsAwarded: number;
  confirmedStreams: string[];
  fraudSignals?: string[];
  evidence?: {
    observation: string;
    streams: Record<
      string,
      { visible: boolean; contamination: string; note: string }
    >;
    imageQuality: string;
    overallConfidence: number;
    recaptureLikelihood: number;
  };
  settleAt?: string | null;
}

// Demo-only: the seeded karmachari. When auth is enabled the worker routes use the Clerk
// principal's own `workers` row instead and this header is ignored (see server/principal.ts).
export const DEMO_WORKER_CODE = 'AMC-WZ-109';

async function apiFetch<T>(path: string, init: RequestInit & { asWorker?: boolean } = {}): Promise<T> {
  const { asWorker, ...rest } = init;
  // When auth is on, the Clerk session token is present and the server prefers it;
  // the device id is still sent so an anonymous session can be claimed on first sign-in.
  const token = await getAuthToken();
  const res = await fetch(path, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': getDeviceId(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(asWorker ? { 'x-demo-worker': DEMO_WORKER_CODE } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body as T;
}

export function getWallet(): Promise<WalletResponse> {
  return apiFetch<WalletResponse>('/api/wallet');
}

export function verifyHandover(payload: VerifyRequest): Promise<VerifyResponse> {
  return apiFetch<VerifyResponse>('/api/handovers/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function disputeHandover(id: string, note: string): Promise<{ status: string; reasonText: string }> {
  return apiFetch(`/api/handovers/${id}/dispute`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export function setBinCount(binCount: number): Promise<SetBinsResponse> {
  return apiFetch<SetBinsResponse>('/api/household/bins', {
    method: 'POST',
    body: JSON.stringify({ binCount }),
  });
}

export function redeemTicket(transitType: string): Promise<RedeemResponse> {
  return apiFetch<RedeemResponse>('/api/tickets/redeem', {
    method: 'POST',
    body: JSON.stringify({ transitType }),
  });
}

// ---- Household onboarding (auth-on path) ----
export interface CreateHouseholdResponse {
  code: string;
  joinCode: string;
  nearbyExisting?: string | null;
}

export function createHousehold(payload: {
  address?: string;
  lat?: number;
  lng?: number;
}): Promise<CreateHouseholdResponse> {
  return apiFetch<CreateHouseholdResponse>('/api/household/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function joinHousehold(code: string): Promise<{ code: string }> {
  return apiFetch<{ code: string }>('/api/household/join', {
    method: 'POST',
    body: JSON.stringify({ code: code.trim() }),
  });
}

// ---- Karmachari ----
export interface ReviewItem {
  handover_id: string;
  household_code: string;
  address: string;
  ward_name: string;
  collection_date: string;
  attempt: number;
  declared_streams: string[];
  decision_reason_code: string | null;
  decision_reason_text: string | null;
  created_at: string;
  overall_confidence: number | null;
  recapture_likelihood: number | null;
  per_stream: Record<string, { visible: boolean; contamination: string; note: string }>;
  fraud_signals: string[];
}

export function getReviewQueue(): Promise<{ items: ReviewItem[] }> {
  return apiFetch('/api/review-queue', { asWorker: true });
}

export function decideReview(
  id: string,
  decision: 'approve' | 'reject',
  opts: { reason?: string; note?: string } = {}
): Promise<{ status: string; creditsAwarded?: number }> {
  return apiFetch(`/api/review-queue/${id}/decide`, {
    method: 'POST',
    asWorker: true,
    body: JSON.stringify({ decision, ...opts }),
  });
}

export function workerIssue(payload: {
  householdCode: string;
  streams: string[];
  workerLat?: number;
  workerLng?: number;
  note?: string;
}): Promise<{ householdCode: string; creditsAwarded: number }> {
  return apiFetch('/api/worker/issue', {
    method: 'POST',
    asWorker: true,
    body: JSON.stringify(payload),
  });
}
