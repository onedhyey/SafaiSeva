// Households, invites, duplicate evidence and the public leaderboard (audit F3 / F12 / F15).
import { freshDb, test, done, assert, eq, rejects } from './harness.mjs';
import * as fx from './fixtures.mjs';

const db = await freshDb({ seed: true });
const one = (sql, params) => db.query(sql, params).then((x) => x.rows[0]);

try {
  const w = await fx.ward(db);
  const wardCode = (await one(`select code::text from public.wards where id = $1`, [w])).code;

  // --- household creation ----------------------------------------------------------
  const create = (u, opts = {}) =>
    one(
      `select public.create_household(p_user := $1, p_ward_code := $2, p_address := $3,
         p_lat := $4, p_lng := $5) as r`,
      [u, wardCode, opts.address ?? '12 Test Society', opts.lat ?? null, opts.lng ?? null]
    ).then((x) => x.r);

  await test('create_household makes the caller owner and returns a code', async () => {
    const u = await fx.user(db);
    const r = await create(u);
    assert(/^HH-U-[A-Z2-9]{6}$/.test(r.code), `code format ${r.code}`);
    const m = await one(`select member_role from public.household_members where user_id = $1`, [u]);
    eq(m.member_role, 'owner', 'owner role');
  });

  await test('one household per account (second create refused)', async () => {
    const u = await fx.user(db);
    await create(u);
    await rejects(create(u), /already_member/, 'second household');
  });

  await test('one household per account holds under concurrency', async () => {
    const u = await fx.user(db);
    const settled = await Promise.allSettled([create(u), create(u), create(u)]);
    eq(settled.filter((s) => s.status === 'fulfilled').length, 1, 'exactly one created');
    const n = await one(`select count(*)::int n from public.household_members where user_id = $1`, [u]);
    eq(n.n, 1, 'one membership');
  });

  // --- invites (F3) ----------------------------------------------------------------
  const invite = (hh, owner) =>
    one(`select public.create_household_invite(p_household := $1, p_owner := $2, p_ttl_hours := 48) as r`, [hh, owner])
      .then((x) => x.r);
  const requestJoin = (token, u) =>
    one(`select public.request_household_join(p_token := $1, p_user := $2) as r`, [token, u]).then((x) => x.r);
  const decideJoin = (req, owner, approve) =>
    one(`select public.decide_household_join(p_request := $1, p_owner := $2, p_approve := $3) as r`, [req, owner, approve])
      .then((x) => x.r);

  await test('F3: owner invite → pending request → owner approval → member', async () => {
    const owner = await fx.user(db);
    const { household_id } = await create(owner);
    const inv = await invite(household_id, owner);
    assert(typeof inv.token === 'string' && inv.token.length >= 10, 'token');
    const joiner = await fx.user(db);
    const r = await requestJoin(inv.token, joiner);
    eq(r.status, 'pending', 'pending until approved');
    const before = await one(`select count(*)::int n from public.household_members where user_id = $1`, [joiner]);
    eq(before.n, 0, 'not a member yet');
    await decideJoin(r.request_id, owner, true);
    const after = await one(`select household_id from public.household_members where user_id = $1`, [joiner]);
    eq(after.household_id, household_id, 'member after approval');
  });

  await test('F3: only the owner can invite or approve', async () => {
    const owner = await fx.user(db);
    const { household_id } = await create(owner);
    const stranger = await fx.user(db);
    await rejects(invite(household_id, stranger), /not_owner/, 'stranger invite');
    const inv = await invite(household_id, owner);
    const joiner = await fx.user(db);
    const r = await requestJoin(inv.token, joiner);
    await rejects(decideJoin(r.request_id, joiner, true), /not_owner/, 'self-approval');
  });

  await test('F3: the household code is not a join secret', async () => {
    const owner = await fx.user(db);
    const { code } = await create(owner);
    await rejects(requestJoin(code, await fx.user(db)), /invite_invalid/, 'joining by household code');
  });

  await test('expired or revoked invites are refused', async () => {
    const owner = await fx.user(db);
    const { household_id } = await create(owner);
    const inv = await invite(household_id, owner);
    await db.query(`update public.household_invites set expires_at = now() - interval '1 minute' where token = $1`, [inv.token]);
    await rejects(requestJoin(inv.token, await fx.user(db)), /invite_invalid/, 'expired');
  });

  await test('rejected request does not add a member; decided request is closed', async () => {
    const owner = await fx.user(db);
    const { household_id } = await create(owner);
    const inv = await invite(household_id, owner);
    const joiner = await fx.user(db);
    const r = await requestJoin(inv.token, joiner);
    await decideJoin(r.request_id, owner, false);
    const n = await one(`select count(*)::int n from public.household_members where user_id = $1`, [joiner]);
    eq(n.n, 0, 'no membership');
    await rejects(decideJoin(r.request_id, owner, true), /request_closed/, 'second decision');
  });

  await test('a member of another household cannot request to join', async () => {
    const a = await fx.user(db);
    const b = await fx.user(db);
    const { household_id } = await create(a);
    await create(b);
    const inv = await invite(household_id, a);
    await rejects(requestJoin(inv.token, b), /already_member/, 'already in a household');
  });

  // --- duplicate evidence (F12) ------------------------------------------------------
  const media = async (hh, u, phash, sha) => {
    const h = await fx.handover(db, hh, u);
    await db.query(
      `insert into public.handover_media (handover_id, kind, storage_path, phash, content_hash)
       values ($1, 'photo', 'k', $2, $3)`,
      [h, phash, sha]
    );
  };
  const dup = (hh, phash, sha) =>
    one(`select public.media_duplicate_signals(p_household := $1, p_phash := $2, p_content_hash := $3, p_max_distance := 6) as r`, [hh, phash, sha])
      .then((x) => x.r);

  await test('F12: near-identical photo from another household → duplicate_phash', async () => {
    const a = await fx.user(db);
    const b = await fx.user(db);
    const hhA = await fx.household(db, w, { owner: a });
    const hhB = await fx.household(db, w, { owner: b });
    await media(hhA, a, 'f0f0f0f0f0f0f0f0', 'sha-a1');
    eq(await dup(hhB, 'f0f0f0f0f0f0f0f1', 'sha-b1'), ['duplicate_phash'], '1-bit difference');
  });

  await test('F12: same household, same bins photographed again → similar_own (not a block)', async () => {
    const a = await fx.user(db);
    const hhA = await fx.household(db, w, { owner: a });
    await media(hhA, a, '0123456789abcdef', 'sha-own-1');
    eq(await dup(hhA, '0123456789abcdee', 'sha-own-2'), ['similar_own'], 'own near-dup');
  });

  await test('F12: exact byte resubmission, even own household → duplicate_phash', async () => {
    const a = await fx.user(db);
    const hhA = await fx.household(db, w, { owner: a });
    await media(hhA, a, 'aaaaaaaaaaaaaaaa', 'sha-same');
    eq(await dup(hhA, 'aaaaaaaaaaaaaaaa', 'sha-same'), ['duplicate_phash'], 'exact resubmit');
  });

  await test('F12: distant hashes → no signal; matches older than 30 days still count', async () => {
    const a = await fx.user(db);
    const b = await fx.user(db);
    const hhA = await fx.household(db, w, { owner: a });
    const hhB = await fx.household(db, w, { owner: b });
    await media(hhA, a, '1111111111111111', 'sha-old');
    await db.query(`update public.handover_media set created_at = now() - interval '90 days' where content_hash = 'sha-old'`);
    eq(await dup(hhB, 'eeeeeeeeeeeeeeee', 'sha-new'), [], 'far apart');
    eq(await dup(hhB, '1111111111111110', 'sha-new2'), ['duplicate_phash'], 'old near-dup still caught');
  });

  // --- leaderboard (F3 / F15) --------------------------------------------------------
  await test('F3/F15: live leaderboard exposes no codes or addresses and ranks by recent earnings', async () => {
    const lw = await fx.ward(db);
    const u1 = await fx.user(db);
    const u2 = await fx.user(db);
    const h1 = await fx.household(db, lw, { owner: u1 });
    const h2 = await fx.household(db, lw, { owner: u2 });
    const earn = (hh, amt, when = 'now()') =>
      db.query(
        `insert into public.credit_ledger (household_id, entry_type, amount, reason, effective_at, created_at)
         values ($1, 'milestone', $2, 't', ${when}, ${when})`,
        [hh, amt]
      );
    await earn(h1, 10);
    await earn(h2, 6);
    await earn(h2, 50, "now() - interval '45 days'"); // outside the 30-day window
    // h1 spends most of its credits — spending must not lower its rank
    await db.query(
      `insert into public.credit_ledger (household_id, entry_type, amount, reason) values ($1, 'spend', -9, 'ticket')`,
      [h1]
    );
    const cols = (await db.query(`select * from public.v_ward_leaderboard_live limit 0`)).fields.map((f) => f.name);
    assert(!cols.some((c) => /code|address|society|ref/.test(c)), `no identifying columns: ${cols}`);
    const rows = (await db.query(
      `select household_id, credits_30d, rank from public.v_ward_leaderboard_live where ward_id = $1 order by rank`,
      [lw]
    )).rows;
    eq(rows.map((r) => [r.household_id, r.credits_30d, Number(r.rank)]), [[h1, 10, 1], [h2, 6, 2]], 'ranking');
  });
} finally {
  await db.drop();
}

done();
