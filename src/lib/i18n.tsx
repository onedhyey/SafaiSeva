import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Minimal UI translation layer: English, Gujarati, Hindi. Strings are keyed; a key missing
// in gu/hi falls back to English, so screens can be translated incrementally.
// The Gujarati and Hindi text here needs review by a native speaker before launch.

export type Lang = 'en' | 'gu' | 'hi';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'gu', label: 'ગુજરાતી' },
  { id: 'hi', label: 'हिन्दी' },
];

const STORAGE_KEY = 'safaiseva_lang';

type Dict = Record<string, string>;

const en: Dict = {
  'nav.wallet': 'Wallet',
  'nav.document': 'Document',
  'nav.rewards': 'Rewards',
  'nav.impact': 'Impact',
  'nav.outbox': 'Outbox',

  'lang.label': 'Language',

  'consent.title': 'Before you submit: how your data is used',
  'consent.what': 'What we collect:',
  'consent.what.body': 'the photo or short video of your waste bins you take in the app, where and when you took it, and your account.',
  'consent.why': 'Why:',
  'consent.why.body': 'to check that waste is separated, award Leaf Credits, and stop fake or repeated submissions.',
  'consent.who': 'Who sees it:',
  'consent.who.body': 'an AI service (Google Gemini) describes the photo for our rules engine; if you dispute a result, a karmachari for your ward reviews it.',
  'consent.howlong': 'How long:',
  'consent.howlong.body': "photos and videos are deleted after 90 days. Your household's credit history is kept while the household is active.",
  'consent.choice': 'Your choice:',
  'consent.choice.body': 'you can delete your data at any time in Settings → Delete my data.',
  'consent.notnow': 'Not now',
  'consent.agree': 'I agree',
  'consent.saving': 'Saving…',
  'consent.error': 'Could not save your choice. Check your connection and try again.',

  'update.ready': 'A new version of SafaiSeva is ready.',
  'update.button': 'Update',

  'load.error': "Couldn't reach SafaiSeva. Check your connection — figures will appear once it's back.",
  'load.retry': 'Retry',

  'notify.title': 'Notifications',
  'notify.on': 'Turn on',
  'notify.off': 'Turn off',
  'notify.unsupported': 'This browser does not support notifications.',
  'notify.ios': 'On iPhone, add SafaiSeva to your Home Screen first (Share → Add to Home Screen), then turn notifications on from the installed app.',
  'notify.unconfigured': 'Notifications are not available right now.',
  'notify.denied': 'Notifications are blocked for this site. Allow them in your browser settings to turn them on.',
  'notify.offText': 'Get told when your handover is reviewed and when your leaves are ready to spend.',
  'notify.onText': 'You will be notified about reviews and when your leaves are ready.',

  'delete.title': 'Delete my data',
  'delete.body': "Removes your account details, your photos and videos, and where you took them. Your household's credit history stays with the household.",
  'delete.start': 'Delete…',
  'delete.warning': 'This cannot be undone. You will be signed out on this device.',
  'delete.keep': 'Keep my data',
  'delete.confirm': 'Delete permanently',
  'delete.busy': 'Deleting…',
  'delete.done': 'Your data has been deleted.',

  'members.title': 'Household members',
  'members.invite': 'Invite a family member',
  'members.share': 'Share this invite code with family. You approve each person before they join.',
  'members.copy': 'Copy',
  'members.copied': 'Copied',
  'members.wants': '{name} wants to join',
  'members.approve': 'Approve',
};

