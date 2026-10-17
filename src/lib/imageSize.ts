// Scale a captured frame to fit within `max` px on its longest side, keeping the aspect
// ratio and never upscaling (audit F13: smaller uploads on slow networks; the vision
// model does not need full sensor resolution).

export const PHOTO_MAX_PX = 1280;
export const KEYFRAME_MAX_PX = 640;

export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const w = width > 0 ? width : 640;
  const h = height > 0 ? height : 480;
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}
