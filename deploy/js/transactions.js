// ============================================================
// transactions.js — הלב: הזנה, רשימה, כרטיס יתרה.
// כל הלוגיקה העסקית של תנועות חיה כאן; app.js רק מחווט אירועים.
// ============================================================

import {
  fetchCategories, fetchTransactions,
  insertTransaction, updateTransaction, deleteTransaction,
} from './db.js';
import { $, esc, openSheet, closeSheet, toast } from './ui.js';
import { periodRange, money, signedMoney, pct, dateLabel, todayLA } from './format.js';
import { t } from './i18n.js';

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
  return categories.filter((c) => c.kind === kind);
}

function findCategory(id) {
  return categories.find((c) => c.id === id);
}

/** נגישים למודולים אחרים (charts.js) בלי לטעון שוב מהמסד */
export function getCategory(id) { return findCategory(id); }
export function getAllCategories() { return categories; }
export function hasTransactionsThisPeriod() { return transactions.length > 0; }

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
  amountEl.textContent = money(balance);
  amountEl.classList.toggle('is-negative', balance < 0);
  $('#balance-in').textContent = money(income);
  $('#balance-out').textContent = money(expense);
  $('#meter-fill').style.setProperty('--fill', spendPct + '%');
  $('#meter-pct').textContent = spendPct + '%';
  $('#meter').classList.toggle('is-hot', spendPct >= 90);
}

// ------------------------------------------------------------
// רשימת תנועות — מסך "היום"
// ------------------------------------------------------------
function txRowHtml(tx) {
  const cat = findCategory(tx.category_id);
  const icon = cat ? cat.icon : '📌';
  const name = cat ? esc(cat.name) : '';
  const note = tx.note ? esc(tx.note) : '';
  const meta = note ? `${dateLabel(tx.occurred_on)} · ${note}` : dateLabel(tx.occurred_on);
  const amountClass = tx.kind === 'income' ? 'is-income' : 'is-expense';

  return `
    <button class="tx" type="button" data-id="${tx.id}">
      <span class="tx__icon" aria-hidden="true">${icon}</span>
      <span class="tx__body">
        <span class="tx__cat">${name}</span>
        <span class="tx__meta">${esc(meta)}</span>
      </span>
      <span class="tx__amount ${amountClass} num">${signedMoney(tx.amount, tx.kind)}</span>
    </button>`;
}

export function renderTransactionList(onRowClick) {
  const listEl = $('#today-txlist');
  const emptyEl = $('#today-empty');

  if (!transactions.length) {
    listEl.hidden = true;
    listEl.innerHTML = '';
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;
  listEl.hidden = false;
  listEl.innerHTML = transactions.map(txRowHtml).join('');
  listEl.querySelectorAll('.tx').forEach((el) => {
    el.addEventListener('click', () => onRowClick(el.dataset.id));
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
      <span class="catchip__name">${esc(c.name)}</span>
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