const gu: Dict = {
  'nav.wallet': 'વૉલેટ',
  'nav.document': 'નોંધ',
  'nav.rewards': 'ઇનામ',
  'nav.impact': 'અસર',
  'nav.outbox': 'બાકી',

  'lang.label': 'ભાષા',

  'consent.title': 'મોકલતા પહેલાં: તમારો ડેટા કેવી રીતે વપરાય છે',
  'consent.what': 'અમે શું લઈએ છીએ:',
  'consent.what.body': 'એપમાં લીધેલો તમારા કચરાના ડબ્બાનો ફોટો કે ટૂંકો વિડિયો, તે ક્યાં અને ક્યારે લીધો, અને તમારું એકાઉન્ટ.',
  'consent.why': 'શા માટે:',
  'consent.why.body': 'કચરો અલગ કર્યો છે તે તપાસવા, લીફ ક્રેડિટ આપવા, અને નકલી કે ફરી મોકલેલી માહિતી રોકવા.',
  'consent.who': 'કોણ જુએ છે:',
  'consent.who.body': 'એક AI સેવા (Google Gemini) અમારા નિયમો માટે ફોટાનું વર્ણન કરે છે; તમે પરિણામ સામે વાંધો લો તો તમારા વોર્ડના કર્મચારી તપાસે છે.',
  'consent.howlong': 'કેટલો સમય:',
  'consent.howlong.body': 'ફોટા અને વિડિયો 90 દિવસ પછી કાઢી નાખવામાં આવે છે. ઘરનો ક્રેડિટ ઇતિહાસ ઘર સક્રિય હોય ત્યાં સુધી રહે છે.',
  'consent.choice': 'તમારી પસંદગી:',
  'consent.choice.body': 'તમે ક્યારેય પણ સેટિંગ્સ → મારો ડેટા કાઢી નાખો માંથી તમારો ડેટા કાઢી શકો છો.',
  'consent.notnow': 'હમણાં નહીં',
  'consent.agree': 'હું સંમત છું',
  'consent.saving': 'સાચવી રહ્યા છીએ…',
  'consent.error': 'તમારી પસંદગી સાચવી શકાઈ નથી. કનેક્શન તપાસીને ફરી પ્રયાસ કરો.',

  'update.ready': 'SafaiSeva નું નવું વર્ઝન તૈયાર છે.',
  'update.button': 'અપડેટ કરો',

  'load.error': 'SafaiSeva સુધી પહોંચી શકાયું નથી. કનેક્શન તપાસો — પાછું આવતાં આંકડા દેખાશે.',
  'load.retry': 'ફરી પ્રયાસ',

  'notify.title': 'સૂચનાઓ',
  'notify.on': 'ચાલુ કરો',
  'notify.off': 'બંધ કરો',
  'notify.unsupported': 'આ બ્રાઉઝર સૂચનાઓને સપોર્ટ કરતું નથી.',
  'notify.ios': 'iPhone પર, પહેલાં SafaiSeva ને હોમ સ્ક્રીન પર ઉમેરો (Share → Add to Home Screen), પછી ઇન્સ્ટોલ કરેલી એપમાંથી સૂચનાઓ ચાલુ કરો.',
  'notify.unconfigured': 'હાલમાં સૂચનાઓ ઉપલબ્ધ નથી.',
  'notify.denied': 'આ સાઇટ માટે સૂચનાઓ બંધ છે. ચાલુ કરવા બ્રાઉઝર સેટિંગ્સમાં મંજૂરી આપો.',
  'notify.offText': 'તમારી નોંધની તપાસ થાય અને પાંદડાં વાપરવા તૈયાર થાય ત્યારે જાણ મેળવો.',
  'notify.onText': 'તપાસ અને પાંદડાં તૈયાર થવા વિશે તમને જાણ કરવામાં આવશે.',

  'delete.title': 'મારો ડેટા કાઢી નાખો',
  'delete.body': 'તમારી એકાઉન્ટ માહિતી, તમારા ફોટા-વિડિયો અને તે ક્યાં લીધા તે કાઢી નાખે છે. ઘરનો ક્રેડિટ ઇતિહાસ ઘર પાસે રહે છે.',
  'delete.start': 'કાઢી નાખો…',
  'delete.warning': 'આ પાછું કરી શકાશે નહીં. આ ઉપકરણ પરથી તમે સાઇન આઉટ થઈ જશો.',
  'delete.keep': 'મારો ડેટા રાખો',
  'delete.confirm': 'કાયમ માટે કાઢી નાખો',
  'delete.busy': 'કાઢી રહ્યા છીએ…',
  'delete.done': 'તમારો ડેટા કાઢી નાખવામાં આવ્યો છે.',

  'members.title': 'ઘરના સભ્યો',
  'members.invite': 'પરિવારના સભ્યને આમંત્રણ આપો',
  'members.share': 'આ આમંત્રણ કોડ પરિવાર સાથે શેર કરો. દરેક વ્યક્તિ જોડાય તે પહેલાં તમે મંજૂરી આપો છો.',
  'members.copy': 'કૉપિ',
  'members.copied': 'કૉપિ થયું',
  'members.wants': '{name} જોડાવા માંગે છે',
  'members.approve': 'મંજૂર',
};

