// Client-side verification adapter.
//
// This file no longer decides anything (audit C2). It converts the DocumentView inputs
// into a backend request, calls the server-authoritative pipeline, and maps the server's
// decision onto the `VerificationResult` shape the UI already renders.

import {
  StreamChecklist,
  LocationData,
  VerificationResult,
  HouseholdProfile,
  StreamAnalysisItem,
} from '../types';
import {
  verifyHandover,
  uploadEvidenceBlob,
  dataUrlToBlob,
  VerifyRequest,
  VerifyResponse,
} from './api';
import { isNetworkError } from './offlineQueue';

/**
 * Thrown by `analyse` / `analyseVideo` when the submission could not leave the device
 * because of connectivity (the evidence upload or the verify call hit a network error).
 * DocumentView catches this and puts the capture in the offline queue instead of
 * showing a rejection (audit P6 / T3.1).
 */
export class OfflineSubmitError extends Error {
  constructor(message = 'offline') {
    super(message);
    this.name = 'OfflineSubmitError';
  }
}

export interface VerificationOptions {
  photo: string;
  streams: StreamChecklist;
  location: LocationData;
  household: HouseholdProfile;
  timestamp?: Date;
}

export interface VideoVerificationOptions {
  /** The recorded clip. Uploaded to Storage; only its key is sent to the server. */
  videoBlob?: Blob | null;
  videoFrames?: string[];
  streams: StreamChecklist;
  location: LocationData;
  household: HouseholdProfile;
  /** Handover id returned by the first (photo) attempt — the server updates that row. */
  handoverId?: string;
  timestamp?: Date;
}

export function checklistToArray(s: StreamChecklist): string[] {
  return (['wet', 'dry', 'sanitary', 'special_care'] as const).filter((k) => s[k]);
}

function streamItem(
  key: string,
  ev: VerifyResponse['evidence'] extends infer E
    ? E extends { streams: infer S }
      ? S[keyof S]
      : never
    : never
): StreamAnalysisItem {
  if (!ev || !ev.visible) {
    return { detected: false, status: 'none', note: ev?.note || 'Not detected', verdict: 'none' };
  }
  const major = ev.contamination === 'major';
  const verdict =
    major
      ? 'contaminated'
      : key === 'sanitary'
      ? 'wrapped'
      : key === 'special_care'
      ? 'safe'
      : 'clean';
  return {
    detected: true,
    status: ev.contamination === 'none' ? 'clean' : ev.contamination,
    note: ev.note || 'Observed',
    verdict: verdict as StreamAnalysisItem['verdict'],
  };
}

function emptyStreams(): VerificationResult['streams'] {
  const none: StreamAnalysisItem = { detected: false, status: 'none', note: 'Not verified', verdict: 'none' };
  return { wet: { ...none }, dry: { ...none }, sanitary: { ...none }, special_care: { ...none } };
}

function toResult(r: VerifyResponse, mediaType: 'photo' | 'video'): VerificationResult {
  const ev = r.evidence;
  const streams = ev
    ? {
        wet: streamItem('wet', ev.streams.wet as any),
        dry: streamItem('dry', ev.streams.dry as any),
        sanitary: streamItem('sanitary', ev.streams.sanitary as any),
        special_care: streamItem('special_care', ev.streams.special_care as any),
      }
    : emptyStreams();

  const conf = ev?.overallConfidence ?? 0.5;
  const blockSignals = (r.fraudSignals || []).filter((s) =>
    ['daily_limit', 'geo_outside', 'window_outside', 'duplicate_phash', 'recapture_suspected'].includes(s)
  );

  const stages = [
    {
      id: '1',
      label: 'Detecting waste & declared streams',
      detail: ev?.observation || 'Evaluated by AI vision check.',
      passed: r.status !== 'rejected' || !!ev?.observation,
    },
    {
      id: '2',
      label: 'Fraud & duplicate checks',
      detail: blockSignals.length ? `Flagged: ${blockSignals.join(', ')}` : 'No blocking signals.',
      passed: blockSignals.length === 0,
    },
    {
      id: '3',
      label: 'Location & collection window',
      detail:
        r.fraudSignals?.includes('geo_outside') || r.fraudSignals?.includes('window_outside')
          ? 'Outside registered area or collection hours.'
          : 'Within registered area and hours.',
      passed: !(r.fraudSignals?.includes('geo_outside') || r.fraudSignals?.includes('window_outside')),
    },
  ];

  return {
    status: r.status,
    decisionReason: r.fix ? `${r.reasonText} ${r.fix}` : r.reasonText,
    creditsAwarded: r.creditsAwarded,
    confidence: conf,
    confidenceLevel: conf >= 0.75 ? 'high' : 'low',
    detectedStreams: r.confirmedStreams,
    requiresVideo: r.status === 'needs_video',
    mediaType,
    stages,
    streams,
    flags: r.fraudSignals || [],
    imageHash: r.handoverId,
    handoverId: r.handoverId,
    secondaryReasons: r.otherReasons ?? [],
  };
}

