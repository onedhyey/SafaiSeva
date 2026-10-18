// Credit integrity (audit F4 / F5 / F6 / F11): every credit-changing decision is one
// transaction that locks the household, so the ledger can never disagree with the
// handover it pays for — even under concurrent requests.
import { freshDb, test, done, assert, eq, rejects } from './harness.mjs';
import * as fx from './fixtures.mjs';

const db = await freshDb();

const decide = (h, hh, actor, over = {}) =>
  db.query(
    `select public.record_handover_decision(
       p_handover := $1, p_household := $2, p_status := $3, p_confirmed_streams := $4,
       p_credits := $5, p_rules_version := 1, p_reason_code := $6, p_reason_text := 'r',
       p_hold_hours := 24, p_actor := $7, p_ledger_reason := 'test earn',
       p_daily_limit_text := 'already verified today') as r`,
    [
      h,
      hh,
      over.status ?? 'verified',
      over.confirmed ?? ['wet', 'dry'],
      over.credits ?? 2,
      over.code ?? 'OK_VERIFIED',
      actor,
    ]
  ).then((x) => x.rows[0].r);

const reconciliation = () =>
  db.query(`select * from public.v_ledger_reconciliation`).then((x) => x.rows);

try {
  const w = await fx.ward(db);

  // --- record_handover_decision ---------------------------------------------------
  await test('verified decision writes handover + one held earn row atomically', async () => {
    const u = await fx.user(db);
    const hh = await fx.household(db, w, { owner: u });
    const h = await fx.handover(db, hh, u);
    const r = await decide(h, hh, u);
    eq(r.status, 'verified', 'status');
    eq(r.credits_awarded, 2, 'credits');
    const l = await fx.ledger(db, hh);
    eq(l.length, 1, 'one ledger row');
    eq([l[0].entry_type, l[0].amount, l[0].handover_id, l[0].on_hold], ['earn', 2, h, true], 'earn row on hold');
  });

  await test('rejected decision writes no ledger row', async () => {
    const u = await fx.user(db);
    const hh = await fx.household(db, w, { owner: u });
    const h = await fx.handover(db, hh, u);
    const r = await decide(h, hh, u, { status: 'rejected', credits: 0, confirmed: [], code: 'NO_WASTE' });
    eq(r.status, 'rejected', 'status');
    eq((await fx.ledger(db, hh)).length, 0, 'no ledger rows');
  });

  await test('F4: a handover of another household cannot be decided', async () => {
    const a = await fx.user(db);
    const b = await fx.user(db);
    const hhA = await fx.household(db, w, { owner: a });
    const hhB = await fx.household(db, w, { owner: b });
    const victim = await fx.handover(db, hhA, a);
    await rejects(decide(victim, hhB, b), /handover_not_owned/, 'foreign handover');
    const { rows } = await db.query(`select status from public.handovers where id = $1`, [victim]);
    eq(rows[0].status, 'pending', 'victim untouched');
    eq((await fx.ledger(db, hhB)).length, 0, 'attacker earned nothing');
  });

  await test('F5: concurrent same-day verifies → exactly one verified, one earn row', async () => {
    const u = await fx.user(db);
    const hh = await fx.household(db, w, { owner: u });
    const hs = await Promise.all([1, 2, 3, 4, 5].map(() => fx.handover(db, hh, u)));
    const results = await Promise.all(hs.map((h) => decide(h, hh, u)));
    eq(results.filter((r) => r.status === 'verified').length, 1, 'verified count');
    eq(results.filter((r) => r.daily_limit === true).length, 4, 'daily-limit rejections');
    const l = await fx.ledger(db, hh);
    eq(l.length, 1, 'exactly one ledger row');
    eq((await reconciliation()).length, 0, 'reconciliation clean');
  });

  await test('reconciliation view flags an earn row whose handover is not verified', async () => {
    const u = await fx.user(db);
    const hh = await fx.household(db, w, { owner: u });
    const h = await fx.handover(db, hh, u, { status: 'rejected' });
    await db.query(
      `insert into public.credit_ledger (household_id, entry_type, amount, handover_id, reason)
       values ($1, 'earn', 2, $2, 'orphan')`,
      [hh, h]
    );
    const rows = await reconciliation();
    assert(rows.some((r) => r.handover_id === h), 'orphan earn row reported');
    // keep the rest of the suite's reconciliation checks meaningful
    await db.query(`update public.handovers set status = 'verified', credits_awarded = 2 where id = $1`, [h]);
  });

  // --- decide_review (karmachari) --------------------------------------------------
  const review = (h, workerId, decision, note = null) =>
    db.query(
      `select public.decide_review(
         p_handover := $1, p_worker := $2, p_decision := $3, p_per_stream := 1, p_cap := 4,
         p_hold_hours := 24, p_rules_version := 1, p_reason_text := 'Approved on review',
         p_note := $4) as r`,
      [h, workerId, decision, note]
    ).then((x) => x.rows[0].r);

  await test('F11: review approve by a worker of the same ward pays once', async () => {
    const u = await fx.user(db);
    const hh = await fx.household(db, w, { owner: u });
    const h = await fx.handover(db, hh, u, { status: 'in_review', declared: ['wet', 'dry', 'sanitary'] });
    const wk = await fx.worker(db, w);
    const r = await review(h, wk.id, 'approve');
    eq([r.status, r.credits_awarded], ['verified', 3], 'approved');
    const l = await fx.ledger(db, hh);
    eq(l.map((x) => x.amount), [3], 'one earn of 3');
    await rejects(review(h, wk.id, 'approve'), /not_in_review/, 'second approve');
  });

  await test('F11: a worker from another ward cannot decide the handover', async () => {
    const u = await fx.user(db);
    const hh = await fx.household(db, w, { owner: u });
    const h = await fx.handover(db, hh, u, { status: 'in_review' });
    const otherWard = await fx.ward(db);
    const wk = await fx.worker(db, otherWard);
    await rejects(review(h, wk.id, 'approve'), /ward_scope/, 'cross-ward approve');
    eq((await fx.ledger(db, hh)).length, 0, 'no ledger');
  });

  await test('review approve respects one verified handover per day', async () => {
    const u = await fx.user(db);
    const hh = await fx.household(db, w, { owner: u });
    await fx.handover(db, hh, u, { status: 'verified' });
    const h2 = await fx.handover(db, hh, u, { status: 'in_review' });
    const wk = await fx.worker(db, w);
    await rejects(review(h2, wk.id, 'approve'), /daily_limit/, 'second verified same day');
    eq((await fx.ledger(db, hh)).length, 0, 'no ledger');
  });

  await test('review reject writes no ledger row', async () => {
    const u = await fx.user(db);
    const hh = await fx.household(db, w, { owner: u });
    const h = await fx.handover(db, hh, u, { status: 'in_review' });
    const wk = await fx.worker(db, w);
    const r = await review(h, wk.id, 'reject', 'mixed');
    eq(r.status, 'rejected', 'rejected');
    eq((await fx.ledger(db, hh)).length, 0, 'no ledger');
  });

  // --- issue_doorstep --------------------------------------------------------------
  const issue = (workerId, code, { lat = null, lng = null, streams = ['wet', 'dry'] } = {}) =>
    db.query(
      `select public.issue_doorstep(
         p_worker := $1, p_household_code := $2, p_streams := $3, p_credits := 2,
         p_worker_lat := $4, p_worker_lng := $5, p_max_distance_m := 150,
         p_reason_text := 'Doorstep') as r`,
      [workerId, code, streams, lat, lng]
    ).then((x) => x.rows[0].r);

  await test('doorstep issuance writes handover + issuance + settled ledger together', async () => {
    const hh = await fx.household(db, w);
    const code = await fx.householdCode(db, hh);
    const wk = await fx.worker(db, w);
    const r = await issue(wk.id, code);
    eq(r.credits_awarded, 2, 'credits');
    const l = await fx.ledger(db, hh);
    eq([l.length, l[0].amount, l[0].on_hold], [1, 2, false], 'settled earn');
    const { rows } = await db.query(`select count(*)::int n from public.worker_issuances where household_id = $1`, [hh]);
    eq(rows[0].n, 1, 'issuance row');
    await rejects(issue(wk.id, code), /daily_limit/, 'second issuance same day');
    eq((await fx.ledger(db, hh)).length, 1, 'still one ledger row');
  });

  await test('F11: doorstep issuance is ward-scoped', async () => {
    const hh = await fx.household(db, w);
    const code = await fx.householdCode(db, hh);
    const wk = await fx.worker(db, await fx.ward(db));
    await rejects(issue(wk.id, code), /ward_scope/, 'cross-ward issuance');
  });

  await test('F11: doorstep issuance needs the worker near a geolocated household', async () => {
    const hh = await fx.household(db, w, { lat: 23.03, lng: 72.56 });
    const code = await fx.householdCode(db, hh);
    const wk = await fx.worker(db, w);
    await rejects(issue(wk.id, code), /worker_location_required/, 'no worker fix');
    await rejects(issue(wk.id, code, { lat: 23.04, lng: 72.56 }), /worker_too_far/, '~1.1 km away');
    const r = await issue(wk.id, code, { lat: 23.0305, lng: 72.5601 });
    eq(r.credits_awarded, 2, 'within 150 m');
  });

  await test('doorstep issuance cap is enforced under concurrency', async () => {
    const wk = await fx.worker(db, w, { cap: 2 });
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push(await fx.householdCode(db, await fx.household(db, w)));
    const settled = await Promise.allSettled(codes.map((c) => issue(wk.id, c)));
    eq(settled.filter((s) => s.status === 'fulfilled').length, 2, 'only cap issuances succeed');
    assert(
      settled.filter((s) => s.status === 'rejected').every((s) => /worker_cap/.test(s.reason.message)),
      'others fail with worker_cap'
    );
  });

  // --- bin milestones (F6) ---------------------------------------------------------
  const milestones = (hh, actor) =>
    db.query(`select public.award_bin_milestones(p_household := $1, p_actor := $2, p_hold_hours := 24) as r`, [hh, actor])
      .then((x) => x.rows[0].r);

  await test('F6: self-reported bins alone award nothing', async () => {
    const u = await fx.user(db);
    const hh = await fx.household(db, w, { owner: u, binCount: 6 });
    eq(await milestones(hh, u), [], 'no awards without evidence');
    eq((await fx.ledger(db, hh)).length, 0, 'no ledger');
  });

  await test('F6: milestones unlock from verified evidence, once, on hold', async () => {
    const u = await fx.user(db);
    const hh = await fx.household(db, w, { owner: u, binCount: 6 });
    await fx.handover(db, hh, u, { status: 'verified', confirmed: ['wet', 'dry'] });
    const first = await milestones(hh, u);
    eq(first.map((m) => m.milestone), ['two_bins'], 'two_bins only');
    eq(await milestones(hh, u), [], 'idempotent');
    const l = await fx.ledger(db, hh);
    eq([l.length, l[0].entry_type, l[0].amount, l[0].on_hold], [1, 'milestone', 5, true], 'held milestone credit');
  });

  await test('F6: milestones need the reported bin count too', async () => {
    const u = await fx.user(db);
    const hh = await fx.household(db, w, { owner: u, binCount: 1 });
    await fx.handover(db, hh, u, { status: 'verified', confirmed: ['wet', 'dry'] });
    eq(await milestones(hh, u), [], 'one bin → no two_bins');
  });

  await test('ledger reconciles with handovers after the whole suite', async () => {
    eq(await reconciliation(), [], 'final reconciliation');
  });
} finally {
  await db.drop();
}

done();