const hi: Dict = {
  'nav.wallet': 'वॉलेट',
  'nav.document': 'दर्ज करें',
  'nav.rewards': 'इनाम',
  'nav.impact': 'असर',
  'nav.outbox': 'बाकी',

  'lang.label': 'भाषा',

  'consent.title': 'भेजने से पहले: आपका डेटा कैसे इस्तेमाल होता है',
  'consent.what': 'हम क्या लेते हैं:',
  'consent.what.body': 'ऐप में ली गई आपके कूड़ेदान की फ़ोटो या छोटा वीडियो, वह कहाँ और कब ली गई, और आपका खाता।',
  'consent.why': 'क्यों:',
  'consent.why.body': 'यह जाँचने के लिए कि कचरा अलग किया गया है, लीफ़ क्रेडिट देने के लिए, और नकली या दोहराई गई जानकारी रोकने के लिए।',
  'consent.who': 'कौन देखता है:',
  'consent.who.body': 'एक AI सेवा (Google Gemini) हमारे नियमों के लिए फ़ोटो का वर्णन करती है; अगर आप नतीजे पर आपत्ति करें तो आपके वार्ड के कर्मचारी जाँच करते हैं।',
  'consent.howlong': 'कितने समय तक:',
  'consent.howlong.body': 'फ़ोटो और वीडियो 90 दिन बाद हटा दिए जाते हैं। घर का क्रेडिट इतिहास घर सक्रिय रहने तक रहता है।',
  'consent.choice': 'आपकी पसंद:',
  'consent.choice.body': 'आप कभी भी सेटिंग्स → मेरा डेटा हटाएँ से अपना डेटा हटा सकते हैं।',
  'consent.notnow': 'अभी नहीं',
  'consent.agree': 'मैं सहमत हूँ',
  'consent.saving': 'सहेज रहे हैं…',
  'consent.error': 'आपकी पसंद सहेजी नहीं जा सकी। कनेक्शन जाँचकर फिर कोशिश करें।',

  'update.ready': 'SafaiSeva का नया संस्करण तैयार है।',
  'update.button': 'अपडेट करें',

  'load.error': 'SafaiSeva तक पहुँच नहीं हो सकी। कनेक्शन जाँचें — वापस आने पर आँकड़े दिखेंगे।',
  'load.retry': 'फिर कोशिश करें',

  'notify.title': 'सूचनाएँ',
  'notify.on': 'चालू करें',
  'notify.off': 'बंद करें',
  'notify.unsupported': 'यह ब्राउज़र सूचनाओं का समर्थन नहीं करता।',
  'notify.ios': 'iPhone पर, पहले SafaiSeva को होम स्क्रीन पर जोड़ें (Share → Add to Home Screen), फिर इंस्टॉल किए गए ऐप से सूचनाएँ चालू करें।',
  'notify.unconfigured': 'अभी सूचनाएँ उपलब्ध नहीं हैं।',
  'notify.denied': 'इस साइट के लिए सूचनाएँ बंद हैं। चालू करने के लिए ब्राउज़र सेटिंग्स में अनुमति दें।',
  'notify.offText': 'जब आपकी प्रविष्टि की जाँच हो और पत्तियाँ खर्च के लिए तैयार हों, तब सूचना पाएँ।',
  'notify.onText': 'जाँच और पत्तियाँ तैयार होने पर आपको सूचना मिलेगी।',

  'delete.title': 'मेरा डेटा हटाएँ',
  'delete.body': 'आपके खाते की जानकारी, आपकी फ़ोटो-वीडियो और वे कहाँ ली गईं, हटा देता है। घर का क्रेडिट इतिहास घर के पास रहता है।',
  'delete.start': 'हटाएँ…',
  'delete.warning': 'यह वापस नहीं किया जा सकता। इस डिवाइस से आप साइन आउट हो जाएँगे।',
  'delete.keep': 'मेरा डेटा रखें',
  'delete.confirm': 'हमेशा के लिए हटाएँ',
  'delete.busy': 'हटा रहे हैं…',
  'delete.done': 'आपका डेटा हटा दिया गया है।',

  'members.title': 'घर के सदस्य',
  'members.invite': 'परिवार के सदस्य को आमंत्रित करें',
  'members.share': 'यह आमंत्रण कोड परिवार के साथ साझा करें। हर व्यक्ति के जुड़ने से पहले आप मंज़ूरी देते हैं।',
  'members.copy': 'कॉपी',
  'members.copied': 'कॉपी हो गया',
  'members.wants': '{name} जुड़ना चाहते हैं',
  'members.approve': 'मंज़ूर',
};

const DICTS: Record<Lang, Dict> = { en, gu, hi };

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'gu' || saved === 'hi') return saved;
  } catch {
    /* storage blocked */
  }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase();
  if (nav.startsWith('gu')) return 'gu';
  if (nav.startsWith('hi')) return 'hi';
  return 'en';
}

let currentLang: Lang = typeof window === 'undefined' ? 'en' : initialLang();

/** The UI language outside React (e.g. for the API client's x-lang header). */
export function getLang(): Lang {
  return currentLang;
}

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let s = DICTS[lang][key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue>({
  lang: 'en',
  setLang: () => undefined,
  t: (key, vars) => translate('en', key, vars),
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(currentLang);

  useEffect(() => {
    currentLang = lang;
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage blocked — the choice lasts for this session */
    }
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

/** Test seam: the dictionaries, for completeness checks. */
export const __dicts = DICTS;
