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
  'help.open': 'Help & how it works',
  'help.title': 'Help & how it works',
  'help.close': 'Close help',
  'help.what.q': 'What is SafaiSeva?',
  'help.what.a': 'SafaiSeva rewards households in Ahmedabad for separating their waste at home. Each day you hand over separated waste, you document it in the app; when it checks out, your household earns leaves (Leaf Credits) that you can spend on rewards.',
  'help.how.q': 'How do I document my handover?',
  'help.how.1': 'Keep wet waste (food, peels) and dry waste (paper, plastic, metal) in separate bins or bags. Sanitary and special-care waste (batteries, sharps) earn more when kept separately too.',
  'help.how.2': 'Open the Document tab during your collection hours and point the camera at your bins.',
  'help.how.3': 'Take one clear photo in good light with every bin open and its contents visible. Keep the bins side by side so each stream is easy to tell apart.',
  'help.how.4': 'Tick the streams you separated (at least wet and dry) and submit. You get a result in a few seconds.',
  'help.video.q': 'Why am I asked for a video?',
  'help.video.a': "If the photo isn't clear enough to confirm every stream, you're asked for a short video. It's not a failure. Pan slowly across each open bin. Record as long as you need, up to 10 minutes. Anything over 30 seconds is sped up into a 30-second time-lapse before it's sent, so long videos don't use more data.",
  'help.camera.q': "Why can't I upload from my gallery?",
  'help.camera.a': "Evidence must be taken live with the SafaiSeva camera, at your home, at the time you hand over. Gallery photos can't prove that, so they're not accepted. This keeps rewards fair for everyone.",
  'help.leaves.q': 'How do leaves work?',
  'help.leaves.a': 'You earn 1 leaf for each separated stream the check confirms, up to 4 a day, once per household per day. New leaves become spendable after 24 hours. Setting up 2, 4 or 6 separate bins also earns a one-time bonus once your handovers show them.',
  'help.dispute.q': 'What if the result is wrong?',
  'help.dispute.a': 'Open the handover in your history and tap Dispute. A karmachari for your ward reviews it, and you get a notification with the outcome.',
  'help.privacy.q': 'What happens to my photos?',
  'help.privacy.a': 'Photos and videos are used only to check segregation and stop fake submissions, and are deleted after 90 days. You can delete all your data any time in Settings → Delete my data.',
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
  'help.open': 'મદદ અને તે કેવી રીતે કામ કરે છે',
  'help.title': 'મદદ અને તે કેવી રીતે કામ કરે છે',
  'help.close': 'મદદ બંધ કરો',
  'help.what.q': 'SafaiSeva શું છે?',
  'help.what.a': 'SafaiSeva અમદાવાદમાં ઘરે કચરો અલગ કરતા પરિવારોને ઇનામ આપે છે. દરરોજ તમે અલગ કરેલો કચરો આપો ત્યારે એપમાં તેની નોંધ કરો; તપાસ સાચી નીકળે તો તમારા ઘરને પાંદડાં (લીફ ક્રેડિટ) મળે છે, જે ઇનામ માટે વાપરી શકાય છે.',
  'help.how.q': 'હું મારી નોંધ કેવી રીતે કરું?',
  'help.how.1': 'ભીનો કચરો (ખોરાક, છાલ) અને સૂકો કચરો (કાગળ, પ્લાસ્ટિક, ધાતુ) અલગ ડબ્બા કે થેલીમાં રાખો. સેનિટરી અને ખાસ કાળજીવાળો કચરો (બેટરી, ધારદાર વસ્તુઓ) અલગ રાખવાથી વધુ મળે છે.',
  'help.how.2': 'તમારા કચરા સંગ્રહના સમયે નોંધ ટેબ ખોલો અને કેમેરા ડબ્બા તરફ રાખો.',
  'help.how.3': 'સારા પ્રકાશમાં, દરેક ડબ્બો ખુલ્લો અને અંદરનું દેખાય તેવો એક સ્પષ્ટ ફોટો લો. ડબ્બા બાજુ-બાજુમાં રાખો જેથી દરેક પ્રકાર સહેલાઈથી ઓળખાય.',
  'help.how.4': 'તમે અલગ કરેલા પ્રકાર પસંદ કરો (ઓછામાં ઓછું ભીનો અને સૂકો) અને મોકલો. થોડી સેકન્ડમાં પરિણામ મળશે.',
  'help.video.q': 'મને વિડિયો કેમ માંગવામાં આવે છે?',
  'help.video.a': 'ફોટામાં દરેક પ્રકાર સ્પષ્ટ ન દેખાય તો ટૂંકો વિડિયો માંગવામાં આવે છે. આ નિષ્ફળતા નથી. દરેક ખુલ્લા ડબ્બા પર ધીમે ધીમે કેમેરા ફેરવો. જરૂર હોય તેટલું, 10 મિનિટ સુધી રેકોર્ડ કરો. 30 સેકન્ડથી લાંબો વિડિયો મોકલતા પહેલાં 30 સેકન્ડના ટાઇમ-લેપ્સમાં ઝડપી બનાવાય છે, જેથી વધુ ડેટા ન વપરાય.',
  'help.camera.q': 'હું ગેલેરીમાંથી અપલોડ કેમ ન કરી શકું?',
  'help.camera.a': 'પુરાવો SafaiSeva કેમેરાથી, તમારા ઘરે, કચરો આપતી વખતે જ લેવાવો જોઈએ. ગેલેરીના ફોટા આ સાબિત કરી શકતા નથી, તેથી સ્વીકારાતા નથી. આથી બધા માટે ઇનામ ન્યાયી રહે છે.',
  'help.leaves.q': 'પાંદડાં કેવી રીતે મળે છે?',
  'help.leaves.a': 'તપાસમાં પુષ્ટિ થયેલા દરેક અલગ પ્રકાર માટે 1 પાંદડું મળે છે, દિવસમાં વધુમાં વધુ 4, ઘર દીઠ દિવસમાં એક વાર. નવાં પાંદડાં 24 કલાક પછી વાપરી શકાય છે. 2, 4 કે 6 અલગ ડબ્બા ગોઠવવાથી, તમારી નોંધોમાં તે દેખાય ત્યારે, એક વખતનું બોનસ પણ મળે છે.',
  'help.dispute.q': 'પરિણામ ખોટું હોય તો?',
  'help.dispute.a': 'તમારા ઇતિહાસમાં તે નોંધ ખોલો અને વાંધો દબાવો. તમારા વોર્ડના કર્મચારી તપાસ કરશે અને પરિણામની સૂચના તમને મળશે.',
  'help.privacy.q': 'મારા ફોટાનું શું થાય છે?',
  'help.privacy.a': 'ફોટા અને વિડિયો ફક્ત કચરો અલગ છે તે તપાસવા અને નકલી નોંધ રોકવા માટે વપરાય છે, અને 90 દિવસ પછી કાઢી નખાય છે. તમે ક્યારેય પણ સેટિંગ્સ → મારો ડેટા કાઢી નાખો માંથી તમારો બધો ડેટા કાઢી શકો છો.',
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
  'help.open': 'मदद और यह कैसे काम करता है',
  'help.title': 'मदद और यह कैसे काम करता है',
  'help.close': 'मदद बंद करें',
  'help.what.q': 'SafaiSeva क्या है?',
  'help.what.a': 'SafaiSeva अहमदाबाद में घर पर कचरा अलग करने वाले परिवारों को इनाम देता है। हर दिन जब आप अलग किया हुआ कचरा देते हैं, ऐप में उसे दर्ज करें; जाँच सही निकलने पर आपके घर को पत्तियाँ (लीफ़ क्रेडिट) मिलती हैं, जिन्हें इनाम पर खर्च किया जा सकता है।',
  'help.how.q': 'मैं अपनी प्रविष्टि कैसे दर्ज करूँ?',
  'help.how.1': 'गीला कचरा (खाना, छिलके) और सूखा कचरा (काग़ज़, प्लास्टिक, धातु) अलग डिब्बों या थैलियों में रखें। सैनिटरी और विशेष देखभाल वाला कचरा (बैटरी, नुकीली चीज़ें) अलग रखने पर ज़्यादा मिलता है।',
  'help.how.2': 'अपने कचरा संग्रह के समय दर्ज करें टैब खोलें और कैमरा डिब्बों की ओर रखें।',
  'help.how.3': 'अच्छी रोशनी में, हर डिब्बा खुला और अंदर का दिखे ऐसी एक साफ़ फ़ोटो लें। डिब्बे पास-पास रखें ताकि हर प्रकार आसानी से पहचाना जा सके।',
  'help.how.4': 'आपने जो प्रकार अलग किए वे चुनें (कम से कम गीला और सूखा) और भेजें। कुछ सेकंड में नतीजा मिलेगा।',
  'help.video.q': 'मुझसे वीडियो क्यों माँगा जाता है?',
  'help.video.a': 'अगर फ़ोटो में हर प्रकार साफ़ नहीं दिखता, तो छोटा वीडियो माँगा जाता है। यह असफलता नहीं है। हर खुले डिब्बे पर धीरे-धीरे कैमरा घुमाएँ। जितना ज़रूरी हो, 10 मिनट तक रिकॉर्ड करें। 30 सेकंड से लंबा वीडियो भेजने से पहले 30 सेकंड के टाइम-लैप्स में तेज़ कर दिया जाता है, ताकि ज़्यादा डेटा न लगे।',
  'help.camera.q': 'मैं गैलरी से अपलोड क्यों नहीं कर सकता?',
  'help.camera.a': 'सबूत SafaiSeva कैमरे से, आपके घर पर, कचरा देते समय ही लिया जाना चाहिए। गैलरी की फ़ोटो यह साबित नहीं कर सकतीं, इसलिए स्वीकार नहीं की जातीं। इससे सबके लिए इनाम निष्पक्ष रहते हैं।',
  'help.leaves.q': 'पत्तियाँ कैसे मिलती हैं?',
  'help.leaves.a': 'जाँच में पुष्टि हुए हर अलग प्रकार के लिए 1 पत्ती मिलती है, दिन में अधिकतम 4, हर घर को दिन में एक बार। नई पत्तियाँ 24 घंटे बाद खर्च की जा सकती हैं। 2, 4 या 6 अलग डिब्बे रखने पर, आपकी प्रविष्टियों में दिखने पर, एक बार का बोनस भी मिलता है।',
  'help.dispute.q': 'अगर नतीजा गलत हो तो?',
  'help.dispute.a': 'अपने इतिहास में वह प्रविष्टि खोलें और आपत्ति दबाएँ। आपके वार्ड के कर्मचारी जाँच करेंगे और नतीजे की सूचना आपको मिलेगी।',
  'help.privacy.q': 'मेरी फ़ोटो का क्या होता है?',
  'help.privacy.a': 'फ़ोटो और वीडियो सिर्फ़ कचरा अलग होने की जाँच और नकली प्रविष्टि रोकने के लिए इस्तेमाल होते हैं, और 90 दिन बाद हटा दिए जाते हैं। आप कभी भी सेटिंग्स → मेरा डेटा हटाएँ से अपना सारा डेटा हटा सकते हैं।',
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
