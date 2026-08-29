// Best-effort geocoding via OpenStreetMap Nominatim. Nationwide (India), no API key.
// Nominatim asks for <=1 req/sec and a descriptive referer; fine for pilot-scale usage.
// Every call degrades gracefully to null / a coordinate string on failure.

export interface GeoHit {
  lat: number;
  lng: number;
  label: string;
  /** State / district hints when available. */
  state?: string;
  district?: string;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org';

// India bounding box (viewbox) so results bias to India.
const INDIA_VIEWBOX = '68.0,6.5,97.5,35.8';

let lastCall = 0;
async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const wait = Math.max(0, 1100 - (Date.now() - lastCall));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  return fn();
}

export function coordLabel(lat: number, lng: number): string {
  return `${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`;
}

/** Forward geocode a free-text query. Returns up to `limit` hits, India-biased. */
export async function searchPlaces(query: string, limit = 6): Promise<GeoHit[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  try {
    return await throttled(async () => {
      const url =
        `${NOMINATIM}/search?format=jsonv2&addressdetails=1&countrycodes=in` +
        `&viewbox=${INDIA_VIEWBOX}&bounded=0&limit=${limit}&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return [];
      const rows = (await res.json()) as any[];
      return rows.map((r) => ({
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        label: r.display_name as string,
        state: r.address?.state,
        district: r.address?.state_district || r.address?.county,
      }));
    });
  } catch {
    return [];
  }
}

/** Reverse geocode a point to a human address. Falls back to the coordinate string. */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    return await throttled(async () => {
      const url = `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return coordLabel(lat, lng);
      const r = (await res.json()) as any;
      return (r.display_name as string) || coordLabel(lat, lng);
    });
  } catch {
    return coordLabel(lat, lng);
  }
}
