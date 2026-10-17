// Server-side structural fraud checks (audit C5). These run BEFORE and alongside the AI
// and feed authoritative signals into the adjudicator. Each returns zero or more signal
// strings; the adjudicator maps them to a human reason.

import { admin } from './supabaseAdmin.ts';
import { haversineKm, haversineMeters } from './geo.ts';

const IST_OFFSET_MIN = 330; // UTC+05:30, no DST

// When a household has a point location (0014) but no polygon yet, treat anything beyond
// this many metres from the point as outside the geofence (audit G1).
const HOUSEHOLD_GEOFENCE_RADIUS_M = 120;

export function istHour(iso: string | Date): number {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes() + IST_OFFSET_MIN;
  return Math.floor((((mins % 1440) + 1440) % 1440) / 60);
}

export function istDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export interface FraudContext {
  householdId: string;
  collectionDate: string;
  capturedAt: string;
  lat: number | null;
  lng: number | null;
  phash: string | null;
  contentHash?: string | null;
  /** The handover being verified — its own earlier attempt is not a duplicate of itself. */
  handoverId?: string;
}

export async function runFraudChecks(ctx: FraudContext): Promise<string[]> {
  const db = admin();
  const signals = new Set<string>();

  // --- household config (geofence bbox + collection window) ---
  const { data: hh } = await db
    .from('households')
    .select(
      'collection_start_hour, collection_end_hour, geofence_polygon, latitude, longitude, ward:wards(min_lat,max_lat,min_lng,max_lng)'
    )
    .eq('id', ctx.householdId)
    .maybeSingle();

  // 1. One approved handover per household per local day.
  {
    const { count } = await db
      .from('handovers')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', ctx.householdId)
      .eq('collection_date', ctx.collectionDate)
      .eq('status', 'verified');
    if ((count ?? 0) > 0) signals.add('daily_limit');
  }

  // 2. Collection window (local hours).
  if (hh) {
    const h = istHour(ctx.capturedAt || new Date());
    if (h < hh.collection_start_hour || h >= hh.collection_end_hour) signals.add('window_outside');
  }

  // 3. Geofence (audit G1). Precedence, tightest first:
  //    a) SQL polygon (app.point_in_geofence) — when AMC supplies households.geofence_polygon;
  //    b) per-household point + ~120 m radius — when 0014 latitude/longitude is set;
  //    c) ward bounding box (~km²) — the last-resort fallback.
  if (hh && ctx.lat != null && ctx.lng != null && !hh.geofence_polygon) {
    if (hh.latitude != null && hh.longitude != null) {
      const metres = haversineMeters(ctx.lat, ctx.lng, hh.latitude, hh.longitude);
      if (metres > HOUSEHOLD_GEOFENCE_RADIUS_M) signals.add('geo_outside');
    } else {
      const w: any = Array.isArray(hh.ward) ? hh.ward[0] : hh.ward;
      if (w) {
        const inside =
          ctx.lat >= w.min_lat && ctx.lat <= w.max_lat && ctx.lng >= w.min_lng && ctx.lng <= w.max_lng;
        if (!inside) signals.add('geo_outside');
      }
    }
  }

  // 4. Duplicate evidence (audit A3 / F12), over every retained hash in SQL:
  //    exact bytes seen before, or a near-identical photo from ANOTHER household → block
  //    (duplicate_phash); the household's own bins looking alike day to day → similar_own
  //    (informational only — it used to be treated as a duplicate and blocked).
  if (ctx.phash || ctx.contentHash) {
    const { data, error } = await db.rpc('media_duplicate_signals', {
      p_household: ctx.householdId,
      p_phash: ctx.phash,
      p_content_hash: ctx.contentHash ?? null,
      p_max_distance: 6,
      p_exclude_handover: ctx.handoverId ?? null,
    });
    if (error) console.error('[fraud] duplicate check failed:', error.message);
    for (const sig of (data as string[] | null) ?? []) signals.add(sig);
  }

  // 5. Velocity / burst over the last 2 hours for this household.
  {
    const since = new Date(Date.now() - 2 * 3600_000).toISOString();
    const { data: recent } = await db
      .from('handovers')
      .select('client_lat, client_lng, created_at')
      .eq('household_id', ctx.householdId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10);
    if ((recent?.length ?? 0) >= 3) signals.add('burst');
    if (ctx.lat != null && ctx.lng != null) {
      for (const r of recent ?? []) {
        if (r.client_lat != null && r.client_lng != null) {
          if (haversineKm(ctx.lat, ctx.lng, r.client_lat, r.client_lng) > 2) {
            signals.add('velocity');
            break;
          }
        }
      }
    }
  }

  return [...signals];
}
