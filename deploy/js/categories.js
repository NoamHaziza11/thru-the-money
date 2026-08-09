// ============================================================
// categories.js — ניהול קטגוריות: הוספה, עריכה, סידור, ארכוב.
// נפתח מתוך גיליון ההגדרות (recurring.js). קטגוריה בארכיון לא
// נעלמת — תנועות עבר ממשיכות להציג אותה, רק לא ניתן לבחור אותה
// עוד בהזנה חדשה (ראה fetchCategories מול fetchAllCategories).
// ============================================================

import { fetchAllCategories, insertCategory, updateCategory } from './db.js';
import { categoryName, loadCategories } from './transactions.js';
import { esc, openSheet, toast } from './ui.js';
import { t } from './i18n.js';

let cats = [];

function nextSortOrderFor(kind) {
  const list = cats.filter((c) => c.kind === kind);
  return list.length ? Math.max(...list.map((c) => c.sort_order)) + 10 : 10;
}

async function afterChange(userId, onChanged) {
  await loadCategories(userId); // מרענן את המטמון שמשמש בוררי קטגוריה במסכים הראשיים
  onChanged?.();
  await openCategoriesSheet(userId, onChanged); // חוזר לרשימה המעודכנת, לא סוגר לגמרי
}

function emptyRowHtml() {
  return `<p class="empty__text" style="padding:8px 0">${t('categories.empty')}</p>`;
}

function catRowHtml(cat) {
  if (cat.is_archived) {
    return `
      <div class="cat-mgmt-row is-archived" data-id="${cat.id}">
        <span class="cat-mgmt-row__icon" aria-hidden="true">${cat.icon}</span>
        <span class="cat-mgmt-row__name">${esc(categoryName(cat))}</span>
        <button class="cat-mgmt-row__restore" type="button" data-action="restore">${t('categories.restore')}</button>
      </div>`;
  }
  return `
    <div class="cat-mgmt-row" data-id="${cat.id}">
      <button class="cat-mgmt-row__main" type="button" data-action="edit">
        <span class="cat-mgmt-row__icon" aria-hidden="true">${cat.icon}</span>
        <span class="cat-mgmt-row__name">${esc(categoryName(cat))}</span>
      </button>
      <span class="cat-mgmt-row__reorder">
        <button type="button" data-action="up" aria-label="${t('categories.moveUp')}">▲</button>
        <button type="button" data-action="down" aria-label="${t('categories.moveDown')}">▼</button>
      </span>
    </div>`;
}

function bodyHtml() {
  const income = cats.filter((c) => c.kind === 'income' && !c.is_archived);
  const expense = cats.filter((c) => c.kind === 'expense' && !c.is_archived);
  const archived = cats.filter((c) => c.is_archived);

  return `
    <div class="cat-mgmt">
      <h3 class="screen__title" style="margin-top:0">${esc(t('categories.incomeHeader'))}</h3>
      <div class="cat-mgmt-list">${income.map(catRowHtml).join('') || emptyRowHtml()}</div>
      <button class="btn btn--income btn--block" id="cat-add-income" type="button">${t('categories.addIncome')}</button>

      <h3 class="screen__title">${esc(t('categories.expenseHeader'))}</h3>
      <div class="cat-mgmt-list">${expense.map(catRowHtml).join('') || emptyRowHtml()}</div>
      <button class="btn btn--expense btn--block" id="cat-add-expense" type="button">${t('categories.addExpense')}</button>

      ${archived.length ? `
      <button class="cat-mgmt-archived-toggle" id="cat-archived-toggle" type="button">${t('categories.showArchived')} (${archived.length})</button>
      <div class="cat-mgmt-list" id="cat-list-archived" hidden>${archived.map(catRowHtml).join('')}</div>
      ` : ''}
    </div>`;
}

export async function openCategoriesSheet(userId, onChanged) {
  cats = await fetchAllCategories(userId);

  openSheet({
    title: t('categories.title'),
    body: bodyHtml(),
    onOpen: (sheetEl) => {
      sheetEl.querySelectorAll('.cat-mgmt-row[data-id]').forEach((row) => {
        const cat = cats.find((c) => c.id === row.dataset.id);
        if (!cat) return;

        row.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
          openCategoryEditSheet(userId, cat, cat.kind, null, () => afterChange(userId, onChanged));
        });
        row.querySelector('[data-action="up"]')?.addEventListener('click', () => moveCategory(userId, cat, -1, onChanged));
        row.querySelector('[data-action="down"]')?.addEventListener('click', () => moveCategory(userId, cat, 1, onChanged));
        row.querySelector('[data-action="restore"]')?.addEventListener('click', async () => {
          try {
            await updateCategory(cat.id, { is_archived: false });
            toast(t('categories.saved'), 'ok');
            await afterChange(userId, onChanged);
          } catch (err) {
            toast(t(err.message), 'error');
          }
        });
      });

      sheetEl.querySelector('#cat-add-income')?.addEventListener('click', () => {
        openCategoryEditSheet(userId, null, 'income', nextSortOrderFor('income'), () => afterChange(userId, onChanged));
      });
      sheetEl.querySelector('#cat-add-expense')?.addEventListener('click', () => {
        openCategoryEditSheet(userId, null, 'expense', nextSortOrderFor('expense'), () => afterChange(userId, onChanged));
      });

      sheetEl.querySelector('#cat-archived-toggle')?.addEventListener('click', () => {
        const list = sheetEl.querySelector('#cat-list-archived');
        list.hidden = !list.hidden;
      });
    },
  });
}

