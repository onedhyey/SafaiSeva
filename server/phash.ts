// Server-side perceptual + exact hashing of evidence images (audit A3).
// dHash (64-bit) for near-duplicate detection across ALL users, plus a sha-256 of the
// bytes for exact re-submits. Uses sharp (already a project dependency).

import sharp from 'sharp';
import { createHash } from 'node:crypto';

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** 16-hex-char (64-bit) difference hash. */
export async function dHash(buf: Buffer): Promise<string> {
  // 9x8 grayscale; compare each pixel to its right neighbour.
  const { data } = await sharp(buf)
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = data[row * 9 + col];
      const right = data[row * 9 + col + 1];
      bits += left > right ? '1' : '0';
    }
  }
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hammingHex(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

export function decodeDataUrl(input: string): { buffer: Buffer; mime: string } {
  const m = input.match(/^data:([^;]+);base64,(.*)$/s);
  if (m) return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
  return { mime: 'image/jpeg', buffer: Buffer.from(input, 'base64') };
}
