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
import { verifyHandover, VerifyRequest, VerifyResponse } from './api';

export interface VerificationOptions {
  photo: string;
  streams: StreamChecklist;
  location: LocationData;
  household: HouseholdProfile;
  timestamp?: Date;
}

export interface VideoVerificationOptions {
  video: string;
  videoFrames?: string[];
  streams: StreamChecklist;
  location: LocationData;
  household: HouseholdProfile;
  /** Handover id returned by the first (photo) attempt — the server updates that row. */
  handoverId?: string;
  timestamp?: Date;
}

function checklistToArray(s: StreamChecklist): string[] {
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
  if (declaredStreams.length === 0) {
    return {
      status: 'rejected',
      decisionReason: 'Select at least one waste stream that is visible in your photo.',
      creditsAwarded: 0,
      confidence: 0.99,
      confidenceLevel: 'high',
      mediaType: 'photo',
      stages: [],
      streams: emptyStreams(),
      flags: ['no_streams_selected'],
      imageHash: '',
    };
  }

  const payload: VerifyRequest = {
    declaredStreams,
    attempt: 1,
    photo: options.photo,
    clientCapturedAt: (options.timestamp ?? new Date()).toISOString(),
    clientLat: options.location?.lat ?? null,
    clientLng: options.location?.lng ?? null,
    clientAccuracyM: options.location?.accuracyMeters ?? null,
    idempotencyKey: `att1-${options.household.id}-${(options.timestamp ?? new Date()).getTime()}`,
  };

  try {
    return toResult(await verifyHandover(payload), 'photo');
  } catch (err: any) {
    console.error('Photo verification error:', err);
    return errorResult(err.message || 'network error', 'photo');
  }
}

export async function analyseVideo(options: VideoVerificationOptions): Promise<VerificationResult> {
  const declaredStreams = checklistToArray(options.streams);
  const payload: VerifyRequest = {
    declaredStreams,
    attempt: 2,
    handoverId: options.handoverId,
    video: options.video || undefined,
    videoFrames: options.videoFrames,
    clientCapturedAt: (options.timestamp ?? new Date()).toISOString(),
    clientLat: options.location?.lat ?? null,
    clientLng: options.location?.lng ?? null,
    clientAccuracyM: options.location?.accuracyMeters ?? null,
    idempotencyKey: `att2-${options.household.id}-${(options.timestamp ?? new Date()).getTime()}`,
  };

  try {
    return toResult(await verifyHandover(payload), 'video');
  } catch (err: any) {
    console.error('Video verification error:', err);
    return errorResult(err.message || 'network error', 'video');
  }
}
