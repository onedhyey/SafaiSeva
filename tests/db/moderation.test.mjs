// Moderation (audit Phase 4): officers reverse fraudulent awards and suspend households,
// ward-scoped and audit-logged. The ledger is never edited — reversals are new rows.
import { freshDb, test, done, assert, eq, rejects } from './harness.mjs';
import * as fx from './fixtures.mjs';

const db = await freshDb();
const one = (sql, p) => db.query(sql, p).then((x) => x.rows[0]);

async function officer(wardId) {
  const u = await fx.user(db, 'officer');
  return (await one(
    `insert into public.ward_officers (user_id, officer_code, name, ward_id)
     values ($1, $2, 'Officer', $3) returning id`,
    [u, 'OFF-' + Math.random().toString(36).slice(2, 8), wardId]
  )).id;
}

async function paidHandover(wardId) {
  const u = await fx.user(db);
  const hh = await fx.household(db, wardId, { owner: u });
  const h = await fx.handover(db, hh, u);
  await db.query(
    `select public.record_handover_decision($1, $2, 'verified', '{wet,dry}', 2, 1, 'OK_VERIFIED', 'ok', 0, $3, 'earn', 'limit')`,
    [h, hh, u]
  );
  return { u, hh, h };
}

const balance = (hh) =>
  one(`select settled_balance::int b from public.v_household_balance where household_id = $1`, [hh]).then((r) => r.b);
const reverse = (h, off, reason = 'photo reused from another home') =>
  one(`select public.reverse_handover_credit(p_handover := $1, p_officer := $2, p_reason := $3) as r`, [h, off, reason]).then((x) => x.r);
const suspend = (hh, off, on = true) =>
  one(`select public.set_household_suspension(p_household := $1, p_officer := $2, p_suspended := $3, p_reason := 'fraud ring') as r`, [hh, off, on]).then((x) => x.r);

try {
  const w = await fx.ward(db);

  await test('reversal writes a negative ledger row, marks the handover, and is audit-logged', async () => {
    const { hh, h } = await paidHandover(w);
    const off = await officer(w);
    eq(await balance(hh), 2, 'paid');
    const r = await reverse(h, off);
    eq(r.reversed, 2, 'reversed amount');
    eq(await balance(hh), 0, 'balance back to 0');
    const hv = await one(`select status, decision_reason_code from public.handovers where id = $1`, [h]);
    eq([hv.status, hv.decision_reason_code], ['rejected', 'REVERSED_BY_OFFICER'], 'handover marked');
    const log = await one(`select action, reason from public.moderation_actions where target_id = $1`, [h]);
    eq([log.action, log.reason], ['reverse_credit', 'photo reused from another home'], 'audit log');
    eq((await db.query(`select * from public.v_ledger_reconciliation`)).rows, [], 'reconciliation stays clean');
  });

  await test('a handover can be reversed only once', async () => {
    const { h } = await paidHandover(w);
    const off = await officer(w);
    await reverse(h, off);
    await rejects(reverse(h, off), /already_reversed|not_reversible/, 'second reversal');
  });

  await test('officers can only reverse in their own ward', async () => {
    const { h } = await paidHandover(w);
    const other = await officer(await fx.ward(db));
    await rejects(reverse(h, other), /ward_scope/, 'cross-ward reversal');
  });

  await test('a reason is required', async () => {
    const { h } = await paidHandover(w);
    const off = await officer(w);
    await rejects(reverse(h, off, '  '), /reason_required/, 'blank reason');
  });

  await test('suspended households cannot earn or redeem; lifting restores them', async () => {
    const { u, hh } = await paidHandover(w);
    const off = await officer(w);
    await suspend(hh, off, true);
    const h2 = await fx.handover(db, hh, u, { date: '2026-01-01' });
    await rejects(
      db.query(
        `select public.record_handover_decision($1, $2, 'verified', '{wet,dry}', 2, 1, 'OK', 'ok', 0, $3, 'earn', 'limit')`,
        [h2, hh, u]
      ),
      /household_suspended/,
      'earning while suspended'
    );
    await rejects(
      db.query(`select public.redeem_ticket($1, $2, 'janmarg_brts', 't', 'r', 1, now() + interval '1 day')`, [hh, u]),
      /household_suspended/,
      'redeeming while suspended'
    );
    await suspend(hh, off, false);
    const r = await db.query(`select public.redeem_ticket($1, $2, 'janmarg_brts', 't', 'r', 1, now() + interval '1 day')`, [hh, u]);
    assert(r.rows.length === 1, 'redeem works after lifting');
    const n = await one(`select count(*)::int n from public.moderation_actions where target_id = $1`, [hh]);
    eq(n.n, 2, 'suspend + lift logged');
  });

  await test('suspension is ward-scoped', async () => {
    const { hh } = await paidHandover(w);
    const other = await officer(await fx.ward(db));
    await rejects(suspend(hh, other), /ward_scope/, 'cross-ward suspension');
  });
} finally {
  await db.drop();
}

done();