async function moveCategory(userId, cat, direction, onChanged) {
  const siblings = cats
    .filter((c) => c.kind === cat.kind && !c.is_archived)
    .sort((a, b) => a.sort_order - b.sort_order);
  const idx = siblings.findIndex((c) => c.id === cat.id);
  const swapIdx = idx + direction;
  if (swapIdx < 0 || swapIdx >= siblings.length) return;
  const other = siblings[swapIdx];

  try {
    await Promise.all([
      updateCategory(cat.id, { sort_order: other.sort_order }),
      updateCategory(other.id, { sort_order: cat.sort_order }),
    ]);
    await afterChange(userId, onChanged);
  } catch (err) {
    toast(t(err.message), 'error');
  }
}

function openCategoryEditSheet(userId, existingCat, kind, nextSortOrder, onDone) {
  const isEdit = !!existingCat;
  const title = isEdit
    ? t('categories.editTitle')
    : t(kind === 'income' ? 'categories.newIncome' : 'categories.newExpense');

  const body = `
    <div class="cat-edit">
      <label class="field">
        <span class="field__label">${t('categories.iconLabel')}</span>
        <input class="field__input cat-edit__icon" id="cat-icon" type="text" maxlength="4" value="${esc(existingCat?.icon || '📌')}">
      </label>
      <label class="field">
        <span class="field__label">${t('categories.nameHeLabel')}</span>
        <input class="field__input" id="cat-name" type="text" maxlength="40" value="${esc(existingCat?.name || '')}" placeholder="${t('categories.nameHePlaceholder')}">
      </label>
      <label class="field">
        <span class="field__label">${t('categories.nameEnLabel')}</span>
        <input class="field__input" id="cat-name-en" type="text" maxlength="40" value="${esc(existingCat?.name_en || '')}" placeholder="${t('categories.nameEnPlaceholder')}">
      </label>

      <button class="btn btn--block" id="cat-save" type="button">${t('entry.save')}</button>
      ${isEdit ? `<button class="btn btn--ghost btn--block" id="cat-archive" type="button">${t('categories.archive')}</button>` : ''}
    </div>`;

  openSheet({
    title,
    body,
    onOpen: (sheetEl) => {
      const nameEl = sheetEl.querySelector('#cat-name');
      const nameEnEl = sheetEl.querySelector('#cat-name-en');
      const iconEl = sheetEl.querySelector('#cat-icon');
      const saveEl = sheetEl.querySelector('#cat-save');
      if (!isEdit) nameEl.focus();

      saveEl.addEventListener('click', async () => {
        const name = nameEl.value.trim();
        if (!name) { toast(t('categories.nameRequired'), 'error'); return; }

        saveEl.disabled = true;
        try {
          const patch = {
            name,
            name_en: nameEnEl.value.trim() || null,
            icon: iconEl.value.trim() || '📌',
          };
          const result = isEdit
            ? await updateCategory(existingCat.id, patch)
            : await insertCategory(userId, { ...patch, kind, sort_order: nextSortOrder });

          if (result.duplicate) {
            toast(t('categories.duplicateName'), 'error');
            saveEl.disabled = false;
            return;
          }
          toast(t('categories.saved'), 'ok');
          onDone(); // חוזר לרשימת הקטגוריות — לא סוגר את הגיליון, ראה afterChange
        } catch (err) {
          toast(t(err.message), 'error');
          saveEl.disabled = false;
        }
      });

      const archiveEl = sheetEl.querySelector('#cat-archive');
      archiveEl?.addEventListener('click', async () => {
        archiveEl.disabled = true;
        try {
          await updateCategory(existingCat.id, { is_archived: true });
          toast(t('categories.archived'), 'ok');
          onDone();
        } catch (err) {
          toast(t(err.message), 'error');
          archiveEl.disabled = false;
        }
      });
    },
  });
}
