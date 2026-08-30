// Adapters from backend payloads to the local view-model shapes the screens already use.
// Phase 2 wires the wallet + submission path to the server; the remaining screens still
// read local seed data and migrate in Phase 3.

import {
  HandoverRecord,
  HandoverStatus,
  HouseholdProfile,
  StreamChecklist,
  TicketRecord,
  VerificationResult,
} from '../types';
import { ServerHandover, ServerTicket } from './api';

export function serverTicketToRecord(t: ServerTicket): TicketRecord {
  return {
    id: t.id,
    transitType: t.transit_type as TicketRecord['transitType'],
    title: t.title,
    route: t.route ?? '',
    creditsSpent: t.credits_spent,
    redeemedAt: t.redeemed_at,
    expiresAt: t.expires_at,
    qrPayload: t.token ?? t.id,
    status: t.status === 'void' ? 'expired' : t.status,
  };
}

export function streamArrayToChecklist(streams: string[] | null | undefined): StreamChecklist {
  const s = streams ?? [];
  return {
    wet: s.includes('wet'),
    dry: s.includes('dry'),
    sanitary: s.includes('sanitary'),
    special_care: s.includes('special_care'),
  };
}

function displayStatus(s: ServerHandover['status']): HandoverStatus {
  return s === 'pending' ? 'in_review' : s;
}

function minimalVerification(sh: ServerHandover): VerificationResult {
  const none = { detected: false, status: 'none', note: '—', verdict: 'none' as const };
  return {
    status: displayStatus(sh.status),
    decisionReason: sh.decision_reason_text || '—',
    creditsAwarded: sh.credits_awarded ?? 0,
    confidence: 0,
    mediaType: sh.media_kind ?? 'photo',
    stages: [],
    streams: { wet: { ...none }, dry: { ...none }, sanitary: { ...none }, special_care: { ...none } },
    flags: [],
    imageHash: sh.id,
    handoverId: sh.id,
  };
}

export function serverHandoverToRecord(
  sh: ServerHandover,
  household: HouseholdProfile
): HandoverRecord {
  return {
    id: sh.id,
    householdId: household.id,
    householdName: household.name,
    ward: household.ward,
    timestamp: sh.created_at,
    dateString: sh.collection_date,
    photoUrl: '',
    imageHash: sh.id,
    location: { lat: 0, lng: 0, address: household.address, isFallback: false },
    streamsConfirmed: streamArrayToChecklist(sh.confirmed_streams ?? sh.declared_streams),
    verification: minimalVerification(sh),
    status: displayStatus(sh.status),
    creditsAwarded: sh.credits_awarded ?? 0,
    source: 'app',
  };
}
