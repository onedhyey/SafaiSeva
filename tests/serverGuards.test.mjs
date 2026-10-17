// Pure server guards: identity mode (F1/F2), capture-time trust (F7), and the mapping of
// SQL decision-function errors to HTTP responses.
import { identityMode } from '../server/identity.ts';
import { resolveCaptureTime } from '../server/captureTime.ts';
import { rpcError } from '../server/rpcErrors.ts';
import { adjudicate } from '../src/lib/verification/adjudicator.ts';
import { FALLBACK_RULES } from '../src/lib/verification/contract.ts';

let failed = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  ${detail}`}`);
  if (!cond) failed++;
};

// --- identity mode ------------------------------------------------------------------
check('auth on → clerk', identityMode({ authEnabled: true, nodeEnv: 'production', allowDemo: false }) === 'clerk');
check(
  'auth on wins even if demo allowed',
  identityMode({ authEnabled: true, nodeEnv: 'development', allowDemo: true }) === 'clerk'
);
check(
  'F1: auth off in production without explicit opt-in → disabled',
  identityMode({ authEnabled: false, nodeEnv: 'production', allowDemo: false }) === 'disabled'
);
check(
  'auth off in production with ALLOW_DEMO_IDENTITY → demo',
  identityMode({ authEnabled: false, nodeEnv: 'production', allowDemo: true }) === 'demo'
);
check(
  'auth off in development → demo (local dev keeps working)',
  identityMode({ authEnabled: false, nodeEnv: 'development', allowDemo: false }) === 'demo'
);
check(
  'auth off with NODE_ENV unset → disabled (fail closed)',
  identityMode({ authEnabled: false, nodeEnv: undefined, allowDemo: false }) === 'disabled'
);

// --- capture time (F7) ---------------------------------------------------------------
const now = new Date('2026-10-18T05:00:00.000Z'); // 10:30 IST
const r1 = resolveCaptureTime(undefined, now);
check('missing client time → server time', r1.effectiveAt === now.toISOString() && r1.signals.length === 0);
const r2 = resolveCaptureTime('not a date', now);
check('garbage client time → server time', r2.effectiveAt === now.toISOString());
const recent = new Date(now.getTime() - 40 * 60_000).toISOString();
const r3 = resolveCaptureTime(recent, now);
check('offline capture 40 min ago is honoured', r3.effectiveAt === recent && r3.signals.length === 0);
const stale = new Date(now.getTime() - 7 * 3600_000).toISOString();
const r4 = resolveCaptureTime(stale, now);
check(
  'F7: capture claimed 7 h ago → server time + stale_capture',
  r4.effectiveAt === now.toISOString() && r4.signals.includes('stale_capture'),
  JSON.stringify(r4)
);
const future = new Date(now.getTime() + 10 * 60_000).toISOString();
const r5 = resolveCaptureTime(future, now);
check(
  'F7: capture claimed 10 min in the future → server time + clock_skew',
  r5.effectiveAt === now.toISOString() && r5.signals.includes('clock_skew'),
  JSON.stringify(r5)
);
const slightFuture = new Date(now.getTime() + 60_000).toISOString();
check('1 min ahead is tolerated', resolveCaptureTime(slightFuture, now).signals.length === 0);

// stale_capture / clock_skew route a clean submission to a human instead of auto-paying
const cleanEvidence = {
  wastePresent: true,
  scene: 'waste_bins',
  streams: {
    wet: { visible: true, contamination: 'none', note: '' },
    dry: { visible: true, contamination: 'none', note: '' },
    sanitary: { visible: false, contamination: 'unknown', note: '' },
    special_care: { visible: false, contamination: 'unknown', note: '' },
  },
  recaptureLikelihood: 0.02,
  recaptureReasons: [],
  imageQuality: 'good',
  tamperSignals: [],
  overallConfidence: 0.95,
  observation: 'Two bins.',
};
const decide = (fraudSignals) =>
  adjudicate({
    evidence: cleanEvidence,
    declaredStreams: ['wet', 'dry'],
    rules: FALLBACK_RULES,
    rewardRulesVersion: 1,
    attempt: 1,
    mediaKind: 'photo',
    fraudSignals,
    collectionWindow: { start: 0, end: 24 },
    lang: 'en',
  });
check('clean evidence, no signals → verified', decide([]).status === 'verified', decide([]).status);
check('stale_capture → in_review', decide(['stale_capture']).status === 'in_review', decide(['stale_capture']).status);
check('clock_skew → in_review', decide(['clock_skew']).status === 'in_review', decide(['clock_skew']).status);
check('similar_own alone does not block', decide(['similar_own']).status === 'verified', decide(['similar_own']).status);

// --- SQL error mapping ------------------------------------------------------------------
const m = (msg) => rpcError({ message: msg });
check('handover_not_owned → 403', m('handover_not_owned').status === 403);
check('ward_scope → 403', m('ward_scope').status === 403);
check('daily_limit → 409', m('daily_limit').status === 409);
check('not_in_review → 409', m('not_in_review').status === 409);
check('worker_cap → 429', m('worker_cap').status === 429);
check('worker_too_far → 422', m('worker_too_far').status === 422);
check('household_not_found → 404', m('household_not_found').status === 404);
const unknown = m('duplicate key value violates unique constraint "secret_internal_idx"');
check(
  'unknown DB error → 500 with a generic message (no internals leaked)',
  unknown.status === 500 && !/secret_internal_idx/.test(unknown.message),
  JSON.stringify(unknown)
);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
if (failed) process.exitCode = 1;
