// Direct tests of the pure adjudicator (no network). Proves the verified path, credit
// math, stream-confirmation, and fraud-signal handling.
import { adjudicate } from '../src/lib/verification/adjudicator.ts';
import { FALLBACK_RULES } from '../src/lib/verification/contract.ts';

const ev = (over = {}) => ({
  wastePresent: true,
  scene: 'waste_bins',
  streams: {
    wet: { visible: true, contamination: 'none', note: 'peels in green bin' },
    dry: { visible: true, contamination: 'none', note: 'paper + bottles' },
    sanitary: { visible: false, contamination: 'unknown', note: 'n/a' },
    special_care: { visible: false, contamination: 'unknown', note: 'n/a' },
  },
  recaptureLikelihood: 0.02,
  recaptureReasons: [],
  imageQuality: 'good',
  tamperSignals: [],
  overallConfidence: 0.9,
  observation: 'Two bins, wet and dry, clearly separated.',
  ...over,
});

const run = (name, input, check) => {
  const d = adjudicate({ rules: FALLBACK_RULES, rewardRulesVersion: 1, mediaKind: 'photo', lang: 'en', ...input });
  const ok = check(d);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  -> ${d.status} / ${d.reasonCode} / ${d.creditsAwarded}c [${d.confirmedStreams}]`);
  if (!ok) console.log('       ', JSON.stringify(d));
  return ok;
};

let all = true;
all &= run('wet+dry verified, 3 credits (2 streams + wet_dry combo)',
  { evidence: ev(), declaredStreams: ['wet', 'dry'], attempt: 1, fraudSignals: [] },
  d => d.status === 'verified' && d.creditsAwarded === 3 && d.confirmedStreams.length === 2);

all &= run('all four verified -> 4 + combo + full4 = 6, capped at daily_cap 5',
  { evidence: ev({ streams: {
      wet:{visible:true,contamination:'none',note:''}, dry:{visible:true,contamination:'none',note:''},
      sanitary:{visible:true,contamination:'none',note:''}, special_care:{visible:true,contamination:'none',note:''} } }),
    declaredStreams: ['wet','dry','sanitary','special_care'], attempt: 1, fraudSignals: [] },
  d => d.status === 'verified' && d.creditsAwarded === 5);

all &= run('declared dry but not visible -> credit only wet, note the miss',
  { evidence: ev({ streams: { ...ev().streams, dry: { visible: false, contamination: 'unknown', note: 'not seen' } } }),
    declaredStreams: ['wet', 'dry'], attempt: 1, fraudSignals: [] },
  d => d.status === 'verified' && d.confirmedStreams.join() === 'wet' && d.creditsAwarded === 1);

all &= run('major contamination -> rejected CROSS_CONTAMINATION',
  { evidence: ev({ streams: { ...ev().streams, wet: { visible: true, contamination: 'major', note: 'plastic in wet' } } }),
    declaredStreams: ['wet', 'dry'], attempt: 1, fraudSignals: [] },
  d => d.status === 'rejected' && d.reasonCode === 'CROSS_CONTAMINATION');

all &= run('low confidence attempt 1 -> needs_video',
  { evidence: ev({ overallConfidence: 0.5 }), declaredStreams: ['wet', 'dry'], attempt: 1, fraudSignals: [] },
  d => d.status === 'needs_video' && d.reasonCode === 'NEEDS_VIDEO_LOW_CONFIDENCE');

all &= run('recapture likelihood high -> rejected SCREEN_RECAPTURE + signal',
  { evidence: ev({ recaptureLikelihood: 0.9 }), declaredStreams: ['wet', 'dry'], attempt: 1, fraudSignals: [] },
  d => d.status === 'rejected' && d.reasonCode === 'SCREEN_RECAPTURE' && d.fraudSignals.includes('recapture_suspected'));

all &= run('server daily_limit signal -> rejected DAILY_LIMIT_REACHED (0 credits)',
  { evidence: ev(), declaredStreams: ['wet', 'dry'], attempt: 1, fraudSignals: ['daily_limit'] },
  d => d.status === 'rejected' && d.reasonCode === 'DAILY_LIMIT_REACHED' && d.creditsAwarded === 0);

all &= run('server geo_outside -> rejected OUTSIDE_GEOFENCE',
  { evidence: ev(), declaredStreams: ['wet', 'dry'], attempt: 1, fraudSignals: ['geo_outside'] },
  d => d.status === 'rejected' && d.reasonCode === 'OUTSIDE_GEOFENCE');

all &= run('velocity -> in_review',
  { evidence: ev(), declaredStreams: ['wet', 'dry'], attempt: 1, fraudSignals: ['velocity'] },
  d => d.status === 'in_review' && d.reasonCode === 'VELOCITY_ANOMALY');

all &= run('gujarati reason text renders',
  { evidence: ev({ wastePresent: false, scene: 'no_waste' }), declaredStreams: ['wet'], attempt: 1, fraudSignals: [], lang: 'gu' },
  d => d.status === 'rejected' && /કચરો/.test(d.reasonText));

console.log(all ? '\nALL PASS' : '\nSOME FAILED');
process.exit(all ? 0 : 1);
