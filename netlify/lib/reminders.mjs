// ============================================================
// reminders.mjs — מתי שולחים תזכורת, ומה כתוב בה.
// השעות לפי שעון קליפורניה, כך שמעבר שעון קיץ/חורף לא משנה כלום.
// הנוסחים בטון חברי (הוחלט 7.11.2026). לשנות או להוסיף — רק כאן.
// ============================================================

const TZ = 'America/Los_Angeles';

// שעה מקומית (בדיוק בתחילת חצי שעה) → סוג התזכורת
export const SLOTS = { '10:00': 'morning', '13:00': 'lunch', '19:30': 'evening' };

const MESSAGES = {
  he: {
    morning: [
      'בוקר טוב! מילאת דלק בדרך לג\'וב הראשון? שתי שניות וזה בפנים ⛽',
      'קפה של בוקר גם נחשב 🙂 שווה לרשום אותו',
      'קנית חלקים לג\'וב של היום? רשום עכשיו, לפני שהקבלה נעלמת בטנדר 🔧',
      'יום חדש. ההוצאה הראשונה של היום מחכה לך באפליקציה',
      'בוקר טוב! מה שנרשם עכשיו לא צריך לזכור בערב 😉',
    ],
    lunch: [
      'צהריים טובים! אם קנית משהו לאכול, שתי שניות וזה בפנים 🙂',
      'הפסקת צהריים? זה הזמן לרשום מה יצא הבוקר',
      'בתיאבון! ואחרי הביס האחרון — לרשום כמה זה עלה 🌮',
      'חצי יום מאחוריך. סגרת ג\'וב? רשום אותו עכשיו כשזה עוד טרי',
      'צהריים זה זמן טוב לבדוק כמה כבר נכנס היום 💵',
    ],
    evening: [
      'סוף יום — דקה אחת לסגור את ההוצאות של היום',
      'לפני שנחים: כל הג\'ובים של היום בפנים? ✅',
      'יום עבודה נגמר. בוא נראה כמה נשאר לך החודש 👀',
      'עוד יום מאחוריך. רשום את מה שנשאר, ותדע בדיוק איפה אתה עומד',
      'ערב טוב! קיבלת היום טיפ? גם הוא נחשב 💵',
    ],
  },
  en: {
    morning: [
      'Morning! Filled up on the way to the first job? Two seconds and it\'s in ⛽',
      'Morning coffee counts too 🙂 worth logging it',
      'Bought parts for today\'s job? Log it before the receipt disappears in the truck 🔧',
      'New day. Today\'s first expense is waiting for you in the app',
      'Morning! What you log now is one less thing to remember tonight 😉',
    ],
    lunch: [
      'Lunch time! If you grabbed something to eat, two seconds and it\'s in 🙂',
      'Lunch break? Good moment to log this morning\'s spending',
      'Enjoy! And after the last bite — log what it cost 🌮',
      'Half the day done. Closed a job? Log it while it\'s fresh',
      'Lunch is a good time to see how much came in today 💵',
    ],
    evening: [
      'End of the day — one minute to close out today\'s expenses',
      'Before you rest: are all of today\'s jobs in? ✅',
      'Work day\'s done. Let\'s see what\'s left for the month 👀',
      'Another day done. Log the rest and know exactly where you stand',
      'Evening! Got a tip today? That counts too 💵',
    ],
  },
};

function laParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

/** סוג התזכורת לרגע הזה, או null אם עכשיו לא שעה של תזכורת */
export function currentSlot(date = new Date()) {
  const p = laParts(date);
  const half = Number(p.minute) < 30 ? '00' : '30';
  return SLOTS[`${p.hour}:${half}`] || null;
}

/**
 * ההודעה לסוג תזכורת ולשפה. מתחלפת לפי התאריך, אז אותה הודעה לא חוזרת
 * יומיים ברצף באותה שעה.
 */
export function pickMessage(slot, lang = 'he', date = new Date()) {
  const p = laParts(date);
  const dayNumber = Math.floor(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) / 86400000);
  const list = (MESSAGES[lang] || MESSAGES.he)[slot];
  return { title: 'Thru The Money', body: list[dayNumber % list.length], tag: `ttm-${slot}` };
}

export function testMessage(lang = 'he') {
  return {
    title: 'Thru The Money',
    body: lang === 'en'
      ? 'Reminders work 🎉 See you at 10:00, 1:00 PM and 7:30 PM'
      : 'התזכורות עובדות 🎉 נתראה ב-10:00, 13:00 ו-19:30',
    tag: 'ttm-test',
  };
}
