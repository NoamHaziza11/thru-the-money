// ============================================================
// db.js — לקוח Supabase + כל שאילתות ה-CRUD
// שום קובץ אחר לא מדבר עם המסד ישירות.
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from './config.js';

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

/**
 * זורק Error שהמסר שלו הוא מפתח תרגום (למשל 'error.loadData'), לא הטקסט
 * הגולמי של Supabase — כדי שהשכבה שמציגה תתרגם לפי השפה הנוכחית.
 * הטקסט המקורי מ-Supabase עדיין נרשם ל-console לצורך דיבאג.
 */
export function assertOk({ data, error }, errorKey = 'error.loadData') {
  if (error) {
    console.error(`[db] ${errorKey}:`, error);
    throw new Error(errorKey);
  }
  return data;
}

// ------------------------------------------------------------
// קטגוריות
// ------------------------------------------------------------
/**
 * כולל גם קטגוריות בארכיון: תנועות ישנות, גרפים ו-CSV צריכים את השם והאייקון
 * שלהן. בוררי הקטגוריה מסננים אותן בעצמם (ראה categoriesByKind ב-transactions.js).
 */
export async function fetchCategories(userId) {
  const res = await supabase
    .from('categories')
    .select('id, name, name_en, kind, icon, color, sort_order, is_archived')
    .eq('user_id', userId)
    .order('kind', { ascending: true })
    .order('sort_order', { ascending: true });
  return assertOk(res, 'error.loadData');
}

/** למסך "ניהול קטגוריות" */
export async function fetchAllCategories(userId) {
  const res = await supabase
    .from('categories')
    .select('id, name, name_en, kind, icon, color, sort_order, is_archived')
    .eq('user_id', userId)
    .order('kind', { ascending: true })
    .order('sort_order', { ascending: true });
  return assertOk(res, 'error.loadData');
}

export async function insertCategory(userId, { name, name_en, kind, icon, sort_order }) {
  const res = await supabase
    .from('categories')
    .insert({ user_id: userId, name, name_en: name_en || null, kind, icon: icon || '📌', sort_order })
    .select('id, name, name_en, kind, icon, color, sort_order, is_archived')
    .single();
  const { data, error } = res;
  if (error) {
    if (error.code === '23505') return { duplicate: true };
    console.error('[db] error.saveCategory:', error);
    throw new Error('error.saveCategory');
  }
  return { duplicate: false, data };
}

export async function updateCategory(id, patch) {
  const res = await supabase
    .from('categories')
    .update(patch)
    .eq('id', id)
    .select('id, name, name_en, kind, icon, color, sort_order, is_archived')
    .single();
  const { data, error } = res;
  if (error) {
    if (error.code === '23505') return { duplicate: true };
    console.error('[db] error.saveCategory:', error);
    throw new Error('error.saveCategory');
  }
  return { duplicate: false, data };
}

// ------------------------------------------------------------
// תנועות
// ------------------------------------------------------------
export async function fetchTransactions(userId, { from, to, limit = 500 }) {
  const res = await supabase
    .from('transactions')
    .select('id, kind, amount, category_id, note, occurred_on, source, created_at')
    .eq('user_id', userId)
    .gte('occurred_on', from)
    .lte('occurred_on', to)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  return assertOk(res, 'error.loadData');
}

export async function insertTransaction(userId, { kind, amount, category_id, note, occurred_on, source = 'manual', recurring_id = null }) {
  const res = await supabase
    .from('transactions')
    .insert({
      user_id: userId, kind, amount, category_id: category_id || null,
      note: note || null, occurred_on, source, recurring_id,
    })
    .select('id, kind, amount, category_id, note, occurred_on, source, created_at')
    .single();
  return assertOk(res, 'error.saveTransaction');
}

/**
 * יוצרת תנועה שנוצרה אוטומטית מכלל קבוע. אם האינדקס הייחודי
 * (recurring_id, חודש) תופס כפילות — זה סימן שמכשיר אחר כבר יצר את
 * אותה תנועה החודש, לא כשל אמיתי, אז מוחזר { duplicate: true } במקום
 * לזרוק שגיאה.
 */
export async function insertRecurringTransaction(userId, { kind, amount, category_id, note, occurred_on, recurring_id }) {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId, kind, amount, category_id: category_id || null,
      note: note || null, occurred_on, source: 'recurring', recurring_id,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { duplicate: true };
    console.error('[db] error.saveTransaction:', error);
    throw new Error('error.saveTransaction');
  }
  return { duplicate: false, data };
}

