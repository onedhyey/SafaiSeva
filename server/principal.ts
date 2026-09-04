// Principal resolution — the ONE place authentication mode matters (audit I4).
//
//   auth OFF (demo) : trust the `x-device-id` header, get-or-create an anonymous user,
//                     auto-attach it to the seeded demo household so the flow works.
//   auth ON (later) : verify the Clerk bearer token, map `sub` -> users.clerk_user_id.
//
// Everything downstream just receives a `Principal { userId }`. The schema's app.uid()
// already accepts either identity, so enabling Clerk is: install @clerk/backend, fill in
// resolveClerk(), flip VITE_AUTH_ENABLED. No table or query changes.

import type { Request } from 'express';
import { verifyToken, createClerkClient, type ClerkClient } from '@clerk/backend';
import { admin } from './supabaseAdmin.ts';
import { env } from './env.ts';

export interface Principal {
  userId: string;
  deviceId?: string;
  clerkSub?: string;
  mode: 'demo' | 'clerk';
}

const DEMO_HOUSEHOLD_CODE = 'HH-NV-0482';

async function getOrCreateDeviceUser(deviceId: string): Promise<string> {
  const db = admin();

  const { data: existing } = await db
    .from('users')
    .select('id')
    .eq('device_id', deviceId)
    .maybeSingle();

  let userId = existing?.id as string | undefined;

  if (!userId) {
    const { data, error } = await db
      .from('users')
      .insert({ device_id: deviceId, display_name: 'Demo Resident' })
      .select('id')
      .single();
    if (error) throw new Error(`create user failed: ${error.message}`);
    userId = data.id;
  }

  // Track the device row (best-effort).
  await db
    .from('devices')
    .upsert({ device_id: deviceId, user_id: userId, last_seen: new Date().toISOString() }, {
      onConflict: 'device_id',
    });

  // Demo convenience: make every anonymous device a member of the demo household.
  const { data: hh } = await db
    .from('households')
    .select('id')
    .eq('code', DEMO_HOUSEHOLD_CODE)
    .maybeSingle();
  if (hh?.id) {
    await db
      .from('household_members')
      .upsert(
        { household_id: hh.id, user_id: userId, member_role: 'member' },
        { onConflict: 'household_id,user_id', ignoreDuplicates: true }
      );
  }

  return userId;
}

// ---------------------------------------------------------------------------------------
// Clerk (auth ON). verifyToken() is networkless after the first JWKS fetch, so this adds
// no per-request round trip. A minimal session token only carries `sub`; name/email are
// pulled from the Backend API once, on first provisioning.
// ---------------------------------------------------------------------------------------
let _clerk: ClerkClient | null = null;
function clerk(): ClerkClient {
  if (!_clerk) {
    if (!env.clerkSecretKey) throw new Error('CLERK_SECRET_KEY is missing while auth is enabled.');
    _clerk = createClerkClient({ secretKey: env.clerkSecretKey });
  }
  return _clerk;
}

interface ClerkClaims {
  sub: string;
  email?: string;
  name?: string;
}

async function verifyClerkToken(token: string): Promise<ClerkClaims> {
  if (!env.clerkSecretKey) {
    const e: any = new Error('Auth is enabled but CLERK_SECRET_KEY is not set on the server.');
    e.status = 500;
    throw e;
  }
  try {
    const payload = (await verifyToken(token, {
      secretKey: env.clerkSecretKey,
      clockSkewInMs: 10_000,
      ...(env.clerkAuthorizedParties.length
        ? { authorizedParties: env.clerkAuthorizedParties }
        : {}),
    })) as Record<string, any>;
    if (!payload?.sub) {
      const e: any = new Error('Session token has no subject.');
      e.status = 401;
      throw e;
    }
    return {
      sub: String(payload.sub),
      email: payload.email || payload.email_address || undefined,
      name: payload.name || payload.full_name || undefined,
    };
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 500) throw err;
    const e: any = new Error('Invalid or expired session token.');
    e.status = 401;
    throw e;
  }
}

function displayName(c: ClerkClaims): string {
  return (c.name || c.email || 'Resident').trim() || 'Resident';
}

async function getOrCreateClerkUser(claims: ClerkClaims, deviceId: string | null): Promise<string> {
  const db = admin();

  // 1. Already provisioned.
  const { data: existing } = await db
    .from('users')
    .select('id')
    .eq('clerk_user_id', claims.sub)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  // 2. First authenticated call from a browser that was an anonymous device session:
  //    claim that users row (and its household / history) instead of forking a new one.
  if (deviceId) {
    const { data: deviceUser } = await db
      .from('users')
      .select('id, clerk_user_id')
      .eq('device_id', deviceId)
      .maybeSingle();
    if (deviceUser?.id && !deviceUser.clerk_user_id) {
      const { data: linked, error } = await db
        .from('users')
        .update({ clerk_user_id: claims.sub, display_name: displayName(claims) })
        .eq('id', deviceUser.id)
        .select('id')
        .single();
      if (!error && linked?.id) return linked.id as string;
    }
  }

  // 3. Fresh user. Backfill a real name from the Backend API if the token was minimal.
  let name = displayName(claims);
  if (name === 'Resident') {
    try {
      const u = await clerk().users.getUser(claims.sub);
      name =
        [u.firstName, u.lastName].filter(Boolean).join(' ') ||
        u.username ||
        u.primaryEmailAddress?.emailAddress ||
        'Resident';
    } catch {
      /* keep default */
    }
  }

  const { data, error } = await db
    .from('users')
    .insert({ clerk_user_id: claims.sub, display_name: name })
    .select('id')
    .single();
  if (error) {
    // Lost a create race — the row exists now.
    const { data: again } = await db
      .from('users')
      .select('id')
      .eq('clerk_user_id', claims.sub)
      .maybeSingle();
    if (again?.id) return again.id as string;
    throw new Error(`provision clerk user failed: ${error.message}`);
  }
  return data.id as string;
}

