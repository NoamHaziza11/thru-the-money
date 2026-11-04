// ============================================================
// transactions.js — הלב: הזנה, רשימה, כרטיס יתרה.
// כל הלוגיקה העסקית של תנועות חיה כאן; app.js רק מחווט אירועים.
// ============================================================

import {
  fetchCategories, fetchTransactions,
  insertTransaction, updateTransaction, deleteTransaction,
} from './db.js';
import { $, esc, openSheet, closeSheet, toast, animateNumber } from './ui.js';
import { periodRange, money, signedMoney, pct, dateLabel, todayLA } from './format.js';
import { t, getLang } from './i18n.js';

let categories = [];
let transactions = [];

// ------------------------------------------------------------
// טעינה
// ------------------------------------------------------------
export async function loadCategories(userId) {
  categories = await fetchCategories(userId);
  return categories;
}

export async function loadPeriodTransactions(userId, period) {
  const { from, to } = periodRange(period);
  transactions = await fetchTransactions(userId, { from, to });
  return transactions;
}

function categoriesByKind(kind) {
  return categories.filter((c) => c.kind === kind && !c.is_archived);
}

function findCategory(id) {
  return categories.find((c) => c.id === id);
}

/** נגישים למודולים אחרים (charts.js) בלי לטעון שוב מהמסד */
export function getCategory(id) { return findCategory(id); }
export function getAllCategories() { return categories; }
export function hasTransactionsThisPeriod() { return transactions.length > 0; }

/** שם הקטגוריה בשפה הנוכחית — נופל חזרה לעברית אם אין תרגום אנגלי */
export function categoryName(cat) {
  if (!cat) return '';
  return getLang() === 'en' && cat.name_en ? cat.name_en : cat.name;
}

// ------------------------------------------------------------
// כרטיס היתרה — נכנס/יצא/נשאר + מד ההוצאות
// ------------------------------------------------------------
export function renderBalanceCard() {
  const income = transactions
    .filter((x) => x.kind === 'income')
    .reduce((sum, x) => sum + Number(x.amount), 0);
  const expense = transactions
    .filter((x) => x.kind === 'expense')
    .reduce((sum, x) => sum + Number(x.amount), 0);
  const balance = income - expense;
  const spendPct = pct(expense, income);

  const amountEl = $('#balance-amount');
  animateNumber(amountEl, balance, money);
  amountEl.classList.toggle('is-negative', balance < 0);
  animateNumber($('#balance-in'), income, money);
  animateNumber($('#balance-out'), expense, money);
  $('#meter-fill').style.setProperty('--fill', spendPct + '%');
  $('#meter-pct').textContent = spendPct + '%';
  $('#meter').classList.toggle('is-hot', spendPct >= 90);
}

// ------------------------------------------------------------
// רשימת תנועות — מסך "היום"
// ------------------------------------------------------------
let activeCategoryFilter = null; // null = הכל

export function resetCategoryFilter() { activeCategoryFilter = null; }

function txRowHtml(tx) {
  const cat = findCategory(tx.category_id);
  const icon = cat ? cat.icon : '📌';
  const name = cat ? esc(categoryName(cat)) : '';
  const note = tx.note ? esc(tx.note) : '';
  const meta = note ? `${dateLabel(tx.occurred_on)} · ${note}` : dateLabel(tx.occurred_on);
  const amountClass = tx.kind === 'income' ? 'is-income' : 'is-expense';

  return `
    <div class="tx-swipe" data-id="${tx.id}">
      <button class="tx-swipe__delete" type="button">${t('edit.delete')}</button>
      <button class="tx" type="button">
        <span class="tx__icon" aria-hidden="true">${icon}</span>
        <span class="tx__body">
          <span class="tx__cat">${name}</span>
          <span class="tx__meta">${esc(meta)}</span>
        </span>
        <span class="tx__amount ${amountClass} num">${signedMoney(tx.amount, tx.kind)}</span>
      </button>
    </div>`;
}

/** לוגית: לפי dir הנוכחי (RTL/LTR), לאיזה כיוון "גרירה לסוף" מותרת */
function dirSign() {
  return document.documentElement.dir === 'rtl' ? -1 : 1;
}

function attachSwipeToDelete(wrapEl, onChanged) {
  const rowEl = wrapEl.querySelector('.tx');
  const delEl = wrapEl.querySelector('.tx-swipe__delete');
  const THRESHOLD = 76;
  let startX = 0;
  let dx = 0;
  let dragging = false;
  let wasDragged = false;

  rowEl.addEventListener('pointerdown', (e) => {
    dragging = true;
    wasDragged = false;
    startX = e.clientX;
    rowEl.setPointerCapture(e.pointerId);
    rowEl.style.transition = 'none';
  });

  rowEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const raw = e.clientX - startX;
    if (Math.abs(raw) > 8) wasDragged = true;
    dx = raw * dirSign() > 0 ? Math.min(Math.abs(raw), THRESHOLD) * dirSign() : 0;
    rowEl.style.transform = `translateX(${dx}px)`;
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    rowEl.style.transition = '';
    const revealed = Math.abs(dx) > THRESHOLD * 0.55;
    rowEl.style.transform = revealed ? `translateX(${dirSign() * THRESHOLD}px)` : '';
  }
  rowEl.addEventListener('pointerup', endDrag);
  rowEl.addEventListener('pointercancel', endDrag);

  rowEl.addEventListener('click', () => {
    if (wasDragged) { wasDragged = false; return; }
    attachSwipeToDelete._onRowClick(wrapEl.dataset.id);
  });

  delEl.addEventListener('click', async () => {
    try {
      await deleteTransaction(wrapEl.dataset.id);
      toast(t('edit.deleted'), 'ok');
      onChanged();
    } catch (err) {
      toast(t(err.message), 'error');
    }
  });
}

