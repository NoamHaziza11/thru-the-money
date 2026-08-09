// ============================================================
// ui.js — ניווט, גיליונות תחתונים, טוסטים
// אין כאן לוגיקה עסקית. רק הצגה.
// ============================================================

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** מונע הזרקת HTML מטקסט שהמשתמש הקליד (הערות, שמות קטגוריות) */
export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ------------------------------------------------------------
// ניווט בין המסכים
// ------------------------------------------------------------
let activeScreen = 'today';
const screenListeners = new Set();

export function onScreenChange(cb) { screenListeners.add(cb); }
export function currentScreen() { return activeScreen; }

export function showScreen(name) {
  activeScreen = name;

  $$('.screen').forEach((el) => {
    const on = el.dataset.screen === name;
    el.classList.toggle('is-active', on);
    el.toggleAttribute('hidden', !on);
  });

  $$('.tab').forEach((el) => {
    const on = el.dataset.target === name;
    el.classList.toggle('is-active', on);
    el.setAttribute('aria-current', on ? 'page' : 'false');
  });

  // כפתורי ההכנסה/הוצאה שייכים למסך "היום" בלבד
  const actions = $('#quick-actions');
  if (actions) actions.hidden = name !== 'today';

  document.querySelector('.main')?.scrollTo({ top: 0 });
  screenListeners.forEach((cb) => cb(name));
}

// ------------------------------------------------------------
// אנימציית מספר עולה — "רגע האיכות" של כרטיס היתרה. מכבד
// prefers-reduced-motion (קופצת ישר לערך הסופי, בלי אנימציה).
// ------------------------------------------------------------
function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * מעדכן אלמנט מהערך המספרי האחרון שהוצג בו (נשמר ב-data-raw-value)
 * אל ערך יעד חדש, באנימציה חלקה. formatter הופך מספר-ביניים לטקסט.
 */
export function animateNumber(el, toValue, formatter, duration = 700) {
  const from = Number(el.dataset.rawValue ?? 0);
  el.dataset.rawValue = String(toValue);

  if (prefersReducedMotion() || from === toValue) {
    el.textContent = formatter(toValue);
    return;
  }

  const start = performance.now();
  const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    el.textContent = formatter(from + (toValue - from) * easeOutExpo(progress));
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ------------------------------------------------------------
// טוסט
// ------------------------------------------------------------
export function toast(message, variant = '') {
  const host = $('#toast-host');
  if (!host) return;

  const el = document.createElement('div');
  el.className = 'toast' + (variant ? ` toast--${variant}` : '');
  el.setAttribute('role', variant === 'error' ? 'alert' : 'status');
  el.textContent = message;
  host.appendChild(el);

  setTimeout(() => {
    el.style.transition = 'opacity 200ms';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 220);
  }, 2600);
}

// ------------------------------------------------------------
// גיליון תחתון
// ------------------------------------------------------------
let lastFocused = null;

export function openSheet({ title, body, onOpen }) {
  const backdrop = $('#sheet-backdrop');
  const sheet = $('#sheet');
  lastFocused = document.activeElement;

  $('#sheet-title').textContent = title;
  $('#sheet-body').innerHTML = body;

  backdrop.hidden = false;
  sheet.hidden = false;
  requestAnimationFrame(() => {
    backdrop.classList.add('is-open');
    sheet.classList.add('is-open');
    onOpen?.(sheet);
  });

  document.body.style.overflow = 'hidden';
}

export function closeSheet() {
  const backdrop = $('#sheet-backdrop');
  const sheet = $('#sheet');
  if (sheet.hidden) return;

  backdrop.classList.remove('is-open');
  sheet.classList.remove('is-open');
  document.body.style.overflow = '';

  setTimeout(() => {
    backdrop.hidden = true;
    sheet.hidden = true;
    $('#sheet-body').innerHTML = '';
    lastFocused?.focus?.();
  }, 260);
}

export function isSheetOpen() { return !$('#sheet')?.hidden; }

// ------------------------------------------------------------
// חיווט אירועים גלובליים — נקרא פעם אחת מ-app.js
// ------------------------------------------------------------
export function initUI() {
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => showScreen(tab.dataset.target));
  });

  $('#sheet-backdrop')?.addEventListener('click', closeSheet);
  $('#sheet-close')?.addEventListener('click', closeSheet);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isSheetOpen()) closeSheet();
  });

  showScreen('today');
}
