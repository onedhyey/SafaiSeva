// Web Push (VAPID) — the reliable-updates channel for the PWA (Android Chrome, and iOS
// 16.4+ once the app is installed to the home screen). Best effort by design: a failed
// push never fails the request that triggered it, and subscriptions the push service
// reports gone (404/410) are deleted.
//
// Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https: contact).
// Generate keys once with `npx web-push generate-vapid-keys`.

import webpush from 'web-push';
import { admin } from './supabaseAdmin.ts';

export interface PushMessage {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

const PUBLIC = process.env.VAPID_PUBLIC_KEY?.trim();
const PRIVATE = process.env.VAPID_PRIVATE_KEY?.trim();
const SUBJECT = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@safaiseva.invalid';

let configured = false;
if (PUBLIC && PRIVATE) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
    configured = true;
  } catch (e: any) {
    console.error('[push] invalid VAPID configuration:', e?.message);
  }
}

export function pushPublicKey(): string | null {
  return configured ? PUBLIC! : null;
}

export async function saveSubscription(
  userId: string,
  sub: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
): Promise<void> {
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
  const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh : '';
  const auth = typeof sub?.keys?.auth === 'string' ? sub.keys.auth : '';
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth) {
    const e: any = new Error('Invalid push subscription.');
    e.status = 400;
    throw e;
  }
  const { error } = await admin()
    .from('push_subscriptions')
    .upsert({ user_id: userId, endpoint, p256dh, auth, failure_count: 0 }, { onConflict: 'endpoint' });
  if (error) throw error;
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await admin().from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint);
}

async function sendTo(rows: { id: string; endpoint: string; p256dh: string; auth: string }[], msg: PushMessage) {
  const payload = JSON.stringify(msg);
  await Promise.allSettled(
    rows.map(async (r) => {
      try {
        await webpush.sendNotification(
          { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
          payload,
          { TTL: 24 * 3600, timeout: 10_000 }
        );
        await admin()
          .from('push_subscriptions')
          .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
          .eq('id', r.id);
      } catch (e: any) {
        const status = Number(e?.statusCode);
        if (status === 404 || status === 410) {
          await admin().from('push_subscriptions').delete().eq('id', r.id);
        } else {
          console.error('[push] send failed:', status || e?.message);
        }
      }
    })
  );
}

/** Notify specific users. Never throws. */
export async function notifyUsers(userIds: string[], msg: PushMessage): Promise<void> {
  if (!configured || !userIds.length) return;
  try {
    const { data } = await admin()
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', userIds);
    if (data?.length) await sendTo(data as any, msg);
  } catch (e: any) {
    console.error('[push] notifyUsers failed:', e?.message);
  }
}

/** Notify every member of a household (optionally except one). Never throws. */
export async function notifyHousehold(householdId: string, msg: PushMessage, exceptUserId?: string): Promise<void> {
  if (!configured) return;
  try {
    const { data } = await admin().from('household_members').select('user_id').eq('household_id', householdId);
    const ids = (data ?? []).map((m: any) => m.user_id as string).filter((id) => id !== exceptUserId);
    await notifyUsers(ids, msg);
  } catch (e: any) {
    console.error('[push] notifyHousehold failed:', e?.message);
  }
}
