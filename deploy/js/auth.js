// ============================================================
// auth.js — הרשמה, התחברות, יציאה
// שגיאות מוחזרות כמפתחות תרגום (למשל 'auth.err.invalidCredentials'),
// לא כטקסט קבוע — כדי שהשכבה שמציגה תוכל לתרגם לפי השפה הנוכחית.
// ============================================================

import { supabase } from './db.js';

function errorKey(error) {
  const m = (error?.message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'auth.err.invalidCredentials';
  if (m.includes('already registered'))        return 'auth.err.alreadyRegistered';
  if (m.includes('password should be at least')) return 'auth.err.passwordTooShort';
  if (m.includes('unable to validate email') || m.includes('is invalid')) return 'auth.err.invalidEmail';
  if (m.includes('email not confirmed'))       return 'auth.err.emailNotConfirmed';
  if (m.includes('signups are disabled') || m.includes('signups not allowed')) return 'auth.err.signupsDisabled';
  if (m.includes('failed to fetch'))           return 'auth.err.noConnection';
  return 'auth.err.generic';
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(), password,
  });
  if (error) throw new Error(errorKey(error));
  return data.user;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(), password,
  });
  if (error) throw new Error(errorKey(error));

  // אם אישור מייל פעיל, אין session — צריך לומר את זה במפורש
  const needsConfirm = !data.session;
  return { user: data.user, needsConfirm };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(errorKey(error));
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** קורא ל-cb בכל שינוי מצב התחברות. מחזיר פונקציית ביטול. */
export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
