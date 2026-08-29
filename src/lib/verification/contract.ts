// Shared verification contract — used by the browser and the server.
//
// Hard rule (audit C2/C3): the AI model produces EVIDENCE ONLY. It never returns a
// pass/fail verdict or a credit number. The backend adjudicator turns evidence +
// reward_rules + fraud signals into a Decision. This file defines both shapes.

export type WasteStream = 'wet' | 'dry' | 'sanitary' | 'special_care';

export const ALL_STREAMS: WasteStream[] = ['wet', 'dry', 'sanitary', 'special_care'];

export type Contamination = 'none' | 'minor' | 'major' | 'unknown';

export interface StreamEvidence {
  /** Genuinely visible in its own container/bag, distinct from other streams. */
  visible: boolean;
  contamination: Contamination;
  /** Short, concrete observation, or "Not visible / not present". */
  note: string;
}

export type SceneKind =
  | 'waste_bins'        // segregation bins / bags with contents
  | 'loose_waste'       // waste present but not in clear separate containers
  | 'no_waste'          // room, wall, floor, table, person, object — no waste
  | 'screen_or_photo'   // a photograph of a screen or a printed photo
  | 'unrelated'         // clearly unrelated subject
  | 'unclear';          // too dark / blurred / occluded to tell

export interface WasteEvidence {
  /** Any genuine household waste or waste container visible at all. */
  wastePresent: boolean;
  scene: SceneKind;
  streams: Record<WasteStream, StreamEvidence>;
  /** 0..1 — likelihood the image is a re-photograph of a screen/print (audit A1). */
  recaptureLikelihood: number;
  /** e.g. ["screen glare", "visible pixel grid", "device bezel", "flat lighting"]. */
  recaptureReasons: string[];
  imageQuality: 'good' | 'poor' | 'unusable';
  /** e.g. ["overlaid text", "cloned region", "inconsistent lighting"]. */
  tamperSignals: string[];
  /** 0..1 — the model's confidence in its own reading of this image/clip. */
  overallConfidence: number;
  /** One or two plain sentences describing what is visible. */
  observation: string;
}

export type DecisionStatus = 'verified' | 'needs_video' | 'in_review' | 'rejected';

export interface Decision {
  status: DecisionStatus;
  /** Streams the resident declared AND the evidence confirmed. Credit is based on these. */
  confirmedStreams: WasteStream[];
  creditsAwarded: number;
  reasonCode: string;
  /** Resolved, localized, resident-facing message (headline; already includes any "Also:"). */
  reasonText: string;
  /** Secondary problems, each a localized sentence — everything wrong beyond the headline. */
  otherReasons?: string[];
  /** "What to change next time", localized. Present on most non-success decisions. */
  fix?: string;
  /** Machine signals attached to this handover (also written to fraud_flags). */
  fraudSignals: string[];
  /** Which reward_rules version produced the award (reproducibility). */
  rewardRulesVersion?: number;
}

// ---- Reward rules shape (the `rules` jsonb in public.reward_rules) --------------------
export interface RewardRules {
  /** +1 per waste stream the AI confirms. */
  per_confirmed_stream: number;
  /** Hard ceiling on a single handover. A handover needs >= min_declared_streams, so the
   *  practical range is [min_declared_streams, daily_cap_credits] = [2, 4]. */
  daily_cap_credits: number;
  /** Fewest streams a resident must declare to submit (wet + dry at minimum). */
  min_declared_streams: number;
  settlement_hold_hours: number;
  milestones: { two_bins: number; four_bins: number; six_bins: number };
  worker_issue_credits: number;
  recapture_block_at: number;
  review_confidence_band: { low: number; high: number };
  redeem: Record<string, number>;
}

export const FALLBACK_RULES: RewardRules = {
  per_confirmed_stream: 1,
  daily_cap_credits: 4,
  min_declared_streams: 2,
  settlement_hold_hours: 24,
  milestones: { two_bins: 5, four_bins: 10, six_bins: 20 },
  worker_issue_credits: 2,
  recapture_block_at: 0.75,
  review_confidence_band: { low: 0.45, high: 0.75 },
  redeem: { janmarg_brts: 20, ahmedabad_metro: 20, janmarg_day_pass: 50 },
};
