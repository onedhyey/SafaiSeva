// Standardized rejection / flag reasons (audit A5).
//
// Every non-trivial decision carries a code from this catalog. The resident is shown a
// curated message + a "what to change" line, in English and Gujarati — never the model's
// raw prose (that is kept as secondary detail on the handover record).

export type Lang = 'en' | 'gu';

export interface ReasonEntry {
  en: string;
  gu: string;
  fix_en?: string;
  fix_gu?: string;
}

/** `{stream}` is substituted with the stream label in the resident's language. */
export const REASONS = {
  OK_VERIFIED: {
    en: 'Segregation verified. {streams} confirmed in the photo.',
    gu: 'વિભાજન ચકાસાયું. ફોટામાં {streams} ની પુષ્ટિ થઈ.',
  },
  OK_VERIFIED_VIDEO: {
    en: 'Segregation verified from the video sweep. {streams} confirmed.',
    gu: 'વિડિયો સ્વીપથી વિભાજન ચકાસાયું. {streams} ની પુષ્ટિ થઈ.',
  },
  NEEDS_VIDEO_LOW_CONFIDENCE: {
    en: 'The photo is not clear enough to confirm segregation. Your submission has not failed.',
    gu: 'વિભાજનની પુષ્ટિ કરવા ફોટો પૂરતો સ્પષ્ટ નથી. તમારું સબમિશન નિષ્ફળ થયું નથી.',
    fix_en: 'Record a short video panning slowly across each bin in good light.',
    fix_gu: 'સારા પ્રકાશમાં દરેક ડબ્બા પર ધીમેથી કૅમેરા ફેરવીને ટૂંકો વિડિયો રેકોર્ડ કરો.',
  },
  NO_WASTE: {
    en: 'Verification failed: the image does not contain identifiable waste.',
    gu: 'ચકાસણી નિષ્ફળ: છબીમાં ઓળખી શકાય તેવો કચરો નથી.',
    fix_en: 'Photograph your actual segregated bins with their contents visible.',
    fix_gu: 'તમારા ખરેખરના વિભાજિત ડબ્બાઓનો, અંદરનો કચરો દેખાય તે રીતે ફોટો લો.',
  },
  EMPTY_OR_UNCLEAR: {
    en: 'Verification failed: the image is empty, too dark, or too blurred to assess.',
    gu: 'ચકાસણી નિષ્ફળ: છબી ખાલી, ખૂબ ઘાટી, અથવા આકારણી માટે ખૂબ ઝાંખી છે.',
    fix_en: 'Retake the photo in daylight, holding the camera steady.',
    fix_gu: 'દિવસના પ્રકાશમાં કૅમેરા સ્થિર રાખીને ફરીથી ફોટો લો.',
  },
  SCREEN_RECAPTURE: {
    en: 'Verification flagged: the image appears to be a photograph of a screen or a printed photo.',
    gu: 'ચકાસણી ધ્વજાંકિત: છબી સ્ક્રીન અથવા છાપેલા ફોટાનો ફોટો હોય તેમ જણાય છે.',
    fix_en: 'Point the camera directly at the bins, not at another screen or picture.',
    fix_gu: 'કૅમેરાને સીધો ડબ્બાઓ તરફ રાખો, બીજી સ્ક્રીન કે ચિત્ર તરફ નહીં.',
  },
  UNRELATED_IMAGE: {
    en: 'Verification failed: the image does not show waste or waste containers.',
    gu: 'ચકાસણી નિષ્ફળ: છબીમાં કચરો કે કચરાના ડબ્બા દેખાતા નથી.',
    fix_en: 'Capture the four separated streams at handover.',
    fix_gu: 'હૅન્ડઓવર વખતે ચારેય અલગ કરેલા પ્રવાહો કૅપ્ચર કરો.',
  },
  STREAM_NOT_VISIBLE: {
    en: 'Verification failed: the {streams} stream you selected could not be seen in the image.',
    gu: 'ચકાસણી નિષ્ફળ: તમે પસંદ કરેલો {streams} પ્રવાહ છબીમાં જોઈ શકાયો નહીં.',
    fix_en: 'Only select streams that are actually in the frame, or reframe to include them.',
    fix_gu: 'ફ્રેમમાં ખરેખર હોય તેવા જ પ્રવાહ પસંદ કરો, અથવા તેમને સમાવવા ફ્રેમ ફરી ગોઠવો.',
  },
  CROSS_CONTAMINATION: {
    en: 'Verification failed: the {streams} stream is mixed with other waste.',
    gu: 'ચકાસણી નિષ્ફળ: {streams} પ્રવાહ અન્ય કચરા સાથે ભળેલો છે.',
    fix_en: 'Keep wet, dry, sanitary and special-care waste in fully separate containers.',
    fix_gu: 'ભીનો, સૂકો, સેનિટરી અને ખાસ કાળજીનો કચરો સંપૂર્ણ અલગ ડબ્બાઓમાં રાખો.',
  },
  NO_STREAMS_DECLARED: {
    en: 'Select at least one waste stream that is visible in your photo.',
    gu: 'તમારા ફોટામાં દેખાતો ઓછામાં ઓછો એક કચરાનો પ્રવાહ પસંદ કરો.',
  },
  DUPLICATE_EVIDENCE: {
    en: 'Verification failed: this image closely matches a previous submission.',
    gu: 'ચકાસણી નિષ્ફળ: આ છબી અગાઉના સબમિશન સાથે ખૂબ મળતી આવે છે.',
    fix_en: 'Take a fresh photo of today’s handover.',
    fix_gu: 'આજના હૅન્ડઓવરનો નવો ફોટો લો.',
  },
  OUTSIDE_GEOFENCE: {
    en: 'Verification failed: the location is outside your registered collection area.',
    gu: 'ચકાસણી નિષ્ફળ: સ્થાન તમારા નોંધાયેલા સંગ્રહ વિસ્તારની બહાર છે.',
    fix_en: 'Submit from your registered address during collection.',
    fix_gu: 'સંગ્રહ સમયે તમારા નોંધાયેલા સરનામેથી સબમિટ કરો.',
  },
  OUTSIDE_WINDOW: {
    en: 'Verification failed: this was submitted outside your area’s collection hours ({window}).',
    gu: 'ચકાસણી નિષ્ફળ: આ તમારા વિસ્તારના સંગ્રહ કલાકો ({window}) ની બહાર સબમિટ થયું.',
    fix_en: 'Submit during your collection window ({window}).',
    fix_gu: 'તમારા સંગ્રહ સમય ({window}) દરમિયાન સબમિટ કરો.',
  },
  DAILY_LIMIT_REACHED: {
    en: 'You have already had an approved handover today. Come back tomorrow.',
    gu: 'આજે તમારો એક હૅન્ડઓવર પહેલેથી મંજૂર થયો છે. કાલે ફરી આવો.',
  },
  VELOCITY_ANOMALY: {
    en: 'Verification flagged: submissions from very different locations in a short time.',
    gu: 'ચકાસણી ધ્વજાંકિત: ટૂંકા સમયમાં ખૂબ અલગ સ્થળોએથી સબમિશન.',
    fix_en: 'This will be reviewed by a karmachari; no action needed from you.',
    fix_gu: 'આની સમીક્ષા કર્મચારી કરશે; તમારે કંઈ કરવાની જરૂર નથી.',
  },
  TAMPER_SUSPECTED: {
    en: 'Verification flagged: the image shows signs of editing.',
    gu: 'ચકાસણી ધ્વજાંકિત: છબીમાં સંપાદનના ચિહ્નો છે.',
    fix_en: 'Submit an unedited photo straight from the camera.',
    fix_gu: 'કૅમેરામાંથી સીધો, સંપાદન વગરનો ફોટો સબમિટ કરો.',
  },
  IN_REVIEW_CONFLICT: {
    en: 'Sent for a quick karmachari check. Your credits are held until it clears.',
    gu: 'ઝડપી કર્મચારી તપાસ માટે મોકલ્યું. મંજૂરી સુધી તમારા ક્રેડિટ રોકાયેલા છે.',
  },
  SERVICE_ERROR: {
    en: 'The verification service could not be reached. Please try again shortly.',
    gu: 'ચકાસણી સેવા સુધી પહોંચી શકાયું નહીં. થોડી વારમાં ફરી પ્રયાસ કરો.',
  },
} satisfies Record<string, ReasonEntry>;

