// ============================================================
// charts.js — מסך "ניתוח": עוגת הוצאות, גרף 6 חודשים, טבלת קטגוריות.
// טוען חלון של 6 חודשים פעם אחת ומחשב הכל בצד הלקוח.
// ============================================================

import { Chart, registerables } from 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/+esm';
import { fetchTransactions } from './db.js';
import { getCategory, hasTransactionsThisPeriod } from './transactions.js';
import { $, esc, onScreenChange } from './ui.js';
import { periodRange, shiftPeriod, periodShortLabel, money, signedMoney, pct, dateLabel } from './format.js';
import { t } from './i18n.js';

Chart.register(...registerables);

// הגרפים לרוב נבנים בזמן שמסך "ניתוח" עדיין display:none (כדי שהמעבר
// אליו ירגיש מיידי) — Chart.js מודד גודל 0 בזמן היצירה ונשאר "עיוור"
// לזה גם אחרי שהמסך נהיה גלוי. resize() ידני כשהמסך מוצג פותר את זה.
onScreenChange((screen) => {
  if (screen !== 'analysis') return;
  pieChart?.resize();
  barChart?.resize();
});

// פלטה שנגזרת מהעיצוב הנוכחי — לא מהצבעים הישנים ששמורים בעמודת
// categories.color (אלה נזרעו לפני שהעיצוב השתנה לגמרי ולא עודכנו).
const CHART_COLORS = [
  '#1F6F5C', '#A63A2C', '#C98A2C', '#4A6FA5',
  '#8B5FBF', '#5A8F7B', '#B0793D', '#6B6F76',
];

let rangeTransactions = [];
let pieChart = null;
let barChart = null;
let selectedCategoryId = null;

export async function loadAnalysisData(userId, period) {
  const rangeStart = shiftPeriod(period, -5);
  const { from } = periodRange(rangeStart);
  const { to } = periodRange(period);
  rangeTransactions = await fetchTransactions(userId, { from, to, limit: 2000 });
}

function txInPeriod(p) {
  const { from, to } = periodRange(p);
  return rangeTransactions.filter((x) => x.occurred_on >= from && x.occurred_on <= to);
}

function sumByKind(txs, kind) {
  return txs.filter((x) => x.kind === kind).reduce((sum, x) => sum + Number(x.amount), 0);
}

function sumByCategory(txs, kind) {
  const map = new Map();
  txs.filter((x) => x.kind === kind).forEach((x) => {
    const key = x.category_id || 'none';
    map.set(key, (map.get(key) || 0) + Number(x.amount));
  });
  return map;
}

// ------------------------------------------------------------
// עוגת הוצאות
// ------------------------------------------------------------
function showPieDetail(categoryId, txs) {
  selectedCategoryId = categoryId;
  const host = $('#pie-detail');
  if (!categoryId) { host.innerHTML = ''; return; }

  const rows = txs.filter((x) => x.kind === 'expense' && (x.category_id || 'none') === categoryId);
  host.innerHTML = '<div class="txlist">' + rows.map((tx) => {
    const cat = getCategory(tx.category_id);
    const note = tx.note ? esc(tx.note) : '';
    const meta = note ? `${dateLabel(tx.occurred_on)} · ${note}` : dateLabel(tx.occurred_on);
    return `
      <div class="tx">
        <span class="tx__icon" aria-hidden="true">${cat?.icon || '📌'}</span>
        <span class="tx__body">
          <span class="tx__cat">${cat ? esc(cat.name) : ''}</span>
          <span class="tx__meta">${esc(meta)}</span>
        </span>
        <span class="tx__amount is-expense num">${signedMoney(tx.amount, 'expense')}</span>
      </div>`;
  }).join('') + '</div>';
}

function renderPie(period) {
  const txs = txInPeriod(period);
  const byCat = sumByCategory(txs, 'expense');
  const pieWrap = $('#pie-wrap');
  const pieEmpty = $('#pie-empty');

  if (byCat.size === 0) {
    pieWrap.hidden = true;
    pieEmpty.hidden = false;
    if (pieChart) { pieChart.destroy(); pieChart = null; }
    $('#pie-detail').innerHTML = '';
    return;
  }
  pieEmpty.hidden = true;
  pieWrap.hidden = false;

  const entries = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const labels = entries.map(([id]) => {
    const cat = getCategory(id);
    return cat ? `${cat.icon} ${cat.name}` : '?';
  });
  const data = entries.map(([, amt]) => amt);
  const colors = entries.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

  if (pieChart) pieChart.destroy();
  pieChart = new Chart($('#pie-canvas').getContext('2d'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { family: 'Rubik' } } },
      },
      onClick: (_evt, elements) => {
        if (!elements.length) return;
        const [id] = entries[elements[0].index];
        showPieDetail(id === selectedCategoryId ? null : id, txs);
      },
    },
  });

  showPieDetail(null, txs);
}

