# Thru The Money

אפליקציית ווב (PWA) לניהול כספים אישיים. עברית RTL, דולרים, מובייל קודם.
המפרט המלא: [SPEC.md](SPEC.md) · מצב הפרויקט והחלטות: [CLAUDE.md](CLAUDE.md)

---

## הקמה — פעם אחת

### 1. Supabase

1. צור פרויקט חדש ב־[supabase.com](https://supabase.com).
2. לך ל־**SQL Editor** והרץ לפי הסדר, קובץ אחרי קובץ:
   - `sql/01_schema.sql`
   - `sql/02_rls.sql`
   - `sql/03_seed_categories.sql`
3. **Authentication → Providers → Email**: ודא שהוא פעיל.
   לשימוש אישי מומלץ לכבות *Confirm email* כדי לא להתעכב על מייל אישור.
4. **Settings → API**: העתק את `Project URL` ואת המפתח `anon public`.
   שני אלה נועדו לצד הלקוח — הם מוגנים ע"י RLS. **אל תיגע ב־`service_role`.**

### 2. הקוד

`deploy/js/config.js` (נוצר בשלב 2) מכיל את שני הערכים מהסעיף הקודם.
אין build step, אין `npm install` — קבצים סטטיים בלבד.

### 3. Netlify

1. גרור את תיקיית הפרויקט ל־Netlify, או חבר ל־Git.
2. ההגדרות כבר יושבות ב־`netlify.toml`: פרסום מתיקיית `deploy/`, פונקציות מ־`netlify/functions/`.
3. **Site settings → Environment variables** — הוסף:

   | שם | ערך |
   |---|---|
   | `ANTHROPIC_API_KEY` | המפתח מ־console.anthropic.com |
   | `SUPABASE_URL` | אותו Project URL |
   | `SUPABASE_ANON_KEY` | אותו מפתח anon |

   המפתח של Anthropic יושב **רק כאן**. אם הוא מופיע אי־פעם בקובץ בתוך `deploy/` — זה באג חמור, לעצור ולהחליף מפתח.

---

## הרצה מקומית

```bash
cd deploy && python3 -m http.server 8080
```

ואז לפתוח `http://localhost:8080`.
צריך שרת אמיתי (לא לפתוח את הקובץ ישירות) — ES Modules ו־service worker לא עובדים מ־`file://`.

לבדיקה של ה־Netlify Function מקומית:

```bash
npx netlify-cli dev
```

---

## מבנה

```
thru-the-money/
├── CLAUDE.md              מקור האמת — החלטות, סטטוס, מה נשאר
├── SPEC.md                האפיון
├── netlify.toml           הגדרות דיפלוי
├── sql/                   סכימה, RLS, קטגוריות ברירת מחדל
├── netlify/functions/     קוד שרת (המלצות AI)
└── deploy/                כל מה שעולה לאוויר
```

---

## שני כללים שלא שוברים

1. **כל שינוי בקוד ב־`deploy/` → להעלות `CACHE_VERSION` ב־`sw.js`.**
   בלי זה הטלפון ממשיך להגיש את הגרסה הישנה, וזה נראה בדיוק כמו באג.
2. **כל SQL עובר סקירה לפני הרצה.** בלי יוצאי דופן.
