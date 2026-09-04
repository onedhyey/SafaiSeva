// Offline capture queue (audit P6 / T3.1).
//
// A resident can document a handover with no connectivity: the capture (photo/video +
// declared streams + location + timestamp) is stored locally and replayed to
// `POST /api/handovers/verify` once the device is back online. The server dedupes on
// `idempotencyKey`, so replaying a queued item is safe — the key is minted once, at
// enqueue time, and reused across every retry.
//
// This module is deliberately free of any static import of `./api` (which pulls the
// React auth context) so it can be unit-tested under `tsx` with an injected api + store.

import { get, set } from 'idb-keyval';
import type { VerifyRequest, VerifyResponse } from './api';

const QUEUE_KEY = 'safaiseva_offline_queue_v1';

export type QueuedStatus = 'queued' | 'sending' | 'failed';

export interface QueuedCapture {
  id: string;
  createdAt: string; // ISO
  householdId: string;
  attempt: 1 | 2;
  declaredStreams: string[];
  photoBlob?: Blob;
  videoBlob?: Blob;
  videoFrames?: string[];
  clientCapturedAt: string; // ISO
  clientLat: number | null;
  clientLng: number | null;
  clientAccuracyM: number | null;
  /** Minted at enqueue, reused on every retry → server-side dedupe. */
  idempotencyKey: string;
  /** Present only for a rare offline second attempt against an existing row. */
  handoverId?: string;
  status: QueuedStatus;
  attempts: number;
  lastError?: string;
  lastTriedAt?: string;
}

// --- storage adapter (swappable for tests) -------------------------------------------
export interface QueueStore {
  read(): Promise<QueuedCapture[]>;
  write(items: QueuedCapture[]): Promise<void>;
}

const idbStore: QueueStore = {
  async read() {
    return (await get<QueuedCapture[]>(QUEUE_KEY)) ?? [];
  },
  async write(items) {
    await set(QUEUE_KEY, items);
  },
};

let store: QueueStore = idbStore;

/** Test seam — replace the backing store with an in-memory one. */
export function __setQueueStore(s: QueueStore): void {
  store = s;
}

function uuid(): string {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `q-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

// --- queue CRUD ---------------------------------------------------------------------

export async function listQueue(): Promise<QueuedCapture[]> {
  return store.read();
}

export async function queueSize(): Promise<number> {
  return (await store.read()).length;
}

export interface EnqueueInput {
  householdId: string;
  attempt: 1 | 2;
  declaredStreams: string[];
  photoBlob?: Blob;
  videoBlob?: Blob;
  videoFrames?: string[];
  clientCapturedAt: string;
  clientLat: number | null;
  clientLng: number | null;
  clientAccuracyM: number | null;
  handoverId?: string;
}

export async function enqueueCapture(input: EnqueueInput): Promise<QueuedCapture> {
  const items = await store.read();
  const item: QueuedCapture = {
    ...input,
    id: uuid(),
    createdAt: new Date().toISOString(),
    idempotencyKey: `q${input.attempt}-${input.householdId}-${Date.now()}-${uuid().slice(0, 8)}`,
    status: 'queued',
    attempts: 0,
  };
  await store.write([item, ...items]);
  return item;
}

export async function removeFromQueue(id: string): Promise<void> {
  const items = await store.read();
  await store.write(items.filter((i) => i.id !== id));
}

export async function updateQueued(id: string, patch: Partial<QueuedCapture>): Promise<void> {
  const items = await store.read();
  await store.write(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
}

export async function clearQueue(): Promise<void> {
  await store.write([]);
}

// --- flush ------------------------------------------------------------------------

/** The slice of `./api` the flush needs — injected so tests don't load the real module. */
export interface FlushApi {
  uploadEvidenceBlob(kind: 'photo' | 'video' | 'keyframe', blob: Blob): Promise<string>;
  verifyHandover(payload: VerifyRequest): Promise<VerifyResponse>;
}

export interface FlushOutcome {
  sent: { id: string; response: VerifyResponse }[];
  failed: { id: string; error: string }[];
  remaining: number;
  stoppedOffline: boolean;
}

let flushing = false;

export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const msg = (err as { message?: string })?.message ?? '';
  return /network|failed to fetch|load failed|net::|fetch failed|ecconn|timeout/i.test(msg);
}

async function loadRealApi(): Promise<FlushApi> {
  const m = await import('./api');
  return { uploadEvidenceBlob: m.uploadEvidenceBlob, verifyHandover: m.verifyHandover };
}

/**
 * Send every queued capture, oldest first. Successful items are removed; a network
 * failure marks the item `failed` and stops the run (still offline — no point hammering).
 * A non-network failure (4xx/5xx) also marks `failed` but the run continues to the next
 * item. Re-entrant calls are no-ops while a flush is in flight.
 */
export async function flushQueue(api?: FlushApi): Promise<FlushOutcome> {
  if (flushing) {
    return { sent: [], failed: [], remaining: await queueSize(), stoppedOffline: false };
  }
  flushing = true;
  const sent: FlushOutcome['sent'] = [];
  const failed: FlushOutcome['failed'] = [];
  let stoppedOffline = false;

  try {
    const resolved = api ?? (await loadRealApi());
    // oldest first: the store keeps newest at the head
    const items = (await store.read()).slice().reverse();

    for (const item of items) {
      try {
        await updateQueued(item.id, {
          status: 'sending',
          attempts: item.attempts + 1,
          lastTriedAt: new Date().toISOString(),
          lastError: undefined,
        });

        const photoKey = item.photoBlob
          ? await resolved.uploadEvidenceBlob('photo', item.photoBlob)
          : undefined;
        const videoKey = item.videoBlob
          ? await resolved.uploadEvidenceBlob('video', item.videoBlob)
          : undefined;

        const payload: VerifyRequest = {
          declaredStreams: item.declaredStreams,
          attempt: item.attempt,
          handoverId: item.handoverId,
          photoKey,
          videoKey,
          videoFrames: item.videoFrames,
          clientCapturedAt: item.clientCapturedAt,
          clientLat: item.clientLat,
          clientLng: item.clientLng,
          clientAccuracyM: item.clientAccuracyM,
          idempotencyKey: item.idempotencyKey,
        };

        const response = await resolved.verifyHandover(payload);
        await removeFromQueue(item.id);
        sent.push({ id: item.id, response });
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? 'send failed';
        await updateQueued(item.id, { status: 'failed', lastError: msg });
        failed.push({ id: item.id, error: msg });
        if (isNetworkError(err)) {
          stoppedOffline = true;
          break;
        }
      }
    }
  } finally {
    flushing = false;
  }

  return { sent, failed, remaining: await queueSize(), stoppedOffline };
}
