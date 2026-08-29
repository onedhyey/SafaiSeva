// Model adapter — EVIDENCE ONLY (audit C3).
//
// The model is asked to describe what it sees: which streams are visible, how clean they
// are, whether the frame looks like a re-photographed screen, image quality, tamper
// signals, and its own confidence. It is explicitly told NOT to decide pass/fail and NOT
// to assign credits — the backend adjudicator does that.

import { GoogleGenAI, Type } from '@google/genai';
import { env, geminiConfigured } from './env.ts';
import type { WasteEvidence } from '../src/lib/verification/contract.ts';

let ai: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (!geminiConfigured()) throw Object.assign(new Error('GEMINI_API_KEY is not configured'), { status: 503 });
  if (!ai) ai = new GoogleGenAI({ apiKey: env.geminiApiKey! });
  return ai;
}

const streamProp = (label: string) => ({
  type: Type.OBJECT,
  properties: {
    visible: {
      type: Type.BOOLEAN,
      description: `True ONLY if ${label} is genuinely visible in its own separate container/bag, distinct from the other streams. False if absent, mixed in, or not identifiable.`,
    },
    contamination: {
      type: Type.STRING,
      enum: ['none', 'minor', 'major', 'unknown'],
      description: 'How mixed with other waste types this stream is. "major" = clearly not segregated.',
    },
    note: { type: Type.STRING, description: 'One short concrete observation, or "Not visible / not present".' },
  },
  required: ['visible', 'contamination', 'note'],
});

const evidenceSchema = {
  type: Type.OBJECT,
  properties: {
    wastePresent: {
      type: Type.BOOLEAN,
      description: 'True if any genuine household waste OR a waste container/bin/bag is visible anywhere in the frame.',
    },
    scene: {
      type: Type.STRING,
      enum: ['waste_bins', 'loose_waste', 'no_waste', 'screen_or_photo', 'unrelated', 'unclear'],
      description:
        'Best single description. "screen_or_photo" = this is a picture of a screen or a printed photo. "no_waste" = room/wall/floor/person/object with no waste. "unclear" = too dark/blurred/occluded to tell.',
    },
    streams: {
      type: Type.OBJECT,
      properties: {
        wet: streamProp('wet/organic waste (kitchen scraps, peels, food)'),
        dry: streamProp('dry recyclables (paper, cardboard, clean plastic, metal)'),
        sanitary: streamProp('sanitary waste wrapped in marked paper/pouch (diapers, napkins)'),
        special_care: streamProp('hazardous / e-waste / batteries / sharps in a dedicated container'),
      },
      required: ['wet', 'dry', 'sanitary', 'special_care'],
    },
    recaptureLikelihood: {
      type: Type.NUMBER,
      description: '0.0 to 1.0 — how likely this image is a re-photograph of a screen or a printed photo (moiré, pixel grid, glare, bezel, flat lighting).',
    },
    recaptureReasons: { type: Type.ARRAY, items: { type: Type.STRING } },
    imageQuality: { type: Type.STRING, enum: ['good', 'poor', 'unusable'] },
    tamperSignals: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Signs of digital editing: overlaid text/graphics, cloned regions, inconsistent lighting/shadows, warped edges. Empty if none.',
    },
    overallConfidence: {
      type: Type.NUMBER,
      description: '0.0 to 1.0 — your confidence in your own reading of this image/clip.',
    },
    observation: { type: Type.STRING, description: 'One or two plain sentences describing what is visible.' },
  },
  required: [
    'wastePresent', 'scene', 'streams', 'recaptureLikelihood', 'recaptureReasons',
    'imageQuality', 'tamperSignals', 'overallConfidence', 'observation',
  ],
};

