// Evidence intake rules enforced on the server, whatever the client claims.
//
// Camera only: photos must come from the SafaiSeva in-app camera. Frames the app captures
// are drawn to a canvas and re-encoded, which leaves no EXIF; photos picked from a phone
// gallery almost always carry EXIF (camera make/model, original timestamp). A photo with
// EXIF is refused before any model call. (A determined attacker can strip EXIF — the other
// fraud checks still apply — but this stops ordinary gallery uploads through the API.)
//
// Size: videos are capped. The app records at ~1 Mbps and turns anything over 30 s into a
// 30-second time-lapse, so real clips are a few MB; the cap only stops abuse.

import sharp from 'sharp';

export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
export const MAX_INLINE_FRAMES = 5;

export async function isInAppPhoto(buf: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(buf).metadata();
    return !meta.exif;
  } catch {
    // Not a decodable image — the model step will reject it as unusable.
    return true;
  }
}

export function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}
