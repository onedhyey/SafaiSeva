// Evidence media <-> Supabase Storage (private 'evidence' bucket). Only the service-role
// API and short-lived signed URLs touch it.
//
// Capture flow (audit B2): the client asks for a signed upload URL, PUTs the file straight
// to Storage, and sends only the object key to /api/handovers/verify. The server reads the
// bytes back (service role) for hashing + the vision model. Nothing large transits the
// JSON body any more.

import { randomUUID } from 'node:crypto';
import { admin } from './supabaseAdmin.ts';
import { decodeDataUrl } from './phash.ts';

const BUCKET = 'evidence';

// What a first-capture camera/recorder can produce. Anything else is rejected before a
// signed URL is minted.
const CONTENT_TYPE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
};

function extForMime(mime: string): string {
  return CONTENT_TYPE_EXT[mime] || (mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'mp4' : mime.includes('png') ? 'png' : 'jpg');
}

export interface StoredMedia {
  path: string;
  bytes: number;
  mime: string;
}

// Inline path only: the derived keyframe from a video attempt still arrives as base64 and
// is written here by the server.
export async function uploadEvidence(
  handoverId: string,
  kind: 'photo' | 'video' | 'keyframe',
  dataUrlOrB64: string,
  index = 0
): Promise<StoredMedia | null> {
  try {
    const { buffer, mime } = decodeDataUrl(dataUrlOrB64);
    const path = `${handoverId}/${kind}-${index}.${extForMime(mime)}`;
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

export interface SignedUpload {
  key: string;
  uploadUrl: string;
  token: string;
}

// Mint a short-lived (2 h) direct-to-Storage upload URL for one captured file. The key is
// namespaced by user so the verify route can confirm ownership before trusting it. Returns
// null for an unsupported content type.
export async function createEvidenceUploadUrl(
  userId: string,
  contentType: string
): Promise<SignedUpload | null> {
  const ext = CONTENT_TYPE_EXT[contentType];
  if (!ext) return null;
  const key = `incoming/${userId}/${randomUUID()}.${ext}`;
  const { data, error } = await admin().storage.from(BUCKET).createSignedUploadUrl(key);
  if (error || !data) {
    console.error('[storage] sign upload failed:', error?.message);
    return null;
  }
  return { key, uploadUrl: data.signedUrl, token: data.token };
}

export function isOwnedEvidenceKey(key: string, userId: string): boolean {
  return typeof key === 'string' && key.startsWith(`incoming/${userId}/`) && !key.includes('..');
}

export interface FetchedMedia {
  buffer: Buffer;
  dataUrl: string;
  mime: string;
  bytes: number;
}

// Read an uploaded object back for hashing + the vision model. Uses the service-role
// client directly (equivalent to a signed read URL, one hop fewer).
export async function fetchEvidence(key: string): Promise<FetchedMedia | null> {
  try {
    const { data, error } = await admin().storage.from(BUCKET).download(key);
    if (error || !data) {
      console.error('[storage] download failed:', error?.message);
      return null;
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    const ext = key.split('.').pop()?.toLowerCase() || 'jpg';
    const mime =
      data.type && data.type !== 'application/octet-stream'
        ? data.type
        : ext === 'webm'
        ? 'video/webm'
        : ext === 'mp4'
        ? 'video/mp4'
        : ext === 'png'
        ? 'image/png'
        : ext === 'webp'
        ? 'image/webp'
        : 'image/jpeg';
    return {
      buffer,
      mime,
      bytes: buffer.byteLength,
      dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
    };
  } catch (e: any) {
    console.error('[storage] download threw:', e?.message);
    return null;
  }
}
