// Evidence media -> Supabase Storage (private 'evidence' bucket). Best-effort: a storage
// failure must not block a verification decision, but it is logged and surfaced.

import { admin } from './supabaseAdmin.ts';
import { decodeDataUrl } from './phash.ts';

const BUCKET = 'evidence';

export interface StoredMedia {
  path: string;
  bytes: number;
  mime: string;
}

export async function uploadEvidence(
  handoverId: string,
  kind: 'photo' | 'video' | 'keyframe',
  dataUrlOrB64: string,
  index = 0
): Promise<StoredMedia | null> {
  try {
    const { buffer, mime } = decodeDataUrl(dataUrlOrB64);
    const ext = mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'mp4' : mime.includes('png') ? 'png' : 'jpg';
    const path = `${handoverId}/${kind}-${index}.${ext}`;
    const { error } = await admin()
      .storage.from(BUCKET)
      .upload(path, buffer, { contentType: mime, upsert: true });
    if (error) {
      console.error('[storage] upload failed:', error.message);
      return null;
    }
    return { path, bytes: buffer.byteLength, mime };
  } catch (e: any) {
    console.error('[storage] upload threw:', e?.message);
    return null;
  }
}