const SYSTEM = `You are the vision component of the Ahmedabad Municipal Corporation SafaiSeva waste-segregation programme.

Your ONLY job is to report OBSERVATIONS about the submitted image or video. You do NOT decide whether the submission passes, and you do NOT award any points or credits — a separate rules engine does that from your report.

Be strict and literal:
- Report a stream as visible ONLY if you can actually see it, in its own separate container/bag, distinct from the others.
- If waste is all mixed in one bin, every stream's contamination is "major".
- If the frame shows a screen, a monitor, a phone, or a printed photograph, set scene = "screen_or_photo" and recaptureLikelihood high.
- If there is no waste (a room, wall, floor, table, person, vehicle, pet, object), set wastePresent = false and scene accordingly.
- Never invent a positive observation. When unsure, say so via lower overallConfidence and "unknown"/"unclear".`;

function coerce(raw: any): WasteEvidence {
  const s = (k: string) => ({
    visible: Boolean(raw?.streams?.[k]?.visible),
    contamination: ['none', 'minor', 'major', 'unknown'].includes(raw?.streams?.[k]?.contamination)
      ? raw.streams[k].contamination
      : 'unknown',
    note: String(raw?.streams?.[k]?.note ?? 'Not visible / not present'),
  });
  const num = (v: any, d = 0) => (typeof v === 'number' && isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
  return {
    wastePresent: Boolean(raw?.wastePresent),
    scene: ['waste_bins', 'loose_waste', 'no_waste', 'screen_or_photo', 'unrelated', 'unclear'].includes(raw?.scene)
      ? raw.scene
      : 'unclear',
    streams: { wet: s('wet'), dry: s('dry'), sanitary: s('sanitary'), special_care: s('special_care') },
    recaptureLikelihood: num(raw?.recaptureLikelihood),
    recaptureReasons: Array.isArray(raw?.recaptureReasons) ? raw.recaptureReasons.map(String) : [],
    imageQuality: ['good', 'poor', 'unusable'].includes(raw?.imageQuality) ? raw.imageQuality : 'poor',
    tamperSignals: Array.isArray(raw?.tamperSignals) ? raw.tamperSignals.map(String) : [],
    overallConfidence: num(raw?.overallConfidence, 0.5),
    observation: String(raw?.observation ?? ''),
  };
}

function parseDataUrl(input: string, fallbackMime: string) {
  const m = input.match(/^data:([^;]+);base64,(.*)$/s);
  return m ? { mimeType: m[1], data: m[2] } : { mimeType: fallbackMime, data: input };
}

export interface ExtractResult {
  evidence: WasteEvidence;
  model: string;
  elapsedMs: number;
  rawText: string;
}

async function run(parts: any[], contextText: string): Promise<ExtractResult> {
  const started = Date.now();
  const resp = await client().models.generateContent({
    model: env.geminiModel,
    contents: [{ role: 'user', parts: [...parts, { text: contextText }] }],
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: 'application/json',
      responseSchema: evidenceSchema,
      temperature: 0.1,
    },
  });
  const rawText = resp.text?.trim() || '{}';
  return { evidence: coerce(JSON.parse(rawText)), model: env.geminiModel, elapsedMs: Date.now() - started, rawText };
}

export async function extractFromPhoto(photo: string, declaredStreams: string[]): Promise<ExtractResult> {
  const p = parseDataUrl(photo, 'image/jpeg');
  return run(
    [{ inlineData: { mimeType: p.mimeType, data: p.data } }],
    `Report your observations for this photo. The resident says these streams are present: ${
      declaredStreams.join(', ') || 'none stated'
    }. Verify what is actually visible; do not assume their list is correct.`
  );
}

export async function extractFromVideo(
  video: string | undefined,
  frames: string[],
  declaredStreams: string[]
): Promise<ExtractResult> {
  const parts: any[] = [];
  if (video) {
    const v = parseDataUrl(video, 'video/webm');
    parts.push({ inlineData: { mimeType: v.mimeType, data: v.data } });
  }
  for (const f of (frames || []).slice(0, 5)) {
    const fr = parseDataUrl(f, 'image/jpeg');
    parts.push({ inlineData: { mimeType: fr.mimeType, data: fr.data } });
  }
  return run(
    parts,
    `Report your observations for this short video sweep (and any still frames). The resident says these streams are present: ${
      declaredStreams.join(', ') || 'none stated'
    }. Verify what is actually visible across the sweep.`
  );
}
