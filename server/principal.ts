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

async function resolveClerk(_token: string): Promise<string> {
  // TODO(auth-on): `import { verifyToken } from '@clerk/backend'`, verify with
  // env.clerkSecretKey, read `sub`, then get-or-create users by clerk_user_id
  // (linking an existing device_id row when the header is also present).
  throw new Error('Clerk verification not wired yet (VITE_AUTH_ENABLED is expected to be false).');
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
    const userId = await resolveClerk(token);
    return { userId, clerkSub: 'pending', mode: 'clerk' };
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