export function renderTransactionList(onRowClick, onChanged) {
  attachSwipeToDelete._onRowClick = onRowClick;

  const listEl = $('#today-txlist');
  const emptyEl = $('#today-empty');

  if (!transactions.length) {
    listEl.hidden = true;
    listEl.innerHTML = '';
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  const filtered = activeCategoryFilter
    ? transactions.filter((x) => x.category_id === activeCategoryFilter)
    : transactions;

  listEl.hidden = false;
  listEl.innerHTML = filtered.length
    ? filtered.map(txRowHtml).join('')
    : `<p class="empty__text" style="padding:24px 0;text-align:center">${t('today.emptyTitle')}</p>`;

  listEl.querySelectorAll('.tx-swipe').forEach((wrap) => attachSwipeToDelete(wrap, onChanged));
}

// ------------------------------------------------------------
// שורת סינון קטגוריות — רק קטגוריות שיש להן תנועה החודש
// ------------------------------------------------------------
export function renderCategoryFilterChips(onChange) {
  const host = $('#category-filter');
  if (!host) return;

  const usedIds = new Set(transactions.map((x) => x.category_id).filter(Boolean));
  const usedCats = categories.filter((c) => usedIds.has(c.id));

  if (!usedCats.length) {
    host.hidden = true;
    host.innerHTML = '';
    return;
  }
  host.hidden = false;

  const allChip = `<button class="filter-chip${activeCategoryFilter === null ? ' is-active' : ''}" type="button" data-id="">${t('today.filterAll')}</button>`;
  const chips = usedCats.map((c) => `
    <button class="filter-chip${activeCategoryFilter === c.id ? ' is-active' : ''}" type="button" data-id="${c.id}">
      <span class="filter-chip__icon" aria-hidden="true">${c.icon}</span>${esc(categoryName(c))}
    </button>`).join('');

  host.innerHTML = allChip + chips;
  host.querySelectorAll('.filter-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeCategoryFilter = btn.dataset.id || null;
      renderCategoryFilterChips(onChange);
      onChange();
    });
  });
}

// ------------------------------------------------------------
// גיליון קטגוריות — משותף בין הזנה חדשה לעריכה
// ------------------------------------------------------------
function catsGridHtml(kind, selectedId) {
  const cats = categoriesByKind(kind);
  if (!cats.length) return `<p class="entry__nocats">${t('entry.noCategories')}</p>`;

  return cats.map((c) => `
    <button class="catchip${c.id === selectedId ? ' is-selected' : ''}" type="button" data-id="${c.id}">
      <span class="catchip__icon" aria-hidden="true">${c.icon}</span>
      <span class="catchip__name">${esc(categoryName(c))}</span>
    </button>`).join('');
}

function wireCatsGrid(sheetEl, onSelect) {
  sheetEl.querySelectorAll('.catchip').forEach((chip) => {
    chip.addEventListener('click', () => {
      sheetEl.querySelectorAll('.catchip').forEach((c) => c.classList.remove('is-selected'));
      chip.classList.add('is-selected');
      onSelect(chip.dataset.id);
    });
  });
}

function wireNoteToggle(sheetEl) {
  const toggle = sheetEl.querySelector('#entry-note-toggle');
  toggle?.addEventListener('click', () => {
    const noteEl = sheetEl.querySelector('#entry-note');
    noteEl.hidden = false;
    toggle.hidden = true;
    noteEl.focus();
  });
}