export type ReasonCode = keyof typeof REASONS;

const STREAM_LABELS: Record<Lang, Record<string, string>> = {
  en: { wet: 'Wet', dry: 'Dry', sanitary: 'Sanitary', special_care: 'Special Care' },
  gu: { wet: 'ભીનો', dry: 'સૂકો', sanitary: 'સેનિટરી', special_care: 'ખાસ કાળજી' },
};

function joinStreams(streams: string[] | undefined, lang: Lang): string {
  if (!streams || streams.length === 0) return lang === 'gu' ? 'પ્રવાહ' : 'the stream';
  return streams.map((s) => STREAM_LABELS[lang][s] ?? s).join(', ');
}

/** "6:00 AM – 12:00 PM" from integer local hours. */
export function formatWindow(start: number, end: number): string {
  const h12 = (h: number) => {
    const hr = h % 12 === 0 ? 12 : h % 12;
    return `${hr}:00 ${h < 12 || h === 24 ? 'AM' : 'PM'}`;
  };
  return `${h12(start)} – ${h12(end)}`;
}

export interface RenderedReason {
  code: ReasonCode;
  text: string;
  fix?: string;
}

export function renderReason(
  code: ReasonCode,
  opts: { lang?: Lang; streams?: string[]; window?: string } = {}
): RenderedReason {
  const lang = opts.lang ?? 'en';
  const entry: ReasonEntry = REASONS[code];
  const streamStr = joinStreams(opts.streams, lang);
  const win = opts.window ?? (lang === 'gu' ? 'તમારો સંગ્રહ સમય' : 'your collection window');
  const sub = (s: string) => s.replace('{streams}', streamStr).replace('{window}', win);
  const text = sub(lang === 'gu' ? entry.gu : entry.en);
  const fixRaw = lang === 'gu' ? entry.fix_gu : entry.fix_en;
  const fix = fixRaw ? sub(fixRaw) : undefined;
  return { code, text, fix };
}
