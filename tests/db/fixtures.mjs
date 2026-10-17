// Small row builders for the SQL tests. Every helper returns the new row's id.
import { randomUUID } from 'node:crypto';

export async function ward(db, code = 'W-' + randomUUID().slice(0, 6)) {
  const { rows } = await db.query(
    `insert into public.wards (code, name, min_lat, max_lat, min_lng, max_lng)
     values ($1, $2, 22.9, 23.1, 72.5, 72.7) returning id`,
    [code, code]
  );
  return rows[0].id;
}

export async function user(db, name = 'u') {
  const { rows } = await db.query(
    `insert into public.users (device_id, display_name) values ($1, $2) returning id`,
    ['dev-' + randomUUID(), name]
  );
  return rows[0].id;
}

export async function household(db, wardId, { lat = null, lng = null, binCount = 1, owner = null } = {}) {
  const { rows } = await db.query(
    `insert into public.households (code, address, ward_id, latitude, longitude, bin_count, bin_target)
     values ($1, 'addr', $2, $3, $4, $5, 6) returning id`,
    ['HH-T-' + randomUUID().slice(0, 8), wardId, lat, lng, binCount]
  );
  const id = rows[0].id;
  if (owner) {
    await db.query(
      `insert into public.household_members (household_id, user_id, member_role) values ($1, $2, 'owner')`,
      [id, owner]
    );
  }
  return id;
}

export async function householdCode(db, id) {
  const { rows } = await db.query(`select code::text from public.households where id = $1`, [id]);
  return rows[0].code;
}

export async function worker(db, wardId, { cap = 25 } = {}) {
  const uid = await user(db, 'worker');
  const { rows } = await db.query(
    `insert into public.workers (user_id, worker_code, name, ward_id, daily_issue_cap)
     values ($1, $2, 'Worker', $3, $4) returning id`,
    [uid, 'W-' + randomUUID().slice(0, 8), wardId, cap]
  );
  return { id: rows[0].id, userId: uid };
}

export async function handover(db, householdId, submittedBy, {
  status = 'pending',
  date = null,
  declared = ['wet', 'dry'],
  confirmed = [],
} = {}) {
  const { rows } = await db.query(
    `insert into public.handovers
       (household_id, submitted_by, collection_date, declared_streams, confirmed_streams, status)
     values ($1, $2, coalesce($3::date, (timezone('Asia/Kolkata', now()))::date), $4, $5, $6)
     returning id`,
    [householdId, submittedBy, date, declared, confirmed, status]
  );
  return rows[0].id;
}

export async function ledger(db, householdId) {
  const { rows } = await db.query(
    `select entry_type, amount, handover_id, effective_at > now() as on_hold
       from public.credit_ledger where household_id = $1 order by created_at`,
    [householdId]
  );
  return rows;
}
