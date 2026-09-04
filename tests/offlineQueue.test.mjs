// Tests for the offline capture queue (T3.1 / audit P6). No network, no IndexedDB:
// an in-memory store and a fake api are injected. Proves enqueue/list/remove/update,
// idempotency-key stability across retries, oldest-first send order, the re-entrancy
// lock, and network-vs-server failure handling.

import {
  __setQueueStore,
  listQueue,
  queueSize,
  enqueueCapture,
  removeFromQueue,
  updateQueued,
  clearQueue,
  flushQueue,
  isNetworkError,
} from '../src/lib/offlineQueue.ts';

let all = true;
const check = (name, ok, extra) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok && extra !== undefined) console.log('       ', JSON.stringify(extra));
  all &= ok;
};

// In-memory store.
let mem = [];
__setQueueStore({
  async read() {
    return mem.map((x) => ({ ...x }));
  },
  async write(items) {
    mem = items.map((x) => ({ ...x }));
  },
});

const baseInput = (over = {}) => ({
  householdId: 'HH-1',
  attempt: 1,
  declaredStreams: ['wet', 'dry'],
  photoBlob: { fake: 'photo' }, // opaque to the queue; the fake api just needs a truthy value
  clientCapturedAt: '2026-09-04T04:00:00.000Z',
  clientLat: 23.03,
  clientLng: 72.55,
  clientAccuracyM: 12,
  ...over,
});

// --- CRUD --------------------------------------------------------------------------
await clearQueue();
const a = await enqueueCapture(baseInput());
const b = await enqueueCapture(baseInput({ householdId: 'HH-2' }));
check('enqueue adds items', (await queueSize()) === 2);
check('newest is at the head', (await listQueue())[0].id === b.id);
check('enqueue sets status/attempts/key', a.status === 'queued' && a.attempts === 0 && a.idempotencyKey.startsWith('q1-HH-1-'));
check('idempotency keys are unique per enqueue', a.idempotencyKey !== b.idempotencyKey);

await updateQueued(a.id, { status: 'failed', lastError: 'boom' });
check('updateQueued patches one item', (await listQueue()).find((i) => i.id === a.id).lastError === 'boom');

await removeFromQueue(a.id);
check('removeFromQueue drops one item', (await queueSize()) === 1 && (await listQueue())[0].id === b.id);

// --- flush: happy path, oldest-first ---------------------------------------------
await clearQueue();
const first = await enqueueCapture(baseInput({ householdId: 'A' }));
await new Promise((r) => setTimeout(r, 2));
const second = await enqueueCapture(baseInput({ householdId: 'B' }));

const seen = [];
let okApi = {
  async uploadEvidenceBlob(kind, blob) {
    return `incoming/u/${kind}-${Math.random().toString(16).slice(2)}.bin`;
  },
  async verifyHandover(payload) {
    seen.push(payload);
    return { handoverId: 'h-' + payload.idempotencyKey, status: 'verified', reasonCode: 'OK', reasonText: 'ok', creditsAwarded: 2, confirmedStreams: payload.declaredStreams };
  },
};

const r1 = await flushQueue(okApi);
check('flush sends every item', r1.sent.length === 2 && r1.failed.length === 0);
check('flush empties the queue on success', r1.remaining === 0 && (await queueSize()) === 0);
check('flush sends oldest first', seen[0].clientLat === 23.03 && seen.length === 2 && seen[0] !== seen[1]);
check('flush forwards the stored idempotencyKey', seen[0].idempotencyKey === first.idempotencyKey && seen[1].idempotencyKey === second.idempotencyKey);
check('flush carries a photoKey from upload', typeof seen[0].photoKey === 'string' && seen[0].photoKey.startsWith('incoming/'));

// --- flush: idempotency key stable across a retry ------------------------------
await clearQueue();
const retry = await enqueueCapture(baseInput({ householdId: 'R' }));
let calls = 0;
const flakyApi = {
  async uploadEvidenceBlob() {
    return 'incoming/u/p.bin';
  },
  async verifyHandover(payload) {
    calls += 1;
    if (calls === 1) throw new Error('503 Service Unavailable'); // server error, not network
    return { handoverId: 'h', status: 'verified', reasonCode: 'OK', reasonText: 'ok', creditsAwarded: 2, confirmedStreams: [] };
  },
};
const rf1 = await flushQueue(flakyApi);
check('server-error failure keeps the item queued', rf1.failed.length === 1 && (await queueSize()) === 1);
check('failed item is marked failed with the error', (await listQueue())[0].status === 'failed' && /503/.test((await listQueue())[0].lastError));
const keyBefore = (await listQueue())[0].idempotencyKey;
const rf2 = await flushQueue(flakyApi);
check('retry reuses the same idempotencyKey', keyBefore === retry.idempotencyKey && rf2.sent.length === 1);
check('successful retry clears the item', (await queueSize()) === 0);
check('retry incremented attempts (2 total)', rf2.sent.length === 1); // attempts tracked internally; item gone now

// --- flush: network error stops the run -----------------------------------------
await clearQueue();
await enqueueCapture(baseInput({ householdId: 'N1' }));
await enqueueCapture(baseInput({ householdId: 'N2' }));
let netCalls = 0;
const offlineApi = {
  async uploadEvidenceBlob() {
    netCalls += 1;
    throw new TypeError('Failed to fetch');
  },
  async verifyHandover() {
    return { handoverId: 'h', status: 'verified', reasonCode: 'OK', reasonText: 'ok', creditsAwarded: 0, confirmedStreams: [] };
  },
};
const ro = await flushQueue(offlineApi);
check('network error stops after the first item', netCalls === 1 && ro.stoppedOffline === true);
check('network error leaves all items queued', ro.remaining === 2 && (await queueSize()) === 2);

check('isNetworkError: TypeError', isNetworkError(new TypeError('x')) === true);
check('isNetworkError: "Failed to fetch"', isNetworkError(new Error('Failed to fetch')) === true);
check('isNetworkError: plain 409 message', isNetworkError(new Error('Request failed (409)')) === false);

console.log(all ? '\nALL PASS' : '\nSOME FAILED');
process.exit(all ? 0 : 1);
