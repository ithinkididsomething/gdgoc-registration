/**
 * Two-language dictionary (EN / HI).
 *
 * No i18n dependency — the portal only needs these two languages, and keeping
 * the copy in-repo means it is reviewable in a pull request.
 *
 * Keys are dotted paths so call sites read as `t('fields.rollNumber')`. The
 * Hindi dictionary is typed against the English one, so a missing or misspelled
 * key is a compile error rather than an empty label at runtime.
 */

export const en = {
  'brand.name': 'GDGOC IET DAVV | IET DAVV, Indore',
  'brand.session': 'SESSION 2026-27',
  'brand.langLabel': 'Switch language',

  'steps.counter': 'Step {current} of {total}',
  'steps.one': 'Your Details',
  'steps.two': 'Domain Priorities',
  'steps.three': 'Your Forms',

  'title.main': 'GDG FRESHER\'S RECRUITMENT REGISTRATION FORM',
  'title.sub': 'Join us at GDG Fresher\'s Recruitment by GDGoC IET DAVV to innovate, build, and excel!',
  'title.details': 'STUDENT DETAILS',
  'title.detailsSub': 'Enter your roll number to auto-fill your details.',

  'footer.copy':
    '© 2026 All rights reserved to GDGoC IET DAVV. Contact: gdgoc@ietdavv.edu.in',

  // Labels for the credit line. The names and profile URLs themselves live in
  // components/Footer.tsx - they are proper nouns and do not change per locale.
  'footer.createdBy': 'Originally created by',
  'footer.qa': 'Testing/QA',

  'fields.rollNumber': 'Roll Number / Enrollment Number',
  'fields.rollNumberPh': 'E.G. 26I9014',
  'fields.rollNumberHint': 'Same as your Tech Unleash registration',
  'fields.rollNumberReplace':
    'That was your JEE roll number. Please replace it with your college roll number.',
  'fields.fullName': 'Full Name',
  'fields.fullNamePh': 'Enter your full name',
  'fields.branch': 'Branch',
  'fields.branchPh': 'Select branch',
  'fields.section': 'Section',
  'fields.sectionPh': 'Select section',
  'fields.sectionFixed': 'This branch runs a single section',
  'fields.yearOfStudy': 'Year of Study',
  'fields.contactNumber': 'Contact Number (with +91)',
  'fields.contactNumberPh': '+91 9876543210',
  'fields.gender': 'Gender',
  'fields.genderPh': 'Select gender',
  'fields.email': 'College Email ID / Personal Email ID',
  'fields.emailPh': 'you@ietdavv.edu.in',
  'fields.emailHelp': 'Official college email ID preferred',
  'fields.linkedin': 'LinkedIn ID / Profile URL',
  'fields.linkedinPh': 'https://linkedin.com/in/username or NA',
  'fields.github': 'GitHub ID / Profile URL',
  'fields.githubPh': 'https://github.com/username or NA',
  'fields.instagram': 'Instagram ID / Handle',
  'fields.instagramPh': '@username or NA',
  'fields.skills': 'Interest & Skills',
  'fields.skillsPh': 'Select your interest & skills',
  'fields.optional': 'Optional',
  'fields.verifiedEditable': 'Prefilled from your registration — edit if changed',
  'fields.yearMissing': 'Not recorded on your form — please select your year',
  'fields.teamMessage': 'Anything you would like to tell the team?',
  'fields.teamMessagePh': 'Your honest thoughts, in a line or two',

  'lookup.idle': 'We will look you up automatically.',
  'lookup.searching': 'Looking up your record…',
  'lookup.found': 'Record found. Your details are verified and locked. Email, GitHub and Instagram stay editable.',
  'lookup.jeeFound':
    'Found you by your JEE roll number. Your details are filled in — please enter your college roll number below.',
  'lookup.jeeRollUnverified':
    'We could not match that college roll number, but your details are already filled in and verified from your JEE roll number. Please check them and continue.',
  'lookup.jeeOffline':
    'Could not reach the server to check that roll number. Your details are already filled in and verified — please continue.',
  'lookup.notFound': 'No record found. Please fill the form manually.',
  'lookup.failed': 'Could not reach the server. You can fill the form manually.',
  'lookup.clear': 'Edit manually',

  'action.submit': 'SUBMIT GDG FRESHER\'S RECRUITMENT REGISTRATION FORM',
  'action.confirm': 'CONFIRM SELECTION & PROCEED TO ASSIGNMENTS',
  'action.submitting': 'Submitting…',
  'action.back': 'Back to details',
  'action.openForm': 'Open Form',

  'step2.heading': 'SELECT YOUR DOMAIN PRIORITIES - GDG FRESHER\'S RECRUITMENT (2026-27)',
  'step2.sub': 'Choose two different domains. Your first choice is your strongest preference.',
  'step2.priority1': 'Priority 1 (Required)',
  'step2.priority2': 'Priority 2 (Required)',
  'step2.priority1Ph': 'Select your first preference',
  'step2.priority2Ph': 'Select your second preference',
  'step2.collision': 'Already chosen as Priority 1 — pick a different domain.',
  'step2.summary': 'APPLICANT SUMMARY',
  'step2.noSelection': 'Not selected',

  'step3.notice': 'Registration logged for GDG IET DAVV Induction 2026-27! Complete your task forms below.',
  'step3.progress': 'Form progress',
  'step3.priority1Cta': 'Priority 1 Form',
  'step3.priority2Cta': 'Priority 2 Form',
  'step3.loading': 'Loading form',
  'step3.openInNewTab': 'Open in new tab',
  'step3.alreadySubmitted': 'Already submitted this form?',
  'step3.continueToSecond': 'Continue to Priority 2',
  'step3.finish': 'I have submitted both',
  'step3.reopenForm': 'Reload form',
  'step3.embedBlocked': 'The embedded form did not load',
  'step3.embedBlockedHint':
    'Your network or browser may be blocking embedded forms. Open it in a new tab to continue — your answers are not lost.',
  'step3.allDone': 'Both forms submitted',
  'step3.allDoneHint':
    'That is everything. You can close this tab — if you need to redo a form, reload the page and sign in again.',
  'step3.securityNote':
    'These forms were issued specifically for your registration. Please do not share them.',

  // Shown instead of the flow when the roll number has already registered.
  'noted.title': 'Your response has been noted',
  'noted.subtitle':
    'You have already responded, so there is nothing left to fill in. Here is what we recorded.',
  'noted.rollNumber': 'Roll number',
  'noted.priority1': 'Priority 1',
  'noted.priority2': 'Priority 2',
  'noted.recordedOn': 'Recorded on',
  'noted.formsHint':
    'If you have not submitted a form yet, open it below and tick it off once you have.',
  'noted.allSubmitted': 'Both forms are marked as submitted. Nothing else to do.',
  'noted.openForm': 'open form',
  'noted.markSubmitted': "I've submitted this",
  'noted.submitted': 'Submitted',
  'noted.footer':
    'Need this changed? Contact the organisers — for security, a response cannot be edited or resubmitted from here.',

  'error.title': 'Submission failed',
  'error.required': 'This field is required.',
  'error.email': 'Enter a valid email address.',
  'error.phone': 'Enter a valid 10-digit phone number.',
  'error.url': 'Enter a valid URL or type "NA".',
  'error.rollNumber': 'Roll number may contain only letters, digits and hyphens.',
  'error.name': 'Enter your full name.',
  'error.priority': 'Choose a domain for this priority.',
  'error.distinct': 'Priority 2 must be different from Priority 1.',
} as const

