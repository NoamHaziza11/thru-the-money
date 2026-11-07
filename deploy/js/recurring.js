// ============================================================
// recurring.js — תנועות קבועות: יצירה אוטומטית + ניהול הכללים.
// ============================================================

import {
  fetchRecurringRules, insertRecurringRule, updateRecurringRule, deleteRecurringRule,
  insertRecurringTransaction,
} from './db.js';
import { getAllCategories, getCategory, categoryName } from './transactions.js';
import { openCategoriesSheet } from './categories.js';
import { pushSectionHtml, wirePushSection } from './push.js';
import { $, esc, openSheet, closeSheet, toast } from './ui.js';
import { todayLA, shiftPeriod, money } from './format.js';
import { t } from './i18n.js';

function ymdToPeriod(ymd) {
  const [year, month] = ymd.split('-').map(Number);
  return { year, month };
}
function periodKey(p) { return p.year * 12 + p.month; }
function daysInMonth(year, month) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
function pad(n) { return String(n).padStart(2, '0'); }
function periodToOccurredOn(period, dayOfMonth) {
  const day = Math.min(dayOfMonth, daysInMonth(period.year, period.month));
  return `${period.year}-${pad(period.month)}-${pad(day)}`;
}

// ------------------------------------------------------------
// יצירה אוטומטית — רץ פעם אחת בכל התחברות/טעינה.
//
// משלים כל חודש שפוספס, לא רק את החודש הנוכחי: אם האפליקציה לא
// נפתחה חודשיים, עדיף שהתנועות של החודשים שביניהם ייווצרו בדיעבד
// מאשר שייעלמו. ראה CLAUDE.md §3.3 להחלטה המקורית.
// ------------------------------------------------------------
export async function runRecurringGeneration(userId) {
  const rules = await fetchRecurringRules(userId);
  const today = todayLA();
  const todayPeriod = ymdToPeriod(today);
  const todayDay = Number(today.split('-')[2]);

  for (const rule of rules) {
    if (!rule.is_active) continue;
    await processRule(userId, rule, todayPeriod, todayDay);
  }
}

async function processRule(userId, rule, todayPeriod, todayDay) {
  let cursor = rule.last_generated_on
    ? shiftPeriod(ymdToPeriod(rule.last_generated_on), 1)
    : ymdToPeriod(rule.start_on);

  const endPeriod = rule.end_on ? ymdToPeriod(rule.end_on) : null;
  let lastDone = null;

  while (periodKey(cursor) <= periodKey(todayPeriod)) {
    if (endPeriod && periodKey(cursor) > periodKey(endPeriod)) break;

    const isCurrentMonth = periodKey(cursor) === periodKey(todayPeriod);
    if (isCurrentMonth && todayDay < rule.day_of_month) break; // עוד לא הגענו ליום הזה החודש

    const occurred_on = periodToOccurredOn(cursor, rule.day_of_month);
    await insertRecurringTransaction(userId, {
      kind: rule.kind, amount: rule.amount, category_id: rule.category_id,
      note: rule.note, occurred_on, recurring_id: rule.id,
    });

    lastDone = { ...cursor };
    cursor = shiftPeriod(cursor, 1);
  }

  if (lastDone) {
    await updateRecurringRule(rule.id, { last_generated_on: `${lastDone.year}-${pad(lastDone.month)}-01` });
  }
}

// ------------------------------------------------------------
// גיליון "תנועה קבועה חדשה / עריכה" — אותו דפוס כמו entry sheet
// ------------------------------------------------------------
function catsGridHtml(kind, selectedId) {
  const cats = getAllCategories().filter((c) => c.kind === kind && !c.is_archived);
  return cats.map((c) => `
    <button class="catchip${c.id === selectedId ? ' is-selected' : ''}" type="button" data-id="${c.id}">
      <span class="catchip__icon" aria-hidden="true">${c.icon}</span>
      <span class="catchip__name">${esc(categoryName(c))}</span>
    </button>`).join('');
}

