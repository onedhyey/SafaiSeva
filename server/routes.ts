// SafaiSeva backend API. The service-role client is the sole authority over handover
// status, credits, and the ledger (audit C2). The client sends evidence and receives a
// decision it cannot influence.

import type { Express, Request, Response } from 'express';
import { admin } from './supabaseAdmin.ts';
import { resolvePrincipal, resolveWorker } from './principal.ts';
import { dHash, sha256, decodeDataUrl } from './phash.ts';
import { extractFromPhoto, extractFromVideo } from './gemini.ts';
import { runFraudChecks, istDate, workerCapExceeded } from './fraud.ts';
import { uploadEvidence } from './storage.ts';
import { signTicket } from './qrToken.ts';
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
      return fail(res, e.status ?? 500, e.message ?? 'wallet error');
    }
  });

  // ---------------------------------------------------------------------------------
  // POST /api/household/bins — set how many separated bins the home has (audit P1).
  //   body: { binCount: 0..8 }
  // Crossing 2 / 4 / 6 bins awards the two_bins / four_bins / six_bins milestone credit
  // (5 / 10 / 20). Each awarded once (bin_milestones unique per household+milestone),
  // settled immediately.
  // ---------------------------------------------------------------------------------
  app.post('/api/household/bins', async (req: Request, res: Response) => {
    try {
      const principal = await resolvePrincipal(req);
      const hh = await householdForUser(principal.userId);
      if (!hh) return fail(res, 409, 'No household is linked to this session.');

      const raw = Number(req.body?.binCount);
      if (!Number.isFinite(raw) || raw < 0 || raw > 8) {
        return fail(res, 400, 'binCount must be between 0 and 8.');
      }
      const newCount = Math.round(raw);
      const oldCount = hh.binCount;

      const db = admin();
      const { rules } = await activeRules();

      const crossed: { milestone: 'two_bins' | 'four_bins' | 'six_bins'; credits: number }[] = [];
      if (oldCount < 2 && newCount >= 2)
        crossed.push({ milestone: 'two_bins', credits: rules.milestones.two_bins });
      if (oldCount < 4 && newCount >= 4)
        crossed.push({ milestone: 'four_bins', credits: rules.milestones.four_bins });
      if (oldCount < 6 && newCount >= 6)
        crossed.push({ milestone: 'six_bins', credits: rules.milestones.six_bins });

      const awarded: { milestone: string; credits: number }[] = [];
      for (const c of crossed) {
        const { error: msErr } = await db
          .from('bin_milestones')
          .insert({ household_id: hh.id, milestone: c.milestone, credits_awarded: c.credits });
        if (msErr) {
          if (/duplicate key/i.test(msErr.message)) continue; // already awarded
          console.error('[bins] milestone insert:', msErr.message);
          continue;
        }
        const { error: ledErr } = await db.from('credit_ledger').insert({
          household_id: hh.id,
          entry_type: 'milestone',
          amount: c.credits,
          reason: `${
            c.milestone === 'two_bins' ? 'Two-bin' : c.milestone === 'four_bins' ? 'Four-bin' : 'Six-bin'
          } setup milestone`,
          effective_at: new Date().toISOString(),
          created_by: principal.userId,
        });
        if (ledErr) console.error('[bins] ledger insert:', ledErr.message);
        else awarded.push({ milestone: c.milestone, credits: c.credits });
      }

      await db
        .from('households')
        .update({ bin_count: newCount, bins_onboarded_at: new Date().toISOString() })
        .eq('id', hh.id);

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
      return fail(res, e.status ?? 500, e.message ?? 'bins error');
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
      const { version: rulesVersion, rules } = await activeRules();

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
        otherReasons: decision.otherReasons ?? [],
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
  // POST /api/tickets/redeem — spend leaves on a transit ticket.
  //   body: { transitType: 'janmarg_brts' | 'ahmedabad_metro' | 'janmarg_day_pass' }
  // Atomic (app.redeem_ticket locks the household); writes the ticket + a 'spend' ledger
  // row. The QR token is HMAC-signed (audit I6). Real fare-gate validation needs a
  // transit partnership (G2).
  // ---------------------------------------------------------------------------------
  app.post('/api/tickets/redeem', async (req: Request, res: Response) => {
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
      return fail(res, e.status ?? 500, e.message ?? 'redeem error');
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

  // ---------------------------------------------------------------------------------
  // Karmachari — review queue and manual (no-app) credit issuance (audit A4 / G3 / I7)
  // ---------------------------------------------------------------------------------

  // GET /api/review-queue — handovers the backend routed to a human.
  app.get('/api/review-queue', async (req: Request, res: Response) => {
    try {
      await resolveWorker(req);
      const { data } = await admin()
        .from('v_review_queue')
        .select('*')
        .order('created_at', { ascending: true });
      return res.json({ items: data ?? [] });
    } catch (e: any) {
      return fail(res, e.status ?? 500, e.message ?? 'review-queue error');
    }
  });

  // POST /api/review-queue/:id/decide  { decision: 'approve' | 'reject', reason?, note? }
  app.post('/api/review-queue/:id/decide', async (req: Request, res: Response) => {
    try {
      const worker = await resolveWorker(req);
      const db = admin();
      const decision = req.body?.decision === 'approve' ? 'approve' : 'reject';

      const { data: h } = await db
        .from('handovers')
        .select('id, household_id, status, declared_streams, confirmed_streams, collection_date, reward_rules_version')
        .eq('id', req.params.id)
        .maybeSingle();
      if (!h) return fail(res, 404, 'Handover not found.');
      if (h.status !== 'in_review') return fail(res, 409, 'This handover is no longer in review.');

      const reviewer = `Karmachari ${worker.name} (${worker.workerCode})`;
      const now = new Date().toISOString();

      if (decision === 'reject') {
        const reason = String(req.body?.reason || 'Not separated at source').slice(0, 200);
        await db
          .from('handovers')
          .update({
            status: 'rejected',
            credits_awarded: 0,
            decision_reason_code: 'IN_REVIEW_CONFLICT',
            decision_reason_text: `Karmachari review: ${reason}`,
            reviewed_by: worker.userId,
            reviewed_at: now,
            review_note: String(req.body?.note || '').slice(0, 500) || null,
          })
          .eq('id', h.id);
        return res.json({ status: 'rejected' });
      }

      // approve: worker vouches for it → credit the confirmed (or declared) streams now.
      const { version, rules } = await activeRules();
      const streams: string[] =
        (h.confirmed_streams?.length ? h.confirmed_streams : h.declared_streams) ?? [];
      const credits = Math.min(streams.length * rules.per_confirmed_stream, rules.daily_cap_credits);
      const settleAt = new Date(Date.now() + rules.settlement_hold_hours * 3600_000).toISOString();

      const { error: updErr } = await db
        .from('handovers')
        .update({
          status: 'verified',
          confirmed_streams: streams,
          credits_awarded: credits,
          reward_rules_version: h.reward_rules_version ?? version,
          decision_reason_code: 'OK_VERIFIED',
          decision_reason_text: `Approved by ${reviewer} after review.`,
          settle_at: settleAt,
          reviewed_by: worker.userId,
          reviewed_at: now,
          review_note: String(req.body?.note || '').slice(0, 500) || null,
        })
        .eq('id', h.id);

      if (updErr && /handovers_one_verified_per_day/.test(updErr.message)) {
        return fail(res, 409, 'This household already has an approved handover for that day.');
      }
      if (updErr) return fail(res, 500, updErr.message);

      const { error: ledErr } = await db.from('credit_ledger').insert({
        household_id: h.household_id,
        entry_type: 'earn',
        amount: credits,
        handover_id: h.id,
        reason: `Handover ${h.collection_date}: approved on review (${streams.join('+')})`,
        effective_at: settleAt,
        created_by: worker.userId,
      });
      if (ledErr && !/duplicate key/i.test(ledErr.message)) {
        console.error('[review] ledger insert:', ledErr.message);
      }
      return res.json({ status: 'verified', creditsAwarded: credits, settleAt });
    } catch (e: any) {
      return fail(res, e.status ?? 500, e.message ?? 'decide error');
    }
  });

  // POST /api/worker/issue  { householdCode, streams: [], workerLat?, workerLng?, note? }
  // A karmachari credits a household at the door (feature phone / no smartphone).
  app.post('/api/worker/issue', async (req: Request, res: Response) => {
    try {
      const worker = await resolveWorker(req);
      const db = admin();

      const code = String(req.body?.householdCode || '').trim();
      if (!code) return fail(res, 400, 'A household code is required.');
      const streams = cleanStreams(req.body?.streams);
      if (streams.length < 2) return fail(res, 400, 'Confirm at least wet and dry.');

      const issuedDate = istDate(new Date().toISOString());
      if (await workerCapExceeded(worker.workerId, issuedDate)) {
        return fail(res, 429, `Daily issuance cap (${worker.dailyIssueCap}) reached.`);
      }

      const { data: hh } = await db
        .from('households')
        .select('id')
        .eq('code', code)
        .maybeSingle();
      if (!hh) return fail(res, 404, `Household ${code} is not registered.`);

      const { rules } = await activeRules();
      const credits = rules.worker_issue_credits ?? 2;

      // A verified handover row so it shows in the household's history…
      const { data: handover, error: hErr } = await db
        .from('handovers')
        .insert({
          household_id: hh.id,
          submitted_by: worker.userId,
          collection_date: issuedDate,
          attempt: 1,
          media_kind: 'photo',
          declared_streams: streams,
          confirmed_streams: streams,
          status: 'verified',
          credits_awarded: credits,
          decision_reason_code: 'OK_VERIFIED',
          decision_reason_text: `Doorstep verification by Karmachari ${worker.name} (${worker.workerCode}).`,
          reviewed_by: worker.userId,
          reviewed_at: new Date().toISOString(),
          client_lat: typeof req.body?.workerLat === 'number' ? req.body.workerLat : null,
          client_lng: typeof req.body?.workerLng === 'number' ? req.body.workerLng : null,
        })
        .select('id')
        .single();
      if (hErr && /handovers_one_verified_per_day/.test(hErr.message)) {
        return fail(res, 409, `${code} already has an approved handover today.`);
      }
      if (hErr) return fail(res, 500, hErr.message);

      await db.from('worker_issuances').insert({
        worker_id: worker.workerId,
        household_id: hh.id,
        household_code: code,
        issued_date: issuedDate,
        streams,
        worker_lat: typeof req.body?.workerLat === 'number' ? req.body.workerLat : null,
        worker_lng: typeof req.body?.workerLng === 'number' ? req.body.workerLng : null,
        credits,
        handover_id: handover.id,
      });

      const { error: ledErr } = await db.from('credit_ledger').insert({
        household_id: hh.id,
        entry_type: 'earn',
        amount: credits,
        handover_id: handover.id,
        reason: `Doorstep issuance by ${worker.workerCode}`,
        effective_at: new Date().toISOString(), // physically verified → no hold
        created_by: worker.userId,
      });
      if (ledErr && !/duplicate key/i.test(ledErr.message)) {
        console.error('[worker/issue] ledger:', ledErr.message);
      }

      return res.json({ householdCode: code, creditsAwarded: credits });
    } catch (e: any) {
      return fail(res, e.status ?? 500, e.message ?? 'issue error');
    }
  });
}
