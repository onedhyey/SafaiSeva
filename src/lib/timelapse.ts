// Video length policy for the second-attempt evidence video.
//
//   - Record as long as needed, up to MAX_RECORDING_S (10 min); recording stops there.
//   - Up to REALTIME_LIMIT_S (30 s) the clip is uploaded as recorded.
//   - Longer recordings become a TIMELAPSE_S (30 s) time-lapse built on the device from
//     evenly spaced frames, so upload size, model cost and review time stay bounded no
//     matter how long someone records.
//
// FrameSampler keeps at most `maxFrames` frames spread evenly over the whole recording
// without knowing its length in advance: it samples every `interval` ms and, whenever it
// fills up, drops every other frame and doubles the interval.

export const MAX_RECORDING_S = 600;
export const REALTIME_LIMIT_S = 30;
export const TIMELAPSE_S = 30;
export const TIMELAPSE_FPS = 10;
export const MAX_FRAMES = TIMELAPSE_S * TIMELAPSE_FPS; // 300

export class FrameSampler<T> {
  private frames: { t: number; frame: T }[] = [];
  private nextAt = 0;
  interval: number;

  constructor(private readonly maxFrames = MAX_FRAMES, initialIntervalMs = 1000 / TIMELAPSE_FPS) {
    this.interval = initialIntervalMs;
  }

  /** Should a frame be captured at elapsed time `t` (ms)? */
  wants(t: number): boolean {
    return t >= this.nextAt;
  }

  add(t: number, frame: T): void {
    this.frames.push({ t, frame });
    // Schedule from the planned time, not the capture time, so timer jitter doesn't stretch
    // the spacing; skip slots that are already past.
    this.nextAt += this.interval;
    while (this.nextAt <= t) this.nextAt += this.interval;
    if (this.frames.length > this.maxFrames) {
      this.frames = this.frames.filter((_, i) => i % 2 === 0);
      this.interval *= 2;
      this.nextAt = this.frames[this.frames.length - 1].t + this.interval;
    }
  }

  get size(): number {
    return this.frames.length;
  }

  all(): T[] {
    return this.frames.map((f) => f.frame);
  }

  times(): number[] {
    return this.frames.map((f) => f.t);
  }

  /** `n` frames evenly spaced across the recording (for the vision model's stills). */
  pick(n: number): T[] {
    const k = this.frames.length;
    if (k <= n) return this.all();
    return Array.from({ length: n }, (_, i) => this.frames[Math.round((i * (k - 1)) / (n - 1))].frame);
  }
}

/** Format seconds as m:ss. */
export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Encode frames into a TIMELAPSE_S-second clip by drawing them onto a canvas at
 * TIMELAPSE_FPS and recording the canvas. Runs in real time (≈30 s), reporting progress.
 */
export async function encodeTimelapse(
  frames: Blob[],
  opts: { width: number; height: number; mimeType: string; onProgress?: (fraction: number) => void }
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = opts.width;
  canvas.height = opts.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const stream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(TIMELAPSE_FPS);
  const recorder = opts.mimeType
    ? new MediaRecorder(stream, { mimeType: opts.mimeType, videoBitsPerSecond: 1_000_000 })
    : new MediaRecorder(stream, { videoBitsPerSecond: 1_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: opts.mimeType || 'video/webm' }));
  });

  // Spread whatever frames we have over the full TIMELAPSE_S seconds.
  const total = Math.max(frames.length, 1);
  const frameMs = (TIMELAPSE_S * 1000) / total;
  recorder.start(1000);
  for (let i = 0; i < frames.length; i++) {
    const bmp = await createImageBitmap(frames[i]);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    opts.onProgress?.((i + 1) / total);
    await new Promise((r) => setTimeout(r, frameMs));
  }
  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  return done;
}
