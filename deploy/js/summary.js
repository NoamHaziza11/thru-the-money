// ============================================================
// summary.js — מסך "סיכום": דוח מספרי, המלצות AI, ייצוא CSV.
// ============================================================

import { supabase, fetchAllTransactions, fetchMonthlySummary, upsertMonthlySummary } from './db.js';
import { hasTransactionsThisPeriod, getAllCategories } from './transactions.js';
import { computeSummary, getExpenseBreakdown } from './charts.js';
import { openSettingsSheet } from './recurring.js';
import { $, esc, toast } from './ui.js';
import { money, periodLabel, todayLA } from './format.js';
import { t, getLang } from './i18n.js';

let currentAiText = '';

// ------------------------------------------------------------
// דוח מספרי
// ------------------------------------------------------------
function renderReport(period) {
  const s = computeSummary(period);

  $('#report-in').textContent = money(s.income);
  $('#report-out').textContent = money(s.expense);
  $('#report-balance').textContent = money(s.balance);
  $('#report-balance').classList.toggle('is-negative', s.balance < 0);

  // הסכום עטוף ב-span עם class="num" (direction:ltr; unicode-bidi:isolate)
  // כדי שסימן ה-+/− לא "יברח" כשהוא צמוד לטקסט עברי (שם הקטגוריה) —
  // בלי בידוד כזה אלגוריתם ה-bidi מזיז את הסימן לצד הלא נכון.
  $('#report-biggest-cat').innerHTML = s.biggestCategory
    ? `${s.biggestCategory.category?.icon || ''} ${esc(s.biggestCategory.category?.name || '')} — <span class="num">${money(s.biggestCategory.amount)}</span>`
    : '—';

  if (s.biggestChange && Math.abs(s.biggestChange.delta) > 0.005) {
    const sign = s.biggestChange.delta > 0 ? '+' : '';
    $('#report-biggest-change').innerHTML =
      `${s.biggestChange.category?.icon || ''} ${esc(s.biggestChange.category?.name || '')} — <span class="num">${sign}${money(s.biggestChange.delta)}</span>`;
  } else {
    $('#report-biggest-change').textContent = t('summary.noChange');
  }

  return s;
}

// ------------------------------------------------------------
// המלצות AI — נוצרות בלחיצה, נשמרות ב-monthly_summaries, לא
// נקראות מחדש מה-API בכל טעינה אלא אם המשתמש מבקש רענון מפורש.
// ------------------------------------------------------------
function renderAiText(text) {
  currentAiText = text || '';
  const host = $('#ai-text');
  if (!currentAiText) { host.innerHTML = ''; return; }
  host.innerHTML = currentAiText
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => `<p class="ai-line">${esc(line.trim())}</p>`)
    .join('');
}

function renderAiButton() {
  $('#ai-btn').textContent = t(currentAiText ? 'summary.aiRegenerate' : 'summary.aiGenerate');
}

async function generateAi(userId, period, stats) {
  const btn = $('#ai-btn');
  btn.disabled = true;
  btn.textContent = t('summary.aiGenerating');

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/.netlify/functions/monthly-summary', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        periodLabel: periodLabel(period),
        lang: getLang(),
        totalIn: stats.income,
        totalOut: stats.expense,
        byCategory: getExpenseBreakdown(period),
      }),
    });
    if (!res.ok) throw new Error('bad_response');
    const { text } = await res.json();

    renderAiText(text);
    await upsertMonthlySummary(userId, period.year, period.month, {
      totals: { income: stats.income, expense: stats.expense, balance: stats.balance },
      ai_text: text,
    });
  } catch (err) {
    toast(t('summary.aiError'), 'error');
  } finally {
    btn.disabled = false;
    renderAiButton();
  }
}

// ------------------------------------------------------------
// ייצוא CSV — כל התנועות, לא רק החודש הנוכחי (SPEC §3: "ייצוא מלא")
// ------------------------------------------------------------
function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function exportCsv(userId) {
  let rows;
  try {
    rows = await fetchAllTransactions(userId);
  } catch (err) {
    toast(t(err.message), 'error');
    return;
  }
  if (!rows.length) { toast(t('summary.exportEmpty')); return; }

  const categories = getAllCategories();
  const catName = (id) => categories.find((c) => c.id === id)?.name || '';

  const header = ['date', 'kind', 'amount', 'category', 'note', 'source'];
  const lines = [header.join(',')];
  for (const tx of rows) {
    const fields = [
      tx.occurred_on, tx.kind, Number(tx.amount).toFixed(2),
      catName(tx.category_id), tx.note || '', tx.source,
    ].map(csvEscape);
    lines.push(fields.join(','));
  }

  // ﻿ (BOM) כדי ש-Excel יזהה UTF-8 נכון — בלי זה עברית מוצגת כג'יבריש
  const BOM = String.fromCharCode(0xFEFF);
  const blob = new Blob([BOM + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `thru-the-money-${todayLA()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------
// כניסה
// ------------------------------------------------------------
// .onclick= ולא addEventListener: handleSession() ב-app.js עלול לרוץ
// יותר מפעם אחת לאותה התחברות (Supabase יורה כמה אירועים לפעמים) —
// עם addEventListener היינו מצטברים למאזינים כפולים.
export function initSummary(userId, onRuleChanged) {
  $('#settings-btn').onclick = () => openSettingsSheet(userId, onRuleChanged);
  $('#export-csv-btn').onclick = () => exportCsv(userId);
}

export async function renderSummary(userId, period) {
  const emptyEl = $('#summary-empty');
  const contentEl = $('#summary-content');

  if (!hasTransactionsThisPeriod()) {
    emptyEl.hidden = false;
    contentEl.hidden = true;
    return;
  }
  emptyEl.hidden = true;
  contentEl.hidden = false;

  const stats = renderReport(period);

  let cachedAiText = '';
  try {
    const cached = await fetchMonthlySummary(userId, period.year, period.month);
    cachedAiText = cached?.ai_text || '';
  } catch {
    // לא קריטי — פשוט לא יוצג טקסט שמור, המשתמש יכול ליצור אחד חדש
  }
  renderAiText(cachedAiText);
  renderAiButton();

  $('#ai-btn').onclick = () => generateAi(userId, period, stats);
}