export async function updateTransaction(id, patch) {
  const res = await supabase
    .from('transactions')
    .update(patch)
    .eq('id', id)
    .select('id, kind, amount, category_id, note, occurred_on, source, created_at')
    .single();
  return assertOk(res, 'error.saveTransaction');
}

export async function deleteTransaction(id) {
  const res = await supabase.from('transactions').delete().eq('id', id);
  return assertOk(res, 'error.deleteTransaction');
}

/** כל התנועות של המשתמש, בלי הגבלת תאריך — לייצוא CSV מלא */
export async function fetchAllTransactions(userId) {
  const res = await supabase
    .from('transactions')
    .select('id, kind, amount, category_id, note, occurred_on, source, created_at')
    .eq('user_id', userId)
    .order('occurred_on', { ascending: true });
  return assertOk(res, 'error.loadData');
}

// ------------------------------------------------------------
// תנועות קבועות
// ------------------------------------------------------------
export async function fetchRecurringRules(userId) {
  const res = await supabase
    .from('recurring_rules')
    .select('id, kind, amount, category_id, note, day_of_month, start_on, end_on, is_active, last_generated_on')
    .eq('user_id', userId)
    .order('is_active', { ascending: false })
    .order('day_of_month', { ascending: true });
  return assertOk(res, 'error.loadData');
}

export async function insertRecurringRule(userId, rule) {
  const res = await supabase
    .from('recurring_rules')
    .insert({ user_id: userId, ...rule })
    .select('id, kind, amount, category_id, note, day_of_month, start_on, end_on, is_active, last_generated_on')
    .single();
  return assertOk(res, 'error.saveTransaction');
}

export async function updateRecurringRule(id, patch) {
  const res = await supabase
    .from('recurring_rules')
    .update(patch)
    .eq('id', id)
    .select('id, kind, amount, category_id, note, day_of_month, start_on, end_on, is_active, last_generated_on')
    .single();
  return assertOk(res, 'error.saveTransaction');
}

export async function deleteRecurringRule(id) {
  const res = await supabase.from('recurring_rules').delete().eq('id', id);
  return assertOk(res, 'error.deleteTransaction');
}

// ------------------------------------------------------------
// תזכורות (Web Push) — מכשיר אחד = שורה אחת, לפי endpoint
// ------------------------------------------------------------
export async function upsertPushSubscription(userId, { endpoint, p256dh, auth, lang }) {
  const res = await supabase
    .from('push_subscriptions')
    .upsert({ user_id: userId, endpoint, p256dh, auth, lang }, { onConflict: 'endpoint' });
  return assertOk(res, 'push.saveFailed');
}

export async function deletePushSubscription(endpoint) {
  const res = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  return assertOk(res, 'push.saveFailed');
}

export async function updatePushLang(endpoint, lang) {
  const res = await supabase.from('push_subscriptions').update({ lang }).eq('endpoint', endpoint);
  return assertOk(res, 'push.saveFailed');
}

// ------------------------------------------------------------
// דוחות חודשיים (כולל טקסט ה-AI)
// ------------------------------------------------------------
export async function fetchMonthlySummary(userId, year, month) {
  const res = await supabase
    .from('monthly_summaries')
    .select('totals, ai_text, generated_at')
    .eq('user_id', userId)
    .eq('period_year', year)
    .eq('period_month', month)
    .maybeSingle();
  return assertOk(res, 'error.loadData');
}

export async function upsertMonthlySummary(userId, year, month, { totals, ai_text }) {
  const res = await supabase
    .from('monthly_summaries')
    .upsert(
      { user_id: userId, period_year: year, period_month: month, totals, ai_text, generated_at: new Date().toISOString() },
      { onConflict: 'user_id,period_year,period_month' },
    )
    .select('totals, ai_text, generated_at')
    .single();
  return assertOk(res, 'error.saveTransaction');
}

// ------------------------------------------------------------
// הגדרות משתמש
// ------------------------------------------------------------
export async function fetchSettings(userId) {
  const res = await supabase
    .from('user_settings')
    .select('currency, locale, timezone, month_start_day')
    .eq('user_id', userId)
    .maybeSingle();
  return assertOk(res, 'error.loadData');
}
