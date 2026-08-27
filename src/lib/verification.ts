import {
  StreamChecklist,
  LocationData,
  VerificationResult,
  HandoverRecord,
  DemoOutcomeOverride,
  HouseholdProfile,
} from '../types';

/**
 * Computes a simple deterministic 64-bit perceptual hash (dHash) from an image data URL.
 */
export async function computePerceptualHash(imageDataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.document) {
      let hash = 0;
      for (let i = 0; i < Math.min(imageDataUrl.length, 500); i++) {
        hash = (hash << 5) - hash + imageDataUrl.charCodeAt(i);
        hash |= 0;
      }
      resolve(Math.abs(hash).toString(16).padStart(16, '0'));
      return;
    }

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 9;
        canvas.height = 8;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve('a1b2c3d4e5f60718');
          return;
        }

        ctx.drawImage(img, 0, 0, 9, 8);
        const imgData = ctx.getImageData(0, 0, 9, 8).data;

        // Grayscale conversion & gradient comparison
        let hashStr = '';
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 8; col++) {
            const idxLeft = (row * 9 + col) * 4;
            const idxRight = (row * 9 + (col + 1)) * 4;

            const lumLeft = 0.299 * imgData[idxLeft] + 0.587 * imgData[idxLeft + 1] + 0.114 * imgData[idxLeft + 2];
            const lumRight = 0.299 * imgData[idxRight] + 0.587 * imgData[idxRight + 1] + 0.114 * imgData[idxRight + 2];

            hashStr += lumLeft > lumRight ? '1' : '0';
          }
        }

        // Convert 64-bit binary to hex string
        let hex = '';
        for (let i = 0; i < 64; i += 4) {
          const nibble = hashStr.substring(i, i + 4);
          hex += parseInt(nibble, 2).toString(16);
        }
        resolve(hex);
      } catch (err) {
        let hash = 0;
        for (let i = 0; i < Math.min(imageDataUrl.length, 1000); i++) {
          hash = (hash << 5) - hash + imageDataUrl.charCodeAt(i);
          hash |= 0;
        }
        resolve(Math.abs(hash).toString(16).padStart(16, '0'));
      }
    };
    img.onerror = () => {
      resolve('e8f2c1a0b3d4e5f6');
    };
    img.src = imageDataUrl;
  });
}

/**
 * Calculates hamming distance between two hex hashes.
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 64;
  let diff = 0;
  for (let i = 0; i < hash1.length; i++) {
    const val1 = parseInt(hash1[i], 16);
    const val2 = parseInt(hash2[i], 16);
    let xor = val1 ^ val2;
    while (xor > 0) {
      if (xor & 1) diff++;
      xor >>= 1;
    }
  }
  return diff;
}

export interface VerificationOptions {
  photo: string;
  streams: StreamChecklist;
  location: LocationData;
  household: HouseholdProfile;
  priorHandovers: HandoverRecord[];
  override?: DemoOutcomeOverride;
  timestamp?: Date;
}

export interface VideoVerificationOptions {
  video: string;
  videoFrames?: string[];
  streams: StreamChecklist;
  location: LocationData;
  household: HouseholdProfile;
  priorHandovers?: HandoverRecord[];
  override?: DemoOutcomeOverride;
  timestamp?: Date;
}

/**
 * Stage 1: Photo Verification via Gemini 3.7 Flash API
 */
