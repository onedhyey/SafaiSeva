// The adjudicator — the single authoritative decision function (audit C2/C3).
//
// Pure: no I/O, no clock, no randomness. Given the model's evidence, the resident's
// declared streams, the active reward rules, and server-computed fraud signals, it
// returns the Decision. The Express API calls this; nothing on the client does.

import {
  Decision,
  DecisionStatus,
  RewardRules,
  WasteEvidence,
  WasteStream,
} from './contract.ts';
import { ReasonCode, renderReason, Lang } from './reasonCodes.ts';

export interface AdjudicateInput {
  evidence: WasteEvidence;
  declaredStreams: WasteStream[];
  rules: RewardRules;
  rewardRulesVersion: number;
  attempt: 1 | 2;
  mediaKind: 'photo' | 'video';
  /** Server-computed, authoritative. e.g. 'daily_limit', 'geo_outside', 'window_outside',
   *  'duplicate_phash', 'velocity', 'burst'. */
  fraudSignals: string[];
  lang?: Lang;
}

function decision(
  status: DecisionStatus,
  code: ReasonCode,
  opts: {
    confirmed?: WasteStream[];
    credits?: number;
    streams?: string[];
    fraudSignals?: string[];
    rewardRulesVersion?: number;
    lang?: Lang;
  } = {}
): Decision {
  const r = renderReason(code, { lang: opts.lang, streams: opts.streams });
  return {
    status,
    confirmedStreams: opts.confirmed ?? [],
    creditsAwarded: opts.credits ?? 0,
    reasonCode: code,
    reasonText: r.text,
    fix: r.fix,
    fraudSignals: opts.fraudSignals ?? [],
    rewardRulesVersion: opts.rewardRulesVersion,
  };
}

function computeCredits(confirmed: WasteStream[], rules: RewardRules): number {
  if (confirmed.length === 0) return 0;
  let c = confirmed.length * rules.per_confirmed_stream;
  if (confirmed.includes('wet') && confirmed.includes('dry')) {
    c += rules.combo_bonus.wet_dry ?? 0;
  }
  if (confirmed.length === 4) c += rules.full_four_bonus;
  c = Math.min(c, rules.daily_cap_credits);
  return Math.max(1, c);
}

export function adjudicate(input: AdjudicateInput): Decision {
  const { evidence, declaredStreams, rules, attempt, mediaKind, fraudSignals, lang } = input;
  const v = input.rewardRulesVersion;
  const d = (status: DecisionStatus, code: ReasonCode, opts: Parameters<typeof decision>[2] = {}) =>
    decision(status, code, {
      ...opts,
      lang,
      rewardRulesVersion: v,
      // a call site may append signals (e.g. 'recapture_suspected'); otherwise pass through
      fraudSignals: opts.fraudSignals ?? fraudSignals,
    });

  // 1. Authoritative structural blocks (server-computed) come first.
  if (fraudSignals.includes('daily_limit')) return d('rejected', 'DAILY_LIMIT_REACHED');
  if (fraudSignals.includes('geo_outside')) return d('rejected', 'OUTSIDE_GEOFENCE');
  if (fraudSignals.includes('window_outside')) return d('rejected', 'OUTSIDE_WINDOW');
  if (fraudSignals.includes('duplicate_phash')) return d('rejected', 'DUPLICATE_EVIDENCE');
  if (fraudSignals.includes('velocity') || fraudSignals.includes('burst')) {
    return d('in_review', 'VELOCITY_ANOMALY');
  }

  // 2. Nothing declared.
  if (declaredStreams.length === 0) return d('rejected', 'NO_STREAMS_DECLARED');

  // 3. Re-photography of a screen / print (audit A1).
  if (
    evidence.recaptureLikelihood >= rules.recapture_block_at ||
    evidence.scene === 'screen_or_photo'
  ) {
    return d('rejected', 'SCREEN_RECAPTURE', { fraudSignals: [...fraudSignals, 'recapture_suspected'] });
  }
  if (evidence.recaptureLikelihood >= rules.review_confidence_band.low) {
    return d('in_review', 'SCREEN_RECAPTURE', {
      fraudSignals: [...fraudSignals, 'recapture_suspected'],
    });
  }

  // 4. Editing / tampering signals — weak detector, so route to a human, don't hard-fail.
  if (evidence.tamperSignals.length > 0) {
    return d('in_review', 'TAMPER_SUSPECTED', { fraudSignals: [...fraudSignals, 'tamper_suspected'] });
  }

  // 5. Scene reality check.
  if (!evidence.wastePresent || evidence.scene === 'no_waste') {
    return d('rejected', 'NO_WASTE');
  }
  if (evidence.scene === 'unrelated') return d('rejected', 'UNRELATED_IMAGE');
  if (evidence.imageQuality === 'unusable' || evidence.scene === 'unclear') {
    return attempt === 1
      ? d('needs_video', 'NEEDS_VIDEO_LOW_CONFIDENCE')
      : d('rejected', 'EMPTY_OR_UNCLEAR');
  }

  // 6. Model self-confidence routing.
  if (evidence.overallConfidence < rules.review_confidence_band.high) {
    return attempt === 1
      ? d('needs_video', 'NEEDS_VIDEO_LOW_CONFIDENCE')
      : d('in_review', 'IN_REVIEW_CONFLICT');
  }

  // 7. Stream confirmation: declared ∩ actually-visible-and-clean.
  const contaminated = declaredStreams.filter(
    (s) => evidence.streams[s].visible && evidence.streams[s].contamination === 'major'
  );
  if (contaminated.length > 0) {
    return d('rejected', 'CROSS_CONTAMINATION', { streams: contaminated });
  }

  const confirmed = declaredStreams.filter(
    (s) =>
      evidence.streams[s].visible &&
      (evidence.streams[s].contamination === 'none' ||
        evidence.streams[s].contamination === 'minor')
  );
  const notVisible = declaredStreams.filter((s) => !evidence.streams[s].visible);

  if (confirmed.length === 0) {
    return attempt === 1
      ? d('needs_video', 'NEEDS_VIDEO_LOW_CONFIDENCE')
      : d('rejected', 'STREAM_NOT_VISIBLE', { streams: notVisible });
  }

  // 8. Verified (fully or partially). Credits only for confirmed streams.
  const credits = computeCredits(confirmed, rules);
  const code: ReasonCode = mediaKind === 'video' ? 'OK_VERIFIED_VIDEO' : 'OK_VERIFIED';
  const base = d('verified', code, { confirmed, credits, streams: confirmed });

  if (notVisible.length > 0) {
    // Partial: approve what was confirmed, but tell the resident what wasn't.
    const missing = renderReason('STREAM_NOT_VISIBLE', { lang, streams: notVisible });
    base.reasonText = `${base.reasonText} ${missing.text}`;
    base.fix = missing.fix;
  }
  return base;
}
