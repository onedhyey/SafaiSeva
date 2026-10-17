// Privacy: consent record, evidence retention, and "delete my data" (audit F8).
import { freshDb, test, done, assert, eq } from './harness.mjs';
import * as fx from './fixtures.mjs';

const db = await freshDb();
const one = (sql, p) => db.query(sql, p).then((x) => x.rows[0]);

try {
  const w = await fx.ward(db);

  const addMedia = async (h, path, ageDays) => {
    await db.query(
      `insert into public.handover_media (handover_id, kind, storage_path, phash, content_hash, created_at)
       values ($1, 'photo', $2, '0123456789abcdef', $3, now() - make_interval(days => $4))`,
      [h, path, 'sha-' + path, ageDays]
    );
  };

  await test('retention: only media older than the window is due, oldest first, limited', async () => {
    const u = await fx.user(db);
    const hh = await fx.household(db, w, { owner: u });
    const h = await fx.handover(db, hh, u);
    await addMedia(h, 'old-1', 120);
    await addMedia(h, 'old-2', 95);
    await addMedia(h, 'fresh', 10);
    const due = (await db.query(`select * from public.media_due_for_purge(p_days := 90, p_limit := 1)`)).rows;
    eq(due.map((r) => r.storage_path), ['old-1'], 'oldest due first, limit 1');
    const all = (await db.query(`select storage_path from public.media_due_for_purge(p_days := 90, p_limit := 100)`)).rows;
    eq(all.map((r) => r.storage_path).sort(), ['old-1', 'old-2'], 'fresh media kept');
  });

  await test('retention: purged media keeps its hashes (duplicate detection still works)', async () => {
    const due = (await db.query(`select id from public.media_due_for_purge(p_days := 90, p_limit := 100)`)).rows;
    const n = await one(`select public.mark_media_purged(p_ids := $1) as n`, [due.map((r) => r.id)]);
    eq(n.n, due.length, 'marked');
    const again = (await db.query(`select * from public.media_due_for_purge(p_days := 90, p_limit := 100)`)).rows;
    eq(again.length, 0, 'not due twice');
    const kept = await one(`select phash, content_hash, purged_at is not null as purged from public.handover_media where storage_path = 'old-1'`);
    eq([kept.phash, kept.purged], ['0123456789abcdef', true], 'hash kept, marked purged');
  });

  await test('consent is recorded per user with version and time', async () => {
    const u = await fx.user(db);
    await db.query(`select public.record_consent(p_user := $1, p_version := '2026-10')`, [u]);
    const r = await one(`select consent_version, consent_at is not null as at from public.users where id = $1`, [u]);
    eq([r.consent_version, r.at], ['2026-10', true], 'consent');
  });

  await test('forget_user: anonymises the person, returns their evidence paths, keeps the ledger', async () => {
    const owner = await fx.user(db);
    const member = await fx.user(db);
    const hh = await fx.household(db, w, { owner });
    await db.query(`insert into public.household_members (household_id, user_id, member_role) values ($1, $2, 'member')`, [hh, member]);
    await db.query(`update public.users set clerk_user_id = 'user_abc', consent_version = 'v1' where id = $1`, [owner]);
    const h = await fx.handover(db, hh, owner, { status: 'verified' });
    await db.query(`update public.handovers set client_lat = 23.03, client_lng = 72.56 where id = $1`, [h]);
    await addMedia(h, 'mine-1', 1);
    await db.query(
      `insert into public.credit_ledger (household_id, entry_type, amount, handover_id, reason) values ($1, 'earn', 2, $2, 't')`,
      [hh, h]
    );

    const r = await one(`select public.forget_user(p_user := $1) as r`, [owner]);
    eq(r.r.storage_paths, ['mine-1'], 'evidence paths to delete from storage');

    const u = await one(`select clerk_user_id, display_name, consent_version, deleted_at is not null as deleted from public.users where id = $1`, [owner]);
    eq([u.clerk_user_id, u.display_name, u.consent_version, u.deleted], [null, 'Deleted user', null, true], 'anonymised');
    const loc = await one(`select client_lat, client_lng from public.handovers where id = $1`, [h]);
    eq([loc.client_lat, loc.client_lng], [null, null], 'locations removed');
    const media = await one(`select purged_at is not null as purged from public.handover_media where storage_path = 'mine-1'`);
    eq(media.purged, true, 'media marked purged');
    const mem = await one(`select count(*)::int n from public.household_members where user_id = $1`, [owner]);
    eq(mem.n, 0, 'membership removed');
    const newOwner = await one(`select member_role from public.household_members where user_id = $1`, [member]);
    eq(newOwner.member_role, 'owner', 'remaining member promoted to owner');
    const led = await one(`select count(*)::int n from public.credit_ledger where household_id = $1`, [hh]);
    eq(led.n, 1, 'household ledger untouched');
  });

  await test('forget_user unlinks a karmachari record', async () => {
    const wk = await fx.worker(db, w);
    await db.query(`select public.forget_user(p_user := $1)`, [wk.userId]);
    const r = await one(`select user_id, active from public.workers where id = $1`, [wk.id]);
    eq([r.user_id, r.active], [null, false], 'worker unlinked and inactive');
  });
} finally {
  await db.drop();
}

done();
