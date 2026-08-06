// ============================================================
// config.js — המפתחות הציבוריים של Supabase
//
// שני הערכים האלה נועדו לצד הלקוח ומוגנים ע"י ה-RLS שהרצת.
// זה בסדר גמור שהם יושבים כאן בקוד.
//
// ⚠️ המפתח service_role לעולם לא נכנס לקובץ הזה ולא לשום קובץ
//    בתוך deploy/. הוא עוקף את כל הגנות ה-RLS.
//
// מאיפה לוקחים:  Supabase → Project Settings → API Keys
// ============================================================

export const SUPABASE_URL = 'https://uxqkczpesksqqjhhnecf.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4cWtjenBlc2tzcXFqaGhuZWNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4ODI5ODIsImV4cCI6MjEwMTQ1ODk4Mn0.VIQwTnr-oJ0SNQ-6px5SGWTqKpNIm3iE01xgaii7olc';

// אזור הזמן שבו נקבע מה זה "היום". לא לשנות.
export const TZ = 'America/Los_Angeles';

export const CURRENCY = 'USD';

export const isConfigured =
  !SUPABASE_URL.startsWith('PASTE_') && !SUPABASE_ANON_KEY.startsWith('PASTE_');
