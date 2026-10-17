// SafaiSeva backend API. The service-role client is the sole authority over handover
// status, credits, and the ledger (audit C2). The client sends evidence and receives a
// decision it cannot influence.

import type { Express, Request, Response } from 'express';
import { admin } from './supabaseAdmin.ts';
import { resolvePrincipal, resolveWorker, resolveOfficer } from './principal.ts';
import { dHash, sha256, decodeDataUrl } from './phash.ts';
import { extractFromPhoto, extractFromVideo } from './gemini.ts';
import { runFraudChecks, istDate } from './fraud.ts';
import {
  uploadEvidence,
  createEvidenceUploadUrl,
  fetchEvidence,
  isOwnedEvidenceKey,
} from './storage.ts';
import { signTicket } from './qrToken.ts';
import { resolveCaptureTime } from './captureTime.ts';
import { rpcError } from './rpcErrors.ts';
import {
  verifyLimiter,
  signLimiter,
  mutationLimiter,
  readLimiter,
} from './rateLimit.ts';
import { adjudicate } from '../src/lib/verification/adjudicator.ts';
import { FALLBACK_RULES, RewardRules, WasteStream, ALL_STREAMS } from '../src/lib/verification/contract.ts';
import { renderReason } from '../src/lib/verification/reasonCodes.ts';

function fail(res: Response, status: number, message: string) {
  return res.status(status).json({ error: message });
}

// For catch blocks: errors we raised on purpose carry a 4xx/503 status and a message meant
// for the user; anything else is unexpected and must not leak internals (audit F10).
function failFrom(res: Response, e: any, label: string) {
  const status = Number(e?.status);
  if (Number.isInteger(status) && status >= 400 && status < 500) return fail(res, status, e.message);
  if (status === 503) return fail(res, 503, e.message);
  console.error(`[${label}]`, e);
  return fail(res, 500, 'Something went wrong on our side. Please try again.');
}

// For a failed SQL decision function / unexpected PostgREST error.
function failDb(res: Response, error: { message?: string } | null | undefined) {
  const { status, message } = rpcError(error);
  return fail(res, status, message);
}

// Settlement hold + rules for awarding milestones after a verified decision. Best effort:
// the handover decision is already committed; a milestone failure is logged, not surfaced.
async function awardMilestones(householdId: string, actor: string, holdHours: number) {
  const { data, error } = await admin().rpc('award_bin_milestones', {
    p_household: householdId,
    p_actor: actor,
    p_hold_hours: holdHours,
  });
  if (error) {
    console.error('[milestones] award failed:', error.message);
    return [] as { milestone: string; credits: number }[];
  }
  return (data ?? []) as { milestone: string; credits: number }[];
}

async function activeRules(): Promise<{ version: number; rules: RewardRules }> {
  const { data } = await admin()
    .from('reward_rules')
    .select('version, rules')
    .eq('active', true)
    .maybeSingle();
  return { version: data?.version ?? 0, rules: (data?.rules as RewardRules) ?? FALLBACK_RULES };
}

interface HouseholdCtx {
  id: string;
  code: string;
  collectionWindow: { start: number; end: number };
  binCount: number;
  binTarget: number;
  binsOnboardedAt: string | null;
}

async function householdForUser(userId: string): Promise<HouseholdCtx | null> {
  const { data } = await admin()
    .from('household_members')
    .select(
      'household:households(id, code, collection_start_hour, collection_end_hour, bin_count, bin_target, bins_onboarded_at)'
    )
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  const hh: any = data?.household;
  if (!hh) return null;
  return {
    id: hh.id,
    code: hh.code,
    collectionWindow: {
      start: hh.collection_start_hour ?? 6,
      end: hh.collection_end_hour ?? 12,
    },
    binCount: hh.bin_count ?? 1,
    binTarget: hh.bin_target ?? 4,
    binsOnboardedAt: hh.bins_onboarded_at ?? null,
  };
}

// A karmachari must be within this distance of a geolocated household to credit it at the
// door (audit F11). Generous for GPS error in dense lanes; households without a point skip it.
const DOORSTEP_MAX_DISTANCE_M = 150;

// The pilot onboards a single ward; new households are placed in it.
const PILOT_WARD_CODE = process.env.PILOT_WARD_CODE?.trim() || 'W12-NAVRANGPURA';

function cleanStreams(input: any): WasteStream[] {
  if (!Array.isArray(input)) return [];
  return ALL_STREAMS.filter((s) => input.includes(s));
}

