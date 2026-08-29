// SafaiSeva backend API. The service-role client is the sole authority over handover
// status, credits, and the ledger (audit C2). The client sends evidence and receives a
// decision it cannot influence.

import type { Express, Request, Response } from 'express';
import { admin } from './supabaseAdmin.ts';
import { resolvePrincipal } from './principal.ts';
import { dHash, sha256, decodeDataUrl } from './phash.ts';
import { extractFromPhoto, extractFromVideo } from './gemini.ts';
import { runFraudChecks, istDate, workerCapExceeded } from './fraud.ts';
import { uploadEvidence } from './storage.ts';
import { adjudicate } from '../src/lib/verification/adjudicator.ts';
import { FALLBACK_RULES, RewardRules, WasteStream, ALL_STREAMS } from '../src/lib/verification/contract.ts';
import { renderReason } from '../src/lib/verification/reasonCodes.ts';

function fail(res: Response, status: number, message: string) {
  return res.status(status).json({ error: message });
}

async function activeRules(): Promise<{ version: number; rules: RewardRules }> {
  const { data } = await admin()
    .from('reward_rules')
    .select('version, rules')
    .eq('active', true)
    .maybeSingle();
  return { version: data?.version ?? 0, rules: (data?.rules as RewardRules) ?? FALLBACK_RULES };
}

async function householdForUser(userId: string): Promise<{ id: string; code: string } | null> {
  const { data } = await admin()
    .from('household_members')
    .select('household:households(id, code)')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  const hh: any = data?.household;
  return hh ? { id: hh.id, code: hh.code } : null;
}

function cleanStreams(input: any): WasteStream[] {
  if (!Array.isArray(input)) return [];
  return ALL_STREAMS.filter((s) => input.includes(s));
}

