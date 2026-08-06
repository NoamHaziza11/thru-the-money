// ============================================================
// format.js — כסף, תאריכים, עברית/אנגלית
// כל מה שקשור לתצוגה עובר דרך כאן, כדי שלא יהיו שני פורמטים
// שונים לאותו דבר בשני מסכים.
// ============================================================

import { TZ } from './config.js';
import { getLang } from './i18n.js';

export const MONTHS_HE = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];
const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ------------------------------------------------------------
// תאריכים — תמיד בשעון LA, לעולם לא UTC.
// בלי זה, תנועה שנרשמת ב-4 אחר הצהריים בקליפורניה
// עלולה להירשם על התאריך של מחר.
// ------------------------------------------------------------

const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** התאריך של היום בשעון LA, בפורמט 'YYYY-MM-DD' */
export function todayLA(date = new Date()) {
  return ymdFormatter.format(date);
}

/** { year, month } של החודש הנוכחי בשעון LA. month הוא 1–12. */
export function currentPeriod() {
  const [y, m] = todayLA().split('-');
  return { year: Number(y), month: Number(m) };
}

/** 'אוגוסט 2026' / 'August 2026' — לפי שפת הממשק הנוכחית */
export function periodLabel({ year, month }) {
  const months = getLang() === 'en' ? MONTHS_EN : MONTHS_HE;
  return `${months[month - 1]} ${year}`;
}

/** 'אוג' / 'Jan' — לתוויות ציר בגרפים, לפי שפת הממשק הנוכחית */
export function periodShortLabel({ month }) {
  const months = getLang() === 'en' ? MONTHS_EN : MONTHS_HE;
  return months[month - 1].slice(0, 3);
}

/** הצעד לחודש הקודם/הבא, בלי לחרוג לשנה לא חוקית */
export function shiftPeriod({ year, month }, delta) {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/** האם התקופה הזו כבר בעתיד ביחס להיום */
export function isFuturePeriod(period) {
  const now = currentPeriod();
  return period.year * 12 + period.month > now.year * 12 + now.month;
}

/** גבולות החודש כמחרוזות תאריך — לשאילתות: occurred_on בין X ל-Y */
export function periodRange({ year, month }) {
  const pad = (n) => String(n).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay)}` };
}

/** מזיז תאריך 'YYYY-MM-DD' במספר ימים ומחזיר 'YYYY-MM-DD' */
export function addDays(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** 'YYYY-MM-DD' → 'היום'/'Today' · 'אתמול'/'Yesterday' · 'שני, 4 באוגוסט'/'Monday, August 4' */
export function dateLabel(ymd) {
  const lang = getLang();
  const today = todayLA();
  if (ymd === today) return lang === 'en' ? 'Today' : 'היום';
  if (ymd === addDays(today, -1)) return lang === 'en' ? 'Yesterday' : 'אתמול';

  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

  if (lang === 'en') return `${DAYS_EN[dow]}, ${MONTHS_EN[m - 1]} ${d}`;
  return `${DAYS_HE[dow]}, ${d} ב${MONTHS_HE[m - 1]}`;
}

// ------------------------------------------------------------
// כסף — דולרים, שתי ספרות אחרי הנקודה, תמיד LTR, בכל שפת ממשק.
// המספרים תמיד נקראים משמאל לימין גם בתוך טקסט עברי.
// ------------------------------------------------------------

/** 1234.5 → '$1,234.50' */
export function money(value) {
  const n = Number(value) || 0;
  return '$' + n.toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

/** בלי אגורות — לכותרות גדולות. 1234.5 → '$1,235' */
export function moneyShort(value) {
  const n = Number(value) || 0;
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** '+$120.00' / '−$80.00' — לפי סוג התנועה */
export function signedMoney(value, kind) {
  return (kind === 'income' ? '+' : '−') + money(value);
}

/** אחוז שלם, חסום ל-0–999 */
export function pct(part, whole) {
  if (!whole) return 0;
  return Math.min(999, Math.max(0, Math.round((part / whole) * 100)));
}