export function mountApiRoutes(app: Express) {
  // ---------------------------------------------------------------------------------
  // GET /api/wallet — authoritative balance + recent activity
  // ---------------------------------------------------------------------------------
  app.get('/api/wallet', readLimiter, async (req: Request, res: Response) => {
    try {
      const principal = await resolvePrincipal(req);
      const hh = await householdForUser(principal.userId);
      if (!hh) return res.json({ balance: 0, pending: 0, householdCode: null, handovers: [], tickets: [] });

      const db = admin();
      const [{ data: bal }, { data: handovers }, { data: tickets }] = await Promise.all([
        db.from('v_household_balance').select('*').eq('household_id', hh.id).maybeSingle(),
        db
          .from('handovers')
          .select('id, collection_date, status, credits_awarded, confirmed_streams, declared_streams, decision_reason_code, decision_reason_text, media_kind, settle_at, created_at')
          .eq('household_id', hh.id)
          .order('created_at', { ascending: false })
          .limit(30),
        db
          .from('tickets')
          .select('*')
          .eq('household_id', hh.id)
          .order('redeemed_at', { ascending: false })
          .limit(20),
      ]);

      const { rules } = await activeRules();

      return res.json({
        householdCode: hh.code,
        balance: bal?.settled_balance ?? 0,
        pending: bal?.pending_credits ?? 0,
        lifetimeEarned: bal?.lifetime_earned ?? 0,
        handovers: handovers ?? [],
        tickets: tickets ?? [],
        bins: {
          count: hh.binCount,
          target: hh.binTarget,
          onboarded: hh.binsOnboardedAt != null,
          milestoneCredits: rules.milestones, // { two_bins, four_bins }
        },
        redeem: rules.redeem, // { janmarg_brts, ahmedabad_metro, janmarg_day_pass }
      });
    } catch (e: any) {
      return failFrom(res, e, 'wallet');
    }
  });

  // ---------------------------------------------------------------------------------
  // POST /api/household/bins — set how many separated bins the home has (audit P1).
  //   body: { binCount: 0..8 }
  // Crossing 2 / 4 / 6 bins awards the two_bins / four_bins / six_bins milestone credit
  // (5 / 10 / 20). Each awarded once (bin_milestones unique per household+milestone),
  // settled immediately.
  // ---------------------------------------------------------------------------------
  app.post('/api/household/bins', mutationLimiter, async (req: Request, res: Response) => {
    try {
      const principal = await resolvePrincipal(req);
      const hh = await householdForUser(principal.userId);
      if (!hh) return fail(res, 409, 'No household is linked to this session.');

      const raw = Number(req.body?.binCount);
      if (!Number.isFinite(raw) || raw < 0 || raw > 8) {
        return fail(res, 400, 'binCount must be between 0 and 8.');
      }
      const newCount = Math.round(raw);

      const db = admin();
      const { rules } = await activeRules();

      const { error: updErr } = await db
        .from('households')
        .update({ bin_count: newCount, bins_onboarded_at: new Date().toISOString() })
        .eq('id', hh.id);
      if (updErr) return failDb(res, updErr);

      // The bin count is self-reported, so on its own it pays nothing (audit F6): each
      // milestone also needs verified handovers confirming enough streams, and settles
      // through the normal hold. award_bin_milestones checks both under the household lock.
      const awarded = await awardMilestones(hh.id, principal.userId, rules.settlement_hold_hours);

      const { data: bal } = await db
        .from('v_household_balance')
        .select('settled_balance')
        .eq('household_id', hh.id)
        .maybeSingle();

      return res.json({
        binCount: newCount,
        binTarget: hh.binTarget,
        milestonesAwarded: awarded,
        balance: bal?.settled_balance ?? 0,
      });
    } catch (e: any) {
      return failFrom(res, e, 'bins');
    }
  });

  // ---------------------------------------------------------------------------------
  // POST /api/uploads/sign — mint a short-lived direct-to-Storage upload URL (audit B2).
  //   body: { kind: 'photo' | 'video' | 'keyframe', contentType }
  //   -> { key, uploadUrl, token }
  // The client PUTs the captured file straight to the private 'evidence' bucket and then
  // sends only `key` to /api/handovers/verify. Authenticated so it is not an open DoS
  // surface; the bucket's 25 MB object cap and the 2 h token expiry bound abuse further.
  // ---------------------------------------------------------------------------------
  app.post('/api/uploads/sign', signLimiter, async (req: Request, res: Response) => {
    try {
      const principal = await resolvePrincipal(req);
      const kind = String(req.body?.kind ?? '');
      const contentType = String(req.body?.contentType ?? '');
      if (!['photo', 'video', 'keyframe'].includes(kind)) {
        return fail(res, 400, 'Unknown upload kind.');
      }
      const signed = await createEvidenceUploadUrl(principal.userId, contentType);
      if (!signed) return fail(res, 415, `Unsupported media type: ${contentType || 'none'}.`);
      return res.json(signed);
    } catch (e: any) {
      return failFrom(res, e, 'sign');
    }
  });

  // ---------------------------------------------------------------------------------
  // POST /api/handovers/verify — the whole pipeline for one attempt
  //   body: { declaredStreams, attempt, handoverId?, photoKey?, videoKey?, videoFrames?,
  //           clientCapturedAt?, clientLat?, clientLng?, clientAccuracyM?,
  //           attestationNonce?, idempotencyKey? }
  // photoKey / videoKey reference objects the client already PUT to Storage via
  // /api/uploads/sign. videoFrames are small derived thumbnails and stay inline.
  // ---------------------------------------------------------------------------------
  app.post('/api/handovers/verify', verifyLimiter, async (req: Request, res: Response) => {
    try {
      const principal = await resolvePrincipal(req);
      const db = admin();
      const hh = await householdForUser(principal.userId);
      if (!hh) return fail(res, 409, 'No household is linked to this session.');

      const body = req.body ?? {};
      const declaredStreams = cleanStreams(body.declaredStreams);
      const attempt: 1 | 2 = body.attempt === 2 ? 2 : 1;
      const photoKey: string | undefined = typeof body.photoKey === 'string' ? body.photoKey : undefined;
      const videoKey: string | undefined = typeof body.videoKey === 'string' ? body.videoKey : undefined;
      const videoFrames: string[] = Array.isArray(body.videoFrames) ? body.videoFrames : [];
      // The client's capture time is honoured only within a bounded offline delay; otherwise
      // server time is used and the submission goes to a human (audit F7).
      const capture = resolveCaptureTime(body.clientCapturedAt);
      const capturedAt = capture.effectiveAt;
      const claimedCapturedAt =
        typeof body.clientCapturedAt === 'string' && Number.isFinite(Date.parse(body.clientCapturedAt))
          ? body.clientCapturedAt
          : null;
      const lat = typeof body.clientLat === 'number' ? body.clientLat : null;
      const lng = typeof body.clientLng === 'number' ? body.clientLng : null;

      // Only objects this user PUT to Storage (incoming/<userId>/…) may be referenced.
      for (const k of [photoKey, videoKey]) {
        if (k && !isOwnedEvidenceKey(k, principal.userId)) {
          return fail(res, 403, 'Evidence key does not belong to this session.');
        }
      }

      if (attempt === 1 && !photoKey) return fail(res, 400, 'A camera photo is required.');
      if (attempt === 2 && !photoKey && !videoKey && videoFrames.length === 0)
        return fail(res, 400, 'A camera video or photo is required for the second attempt.');

      const { version: rulesVersion, rules } = await activeRules();

      // Reject too-few-streams before touching Storage / the model.
      if (declaredStreams.length < (rules.min_declared_streams ?? 2)) {
        const r = renderReason('TOO_FEW_STREAMS');
        return res.json({
          status: 'rejected',
          reasonCode: r.code,
          reasonText: r.text,
          fix: r.fix,
          creditsAwarded: 0,
          confirmedStreams: [],
        });
      }

      // Pull the uploaded bytes back for hashing + the vision model.
      const photoData = photoKey ? await fetchEvidence(photoKey) : null;
      if (photoKey && !photoData) return fail(res, 502, 'Could not read the uploaded photo.');
      const videoData = videoKey ? await fetchEvidence(videoKey) : null;
      if (videoKey && !videoData) return fail(res, 502, 'Could not read the uploaded video.');

      const mediaKind: 'photo' | 'video' = videoData ? 'video' : 'photo';

      const collectionDate = istDate(capturedAt);

      // --- idempotency: reuse an existing pending row for this attempt key ---
      let handoverId: string | undefined =
        typeof body.handoverId === 'string' && body.handoverId ? body.handoverId : undefined;
      const idemKey: string | undefined =
        typeof body.idempotencyKey === 'string' && body.idempotencyKey ? body.idempotencyKey : undefined;

      // A second attempt names its handover: it must be this household's, and still open
      // (audit F4 — previously any id was accepted and overwritten).
      if (handoverId) {
        const { data: own } = await db
          .from('handovers')
          .select('id, status')
          .eq('id', handoverId)
          .eq('household_id', hh.id)
          .maybeSingle();
        if (!own) return fail(res, 403, 'This handover does not belong to your household.');
        if (own.status === 'verified') return fail(res, 409, 'This handover was already approved.');
      }

      if (!handoverId && idemKey) {
        const { data: existing } = await db
          .from('handovers')
          .select('id, status, credits_awarded, confirmed_streams, decision_reason_code, decision_reason_text')
          .eq('idempotency_key', idemKey)
          .eq('household_id', hh.id)
          .maybeSingle();
        if (existing && existing.status !== 'pending') {
          return res.json({
            handoverId: existing.id,
            status: existing.status,
            creditsAwarded: existing.credits_awarded,
            confirmedStreams: existing.confirmed_streams ?? [],
            reasonCode: existing.decision_reason_code,
            reasonText: existing.decision_reason_text,
            idempotentReplay: true,
          });
        }
        handoverId = existing?.id;
      }

      // --- create (attempt 1) or load (attempt 2) the handover row ---
      if (!handoverId) {
        const { data, error } = await db
          .from('handovers')
          .insert({
            household_id: hh.id,
            submitted_by: principal.userId,
            device_id: principal.deviceId ?? null,
            collection_date: collectionDate,
            attempt,
            media_kind: mediaKind,
            declared_streams: declaredStreams,
            client_captured_at: claimedCapturedAt,
            client_lat: lat,
            client_lng: lng,
            client_accuracy_m: typeof body.clientAccuracyM === 'number' ? body.clientAccuracyM : null,
            attestation_nonce: body.attestationNonce ?? null,
            idempotency_key: idemKey ?? null,
            status: 'pending',
          })
          .select('id')
          .single();
        if (error) return failDb(res, error);
        handoverId = data.id;
      } else {
        await db
          .from('handovers')
          .update({ attempt, media_kind: mediaKind, status: 'pending' })
          .eq('id', handoverId)
          .eq('household_id', hh.id);
      }

      // --- hashes (from the still image we have) ---
      const hashBuffer: Buffer | null =
        photoData?.buffer ?? (videoFrames[0] ? decodeDataUrl(videoFrames[0]).buffer : null);
      let phash: string | null = null;
      let contentHash: string | null = null;
      if (hashBuffer) {
        try {
          phash = await dHash(hashBuffer);
          contentHash = sha256(hashBuffer);
        } catch (e: any) {
          console.error('[verify] hash failed:', e?.message);
        }
      }

      // --- structural fraud checks (authoritative) ---
      const fraudSignals = [
        ...capture.signals,
        ...(await runFraudChecks({
          householdId: hh.id,
          collectionDate,
          capturedAt,
          lat,
          lng,
          phash,
          contentHash,
          handoverId,
        })),
      ];

      // --- AI evidence extraction ---
      let extract;
      try {
        extract =
          mediaKind === 'video'
            ? await extractFromVideo(videoData?.dataUrl, videoFrames, declaredStreams)
            : await extractFromPhoto(photoData!.dataUrl, declaredStreams);
      } catch (e: any) {
        await db.from('handovers').update({ status: 'in_review', decision_reason_code: 'SERVICE_ERROR' }).eq('id', handoverId);
        const r = renderReason('SERVICE_ERROR');
        return res.status(e.status ?? 502).json({
          handoverId,
          status: 'in_review',
          reasonCode: r.code,
          reasonText: r.text,
          creditsAwarded: 0,
          confirmedStreams: [],
        });
      }

      // --- persist evidence + media rows ---
      await db.from('verification_events').insert({
        handover_id: handoverId,
        attempt,
        model: extract.model,
        model_response_ms: extract.elapsedMs,
        raw_evidence: extract.evidence as any,
        waste_present: extract.evidence.wastePresent,
        recapture_likelihood: extract.evidence.recaptureLikelihood,
        image_quality: extract.evidence.imageQuality,
        overall_confidence: extract.evidence.overallConfidence,
        tamper_signals: extract.evidence.tamperSignals,
        per_stream: extract.evidence.streams as any,
      });

      // Media rows point straight at the client-uploaded objects — nothing is re-uploaded.
      // The only server write here is the derived keyframe from a frames-only video attempt.
      const mediaRows: Record<string, any>[] = [];
      if (photoData && photoKey) {
        mediaRows.push({
          handover_id: handoverId,
          attempt,
          kind: 'photo',
          storage_path: photoKey,
          content_hash: contentHash,
          phash,
          bytes: photoData.bytes,
        });
      }
      if (videoData && videoKey) {
        mediaRows.push({
          handover_id: handoverId,
          attempt,
          kind: 'video',
          storage_path: videoKey,
          bytes: videoData.bytes,
        });
      }
      if (!photoData && videoFrames[0]) {
        const kf = await uploadEvidence(handoverId, 'keyframe', videoFrames[0], 0);
        mediaRows.push({
          handover_id: handoverId,
          attempt,
          kind: 'keyframe',
          storage_path: kf?.path ?? 'not-stored',
          content_hash: contentHash,
          phash,
          bytes: kf?.bytes ?? null,
        });
      }
      if (mediaRows.length) await db.from('handover_media').insert(mediaRows);

      // --- adjudicate ---
      const decision = adjudicate({
        evidence: extract.evidence,
        declaredStreams,
        rules,
        rewardRulesVersion: rulesVersion,
        attempt,
        mediaKind,
        fraudSignals,
        collectionWindow: hh.collectionWindow,
      });

      // --- record fraud flags ---
      if (decision.fraudSignals.length) {
        await db.from('fraud_flags').insert(
          decision.fraudSignals.map((signal) => ({
            handover_id: handoverId,
            household_id: hh.id,
            user_id: principal.userId,
            signal,
            severity: ['daily_limit', 'geo_outside', 'window_outside', 'duplicate_phash'].includes(signal)
              ? 'block'
              : signal === 'similar_own'
              ? 'info'
              : 'warn',
          }))
        );
      }

      // --- finalize: decision + ledger in one transaction under the household lock ---
      // (audit F5 — the earn row used to be written before the handover update, so a
      // same-day race could pay a submission that was then rejected.)
      const dailyLimit = renderReason('DAILY_LIMIT_REACHED');
      const { data: outcome, error: decErr } = await db.rpc('record_handover_decision', {
        p_handover: handoverId,
        p_household: hh.id,
        p_status: decision.status,
        p_confirmed_streams: decision.confirmedStreams,
        p_credits: decision.status === 'verified' ? decision.creditsAwarded : 0,
        p_rules_version: rulesVersion,
        p_reason_code: decision.reasonCode,
        p_reason_text: decision.reasonText,
        p_hold_hours: rules.settlement_hold_hours,
        p_actor: principal.userId,
        p_ledger_reason: `Handover ${collectionDate}: ${decision.confirmedStreams.join('+')}`,
        p_daily_limit_text: dailyLimit.text,
      });
      if (decErr) return failDb(res, decErr);

      const settled: any = outcome;
      if (settled?.daily_limit) {
        return res.json({
          handoverId,
          status: 'rejected',
          reasonCode: dailyLimit.code,
          reasonText: dailyLimit.text,
          creditsAwarded: 0,
          confirmedStreams: [],
        });
      }
      const settleAt: string | null = settled?.settle_at ?? null;

      // A verified handover may unlock a bin milestone (audit F6).
      const milestonesAwarded =
        decision.status === 'verified'
          ? await awardMilestones(hh.id, principal.userId, rules.settlement_hold_hours)
          : [];

      return res.json({
        handoverId,
        status: decision.status,
        reasonCode: decision.reasonCode,
        reasonText: decision.reasonText,
        otherReasons: decision.otherReasons ?? [],
        fix: decision.fix,
        creditsAwarded: decision.creditsAwarded,
        confirmedStreams: decision.confirmedStreams,
        fraudSignals: decision.fraudSignals,
        milestonesAwarded,
        evidence: {
          observation: extract.evidence.observation,
          streams: extract.evidence.streams,
          imageQuality: extract.evidence.imageQuality,
          overallConfidence: extract.evidence.overallConfidence,
          recaptureLikelihood: extract.evidence.recaptureLikelihood,
        },
        settleAt,
      });
    } catch (e: any) {
      console.error('[verify] error:', e);
      return failFrom(res, e, 'verification');
    }
  });

  // ---------------------------------------------------------------------------------
  // POST /api/tickets/redeem — spend leaves on a transit ticket.
  //   body: { transitType: 'janmarg_brts' | 'ahmedabad_metro' | 'janmarg_day_pass' }
  // Atomic (app.redeem_ticket locks the household); writes the ticket + a 'spend' ledger
  // row. The QR token is HMAC-signed (audit I6). Real fare-gate validation needs a
  // transit partnership (G2).
  // ---------------------------------------------------------------------------------
  app.post('/api/tickets/redeem', mutationLimiter, async (req: Request, res: Response) => {
    try {
      const principal = await resolvePrincipal(req);
      const hh = await householdForUser(principal.userId);
      if (!hh) return fail(res, 409, 'No household is linked to this session.');

      const CATALOG: Record<string, { title: string; route: string }> = {
        janmarg_brts: { title: 'Janmarg BRTS Single Ride', route: 'Any Janmarg BRTS corridor, Ahmedabad' },
        ahmedabad_metro: { title: 'Metro Single Ride', route: 'GMRC Ahmedabad Metro network' },
        janmarg_day_pass: { title: 'Janmarg Day Pass', route: 'All Janmarg BRTS corridors (24h)' },
      };
      const transitType = String(req.body?.transitType || '');
      const item = CATALOG[transitType];
      if (!item) return fail(res, 400, 'Unknown transit ticket.');

      const { rules } = await activeRules();
      const cost = rules.redeem?.[transitType];
      if (!cost || cost <= 0) return fail(res, 400, 'This ticket is not available right now.');

      const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
      const db = admin();

      const { data: ticket, error } = await db.rpc('redeem_ticket', {
        p_household: hh.id,
        p_redeemed_by: principal.userId,
        p_transit: transitType,
        p_title: item.title,
        p_route: item.route,
        p_cost: cost,
        p_expires_at: expiresAt,
      });

      if (error) {
        if (/insufficient balance/i.test(error.message)) {
          return fail(res, 402, `Not enough leaves — this ticket costs ${cost}.`);
        }
        return fail(res, 500, `redeem failed: ${error.message}`);
      }

      const t: any = ticket;
      const token = signTicket({
        tid: t.id,
        hh: hh.id,
        type: transitType,
        exp: Math.floor(new Date(expiresAt).getTime() / 1000),
      });
      await db.from('tickets').update({ token }).eq('id', t.id);

      const { data: bal } = await db
        .from('v_household_balance')
        .select('settled_balance')
        .eq('household_id', hh.id)
        .maybeSingle();

      return res.json({
        ticket: { ...t, token },
        balance: bal?.settled_balance ?? 0,
      });
    } catch (e: any) {
      return failFrom(res, e, 'redeem');
    }
  });

  // ---------------------------------------------------------------------------------
  // POST /api/handovers/:id/dispute
  // ---------------------------------------------------------------------------------
  app.post('/api/handovers/:id/dispute', mutationLimiter, async (req: Request, res: Response) => {
    try {
      const principal = await resolvePrincipal(req);
      const db = admin();
      const { data: h } = await db
        .from('handovers')
        .select('id, household_id, status')
        .eq('id', req.params.id)
        .maybeSingle();
      if (!h) return fail(res, 404, 'Handover not found.');

      const { data: member } = await db
        .from('household_members')
        .select('user_id')
        .eq('household_id', h.household_id)
        .eq('user_id', principal.userId)
        .maybeSingle();
      if (!member) return fail(res, 403, 'Not your handover.');
      if (h.status === 'verified') return fail(res, 409, 'This handover was already approved.');
      // Only a decided, unpaid handover can be escalated — and only once.
      if (h.status === 'in_review') return fail(res, 409, 'This handover is already with a karmachari.');
      if (h.status === 'pending') return fail(res, 409, 'This handover is still being checked.');

      await db.from('handovers').update({ status: 'in_review', decision_reason_code: 'IN_REVIEW_CONFLICT' }).eq('id', h.id);
      await db.from('fraud_flags').insert({
        handover_id: h.id,
        household_id: h.household_id,
        user_id: principal.userId,
        signal: 'resident_dispute',
        severity: 'info',
        detail: { note: String(req.body?.note ?? '').slice(0, 500) },
      });
      const r = renderReason('IN_REVIEW_CONFLICT');
      return res.json({ status: 'in_review', reasonText: r.text });
    } catch (e: any) {
      return failFrom(res, e, 'dispute');
    }
  });

  // ---------------------------------------------------------------------------------
  // Karmachari — review queue and manual (no-app) credit issuance (audit A4 / G3 / I7)
  // ---------------------------------------------------------------------------------

  // GET /api/worker/profile — the karmachari header: identity from the resolved `workers`
  // row, plus today's live counters (audit G3). Replaces the seeded KarmachariProfile.
  app.get('/api/worker/profile', readLimiter, async (req: Request, res: Response) => {
    try {
      const worker = await resolveWorker(req);
      const db = admin();
      const today = istDate(new Date().toISOString());

      let wardName = 'Ward 12 - Navrangpura';
      if (worker.wardId) {
        const { data: w } = await db.from('wards').select('name').eq('id', worker.wardId).maybeSingle();
        if (w?.name) wardName = w.name as string;
      }

      const [{ count: issuedToday }, { count: reviewedToday }] = await Promise.all([
        db
          .from('worker_issuances')
          .select('id', { count: 'exact', head: true })
          .eq('worker_id', worker.workerId)
          .eq('issued_date', today),
        db
          .from('handovers')
          .select('id', { count: 'exact', head: true })
          .eq('reviewed_by', worker.userId)
          .gte('reviewed_at', `${today}T00:00:00Z`),
      ]);

      return res.json({
        id: worker.workerCode,
        name: worker.name,
        workerCode: worker.workerCode,
        zone: worker.zone ?? 'West Zone',
        ward: wardName,
        reviewsClearedToday: reviewedToday ?? 0,
        manualCreditsIssued: issuedToday ?? 0,
        overrideRate: 0,
      });
    } catch (e: any) {
      return failFrom(res, e, 'worker profile');
    }
  });

  // GET /api/review-queue — handovers the backend routed to a human.
  app.get('/api/review-queue', readLimiter, async (req: Request, res: Response) => {
    try {
      // A karmachari only sees their own ward's queue (audit F11).
      const worker = await resolveWorker(req);
      if (!worker.wardId) return res.json({ items: [] });
      const { data, error } = await admin()
        .from('v_review_queue')
        .select('*')
        .eq('ward_id', worker.wardId)
        .order('created_at', { ascending: true });
      if (error) return failDb(res, error);
      return res.json({ items: data ?? [] });
    } catch (e: any) {
      return failFrom(res, e, 'review-queue');
    }
  });

  // POST /api/review-queue/:id/decide  { decision: 'approve' | 'reject', reason?, note? }
  app.post('/api/review-queue/:id/decide', mutationLimiter, async (req: Request, res: Response) => {
    try {
      const worker = await resolveWorker(req);
      const decision = req.body?.decision === 'approve' ? 'approve' : 'reject';
      const reviewer = `Karmachari ${worker.name} (${worker.workerCode})`;
      const note = String(req.body?.note || '').slice(0, 500) || null;
      const { version, rules } = await activeRules();

      // Ward scope, in-review status, the one-per-day rule and the ledger write all happen
      // in one transaction under the household lock (audit F5 / F11).
      const { data, error } = await admin().rpc('decide_review', {
        p_handover: req.params.id,
        p_worker: worker.workerId,
        p_decision: decision,
        p_per_stream: rules.per_confirmed_stream,
        p_cap: rules.daily_cap_credits,
        p_hold_hours: rules.settlement_hold_hours,
        p_rules_version: version,
        p_reason_text:
          decision === 'approve'
            ? `Approved by ${reviewer} after review.`
            : `Karmachari review: ${String(req.body?.reason || 'Not separated at source').slice(0, 200)}`,
        p_note: note,
      });
      if (error) return failDb(res, error);

      const out: any = data;
      if (out.status === 'verified' && out.household_id) {
        await awardMilestones(out.household_id, worker.userId, rules.settlement_hold_hours);
      }
      return res.json({
        status: out.status,
        creditsAwarded: out.credits_awarded ?? 0,
        settleAt: out.settle_at ?? null,
      });
    } catch (e: any) {
      return failFrom(res, e, 'decide');
    }
  });

  // POST /api/worker/issue  { householdCode, streams: [], workerLat?, workerLng?, note? }
  // A karmachari credits a household at the door (feature phone / no smartphone).
  app.post('/api/worker/issue', mutationLimiter, async (req: Request, res: Response) => {
    try {
      const worker = await resolveWorker(req);

      const code = String(req.body?.householdCode || '').trim();
      if (!code) return fail(res, 400, 'A household code is required.');
      const streams = cleanStreams(req.body?.streams);
      if (streams.length < 2) return fail(res, 400, 'Confirm at least wet and dry.');

      const { rules } = await activeRules();
      const credits = rules.worker_issue_credits ?? 2;
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

      // Ward scope, worker-at-the-door distance, the daily cap and the one-per-day rule are
      // enforced with handover + issuance + ledger in one transaction (audit F5 / F11).
      const { data, error } = await admin().rpc('issue_doorstep', {
        p_worker: worker.workerId,
        p_household_code: code,
        p_streams: streams,
        p_credits: credits,
        p_worker_lat: num(req.body?.workerLat),
        p_worker_lng: num(req.body?.workerLng),
        p_max_distance_m: DOORSTEP_MAX_DISTANCE_M,
        p_reason_text: `Doorstep verification by Karmachari ${worker.name} (${worker.workerCode}).`,
      });
      if (error) {
        if (/^worker_cap/.test(error.message)) {
          return fail(res, 429, `Daily issuance cap (${worker.dailyIssueCap}) reached.`);
        }
        return failDb(res, error);
      }

      const out: any = data;
      return res.json({ householdCode: out.household_code ?? code, creditsAwarded: out.credits_awarded });
    } catch (e: any) {
      return failFrom(res, e, 'issue');
    }
  });

  // ---------------------------------------------------------------------------------
  // Ward Officer — read-only ward oversight (audit G7, schema 0015 + 0016). The officer
  // is a real server principal (resolveOfficer); every figure comes from the officer
  // analytics views, ward-scoped. No mutating officer endpoint exists by design.
  // ---------------------------------------------------------------------------------

  // GET /api/officer/dashboard — the whole officer screen except anomalies:
  // KPI header, AI verification split, sub-district participation, karmachari audit.
  app.get('/api/officer/dashboard', readLimiter, async (req: Request, res: Response) => {
    try {
      const officer = await resolveOfficer(req);
      if (!officer.wardId) return fail(res, 409, 'This officer is not assigned to a ward.');
      const db = admin();

      const [{ data: kpi }, { data: subs }, { data: audit }] = await Promise.all([
        db.from('v_officer_dashboard').select('*').eq('ward_id', officer.wardId).maybeSingle(),
        db.from('v_officer_subdistricts').select('*').eq('ward_id', officer.wardId).order('sort_order'),
        db.from('v_officer_worker_audit').select('*').eq('ward_id', officer.wardId).order('sort_order'),
      ]);
      if (!kpi) return fail(res, 404, 'No analytics baseline for this ward yet.');

      const band = (participation: number, target: number): 'optimal' | 'attention' | 'low' => {
        if (target <= 0) return 'attention';
        const r = participation / target;
        return r >= 1 ? 'optimal' : r >= 0.93 ? 'attention' : 'low';
      };
      const rupeePerCredit =
        kpi.credits_issued_baseline > 0
          ? kpi.rupee_value_baseline / kpi.credits_issued_baseline
          : 5;

      return res.json({
        wardName: kpi.ward_name,
        householdsEnrolled: kpi.households_enrolled,
        participationRateThisWeek: Number(kpi.participation_this_week),
        participationRateLastWeek: Number(kpi.participation_last_week),
        creditsIssued: kpi.credits_issued_live,
        rupeeValue: Math.round(kpi.credits_issued_live * rupeePerCredit),
        aiSplit: {
          approved: Number(kpi.ai_approved_pct),
          inReview: Number(kpi.ai_in_review_pct),
          rejected: Number(kpi.ai_rejected_pct),
        },
        subDistricts: (subs ?? []).map((s: any) => ({
          name: s.name,
          households: s.households,
          participation: Number(s.participation),
          status: band(Number(s.participation), Number(s.target_participation)),
        })),
        karmacharis: (audit ?? []).map((k: any) => ({
          id: k.audit_ref,
          name: k.name,
          route: k.route,
          reviewsDone: k.reviews_done,
          overrides: k.overrides,
          overrideRate: k.reviews_done > 0 ? Math.round((k.overrides / k.reviews_done) * 1000) / 10 : 0,
          flagged: k.flagged,
          ...(k.flag_reason ? { flagReason: k.flag_reason } : {}),
        })),
      });
    } catch (e: any) {
      return failFrom(res, e, 'officer dashboard');
    }
  });

  // GET /api/officer/anomalies — curated + live-derived algorithmic flags for the ward.
  app.get('/api/officer/anomalies', readLimiter, async (req: Request, res: Response) => {
    try {
      const officer = await resolveOfficer(req);
      if (!officer.wardId) return fail(res, 409, 'This officer is not assigned to a ward.');

      const { data } = await admin()
        .from('v_officer_anomalies')
        .select('*')
        .eq('ward_id', officer.wardId);

      const rank = { high: 0, medium: 1 } as const;
      const anomalies = (data ?? [])
        .map((a: any) => ({
          householdId: a.household_ref,
          name: a.name,
          address: a.address,
          approvalRate: Number(a.approval_rate),
          totalSubmissions: a.total_submissions,
          flagReason: a.flag_reason,
          severity: (a.severity === 'high' ? 'high' : 'medium') as 'high' | 'medium',
        }))
        .sort((x, y) => rank[x.severity] - rank[y.severity] || y.totalSubmissions - x.totalSubmissions);

      return res.json({ anomalies });
    } catch (e: any) {
      return failFrom(res, e, 'officer anomalies');
    }
  });

  // ---------------------------------------------------------------------------------
  // GET /api/ward/leaderboard — the resident Impact-tab leaderboard.
  // Backed by v_ward_leaderboard_live (0019): credits EARNED in the last 30 days, so
  // redeeming never lowers a rank (audit F15). Nothing identifying leaves the server —
  // no household codes, no addresses (audit F3); only the caller's own row is marked.
  // ---------------------------------------------------------------------------------
  app.get('/api/ward/leaderboard', readLimiter, async (req: Request, res: Response) => {
    try {
      const principal = await resolvePrincipal(req);
      const db = admin();

      const hh = await householdForUser(principal.userId);
      if (!hh) return res.json({ leaderboard: [] });
      const { data: own } = await db.from('households').select('ward_id').eq('id', hh.id).maybeSingle();
      const wardId = (own?.ward_id as string | undefined) ?? null;
      if (!wardId) return res.json({ leaderboard: [] });

      const { data, error } = await db
        .from('v_ward_leaderboard_live')
        .select('household_id, credits_30d, rank')
        .eq('ward_id', wardId)
        .order('rank', { ascending: true })
        .limit(10);
      if (error) return failDb(res, error);

      const rows = data ?? [];
      const leaderboard = rows.map((r: any) => ({
        rank: Number(r.rank),
        isYou: r.household_id === hh.id,
        label: r.household_id === hh.id ? 'Your household' : `Household #${Number(r.rank)}`,
        credits: r.credits_30d,
      }));

      // The caller's own standing, even when outside the top 10.
      if (!leaderboard.some((r) => r.isYou)) {
        const { data: me } = await db
          .from('v_ward_leaderboard_live')
          .select('credits_30d, rank')
          .eq('household_id', hh.id)
          .maybeSingle();
        if (me) {
          leaderboard.push({
            rank: Number(me.rank),
            isYou: true,
            label: 'Your household',
            credits: me.credits_30d,
          });
        }
      }
      return res.json({ leaderboard, period: '30d' });
    } catch (e: any) {
      return failFrom(res, e, 'ward leaderboard');
    }
  });

  // ---------------------------------------------------------------------------------
  // Household onboarding. A signed-in resident with no household creates one, or asks to
  // join an existing one with an invite the owner shared; the owner approves each request
  // (audit F3 — the public household code used to be enough to join and spend). Everyone
  // on a household shares its balance and its per-household daily limits.
  //   POST /api/household/create                { address?, lat?, lng? } -> { code, nearbyExisting }
  //   POST /api/household/invite      (owner)                            -> { token, expiresAt }
  //   POST /api/household/join                  { token }                -> { status: 'pending' }
  //   GET  /api/household/requests    (owner)                            -> { requests: [...] }
  //   POST /api/household/requests/:id/decide (owner) { approve: bool }  -> { status }
  // ---------------------------------------------------------------------------------
  app.post('/api/household/create', mutationLimiter, async (req: Request, res: Response) => {
    try {
      const principal = await resolvePrincipal(req);
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      const { data, error } = await admin().rpc('create_household', {
        p_user: principal.userId,
        p_ward_code: PILOT_WARD_CODE,
        p_address: String(req.body?.address || '').trim().slice(0, 240),
        p_lat: num(req.body?.lat),
        p_lng: num(req.body?.lng),
      });
      if (error) return failDb(res, error);
      const out: any = data;
      return res.json({ code: out.code, nearbyExisting: out.nearby_existing ?? null });
    } catch (e: any) {
      return failFrom(res, e, 'create');
    }
  });

  app.post('/api/household/invite', mutationLimiter, async (req: Request, res: Response) => {
    try {
      const principal = await resolvePrincipal(req);
      const hh = await householdForUser(principal.userId);
      if (!hh) return fail(res, 409, 'No household is linked to this session.');
      const { data, error } = await admin().rpc('create_household_invite', {
        p_household: hh.id,
        p_owner: principal.userId,
        p_ttl_hours: 48,
      });
      if (error) return failDb(res, error);
      const out: any = data;
      return res.json({ token: out.token, expiresAt: out.expires_at });
    } catch (e: any) {
      return failFrom(res, e, 'invite');
    }
  });

  app.post('/api/household/join', mutationLimiter, async (req: Request, res: Response) => {
    try {
      const principal = await resolvePrincipal(req);
      const token = String(req.body?.token || '').trim();
      if (!token) return fail(res, 400, 'An invite code is required.');
      const { data, error } = await admin().rpc('request_household_join', {
        p_token: token,
        p_user: principal.userId,
      });
      if (error) return failDb(res, error);
      return res.json({ status: (data as any).status, requestId: (data as any).request_id });
    } catch (e: any) {
      return failFrom(res, e, 'join');
    }
  });

  app.get('/api/household/requests', readLimiter, async (req: Request, res: Response) => {
    try {
      const principal = await resolvePrincipal(req);
      const hh = await householdForUser(principal.userId);
      if (!hh) return res.json({ requests: [] });
      const { data, error } = await admin()
        .from('household_join_requests')
        .select('id, created_at, user:users(display_name)')
        .eq('household_id', hh.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) return failDb(res, error);
      // Only the owner sees who is asking.
      const { data: me } = await admin()
        .from('household_members')
        .select('member_role')
        .eq('household_id', hh.id)
        .eq('user_id', principal.userId)
        .maybeSingle();
      if (me?.member_role !== 'owner') return res.json({ requests: [] });
      return res.json({
        requests: (data ?? []).map((r: any) => ({
          id: r.id,
          createdAt: r.created_at,
          name: r.user?.display_name ?? 'Resident',
        })),
      });
    } catch (e: any) {
      return failFrom(res, e, 'requests');
    }
  });

  app.post('/api/household/requests/:id/decide', mutationLimiter, async (req: Request, res: Response) => {
    try {
      const principal = await resolvePrincipal(req);
      const { data, error } = await admin().rpc('decide_household_join', {
        p_request: req.params.id,
        p_owner: principal.userId,
        p_approve: req.body?.approve === true,
      });
      if (error) return failDb(res, error);
      return res.json({ status: (data as any).status });
    } catch (e: any) {
      return failFrom(res, e, 'decide join');
    }
  });
}