function openRuleSheet(userId, existingRule, kind, onChanged) {
  const isEdit = !!existingRule;
  const title = isEdit
    ? t('recurring.editTitle')
    : t(kind === 'income' ? 'recurring.newTitleIncome' : 'recurring.newTitleExpense');

  const body = `
    <div class="entry entry--${kind}">
      <div class="entry__amount-wrap">
        <span class="entry__currency">$</span>
        <input class="entry__amount num" id="rule-amount" type="text" inputmode="decimal" placeholder="0.00" autocomplete="off" value="${existingRule ? Number(existingRule.amount).toFixed(2) : ''}">
      </div>
      <div class="entry__cats">${catsGridHtml(kind, existingRule?.category_id ?? null)}</div>

      <label class="field">
        <span class="field__label">${t('recurring.dayOfMonth')}</span>
        <input class="field__input num" id="rule-day" type="number" min="1" max="31" step="1" value="${existingRule?.day_of_month ?? ''}">
      </label>

      <button class="entry__note-toggle" id="rule-note-toggle" type="button" ${existingRule?.note ? 'hidden' : ''}>${t('entry.addNote')}</button>
      <textarea class="entry__note" id="rule-note" rows="2" placeholder="${t('entry.notePlaceholder')}" ${existingRule?.note ? '' : 'hidden'}>${esc(existingRule?.note || '')}</textarea>

      <button class="btn btn--block entry__save" id="rule-save" type="button">${t('entry.save')}</button>
      ${isEdit ? `<button class="btn btn--ghost btn--block entry__delete" id="rule-delete" type="button">${t('edit.delete')}</button>` : ''}
    </div>`;

  let selectedCat = existingRule?.category_id ?? null;

  openSheet({
    title,
    body,
    onOpen: (sheetEl) => {
      const amountEl = sheetEl.querySelector('#rule-amount');
      const dayEl = sheetEl.querySelector('#rule-day');
      const saveEl = sheetEl.querySelector('#rule-save');
      if (!isEdit) amountEl.focus();

      sheetEl.querySelectorAll('.catchip').forEach((chip) => {
        chip.addEventListener('click', () => {
          sheetEl.querySelectorAll('.catchip').forEach((c) => c.classList.remove('is-selected'));
          chip.classList.add('is-selected');
          selectedCat = chip.dataset.id;
        });
      });

      const noteToggle = sheetEl.querySelector('#rule-note-toggle');
      noteToggle?.addEventListener('click', () => {
        const noteEl = sheetEl.querySelector('#rule-note');
        noteEl.hidden = false;
        noteToggle.hidden = true;
        noteEl.focus();
      });

      saveEl.addEventListener('click', async () => {
        const amount = parseFloat(amountEl.value);
        const day = parseInt(dayEl.value, 10);
        if (!(amount > 0) || !selectedCat || !(day >= 1 && day <= 31)) return;

        saveEl.disabled = true;
        try {
          const patch = {
            kind, amount, category_id: selectedCat, day_of_month: day,
            note: sheetEl.querySelector('#rule-note').value.trim() || null,
          };
          if (isEdit) {
            await updateRecurringRule(existingRule.id, patch);
          } else {
            await insertRecurringRule(userId, { ...patch, start_on: todayLA(), is_active: true });
            // אם היום בחודש כבר עבר, המשתמש מצפה לראות את התנועה של
            // החודש הנוכחי מיד — לא לחכות להתחברות הבאה.
            await runRecurringGeneration(userId);
          }
          closeSheet();
          toast(t('recurring.saved'), 'ok');
          onChanged();
        } catch (err) {
          toast(t(err.message), 'error');
          saveEl.disabled = false;
        }
      });

      const deleteEl = sheetEl.querySelector('#rule-delete');
      let armed = false;
      let armTimer = null;
      deleteEl?.addEventListener('click', async () => {
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
          await deleteRecurringRule(existingRule.id);
          closeSheet();
          toast(t('edit.deleted'), 'ok');
          onChanged();
        } catch (err) {
          toast(t(err.message), 'error');
          deleteEl.disabled = false;
        }
      });
    },
  });
}

