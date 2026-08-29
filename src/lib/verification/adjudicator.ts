// The adjudicator — the single authoritative decision function (audit C2/C3).
//
// Pure: no I/O, no clock, no randomness. Given the model's evidence, the resident's
// declared streams, the active reward rules, the household's collection window, and
// server-computed fraud signals, it returns the Decision. The Express API calls this;
// nothing on the client does.
//
// It evaluates EVERY applicable problem, not just the first, then reports the most
// actionable one as the headline with the rest as "also" (audit: reason accuracy).

import { Decision, DecisionStatus, RewardRules, WasteEvidence, WasteStream } from './contract.ts';
import { ReasonCode, renderReason, formatWindow, Lang } from './reasonCodes.ts';

export interface AdjudicateInput {
  evidence: WasteEvidence;
  declaredStreams: WasteStream[];
  rules: RewardRules;
  rewardRulesVersion: number;
  attempt: 1 | 2;
  mediaKind: 'photo' | 'video';
  /** Server-computed, authoritative: 'daily_limit' | 'geo_outside' | 'window_outside'
   *  | 'duplicate_phash' | 'velocity' | 'burst'. */
  fraudSignals: string[];
  /** Household's local collection hours, so the window can be named in the message. */
  collectionWindow?: { start: number; end: number };
  lang?: Lang;
}

interface Finding {
  code: ReasonCode;
  streams?: string[];
}

// Headline order: most actionable to the resident first. A photo that isn't valid waste
// is the thing to fix; logistics blocks (time/place/limit) come after.
const HEADLINE_ORDER: ReasonCode[] = [
  'NO_WASTE',
  'UNRELATED_IMAGE',
  'SCREEN_RECAPTURE',
  'EMPTY_OR_UNCLEAR',
  'CROSS_CONTAMINATION',
  'STREAM_NOT_VISIBLE',
  'TAMPER_SUSPECTED',
  'DUPLICATE_EVIDENCE',
  'OUTSIDE_GEOFENCE',
  'OUTSIDE_WINDOW',
  'DAILY_LIMIT_REACHED',
  'VELOCITY_ANOMALY',
  'NEEDS_VIDEO_LOW_CONFIDENCE',
  'IN_REVIEW_CONFLICT',
];
const rank = (c: ReasonCode) => {
  const i = HEADLINE_ORDER.indexOf(c);
  return i === -1 ? 99 : i;
};

const HARD_BLOCKS: ReasonCode[] = [
  'DAILY_LIMIT_REACHED',
  'OUTSIDE_GEOFENCE',
  'OUTSIDE_WINDOW',
  'DUPLICATE_EVIDENCE',
];

function computeCredits(confirmed: WasteStream[], rules: RewardRules): number {
  // +1 per stream the AI confirmed, up to the daily ceiling. No combo/full-set bonus.
  return Math.min(confirmed.length * rules.per_confirmed_stream, rules.daily_cap_credits);
}

