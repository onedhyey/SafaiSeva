// Thin client for the SafaiSeva backend. Every call carries the anonymous device id in a
// header; when auth is enabled later, a Clerk bearer token is added alongside it and the
// server prefers that (see server/principal.ts).

import { getDeviceId } from './authContext';

export interface BinsInfo {
  count: number;
  target: number;
  onboarded: boolean;
  milestoneCredits: { two_bins: number; four_bins: number };
}

export interface WalletResponse {
  householdCode: string | null;
  balance: number;
  pending: number;
  lifetimeEarned?: number;
  handovers: ServerHandover[];
  tickets: any[];
  bins?: BinsInfo;
  redeem?: Record<string, number>;
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

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': getDeviceId(),
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