export type TranslationKey = keyof typeof en

const hi: Record<TranslationKey, string> = {
  'brand.name': 'GDGOC IET DAVV | IET DAVV, इंदौर',
  'brand.session': 'सत्र 2026-27',
  'brand.langLabel': 'भाषा बदलें',

  'steps.counter': 'चरण {current} / {total}',
  'steps.one': 'आपका विवरण',
  'steps.two': 'डोमेन प्राथमिकता',
  'steps.three': 'आपके फ़ॉर्म',

  'title.main': 'जीडीजी फ्रेशर रिक्रूटमेंट पंजीकरण फ़ॉर्म',
  'title.sub':
    'GDGoC IET DAVV द्वारा आयोजित जीडीजी फ्रेशर रिक्रूटमेंट में शामिल हों — नवाचार करें, बनाएं और उत्कृष्टता प्राप्त करें!',
  'title.details': 'छात्र विवरण',
  'title.detailsSub': 'अपना विवरण स्वतः भरने के लिए रोल नंबर दर्ज करें।',

  'footer.copy':
    '© 2026 सर्वाधिकार सुरक्षित, GDGoC IET DAVV। संपर्क: gdgoc@ietdavv.edu.in',

  'footer.createdBy': 'मूल रूप से तैयार किया',
  'footer.qa': 'परीक्षण / गुणवत्ता जाँच',

  'fields.rollNumber': 'रोल नंबर / नामांकन नंबर',
  'fields.rollNumberPh': 'उदा. 26I9014',
  'fields.rollNumberHint': 'टेक अनलीज़ पंजीकरण वाला ही',
  'fields.rollNumberReplace':
    'यह आपका JEE रोल नंबर था। कृपया इसे अपने कॉलेज रोल नंबर से बदलें।',
  'fields.fullName': 'पूरा नाम',
  'fields.fullNamePh': 'अपना पूरा नाम लिखें',
  'fields.branch': 'शाखा',
  'fields.branchPh': 'शाखा चुनें',
  'fields.section': 'सेक्शन',
  'fields.sectionPh': 'सेक्शन चुनें',
  'fields.sectionFixed': 'इस ब्रांच में केवल एक सेक्शन है',
  'fields.yearOfStudy': 'वर्ष',
  'fields.contactNumber': 'संपर्क नंबर (+91 के साथ)',
  'fields.contactNumberPh': '+91 9876543210',
  'fields.gender': 'लिंग',
  'fields.genderPh': 'लिंग चुनें',
  'fields.email': 'कॉलेज ईमेल आईडी / व्यक्तिगत ईमेल आईडी',
  'fields.emailPh': 'you@ietdavv.edu.in',
  'fields.emailHelp': 'आधिकारिक कॉलेज ईमेल आईडी को प्राथमिकता दी जाती है',
  'fields.linkedin': 'लिंक्डइन आईडी / प्रोफ़ाइल यूआरएल',
  'fields.linkedinPh': 'https://linkedin.com/in/username या NA',
  'fields.github': 'गिटहब आईडी / प्रोफ़ाइल यूआरएल',
  'fields.githubPh': 'https://github.com/username या NA',
  'fields.instagram': 'इंस्टाग्राम आईडी / हैंडल',
  'fields.instagramPh': '@username या NA',
  'fields.skills': 'रुचि और कौशल',
  'fields.skillsPh': 'अपनी रुचि और कौशल चुनें',
  'fields.optional': 'वैकल्पिक',
  'fields.verifiedEditable': 'आपके पंजीकरण से भरा गया है — बदल गया हो तो संपादित करें',
  'fields.yearMissing': 'आपके फ़ॉर्म में दर्ज नहीं है — कृपया अपना वर्ष चुनें',
  'fields.teamMessage': 'टीम को कुछ कहना है?',
  'fields.teamMessagePh': 'आपकी सच्ची बात, एक-दो पंक्तियों में',

  'lookup.idle': 'हम आपका रिकॉर्ड स्वतः खोजेंगे।',
  'lookup.searching': 'आपका रिकॉर्ड खोजा जा रहा है…',
  'lookup.found': 'रिकॉर्ड मिल गया। आपका विवरण सत्यापित और लॉक है। ईमेल, गिटहब और इंस्टाग्राम संपादन योग्य हैं।',
  'lookup.jeeFound':
    'आपको आपके JEE रोल नंबर से ढूँढ लिया गया है। आपका विवरण भर दिया गया है — कृपया नीचे अपना कॉलेज रोल नंबर दर्ज करें।',
  'lookup.jeeRollUnverified':
    'वह कॉलेज रोल नंबर मेल नहीं खाया, लेकिन आपका विवरण पहले से भरा हुआ और आपके JEE रोल नंबर से सत्यापित है। कृपया जाँच कर आगे बढ़ें।',
  'lookup.jeeOffline':
    'रोल नंबर जाँचने के लिए सर्वर से संपर्क नहीं हो सका। आपका विवरण पहले से भरा और सत्यापित है — कृपया आगे बढ़ें।',
  'lookup.notFound': 'कोई रिकॉर्ड नहीं मिला। कृपया फ़ॉर्म स्वयं भरें।',
  'lookup.failed': 'सर्वर से संपर्क नहीं हो सका। आप फ़ॉर्म स्वयं भर सकते हैं।',
  'lookup.clear': 'स्वयं संपादित करें',

  'action.submit': 'जीडीजी फ्रेशर रिक्रूटमेंट पंजीकरण फ़ॉर्म जमा करें',
  'action.confirm': 'चयन की पुष्टि करें और असाइनमेंट पर जाएं',
  'action.submitting': 'जमा किया जा रहा है…',
  'action.back': 'विवरण पर वापस जाएं',
  'action.openForm': 'फ़ॉर्म खोलें',

  'step2.heading': 'अपने डोमेन प्राथमिकताएं चुनें - जीडीजी फ्रेशर रिक्रूटमेंट (2026-27)',
  'step2.sub': 'दो अलग-अलग डोमेन चुनें। आपकी पहली पसंद सबसे मजबूत है।',
  'step2.priority1': 'प्राथमिकता 1 (आवश्यक)',
  'step2.priority2': 'प्राथमिकता 2 (आवश्यक)',
  'step2.priority1Ph': 'अपनी पहली पसंद चुनें',
  'step2.priority2Ph': 'अपनी दूसरी पसंद चुनें',
  'step2.collision': 'प्राथमिकता 1 के रूप में चुना गया — कोई दूसरा डोमेन चुनें।',
  'step2.summary': 'आवेदक सारांश',
  'step2.noSelection': 'चयनित नहीं',

  'step3.notice': 'GDG IET DAVV इंडक्शन 2026-27 के लिए पंजीकरण दर्ज हो गया! नीचे अपने टास्क फ़ॉर्म पूरे करें।',
  'step3.progress': 'फ़ॉर्म प्रगति',
  'step3.priority1Cta': 'प्राथमिकता 1 फ़ॉर्म',
  'step3.priority2Cta': 'प्राथमिकता 2 फ़ॉर्म',
  'step3.loading': 'फ़ॉर्म लोड हो रहा है',
  'step3.openInNewTab': 'नए टैब में खोलें',
  'step3.alreadySubmitted': 'क्या यह फ़ॉर्म जमा कर दिया?',
  'step3.continueToSecond': 'प्राथमिकता 2 पर जाएँ',
  'step3.finish': 'मैंने दोनों जमा कर दिए',
  'step3.reopenForm': 'फ़ॉर्म पुनः लोड करें',
  'step3.embedBlocked': 'एम्बेड किया गया फ़ॉर्म लोड नहीं हुआ',
  'step3.embedBlockedHint':
    'आपका नेटवर्क या ब्राउज़र एम्बेडेड फ़ॉर्म को रोक रहा है। जारी रखने के लिए इसे नए टैब में खोलें — आपके उत्तर सुरक्षित हैं।',
  'step3.allDone': 'दोनों फ़ॉर्म जमा हो गए',
  'step3.allDoneHint':
    'बस इतना ही है। आप यह टैब बंद कर सकते हैं — किसी फ़ॉर्म को दोबारा भरना हो तो पेज रीलोड करके दोबारा साइन इन करें।',
  'step3.securityNote': 'ये फ़ॉर्म आपके पंजीकरण के लिए विशेष रूप से जारी किए गए हैं। कृपया इन्हें साझा न करें।',

  'noted.title': 'आपकी प्रतिक्रिया दर्ज हो गई है',
  'noted.subtitle':
    'आपने पहले ही जवाब दे दिया है, इसलिए अब भरने के लिए कुछ नहीं बचा। हमने जो दर्ज किया है वह नीचे है।',
  'noted.rollNumber': 'रोल नंबर',
  'noted.priority1': 'प्राथमिकता 1',
  'noted.priority2': 'प्राथमिकता 2',
  'noted.recordedOn': 'दर्ज की गई तिथि',
  'noted.formsHint':
    'यदि आपने कोई फ़ॉर्म अभी तक जमा नहीं किया है, तो नीचे खोलें और जमा करने के बाद उसे चिह्नित करें।',
  'noted.allSubmitted': 'दोनों फ़ॉर्म जमा हो चुके हैं। अब कुछ नहीं करना है।',
  'noted.openForm': 'फ़ॉर्म खोलें',
  'noted.markSubmitted': 'मैंने यह जमा कर दिया',
  'noted.submitted': 'जमा हो गया',
  'noted.footer':
    'कुछ बदलना है? आयोजकों से संपर्क करें — सुरक्षा के लिए यहाँ प्रतिक्रिया में संशोधन या पुनः जमा संभव नहीं है।',

  'error.title': 'जमा करना विफल रहा',
  'error.required': 'यह फ़ील्ड आवश्यक है।',
  'error.email': 'एक मान्य ईमेल पता दर्ज करें।',
  'error.phone': 'एक मान्य 10-अंकीय फ़ोन नंबर दर्ज करें।',
  'error.url': 'एक मान्य URL दर्ज करें या "NA" लिखें।',
  'error.rollNumber': 'रोल नंबर में केवल अक्षर, अंक और हाइफ़न हो सकते हैं।',
  'error.name': 'अपना पूरा नाम लिखें।',
  'error.priority': 'इस प्राथमिकता के लिए एक डोमेन चुनें।',
  'error.distinct': 'प्राथमिकता 2, प्राथमिकता 1 से अलग होनी चाहिए।',
}

export const DICTIONARIES: Record<'en' | 'hi', Record<TranslationKey, string>> = { en, hi }