// ------------------------------------------------------------
// גיליון ההגדרות — רשימת כל הכללים + הוספה
// ------------------------------------------------------------
function ruleRowHtml(rule) {
  const cat = getCategory(rule.category_id);
  const amountClass = rule.kind === 'income' ? 'is-income' : 'is-expense';
  const meta = `${t('recurring.everyMonthOn')} ${rule.day_of_month}` + (rule.is_active ? '' : ` · ${t('recurring.inactive')}`);
  return `
    <button class="tx" type="button" data-id="${rule.id}" style="${rule.is_active ? '' : 'opacity:.55'}">
      <span class="tx__icon" aria-hidden="true">${cat?.icon || '📌'}</span>
      <span class="tx__body">
        <span class="tx__cat">${cat ? esc(categoryName(cat)) : ''}</span>
        <span class="tx__meta">${esc(meta)}</span>
      </span>
      <span class="tx__amount ${amountClass} num">${money(rule.amount)}</span>
    </button>`;
}

async function renderRulesList(userId, host, onRuleChanged) {
  const rules = await fetchRecurringRules(userId);
  if (!rules.length) {
    host.innerHTML = `<p class="empty__text" style="padding:8px 0">${t('recurring.empty')}</p>`;
    return;
  }
  host.innerHTML = '<div class="txlist">' + rules.map(ruleRowHtml).join('') + '</div>';
  host.querySelectorAll('.tx').forEach((el) => {
    el.addEventListener('click', () => {
      const rule = rules.find((r) => r.id === el.dataset.id);
      openRuleSheet(userId, rule, rule.kind, async () => {
        await renderRulesList(userId, host, onRuleChanged);
        onRuleChanged?.();
      });
    });
  });
}

/**
 * @param {Function} [onRuleChanged] נקרא אחרי כל שינוי בכלל (הוספה/עריכה/
 *   מחיקה) כדי שהמסכים הראשיים (יתרה, רשימה, ניתוח, סיכום) יתעדכנו —
 *   הוספת כלל יכולה ליצור מיד תנועה לחודש הנוכחי (ראה openRuleSheet).
 */
export function openSettingsSheet(userId, onRuleChanged) {
  const body = `
    <div class="settings">
      <h3 class="screen__title" style="margin-top:0" data-i18n="recurring.title">${esc(t('recurring.title'))}</h3>
      <div id="rules-list"></div>
      <div class="settings__add-row">
        <button class="btn btn--income" id="rule-add-income" type="button">${t('recurring.newIncome')}</button>
        <button class="btn btn--expense" id="rule-add-expense" type="button">${t('recurring.newExpense')}</button>
      </div>

      <h3 class="screen__title" data-i18n="categories.sectionTitle">${esc(t('categories.sectionTitle'))}</h3>
      <button class="btn btn--ghost btn--block" id="manage-categories-btn" type="button">${t('categories.manageBtn')}</button>

      ${pushSectionHtml()}
    </div>`;

  openSheet({
    title: t('settings.title'),
    body,
    onOpen: (sheetEl) => {
      const host = sheetEl.querySelector('#rules-list');
      renderRulesList(userId, host, onRuleChanged);

      const afterAdd = async () => {
        await renderRulesList(userId, host, onRuleChanged);
        onRuleChanged?.();
      };
      sheetEl.querySelector('#rule-add-income').addEventListener('click', () => {
        openRuleSheet(userId, null, 'income', afterAdd);
      });
      sheetEl.querySelector('#rule-add-expense').addEventListener('click', () => {
        openRuleSheet(userId, null, 'expense', afterAdd);
      });

      sheetEl.querySelector('#manage-categories-btn').addEventListener('click', () => {
        openCategoriesSheet(userId, onRuleChanged);
      });

      wirePushSection(sheetEl, userId);
    },
  });
}