export function adjudicate(input: AdjudicateInput): Decision {
  const { evidence, declaredStreams, rules, attempt, mediaKind, fraudSignals, lang } = input;
  const version = input.rewardRulesVersion;
  const windowLabel = input.collectionWindow
    ? formatWindow(input.collectionWindow.start, input.collectionWindow.end)
    : undefined;

  const render = (code: ReasonCode, streams?: string[]) =>
    renderReason(code, { lang, streams, window: windowLabel });

  // --- too few streams declared: terminal (you must separate at least wet + dry) ---
  if (declaredStreams.length < (rules.min_declared_streams ?? 2)) {
    const r = render('TOO_FEW_STREAMS');
    return {
      status: 'rejected',
      confirmedStreams: [],
      creditsAwarded: 0,
      reasonCode: 'TOO_FEW_STREAMS',
      reasonText: r.text,
      fix: r.fix,
      otherReasons: [],
      fraudSignals,
      rewardRulesVersion: version,
    };
  }

  const findings: Finding[] = [];
  const extraSignals = new Set<string>();

  // --- structural blocks (server-computed) ---
  if (fraudSignals.includes('daily_limit')) findings.push({ code: 'DAILY_LIMIT_REACHED' });
  if (fraudSignals.includes('geo_outside')) findings.push({ code: 'OUTSIDE_GEOFENCE' });
  if (fraudSignals.includes('window_outside')) findings.push({ code: 'OUTSIDE_WINDOW' });
  if (fraudSignals.includes('duplicate_phash')) findings.push({ code: 'DUPLICATE_EVIDENCE' });
  const softAnomaly = fraudSignals.includes('velocity') || fraudSignals.includes('burst');
  const hasHardBlock = findings.some((f) => HARD_BLOCKS.includes(f.code));

  // --- content evaluation (independent of the blocks above) ---
  // contentOutcome: 'ok' | 'rejected' | 'needs_video' | 'in_review'
  let contentOutcome: 'ok' | 'rejected' | 'needs_video' | 'in_review' = 'ok';
  let confirmed: WasteStream[] = [];
  let notVisible: WasteStream[] = [];

  const recap = evidence.recaptureLikelihood;
  if (recap >= rules.recapture_block_at || evidence.scene === 'screen_or_photo') {
    findings.push({ code: 'SCREEN_RECAPTURE' });
    extraSignals.add('recapture_suspected');
    contentOutcome = 'rejected';
  } else if (recap >= rules.review_confidence_band.low) {
    findings.push({ code: 'SCREEN_RECAPTURE' });
    extraSignals.add('recapture_suspected');
    contentOutcome = 'in_review';
  } else if (evidence.tamperSignals.length > 0) {
    findings.push({ code: 'TAMPER_SUSPECTED' });
    extraSignals.add('tamper_suspected');
    contentOutcome = 'in_review';
  } else if (!evidence.wastePresent || evidence.scene === 'no_waste') {
    findings.push({ code: 'NO_WASTE' });
    contentOutcome = 'rejected';
  } else if (evidence.scene === 'unrelated') {
    findings.push({ code: 'UNRELATED_IMAGE' });
    contentOutcome = 'rejected';
  } else if (evidence.imageQuality === 'unusable' || evidence.scene === 'unclear') {
    if (attempt === 1) {
      findings.push({ code: 'NEEDS_VIDEO_LOW_CONFIDENCE' });
      contentOutcome = 'needs_video';
    } else {
      findings.push({ code: 'EMPTY_OR_UNCLEAR' });
      contentOutcome = 'rejected';
    }
  } else if (evidence.overallConfidence < rules.review_confidence_band.high) {
    if (attempt === 1) {
      findings.push({ code: 'NEEDS_VIDEO_LOW_CONFIDENCE' });
      contentOutcome = 'needs_video';
    } else {
      findings.push({ code: 'IN_REVIEW_CONFLICT' });
      contentOutcome = 'in_review';
    }
  } else {
    // scene + confidence fine → stream confirmation
    const contaminated = declaredStreams.filter(
      (s) => evidence.streams[s].visible && evidence.streams[s].contamination === 'major'
    );
    confirmed = declaredStreams.filter(
      (s) =>
        evidence.streams[s].visible &&
        (evidence.streams[s].contamination === 'none' ||
          evidence.streams[s].contamination === 'minor')
    );
    notVisible = declaredStreams.filter((s) => !evidence.streams[s].visible);

    if (contaminated.length > 0) {
      findings.push({ code: 'CROSS_CONTAMINATION', streams: contaminated });
      contentOutcome = 'rejected';
    } else if (confirmed.length === 0) {
      if (attempt === 1) {
        findings.push({ code: 'NEEDS_VIDEO_LOW_CONFIDENCE' });
        contentOutcome = 'needs_video';
      } else {
        findings.push({ code: 'STREAM_NOT_VISIBLE', streams: notVisible });
        contentOutcome = 'rejected';
      }
    } else {
      contentOutcome = 'ok'; // verified (possibly partial)
    }
  }

  // --- clean pass: verified ---
  if (contentOutcome === 'ok' && !hasHardBlock && !softAnomaly) {
    const credits = computeCredits(confirmed, rules);
    const okCode: ReasonCode = mediaKind === 'video' ? 'OK_VERIFIED_VIDEO' : 'OK_VERIFIED';
    const r = render(okCode, confirmed);
    let reasonText = r.text;
    let fix = r.fix;
    if (notVisible.length > 0) {
      const miss = render('STREAM_NOT_VISIBLE', notVisible);
      reasonText = `${reasonText} ${miss.text}`;
      fix = miss.fix;
    }
    return {
      status: 'verified',
      confirmedStreams: confirmed,
      creditsAwarded: credits,
      reasonCode: okCode,
      reasonText,
      fix,
      otherReasons: [],
      fraudSignals: [...fraudSignals, ...extraSignals],
      rewardRulesVersion: version,
    };
  }

  // --- failure path: decide status ---
  let status: DecisionStatus;
  if (hasHardBlock || contentOutcome === 'rejected') status = 'rejected';
  else if (softAnomaly || contentOutcome === 'in_review') status = 'in_review';
  else status = 'needs_video'; // only reached when the sole issue is low-confidence attempt 1

  // A pure low-confidence first attempt: keep it as a single clean "record a video" prompt.
  if (status === 'needs_video') {
    const r = render('NEEDS_VIDEO_LOW_CONFIDENCE');
    return {
      status,
      confirmedStreams: [],
      creditsAwarded: 0,
      reasonCode: 'NEEDS_VIDEO_LOW_CONFIDENCE',
      reasonText: r.text,
      fix: r.fix,
      otherReasons: [],
      fraudSignals: [...fraudSignals, ...extraSignals],
      rewardRulesVersion: version,
    };
  }

  // If a hard block makes this a rejection, a "record a video" content finding is moot.
  let usable = findings.filter(
    (f) => !(hasHardBlock && f.code === 'NEEDS_VIDEO_LOW_CONFIDENCE')
  );
  if (softAnomaly && !usable.some((f) => f.code === 'VELOCITY_ANOMALY')) {
    usable.push({ code: 'VELOCITY_ANOMALY' });
  }
  // de-dupe by code (recapture can be pushed once)
  const seen = new Set<string>();
  usable = usable.filter((f) => (seen.has(f.code) ? false : (seen.add(f.code), true)));
  usable.sort((a, b) => rank(a.code) - rank(b.code));

  const [head, ...rest] = usable;
  const headR = render(head.code, head.streams);
  // `reasonText` is the headline only; `otherReasons` lists every additional problem so
  // the resident sees the full picture (e.g. "no waste" AND "outside collection hours").
  const otherReasons = rest.map((f) => render(f.code, f.streams).text);

  return {
    status,
    confirmedStreams: [],
    creditsAwarded: 0,
    reasonCode: head.code,
    reasonText: headR.text,
    fix: headR.fix,
    otherReasons,
    fraudSignals: [...fraudSignals, ...extraSignals],
    rewardRulesVersion: version,
  };
}