// ------------------------------------------------------------
// נכנס מול יצא — 6 חודשים
// ------------------------------------------------------------
function renderBar(period) {
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(shiftPeriod(period, -i));

  const labels = months.map(periodShortLabel);
  const incomeData = months.map((p) => sumByKind(txInPeriod(p), 'income'));
  const expenseData = months.map((p) => sumByKind(txInPeriod(p), 'expense'));

  if (barChart) barChart.destroy();
  barChart = new Chart($('#bar-canvas').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: t('balance.in'), data: incomeData, backgroundColor: '#1F6F5C', borderRadius: 4, maxBarThickness: 28 },
        { label: t('balance.out'), data: expenseData, backgroundColor: '#A63A2C', borderRadius: 4, maxBarThickness: 28 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { callback: (v) => '$' + v } },
      },
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'Rubik' } } },
      },
    },
  });
}

// ------------------------------------------------------------
// טבלת קטגוריות — סכום, אחוז, שינוי מול חודש קודם
// ------------------------------------------------------------
function renderTable(period) {
  const curTxs = txInPeriod(period);
  const prevByCat = sumByCategory(txInPeriod(shiftPeriod(period, -1)), 'expense');
  const curByCat = sumByCategory(curTxs, 'expense');
  const totalExpense = sumByKind(curTxs, 'expense');

  const entries = [...curByCat.entries()].sort((a, b) => b[1] - a[1]);
  const host = $('#category-table');

  host.innerHTML = entries.map(([id, amt]) => {
    const cat = getCategory(id);
    const share = pct(amt, totalExpense);
    const prevAmt = prevByCat.get(id) || 0;

    let deltaHtml;
    if (prevAmt === 0) {
      deltaHtml = `<span class="cat-row__delta is-new">${t('analysis.new')}</span>`;
    } else {
      const change = Math.round(((amt - prevAmt) / prevAmt) * 100);
      const cls = change > 0 ? 'is-up' : change < 0 ? 'is-down' : '';
      const sign = change > 0 ? '+' : '';
      deltaHtml = `<span class="cat-row__delta ${cls} num">${sign}${change}%</span>`;
    }

    return `
      <div class="cat-row">
        <span class="cat-row__icon" aria-hidden="true">${cat?.icon || '📌'}</span>
        <span class="cat-row__body">
          <span class="cat-row__name">${cat ? esc(cat.name) : ''}</span>
          <span class="cat-row__pct">${share}%</span>
        </span>
        <span class="cat-row__end">
          <span class="cat-row__amount num">${money(amt)}</span>
          ${deltaHtml}
        </span>
      </div>`;
  }).join('');
}

// ------------------------------------------------------------
// כניסה
// ------------------------------------------------------------
export function renderAnalysis(period) {
  const emptyEl = $('#analysis-empty');
  const contentEl = $('#analysis-content');

  if (!hasTransactionsThisPeriod()) {
    emptyEl.hidden = false;
    contentEl.hidden = true;
    return;
  }

  emptyEl.hidden = true;
  contentEl.hidden = false;

  renderPie(period);
  renderBar(period);
  renderTable(period);
}

// ------------------------------------------------------------
// דוח מספרי + נתוני קלט להמלצות AI — נקרא ממסך "סיכום" (summary.js).
// משתמש באותו rangeTransactions שכבר נטען — לא query נוסף.
// ------------------------------------------------------------

/** סה"כ נכנס/יצא, הקטגוריה הגדולה, והשינוי הגדול ביותר מול החודש הקודם */
export function computeSummary(period) {
  const curTxs = txInPeriod(period);
  const prevTxs = txInPeriod(shiftPeriod(period, -1));

  const income = sumByKind(curTxs, 'income');
  const expense = sumByKind(curTxs, 'expense');
  const curByCat = sumByCategory(curTxs, 'expense');
  const prevByCat = sumByCategory(prevTxs, 'expense');

  const catEntries = [...curByCat.entries()].sort((a, b) => b[1] - a[1]);
  const biggestCategory = catEntries[0]
    ? { category: getCategory(catEntries[0][0]), amount: catEntries[0][1] }
    : null;

  const allCatIds = new Set([...curByCat.keys(), ...prevByCat.keys()]);
  let biggestChange = null;
  for (const id of allCatIds) {
    const cur = curByCat.get(id) || 0;
    const prev = prevByCat.get(id) || 0;
    const delta = cur - prev;
    if (!biggestChange || Math.abs(delta) > Math.abs(biggestChange.delta)) {
      biggestChange = { category: getCategory(id), delta, cur, prev };
    }
  }

  return { income, expense, balance: income - expense, biggestCategory, biggestChange };
}

/** פירוט הוצאות לפי קטגוריה — לבניית הקלט להמלצות ה-AI */
export function getExpenseBreakdown(period) {
  const byCat = sumByCategory(txInPeriod(period), 'expense');
  return [...byCat.entries()]
    .map(([id, amount]) => ({ name: getCategory(id)?.name || '?', amount }))
    .sort((a, b) => b.amount - a.amount);
}