function errorResult(message: string, mediaType: 'photo' | 'video'): VerificationResult {
  return {
    status: 'rejected',
    decisionReason: `Verification could not be completed: ${message}`,
    creditsAwarded: 0,
    confidence: 0,
    confidenceLevel: 'low',
    mediaType,
    stages: [
      { id: '1', label: 'Detecting waste & declared streams', detail: 'Service error.', passed: false },
      { id: '2', label: 'Fraud & duplicate checks', detail: 'Not run.', passed: false },
      { id: '3', label: 'Location & collection window', detail: 'Not run.', passed: false },
    ],
    streams: emptyStreams(),
    flags: ['service_error'],
    imageHash: '',
  };
}

export async function analyse(options: VerificationOptions): Promise<VerificationResult> {
  const declaredStreams = checklistToArray(options.streams);
  if (declaredStreams.length < 2) {
    return {
      status: 'rejected',
      decisionReason:
        'Select at least two streams — you must separate wet and dry waste to log a handover.',
      creditsAwarded: 0,
      confidence: 0.99,
      confidenceLevel: 'high',
      mediaType: 'photo',
      stages: [],
      streams: emptyStreams(),
      flags: ['too_few_streams'],
      imageHash: '',
    };
  }

  try {
    const photoKey = await uploadEvidenceBlob('photo', dataUrlToBlob(options.photo));
    const payload: VerifyRequest = {
      declaredStreams,
      attempt: 1,
      photoKey,
      clientCapturedAt: (options.timestamp ?? new Date()).toISOString(),
      clientLat: options.location?.lat ?? null,
      clientLng: options.location?.lng ?? null,
      clientAccuracyM: options.location?.accuracyMeters ?? null,
      idempotencyKey: `att1-${options.household.id}-${(options.timestamp ?? new Date()).getTime()}`,
    };
    return toResult(await verifyHandover(payload), 'photo');
  } catch (err: any) {
    if (isNetworkError(err)) throw new OfflineSubmitError(err?.message);
    console.error('Photo verification error:', err);
    return errorResult(err.message || 'network error', 'photo');
  }
}

export async function analyseVideo(options: VideoVerificationOptions): Promise<VerificationResult> {
  const declaredStreams = checklistToArray(options.streams);

  try {
    // Upload the clip if MediaRecorder produced one; a frames-only fallback goes inline.
    const videoKey = options.videoBlob
      ? await uploadEvidenceBlob('video', options.videoBlob)
      : undefined;
    const payload: VerifyRequest = {
      declaredStreams,
      attempt: 2,
      handoverId: options.handoverId,
      videoKey,
      videoFrames: options.videoFrames,
      clientCapturedAt: (options.timestamp ?? new Date()).toISOString(),
      clientLat: options.location?.lat ?? null,
      clientLng: options.location?.lng ?? null,
      clientAccuracyM: options.location?.accuracyMeters ?? null,
      idempotencyKey: `att2-${options.household.id}-${(options.timestamp ?? new Date()).getTime()}`,
    };
    return toResult(await verifyHandover(payload), 'video');
  } catch (err: any) {
    if (isNetworkError(err)) throw new OfflineSubmitError(err?.message);
    console.error('Video verification error:', err);
    return errorResult(err.message || 'network error', 'video');
  }
}