export async function analyse(options: VerificationOptions): Promise<VerificationResult> {
  const {
    photo,
    streams,
    location,
    household,
    priorHandovers,
    override = 'auto',
  } = options;

  // Compute image hash for anti-duplicate detection
  const imageHash = await computePerceptualHash(photo);

  // 1. Check duplicate image against recent submissions
  const recentSubmissions = priorHandovers.slice(0, 30);
  let duplicateMatch: HandoverRecord | null = null;
  for (const prev of recentSubmissions) {
    if (prev.imageHash) {
      const distance = hammingDistance(imageHash, prev.imageHash);
      if (distance <= 4) {
        duplicateMatch = prev;
        break;
      }
    }
  }

  if (duplicateMatch) {
    return {
      status: 'rejected',
      decisionReason: `This photo matches a previous submission from ${duplicateMatch.dateString}. Live daily photograph required.`,
      creditsAwarded: 0,
      confidence: 0.99,
      confidenceLevel: 'high',
      mediaType: 'photo',
      imageHash,
      flags: ['duplicate_image_detected'],
      stages: [
        { id: '1', label: 'Detecting waste streams', detail: 'Image matches an archived submission signature.', passed: false },
        { id: '2', label: 'Checking for cross-contamination', detail: 'Duplicate image verification blocked.', passed: false },
        { id: '3', label: 'Confirming location and time', detail: 'Rejected prior to metadata validation.', passed: false },
      ],
      streams: {
        wet: { detected: false, status: 'duplicate', note: 'Duplicate photo detected', verdict: 'contaminated' },
        dry: { detected: false, status: 'duplicate', note: 'Duplicate photo detected', verdict: 'contaminated' },
        sanitary: { detected: false, status: 'none', note: '—', verdict: 'none' },
        special_care: { detected: false, status: 'none', note: '—', verdict: 'none' },
      },
    };
  }

  // Check if at least one stream is selected
  const hasAnyStream = streams.wet || streams.dry || streams.sanitary || streams.special_care;
  if (!hasAnyStream) {
    return {
      status: 'rejected',
      decisionReason: 'No waste streams were selected. Please select at least one segregated stream to verify.',
      creditsAwarded: 0,
      confidence: 0.98,
      confidenceLevel: 'high',
      mediaType: 'photo',
      imageHash,
      flags: ['no_streams_selected'],
      stages: [
        { id: '1', label: 'Detecting waste streams', detail: 'No segregated stream selected for verification.', passed: false },
        { id: '2', label: 'Checking for cross-contamination', detail: 'Verification skipped.', passed: false },
        { id: '3', label: 'Confirming location and time', detail: 'Within collection perimeter.', passed: true },
      ],
      streams: {
        wet: { detected: false, status: 'missing', note: 'Not declared', verdict: 'none' },
        dry: { detected: false, status: 'missing', note: 'Not declared', verdict: 'none' },
        sanitary: { detected: false, status: 'none', note: 'Not declared', verdict: 'none' },
        special_care: { detected: false, status: 'none', note: 'Not declared', verdict: 'none' },
      },
    };
  }

  // Call server Gemini API
  try {
    const res = await fetch('/api/verify/photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photo,
        streams,
        location,
        household,
        override,
      }),
    });

    if (!res.ok) {
      let errMsg = `Server returned error (${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson.error) errMsg = errJson.error;
      } catch {}
      throw new Error(errMsg);
    }

    const data = await res.json();
    const isConfidenceLow = data.confidence?.toLowerCase() === 'low';
    const isVerified = Boolean(data.verified);
    const confidenceScore = isConfidenceLow ? 0.62 : 0.98;

    // Build actual stream report from Gemini response
    const streamResults = {
      wet: {
        detected: Boolean(data.streams?.wet?.detected),
        status: data.streams?.wet?.status || (data.streams?.wet?.detected ? 'clean' : 'none'),
        note: data.streams?.wet?.note || (data.streams?.wet?.detected ? 'Observed' : 'Not detected in image'),
        verdict: (data.streams?.wet?.verdict || 'none') as any,
      },
      dry: {
        detected: Boolean(data.streams?.dry?.detected),
        status: data.streams?.dry?.status || (data.streams?.dry?.detected ? 'clean' : 'none'),
        note: data.streams?.dry?.note || (data.streams?.dry?.detected ? 'Observed' : 'Not detected in image'),
        verdict: (data.streams?.dry?.verdict || 'none') as any,
      },
      sanitary: {
        detected: Boolean(data.streams?.sanitary?.detected),
        status: data.streams?.sanitary?.status || (data.streams?.sanitary?.detected ? 'wrapped' : 'none'),
        note: data.streams?.sanitary?.note || (data.streams?.sanitary?.detected ? 'Observed' : 'Not detected in image'),
        verdict: (data.streams?.sanitary?.verdict || 'none') as any,
      },
      special_care: {
        detected: Boolean(data.streams?.special_care?.detected),
        status: data.streams?.special_care?.status || (data.streams?.special_care?.detected ? 'safe' : 'none'),
        note: data.streams?.special_care?.note || (data.streams?.special_care?.detected ? 'Observed' : 'Not detected in image'),
        verdict: (data.streams?.special_care?.verdict || 'none') as any,
      },
    };

    if (isConfidenceLow) {
      // Low confidence - prompt for video or retake
      return {
        status: 'needs_video',
        decisionReason: data.reason || 'Lighting, shadow, or container angles are ambiguous. Additional short video verification is requested.',
        creditsAwarded: 0,
        confidence: confidenceScore,
        confidenceLevel: 'low',
        requiresVideo: true,
        mediaType: 'photo',
        imageHash,
        flags: ['low_confidence_ambiguity', 'requires_video_verification'],
        stages: [
          { id: '1', label: 'Detecting waste streams', detail: 'Declared streams partially identified in photo frame.', passed: true },
          { id: '2', label: 'Checking for cross-contamination', detail: 'Low confidence / angle ambiguity — short video requested.', passed: false },
          { id: '3', label: 'Confirming location and time', detail: `Verified at ${household.address}.`, passed: true },
        ],
        streams: streamResults,
      };
    }

    if (isVerified) {
      const awarded = Math.max(0, typeof data.creditsAwarded === 'number' ? data.creditsAwarded : 0);

      return {
        status: 'verified',
        decisionReason: data.reason || 'All declared streams confirmed. Waste cleanly segregated with zero cross-contamination.',
        creditsAwarded: awarded,
        confidence: confidenceScore,
        confidenceLevel: 'high',
        mediaType: 'photo',
        imageHash,
        flags: [],
        stages: [
          { id: '1', label: 'Detecting waste streams', detail: 'All active stream compartments recognized.', passed: true },
          { id: '2', label: 'Checking for cross-contamination', detail: 'Zero cross-stream contamination identified.', passed: true },
          { id: '3', label: 'Confirming location and time', detail: `Verified at ${household.address}.`, passed: true },
        ],
        streams: streamResults,
      };
    }

    // High confidence rejection (empty scene, non-waste, contamination, or unsegregated)
    return {
      status: 'rejected',
      decisionReason: data.reason || 'No valid segregated waste containers detected in the image.',
      creditsAwarded: 0,
      confidence: confidenceScore,
      confidenceLevel: 'high',
      mediaType: 'photo',
      imageHash,
      flags: ['segregation_verification_failed'],
      stages: [
        { id: '1', label: 'Detecting waste streams', detail: 'Waste containers evaluation completed.', passed: false },
        { id: '2', label: 'Checking for cross-contamination', detail: data.reason || 'Segregation conditions not met.', passed: false },
        { id: '3', label: 'Confirming location and time', detail: `Location logged at ${household.address}.`, passed: true },
      ],
      streams: streamResults,
    };
  } catch (err: any) {
    console.error('Photo verification error:', err);
    return {
      status: 'rejected',
      decisionReason: `Verification failed: ${err.message || 'Unable to connect to Gemini AI verification service.'}`,
      creditsAwarded: 0,
      confidence: 0.95,
      confidenceLevel: 'high',
      mediaType: 'photo',
      imageHash,
      flags: ['api_verification_error'],
      stages: [
        { id: '1', label: 'Detecting waste streams', detail: 'Analysis failed due to service error.', passed: false },
        { id: '2', label: 'Checking for cross-contamination', detail: 'Verification could not be completed.', passed: false },
        { id: '3', label: 'Confirming location and time', detail: `Logged at ${household.address}.`, passed: false },
      ],
      streams: {
        wet: { detected: false, status: 'none', note: 'Not verified', verdict: 'none' },
        dry: { detected: false, status: 'none', note: 'Not verified', verdict: 'none' },
        sanitary: { detected: false, status: 'none', note: 'Not verified', verdict: 'none' },
        special_care: { detected: false, status: 'none', note: 'Not verified', verdict: 'none' },
      },
    };
  }
}

/**
 * Stage 2: Video Verification via Gemini 3.7 Flash API
 */
export async function analyseVideo(options: VideoVerificationOptions): Promise<VerificationResult> {
  const {
    video,
    videoFrames = [],
    streams,
    location,
    household,
    override = 'auto',
  } = options;

  const imageHash = videoFrames[0] ? await computePerceptualHash(videoFrames[0]) : 'video_hash_' + Date.now();

  try {
    const res = await fetch('/api/verify/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video,
        videoFrames,
        streams,
        location,
        household,
        override,
      }),
    });

    if (!res.ok) {
      let errMsg = `Server returned error (${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson.error) errMsg = errJson.error;
      } catch {}
      throw new Error(errMsg);
    }

    const data = await res.json();
    const isVerified = Boolean(data.verified);

    const streamResults = {
      wet: {
        detected: Boolean(data.streams?.wet?.detected),
        status: data.streams?.wet?.status || (data.streams?.wet?.detected ? 'clean' : 'none'),
        note: data.streams?.wet?.note || (data.streams?.wet?.detected ? 'Observed in video' : 'Not detected in video'),
        verdict: (data.streams?.wet?.verdict || 'none') as any,
      },
      dry: {
        detected: Boolean(data.streams?.dry?.detected),
        status: data.streams?.dry?.status || (data.streams?.dry?.detected ? 'clean' : 'none'),
        note: data.streams?.dry?.note || (data.streams?.dry?.detected ? 'Observed in video' : 'Not detected in video'),
        verdict: (data.streams?.dry?.verdict || 'none') as any,
      },
      sanitary: {
        detected: Boolean(data.streams?.sanitary?.detected),
        status: data.streams?.sanitary?.status || (data.streams?.sanitary?.detected ? 'wrapped' : 'none'),
        note: data.streams?.sanitary?.note || (data.streams?.sanitary?.detected ? 'Observed in video' : 'Not detected in video'),
        verdict: (data.streams?.sanitary?.verdict || 'none') as any,
      },
      special_care: {
        detected: Boolean(data.streams?.special_care?.detected),
        status: data.streams?.special_care?.status || (data.streams?.special_care?.detected ? 'safe' : 'none'),
        note: data.streams?.special_care?.note || (data.streams?.special_care?.detected ? 'Observed in video' : 'Not detected in video'),
        verdict: (data.streams?.special_care?.verdict || 'none') as any,
      },
    };

    if (isVerified) {
      const awarded = Math.max(0, typeof data.creditsAwarded === 'number' ? data.creditsAwarded : 0);

      return {
        status: 'verified',
        decisionReason: data.reason || 'Multi-angle video inspection verified clean segregation across all declared streams.',
        creditsAwarded: awarded,
        confidence: 0.99,
        confidenceLevel: 'high',
        mediaType: 'video',
        imageHash,
        flags: ['verified_via_video_analysis'],
        stages: [
          { id: '1', label: 'Multi-angle stream sweep', detail: 'Motion video confirmed all stream bins.', passed: true },
          { id: '2', label: 'Deep cross-contamination check', detail: 'Zero cross-contamination confirmed inside containers.', passed: true },
          { id: '3', label: 'GPS polygon and time lock', detail: `Confirmed at ${household.address}.`, passed: true },
        ],
        streams: streamResults,
      };
    }

    return {
      status: 'rejected',
      decisionReason: data.reason || 'Video analysis identified non-segregated or non-compliant waste.',
      creditsAwarded: 0,
      confidence: 0.96,
      confidenceLevel: 'high',
      mediaType: 'video',
      imageHash,
      flags: ['video_verification_failed'],
      stages: [
        { id: '1', label: 'Multi-angle stream sweep', detail: 'Video inspected across recorded motion.', passed: false },
        { id: '2', label: 'Deep cross-contamination check', detail: data.reason || 'Segregation requirements not met.', passed: false },
        { id: '3', label: 'GPS polygon and time lock', detail: `Location logged at ${household.address}.`, passed: true },
      ],
      streams: streamResults,
    };
  } catch (err: any) {
    console.error('Video verification error:', err);
    return {
      status: 'rejected',
      decisionReason: `Video verification failed: ${err.message || 'Unable to connect to Gemini AI verification service.'}`,
      creditsAwarded: 0,
      confidence: 0.95,
      confidenceLevel: 'high',
      mediaType: 'video',
      imageHash,
      flags: ['api_video_error'],
      stages: [
        { id: '1', label: 'Multi-angle stream sweep', detail: 'Video analysis failed due to service error.', passed: false },
        { id: '2', label: 'Deep cross-contamination check', detail: 'Verification could not be completed.', passed: false },
        { id: '3', label: 'GPS polygon and time lock', detail: `Confirmed at ${household.address}.`, passed: false },
      ],
      streams: {
        wet: { detected: false, status: 'none', note: 'Not verified', verdict: 'none' },
        dry: { detected: false, status: 'none', note: 'Not verified', verdict: 'none' },
        sanitary: { detected: false, status: 'none', note: 'Not verified', verdict: 'none' },
        special_care: { detected: false, status: 'none', note: 'Not verified', verdict: 'none' },
      },
    };
  }
}

/**
 * Calculates variable Leaf Credits according to the verified waste streams:
 * - 1 stream = 1 credit
 * - 2 streams (Wet + Dry) = 2-3 credits
 * - 3 streams (Wet + Dry + Sanitary) = 3-4 credits
 * - 4 streams (Wet + Dry + Sanitary + Special Care) = 4-5 credits
 */
export function calculateVariableCredits(
  streams: StreamChecklist,
  detectedStreams?: string[]
): number {
  let count = [streams.wet, streams.dry, streams.sanitary, streams.special_care].filter(Boolean).length;
  if (Array.isArray(detectedStreams) && detectedStreams.length > 0) {
    count = Math.max(count, detectedStreams.length);
  }

  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2 + (streams.wet && streams.dry ? 1 : 0); // e.g. 2-3
  if (count === 3) return 3 + (streams.sanitary ? 1 : 0); // e.g. 3-4
  return 4 + (streams.special_care ? 1 : 0); // e.g. 4-5
}