// ------------------------------------------------------------
// הזנה חדשה — היעד: 3 שניות מלחיצה לשמירה
// ------------------------------------------------------------
export function openEntrySheet(kind, userId, period, onChanged) {
  const title = t(kind === 'income' ? 'entry.titleIncome' : 'entry.titleExpense');

  const body = `
    <div class="entry entry--${kind}">
      <div class="entry__amount-wrap">
        <span class="entry__currency">$</span>
        <input class="entry__amount num" id="entry-amount" type="text" inputmode="decimal" placeholder="0.00" autocomplete="off">
      </div>
      <div class="entry__cats">${catsGridHtml(kind, null)}</div>
      <button class="entry__note-toggle" id="entry-note-toggle" type="button">${t('entry.addNote')}</button>
      <textarea class="entry__note" id="entry-note" rows="2" placeholder="${t('entry.notePlaceholder')}" hidden></textarea>
      <input type="date" class="entry__date-input num" id="entry-date" value="${todayLA()}">
      <button class="btn btn--block entry__save" id="entry-save" type="button" disabled>${t('entry.save')}</button>
    </div>`;

  let selectedCat = null;

  openSheet({
    title,
    body,
    onOpen: (sheetEl) => {
      const amountEl = sheetEl.querySelector('#entry-amount');
      const saveEl = sheetEl.querySelector('#entry-save');
      amountEl.focus();

      const refreshSave = () => {
        saveEl.disabled = !(parseFloat(amountEl.value) > 0 && selectedCat);
      };
      amountEl.addEventListener('input', refreshSave);
      wireCatsGrid(sheetEl, (id) => { selectedCat = id; refreshSave(); });
      wireNoteToggle(sheetEl);

      saveEl.addEventListener('click', async () => {
        saveEl.disabled = true;
        try {
          await insertTransaction(userId, {
            kind,
            amount: parseFloat(amountEl.value),
            category_id: selectedCat,
            note: sheetEl.querySelector('#entry-note').value.trim(),
            occurred_on: sheetEl.querySelector('#entry-date').value || todayLA(),
          });
          closeSheet();
          toast(t('entry.saved'), 'ok');
          await loadPeriodTransactions(userId, period);
          onChanged();
        } catch (err) {
          toast(t(err.message), 'error');
          saveEl.disabled = false;
        }
      });
    },
  });
}

// ------------------------------------------------------------
// עריכת תנועה קיימת — כולל מחיקה עם אישור בלחיצה כפולה
// ------------------------------------------------------------
export function openEditSheet(txId, userId, period, onChanged) {
  const tx = transactions.find((x) => x.id === txId);
  if (!tx) return;

  const hasNote = !!tx.note;
  const body = `
    <div class="entry entry--${tx.kind}">
      <div class="entry__amount-wrap">
        <span class="entry__currency">$</span>
        <input class="entry__amount num" id="entry-amount" type="text" inputmode="decimal" value="${Number(tx.amount).toFixed(2)}" autocomplete="off">
      </div>
      <div class="entry__cats">${catsGridHtml(tx.kind, tx.category_id)}</div>
      <button class="entry__note-toggle" id="entry-note-toggle" type="button" ${hasNote ? 'hidden' : ''}>${t('entry.addNote')}</button>
      <textarea class="entry__note" id="entry-note" rows="2" placeholder="${t('entry.notePlaceholder')}" ${hasNote ? '' : 'hidden'}>${esc(tx.note || '')}</textarea>
      <input type="date" class="entry__date-input num" id="entry-date" value="${tx.occurred_on}">
      <button class="btn btn--block entry__save" id="entry-save" type="button">${t('entry.save')}</button>
      <button class="btn btn--ghost btn--block entry__delete" id="entry-delete" type="button">${t('edit.delete')}</button>
    </div>`;

  let selectedCat = tx.category_id;

  openSheet({
    title: t('edit.title'),
    body,
    onOpen: (sheetEl) => {
      const amountEl = sheetEl.querySelector('#entry-amount');
      const saveEl = sheetEl.querySelector('#entry-save');
      const deleteEl = sheetEl.querySelector('#entry-delete');

      wireCatsGrid(sheetEl, (id) => { selectedCat = id; });
      wireNoteToggle(sheetEl);

      saveEl.addEventListener('click', async () => {
        saveEl.disabled = true;
        try {
          await updateTransaction(tx.id, {
            amount: parseFloat(amountEl.value),
            category_id: selectedCat,
            note: sheetEl.querySelector('#entry-note').value.trim() || null,
            occurred_on: sheetEl.querySelector('#entry-date').value || tx.occurred_on,
          });
          closeSheet();
          toast(t('edit.saved'), 'ok');
          await loadPeriodTransactions(userId, period);
          onChanged();
        } catch (err) {
          toast(t(err.message), 'error');
          saveEl.disabled = false;
        }
      });

      // מחיקה דורשת שתי לחיצות — מונע מחיקה בטעות בלי לפתוח דיאלוג נוסף
      let armed = false;
      let armTimer = null;
      deleteEl.addEventListener('click', async () => {
        if (!armed) {
          armed = true;
          deleteEl.textContent = t('edit.confirmDelete');
          deleteEl.classList.replace('btn--ghost', 'btn--expense');
          armTimer = setTimeout(() => {
            armed = false;
            deleteEl.textContent = t('edit.delete');
            deleteEl.classList.replace('btn--expense', 'btn--ghost');
          }, 3000);
          return;
        }
        clearTimeout(armTimer);
        deleteEl.disabled = true;
        try {
          await deleteTransaction(tx.id);
          closeSheet();
          toast(t('edit.deleted'), 'ok');
          await loadPeriodTransactions(userId, period);
          onChanged();
        } catch (err) {
          toast(t(err.message), 'error');
          deleteEl.disabled = false;
        }
      });
    },
  });
}