export function mountApiRoutes(app: Express) {
  // ---------------------------------------------------------------------------------
  // GET /api/wallet — authoritative balance + recent activity
  // ---------------------------------------------------------------------------------
  app.get('/api/wallet', async (req: Request, res: Response) => {
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

      return res.json({
        householdCode: hh.code,
        balance: bal?.settled_balance ?? 0,
        pending: bal?.pending_credits ?? 0,
        lifetimeEarned: bal?.lifetime_earned ?? 0,
        handovers: handovers ?? [],
        tickets: tickets ?? [],
      });
    } catch (e: any) {
      return fail(res, e.status ?? 500, e.message ?? 'wallet error');
    }
  });

  // ---------------------------------------------------------------------------------
  // POST /api/handovers/verify — the whole pipeline for one attempt
  //   body: { declaredStreams, attempt, handoverId?, photo?, video?, videoFrames?,
  //           clientCapturedAt?, clientLat?, clientLng?, clientAccuracyM?,
  //           attestationNonce?, idempotencyKey? }
  // ---------------------------------------------------------------------------------
  app.post('/api/handovers/verify', async (req: Request, res: Response) => {
    try {
      const principal = await resolvePrincipal(req);
      const db = admin();
      const hh = await householdForUser(principal.userId);
      if (!hh) return fail(res, 409, 'No household is linked to this session.');

      const body = req.body ?? {};
      const declaredStreams = cleanStreams(body.declaredStreams);
      const attempt: 1 | 2 = body.attempt === 2 ? 2 : 1;
      const photo: string | undefined = body.photo;
      const video: string | undefined = body.video;
      const videoFrames: string[] = Array.isArray(body.videoFrames) ? body.videoFrames : [];
      const mediaKind: 'photo' | 'video' = video ? 'video' : 'photo';
      const capturedAt: string = body.clientCapturedAt || new Date().toISOString();
      const lat = typeof body.clientLat === 'number' ? body.clientLat : null;
      const lng = typeof body.clientLng === 'number' ? body.clientLng : null;

      if (attempt === 1 && !photo) return fail(res, 400, 'A camera photo is required.');
      if (attempt === 2 && !photo && !video && videoFrames.length === 0)
        return fail(res, 400, 'A camera video or photo is required for the second attempt.');
      if (declaredStreams.length === 0) {
        const r = renderReason('NO_STREAMS_DECLARED');
        return res.json({ status: 'rejected', reasonCode: r.code, reasonText: r.text, creditsAwarded: 0, confirmedStreams: [] });
      }

      const { version: rulesVersion, rules } = await activeRules();
      const collectionDate = istDate(capturedAt);

      // --- idempotency: reuse an existing pending row for this attempt key ---
      let handoverId: string | undefined = body.handoverId;
      const idemKey: string | undefined = body.idempotencyKey;
      if (!handoverId && idemKey) {
        const { data: existing } = await db
          .from('handovers')
          .select('id, status, credits_awarded, confirmed_streams, decision_reason_code, decision_reason_text')
          .eq('idempotency_key', idemKey)
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
            client_captured_at: capturedAt,
            client_lat: lat,
            client_lng: lng,
            client_accuracy_m: typeof body.clientAccuracyM === 'number' ? body.clientAccuracyM : null,
            attestation_nonce: body.attestationNonce ?? null,
            idempotency_key: idemKey ?? null,
            status: 'pending',
          })
          .select('id')
          .single();
        if (error) return fail(res, 500, `create handover failed: ${error.message}`);
        handoverId = data.id;
      } else {
        await db
          .from('handovers')
          .update({ attempt, media_kind: mediaKind, status: 'pending' })
          .eq('id', handoverId);
      }

      // --- hashes (from the still image we have) ---
      const hashSource = photo || videoFrames[0];
      let phash: string | null = null;
      let contentHash: string | null = null;
      if (hashSource) {
        try {
          const { buffer } = decodeDataUrl(hashSource);
          phash = await dHash(buffer);
          contentHash = sha256(buffer);
        } catch (e: any) {
          console.error('[verify] hash failed:', e?.message);
        }
      }

      // --- structural fraud checks (authoritative) ---
      const fraudSignals = await runFraudChecks({
        householdId: hh.id,
        collectionDate,
        capturedAt,
        lat,
        lng,
        phash,
      });

      // --- AI evidence extraction ---
      let extract;
      try {
        extract =
          mediaKind === 'video'
            ? await extractFromVideo(video, videoFrames, declaredStreams)
            : await extractFromPhoto(photo!, declaredStreams);
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

      const stored = hashSource
        ? await uploadEvidence(handoverId, mediaKind === 'video' ? 'keyframe' : 'photo', hashSource, 0)
        : null;
      if (video) await uploadEvidence(handoverId, 'video', video, 0);
      await db.from('handover_media').insert({
        handover_id: handoverId,
        attempt,
        kind: mediaKind === 'video' ? 'keyframe' : 'photo',
        storage_path: stored?.path ?? 'not-stored',
        content_hash: contentHash,
        phash,
        bytes: stored?.bytes ?? null,
      });

      // --- adjudicate ---
      const decision = adjudicate({
        evidence: extract.evidence,
        declaredStreams,
        rules,
        rewardRulesVersion: rulesVersion,
        attempt,
        mediaKind,
        fraudSignals,
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
              : 'warn',
          }))
        );
      }

      // --- settle: on verified, write the ledger earn row with the hold ---
      let settleAt: string | null = null;
      if (decision.status === 'verified') {
        settleAt = new Date(Date.now() + rules.settlement_hold_hours * 3600_000).toISOString();
        const { error: ledgerErr } = await db.from('credit_ledger').insert({
          household_id: hh.id,
          entry_type: 'earn',
          amount: decision.creditsAwarded,
          handover_id: handoverId,
          reason: `Handover ${collectionDate}: ${decision.confirmedStreams.join('+')}`,
          effective_at: settleAt,
          created_by: principal.userId,
        });
        if (ledgerErr && !/duplicate key/i.test(ledgerErr.message)) {
          console.error('[verify] ledger insert:', ledgerErr.message);
        }
      }

      // --- finalize handover ---
      const { error: updErr } = await db
        .from('handovers')
        .update({
          status: decision.status,
          confirmed_streams: decision.confirmedStreams,
          credits_awarded: decision.creditsAwarded,
          reward_rules_version: rulesVersion,
          decision_reason_code: decision.reasonCode,
          decision_reason_text: decision.reasonText,
          settle_at: settleAt,
        })
        .eq('id', handoverId);

      if (updErr && /handovers_one_verified_per_day/.test(updErr.message)) {
        const r = renderReason('DAILY_LIMIT_REACHED');
        await db.from('handovers').update({ status: 'rejected', decision_reason_code: r.code, decision_reason_text: r.text }).eq('id', handoverId);
        return res.json({ handoverId, status: 'rejected', reasonCode: r.code, reasonText: r.text, creditsAwarded: 0, confirmedStreams: [] });
      }

      return res.json({
        handoverId,
        status: decision.status,
        reasonCode: decision.reasonCode,
        reasonText: decision.reasonText,
        fix: decision.fix,
        creditsAwarded: decision.creditsAwarded,
        confirmedStreams: decision.confirmedStreams,
        fraudSignals: decision.fraudSignals,
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
      return fail(res, e.status ?? 500, e.message ?? 'verification error');
    }
  });

  // ---------------------------------------------------------------------------------
  // POST /api/handovers/:id/dispute
  // ---------------------------------------------------------------------------------
  app.post('/api/handovers/:id/dispute', async (req: Request, res: Response) => {
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
      return fail(res, e.status ?? 500, e.message ?? 'dispute error');
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void workerCapExceeded; // used by the worker-issuance route (Phase 3)
}