async function resolveClerk(token: string, req: Request): Promise<{ userId: string; sub: string }> {
  const claims = await verifyClerkToken(token);
  const raw = (req.header('x-device-id') || '').trim();
  const deviceId = raw.length >= 6 ? raw : null;
  const userId = await getOrCreateClerkUser(claims, deviceId);
  return { userId, sub: claims.sub };
}

export async function resolvePrincipal(req: Request): Promise<Principal> {
  if (env.authEnabled) {
    const auth = req.header('authorization') || '';
    const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    if (!token) {
      const err: any = new Error('Authentication required');
      err.status = 401;
      throw err;
    }
    const { userId, sub } = await resolveClerk(token, req);
    return { userId, clerkSub: sub, mode: 'clerk' };
  }

  const deviceId = (req.header('x-device-id') || '').trim();
  if (!deviceId || deviceId.length < 6) {
    const err: any = new Error('Missing or invalid x-device-id header');
    err.status = 400;
    throw err;
  }
  const userId = await getOrCreateDeviceUser(deviceId);
  return { userId, deviceId, mode: 'demo' };
}

export interface WorkerPrincipal {
  userId: string;
  workerId: string;
  workerCode: string;
  name: string;
  zone: string | null;
  wardId: string | null;
  dailyIssueCap: number;
}

/**
 * The karmachari counterpart of resolvePrincipal (audit G3). In demo mode a client that
 * has taken the Karmachari role sends `x-demo-worker: <worker_code>` and we resolve the
 * seeded worker row. When auth is enabled this maps the Clerk principal to its own
 * `workers` row instead — same downstream shape, no code change in the routes.
 */
export async function resolveWorker(req: Request): Promise<WorkerPrincipal> {
  const db = admin();
  const deny = (msg: string) => {
    const e: any = new Error(msg);
    e.status = 403;
    return e;
  };

  let query;
  if (env.authEnabled) {
    const principal = await resolvePrincipal(req);
    query = db.from('workers').select('*').eq('user_id', principal.userId);
  } else {
    const code = (req.header('x-demo-worker') || '').trim();
    if (!code) throw deny('Karmachari role required for this action.');
    query = db.from('workers').select('*').eq('worker_code', code);
  }

  const { data: w } = await query.eq('active', true).maybeSingle();
  if (!w) throw deny('No active karmachari record for this session.');

  return {
    userId: w.user_id,
    workerId: w.id,
    workerCode: w.worker_code,
    name: w.name,
    zone: w.zone ?? null,
    wardId: w.ward_id ?? null,
    dailyIssueCap: w.daily_issue_cap ?? 25,
  };
}

export interface OfficerPrincipal {
  userId: string | null;
  officerId: string;
  officerCode: string;
  name: string;
  wardId: string | null;
}

/**
 * The ward-officer counterpart of resolveWorker (audit G7, schema 0015_ward_officers).
 * An officer oversees a ward's aggregates and never documents handovers, so this only
 * needs to answer "which ward does this principal supervise?".
 *
 *   auth OFF (demo) : client that has taken the Officer role sends
 *                     `x-demo-officer: <officer_code>` -> seeded ward_officers row.
 *   auth ON  (later): map the Clerk principal to its own ward_officers row by user_id.
 *
 * Same downstream shape either way, so the officer routes don't branch on auth mode.
 */
export async function resolveOfficer(req: Request): Promise<OfficerPrincipal> {
  const db = admin();
  const deny = (msg: string) => {
    const e: any = new Error(msg);
    e.status = 403;
    return e;
  };

  let query;
  if (env.authEnabled) {
    const principal = await resolvePrincipal(req);
    query = db.from('ward_officers').select('*').eq('user_id', principal.userId);
  } else {
    const code = (req.header('x-demo-officer') || '').trim();
    if (!code) throw deny('Ward Officer role required for this action.');
    query = db.from('ward_officers').select('*').eq('officer_code', code);
  }

  const { data: o } = await query.eq('active', true).maybeSingle();
  if (!o) throw deny('No active ward officer record for this session.');

  return {
    userId: o.user_id ?? null,
    officerId: o.id,
    officerCode: o.officer_code,
    name: o.name,
    wardId: o.ward_id ?? null,
  };
}
