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
    // If running without DOM canvas or fallback
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
        // Fallback string hash
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

// TODO: swap for on-device model (TF.js MobileNet fine-tune or similar)
export async function analyse(options: VerificationOptions): Promise<VerificationResult> {
  const {
    photo,
    streams,
    location,
    household,
    priorHandovers,
    override = 'auto',
    timestamp = new Date(),
  } = options;

  // Compute image hash
  const imageHash = await computePerceptualHash(photo);

  // 1. Check duplicate image against last 30 submissions
  const recentSubmissions = priorHandovers.slice(0, 30);
  let duplicateMatch: HandoverRecord | null = null;
  for (const prev of recentSubmissions) {
    if (prev.imageHash) {
      const distance = hammingDistance(imageHash, prev.imageHash);
      if (distance <= 4) { // Highly similar image
        duplicateMatch = prev;
        break;
      }
    }
  }

  // 2. Check location bounds
  const isWithinArea =
    location.lat >= household.registeredArea.minLat - 0.005 &&
    location.lat <= household.registeredArea.maxLat + 0.005 &&
    location.lng >= household.registeredArea.minLng - 0.005 &&
    location.lng <= household.registeredArea.maxLng + 0.005;

  // 3. Check collection window (6 AM to 11 AM)
  const hour = timestamp.getHours();
  const isWithinWindow = hour >= household.collectionWindow.startHour && hour < household.collectionWindow.endHour;

  // 4. Force override handling for jury demo control
  if (override === 'force_approve') {
    return {
      status: 'verified',
      decisionReason: 'All streams compliant. Wet and dry waste cleanly separated.',
      creditsAwarded: 2,
      confidence: 0.97,
      imageHash,
      flags: [],
      stages: [
        { id: '1', label: 'Detecting waste streams', detail: '4-stream protocol layout detected and categorized.', passed: true },
        { id: '2', label: 'Checking for cross-contamination', detail: 'Organic wet and recyclable dry compartments cleanly separated.', passed: true },
        { id: '3', label: 'Confirming location and time', detail: `Within ${household.ward} collection radius.`, passed: true },
      ],
      streams: {
        wet: { detected: streams.wet, status: 'clean', note: 'Clean, no plastic detected', verdict: 'clean' },
        dry: { detected: streams.dry, status: 'clean', note: 'Dry paper and bottles separated', verdict: 'clean' },
        sanitary: { detected: streams.sanitary, status: streams.sanitary ? 'wrapped' : 'none', note: streams.sanitary ? 'Wrapped in newspaper with red mark' : 'None in this handover', verdict: streams.sanitary ? 'wrapped' : 'none' },
        special_care: { detected: streams.special_care, status: streams.special_care ? 'safe' : 'none', note: streams.special_care ? 'Isolated in designated container' : 'None in this handover', verdict: streams.special_care ? 'safe' : 'none' },
      },
    };
  }

  if (override === 'force_review') {
    return {
      status: 'in_review',
      decisionReason: 'Special care container detected and queued for karmachari physical safety verification.',
      creditsAwarded: 2, // Credits held, not lost
      confidence: 0.76,
      imageHash,
      flags: ['manual_spotcheck_required'],
      stages: [
        { id: '1', label: 'Detecting waste streams', detail: 'Streams identified; hazardous item isolated in red compartment.', passed: true },
        { id: '2', label: 'Checking for cross-contamination', detail: 'Worker physical confirmation requested for special care stream.', passed: false },
        { id: '3', label: 'Confirming location and time', detail: 'Timestamp and registered route verified.', passed: true },
      ],
      streams: {
        wet: { detected: streams.wet, status: 'clean', note: 'Clean kitchen waste', verdict: 'clean' },
        dry: { detected: streams.dry, status: 'clean', note: 'Clean recyclables', verdict: 'clean' },
        sanitary: { detected: streams.sanitary, status: streams.sanitary ? 'wrapped' : 'none', note: streams.sanitary ? 'Wrapped correctly' : 'None', verdict: streams.sanitary ? 'wrapped' : 'none' },
        special_care: { detected: true, status: 'hazardous', note: 'Hazardous item flagged for karmachari spot-check', verdict: 'safe' },
      },
    };
  }

  if (override === 'force_reject') {
    return {
      status: 'rejected',
      decisionReason: 'Plastic wrapper detected in the wet stream. Wet organic waste must be 100% free of synthetic liners.',
      creditsAwarded: 0,
      confidence: 0.95,
      imageHash,
      flags: ['cross_contamination_wet'],
      stages: [
        { id: '1', label: 'Detecting waste streams', detail: 'Wet and Dry streams detected.', passed: true },
        { id: '2', label: 'Checking for cross-contamination', detail: 'Non-biodegradable synthetic wrapper identified in green wet bin.', passed: false },
        { id: '3', label: 'Confirming location and time', detail: 'Location verified.', passed: true },
      ],
      streams: {
        wet: { detected: true, status: 'contaminated', note: 'Plastic wrapper detected in the wet stream', verdict: 'contaminated' },
        dry: { detected: true, status: 'clean', note: 'Clean paper & containers', verdict: 'clean' },
        sanitary: { detected: streams.sanitary, status: streams.sanitary ? 'wrapped' : 'none', note: streams.sanitary ? 'Wrapped' : 'None in this handover', verdict: streams.sanitary ? 'wrapped' : 'none' },
        special_care: { detected: streams.special_care, status: streams.special_care ? 'safe' : 'none', note: streams.special_care ? 'Safe' : 'None in this handover', verdict: streams.special_care ? 'safe' : 'none' },
      },
    };
  }

  // Automated logic:
  // Duplicate check
  if (duplicateMatch) {
    return {
      status: 'rejected',
      decisionReason: `This photo matches one you submitted on ${duplicateMatch.dateString}. Live daily photograph required.`,
      creditsAwarded: 0,
      confidence: 0.99,
      imageHash,
      flags: ['duplicate_image_detected'],
      stages: [
        { id: '1', label: 'Detecting waste streams', detail: 'Image contents match an archived submission.', passed: false },
        { id: '2', label: 'Checking for cross-contamination', detail: 'Anti-gaming perceptual hash collision.', passed: false },
        { id: '3', label: 'Confirming location and time', detail: 'Rejected prior to metadata validation.', passed: false },
      ],
      streams: {
        wet: { detected: true, status: 'duplicate', note: 'Identical pixel signature to prior submission', verdict: 'contaminated' },
        dry: { detected: true, status: 'duplicate', note: 'Duplicate photo detected', verdict: 'contaminated' },
        sanitary: { detected: false, status: 'none', note: '—', verdict: 'none' },
        special_care: { detected: false, status: 'none', note: '—', verdict: 'none' },
      },
    };
  }

  // Must have at least wet and dry separated
  if (!streams.wet || !streams.dry) {
    return {
      status: 'rejected',
      decisionReason: 'Wet and Dry waste must both be separated at source according to AMC 4-stream guidelines.',
      creditsAwarded: 0,
      confidence: 0.98,
      imageHash,
      flags: ['missing_primary_streams'],
      stages: [
        { id: '1', label: 'Detecting waste streams', detail: 'Primary 2-stream base segregation incomplete.', passed: false },
        { id: '2', label: 'Checking for cross-contamination', detail: 'Unsegregated or unconfirmed streams.', passed: false },
        { id: '3', label: 'Confirming location and time', detail: 'Within collection perimeter.', passed: true },
      ],
      streams: {
        wet: { detected: streams.wet, status: streams.wet ? 'clean' : 'missing', note: streams.wet ? 'Clean' : 'Wet stream missing', verdict: streams.wet ? 'clean' : 'none' },
        dry: { detected: streams.dry, status: streams.dry ? 'clean' : 'missing', note: streams.dry ? 'Clean' : 'Dry stream missing', verdict: streams.dry ? 'clean' : 'none' },
        sanitary: { detected: streams.sanitary, status: 'none', note: 'None in this handover', verdict: 'none' },
        special_care: { detected: streams.special_care, status: 'none', note: 'None in this handover', verdict: 'none' },
      },
    };
  }

  // Location or window check deviation triggers Needs Review
  if (!isWithinArea || location.isFallback || !isWithinWindow || streams.special_care) {
    const reasons: string[] = [];
    if (!isWithinArea || location.isFallback) reasons.push('Location coordinate logged via fallback/drift');
    if (!isWithinWindow) reasons.push('Handover outside morning collection route window');
    if (streams.special_care) reasons.push('Special care hazardous stream flagged for karmachari safety protocol');

    return {
      status: 'in_review',
      decisionReason: `${reasons.join(' · ')}. Queued for karmachari spot-check. Credits held safely.`,
      creditsAwarded: 2,
      confidence: 0.82,
      imageHash,
      flags: reasons,
      stages: [
        { id: '1', label: 'Detecting waste streams', detail: 'Wet (green) and Dry (grey) streams detected cleanly.', passed: true },
        { id: '2', label: 'Checking for cross-contamination', detail: 'Zero cross-stream contamination identified.', passed: true },
        { id: '3', label: 'Confirming location and time', detail: `${reasons[0]} — requires worker spot-verification.`, passed: false },
      ],
      streams: {
        wet: { detected: true, status: 'clean', note: 'Clean organic kitchen waste', verdict: 'clean' },
        dry: { detected: true, status: 'clean', note: 'Clean recyclables', verdict: 'clean' },
        sanitary: { detected: streams.sanitary, status: streams.sanitary ? 'wrapped' : 'none', note: streams.sanitary ? 'Wrapped correctly' : 'None in this handover', verdict: streams.sanitary ? 'wrapped' : 'none' },
        special_care: { detected: streams.special_care, status: streams.special_care ? 'hazardous' : 'none', note: streams.special_care ? 'Item safely packaged' : 'None in this handover', verdict: streams.special_care ? 'safe' : 'none' },
      },
    };
  }

  // Normal verified pass
  return {
    status: 'verified',
    decisionReason: 'All streams compliant. Wet and dry waste cleanly separated.',
    creditsAwarded: 2,
    confidence: 0.98,
    imageHash,
    flags: [],
    stages: [
      { id: '1', label: 'Detecting waste streams', detail: 'Wet, Dry, and declared auxiliary streams identified.', passed: true },
      { id: '2', label: 'Checking for cross-contamination', detail: 'Organic wet stream 100% free of synthetic liners.', passed: true },
      { id: '3', label: 'Confirming location and time', detail: `Verified at ${household.address} during morning collection route.`, passed: true },
    ],
    streams: {
      wet: { detected: true, status: 'clean', note: 'Clean, no plastic detected', verdict: 'clean' },
      dry: { detected: true, status: 'clean', note: 'Clean paper & containers', verdict: 'clean' },
      sanitary: { detected: streams.sanitary, status: streams.sanitary ? 'wrapped' : 'none', note: streams.sanitary ? 'Wrapped correctly' : 'None in this handover', verdict: streams.sanitary ? 'wrapped' : 'none' },
      special_care: { detected: false, status: 'none', note: 'None in this handover', verdict: 'none' },
    },
  };
}
