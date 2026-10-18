// Fixes for the code-review findings on the hardening branch (SQL layer).
import { freshDb, test, done, assert, eq, rejects } from './harness.mjs';
import * as fx from './fixtures.mjs';

const db = await freshDb();
const one = (sql, p) => db.query(sql, p).then((x) => x.rows[0]);

async function officer(wardId) {
  const u = await fx.user(db, 'officer');
  return (await one(
    `insert into public.ward_officers (user_id, officer_code, name, ward_id) values ($1, $2, 'O', $3) returning id`,
    [u, 'OFF-' + Math.random().toString(36).slice(2, 8), wardId]
  )).id;
}
const decide = (h, hh, u, credits = 2) =>
  one(
    `select public.record_handover_decision($1, $2, 'verified', '{wet,dry,sanitary,special_care}', $4, 1, 'OK', 'ok', 0, $3, 'earn', 'limit') as r`,
    [h, hh, u, credits]
  ).then((x) => x.r);

try {
  const w = await fx.ward(db);

  await test('review #2: a reversed handover cannot be decided again', async () => {
    const u = await fx.user(db);
    const hh = await fx.household(db, w, { owner: u });
    const h = await fx.handover(db, hh, u);
    await decide(h, hh, u);
    const off = await officer(w);
    await db.query(`select public.reverse_handover_credit($1, $2, 'fraud')`, [h, off]);
    await db.query(`update public.handovers set status = 'pending' where id = $1`, [h]); // as the old route did
    await rejects(decide(h, hh, u), /already_reversed/, 're-decide reversed handover');
  });

  await test('review #4: approving a request whose user joined elsewhere closes it (not stuck pending)', async () => {
    const a = await fx.user(db);
    const b = await fx.user(db);
    const joiner = await fx.user(db);
    const { household_id: hA } = (await one(`select public.create_household($1, (select code::text from public.wards where id = $2), 'a', null, null) as r`, [a, w])).r;
    const { household_id: hB } = (await one(`select public.create_household($1, (select code::text from public.wards where id = $2), 'b', null, null) as r`, [b, w])).r;
    const invA = (await one(`select public.create_household_invite($1, $2, 48) as r`, [hA, a])).r;
    const invB = (await one(`select public.create_household_invite($1, $2, 48) as r`, [hB, b])).r;
    const rA = (await one(`select public.request_household_join($1, $2) as r`, [invA.token, joiner])).r;
    const rB = (await one(`select public.request_household_join($1, $2) as r`, [invB.token, joiner])).r;
    await one(`select public.decide_household_join($1, $2, true)`, [rA.request_id, a]);
    const out = (await one(`select public.decide_household_join($1, $2, true) as r`, [rB.request_id, b])).r;
    eq(out.status, 'cancelled', 'second approval reports cancelled');
    const st = await one(`select status from public.household_join_requests where id = $1`, [rB.request_id]);
    eq(st.status, 'cancelled', 'request no longer pending');
  });

  await test('review #6: reversed credits do not count on the leaderboard', async () => {
    const lw = await fx.ward(db);
    const u = await fx.user(db);
    const hh = await fx.household(db, lw, { owner: u });
    const h = await fx.handover(db, hh, u);
    await decide(h, hh, u, 4);
    const off = await officer(lw);
    await db.query(`select public.reverse_handover_credit($1, $2, 'fraud')`, [h, off]);
    const n = await one(`select count(*)::int n from public.v_ward_leaderboard_live where household_id = $1`, [hh]);
    eq(n.n, 0, 'net-zero household not ranked');
  });

  await test('review #7: a deleted user’s evidence is due for purge immediately and stays due until removed', async () => {
    const u = await fx.user(db);
    const hh = await fx.household(db, w, { owner: u });
    const h = await fx.handover(db, hh, u);
    await db.query(`insert into public.handover_media (handover_id, kind, storage_path, phash) values ($1, 'photo', 'del-1', 'aaaaaaaaaaaaaaaa')`, [h]);
    const r = (await one(`select public.forget_user($1) as r`, [u])).r;
    eq(r.storage_paths, ['del-1'], 'paths returned');
    const due = (await db.query(`select storage_path from public.media_due_for_purge(90, 100)`)).rows.map((x) => x.storage_path);
    assert(due.includes('del-1'), 'still due until storage removal is confirmed');
  });

  await test('review #8: near-duplicate search uses a precomputed bit column and still finds matches', async () => {
    const a = await fx.user(db);
    const b = await fx.user(db);
    const hA = await fx.household(db, w, { owner: a });
    const hB = await fx.household(db, w, { owner: b });
    const h = await fx.handover(db, hA, a);
    await db.query(`insert into public.handover_media (handover_id, kind, storage_path, phash) values ($1, 'photo', 'n-1', '00ff00ff00ff00ff')`, [h]);
    const col = await one(`select count(*)::int n from information_schema.columns where table_name = 'handover_media' and column_name = 'phash_bits'`);
    eq(col.n, 1, 'phash_bits column exists');
    const sig = (await one(`select public.media_duplicate_signals($1, '00ff00ff00ff00fe', null, 6) as r`, [hB])).r;
    eq(sig, ['duplicate_phash'], 'match found');
  });

  await test('review #9: reversing a handover claws back milestones it no longer supports', async () => {
    const u = await fx.user(db);
    const hh = await fx.household(db, w, { owner: u, binCount: 2 });
    const h = await fx.handover(db, hh, u);
    await decide(h, hh, u);
    const m = (await one(`select public.award_bin_milestones($1, $2, 0) as r`, [hh, u])).r;
    eq(m.map((x) => x.milestone), ['two_bins'], 'milestone earned');
    const off = await officer(w);
    await db.query(`select public.reverse_handover_credit($1, $2, 'fraud')`, [h, off]);
    const bal = await one(`select settled_balance::int b from public.v_household_balance where household_id = $1`, [hh]);
    eq(bal.b, 0, 'earn and milestone both reversed');
    const ms = await one(`select reversed_at is not null as rev from public.bin_milestones where household_id = $1`, [hh]);
    eq(ms.rev, true, 'milestone marked reversed (can be re-earned)');
    eq((await db.query(`select * from public.v_ledger_reconciliation`)).rows, [], 'reconciliation clean');
  });
} finally {
  await db.drop();
}

done();
