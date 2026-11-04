// ============================================================
// app.js — נקודת הכניסה. מחווט אימות, ניווט, שפה, ומצב התקופה.
// ============================================================

import { isConfigured } from './config.js';
import { signIn, signUp, signOut, getSession, onAuthChange } from './auth.js';
import { $, $$, initUI, toast } from './ui.js';
import { currentPeriod, periodLabel, shiftPeriod } from './format.js';
import { getLang, setLang, t, applyI18n } from './i18n.js';
import {
  loadCategories, loadPeriodTransactions,
  renderBalanceCard, renderTransactionList, renderCategoryFilterChips, resetCategoryFilter,
  openEntrySheet, openEditSheet,
} from './transactions.js';
import { loadAnalysisData, renderAnalysis, renderTrend } from './charts.js';
import { runRecurringGeneration } from './recurring.js';
import { initSummary, renderSummary } from './summary.js';

let period = currentPeriod();
let authMode = 'signin';
let userId = null;

// ------------------------------------------------------------
// שפה
// ------------------------------------------------------------
function renderLangToggles() {
  const label = getLang() === 'he' ? 'English' : 'עברית';
  $$('.lang-toggle').forEach((btn) => { btn.textContent = label; });
}

function initLangToggle() {
  $$('.lang-toggle').forEach((btn) => {
    btn.addEventListener('click', () => setLang(getLang() === 'he' ? 'en' : 'he'));
  });

  document.addEventListener('langchange', () => {
    renderLangToggles();
    renderPeriod();
    setAuthMode(authMode);
    if (userId) {
      renderTodayScreen();
      renderAnalysis(period);
      renderSummary(userId, period);
    }
  });

  renderLangToggles();
}

// ------------------------------------------------------------
// תקופה (חודש מוצג) — קובעת אילו תנועות טעונות
// ------------------------------------------------------------
function isCurrentPeriod(p) {
  const now = currentPeriod();
  return p.year === now.year && p.month === now.month;
}

function renderPeriod() {
  $('#period-label').textContent = periodLabel(period);
  $('#period-next').disabled = isCurrentPeriod(period);
}

// רשימת התנועות של "היום" בלבד (מכבדת סינון קטגוריה פעיל) — נקראת גם
// כ-callback מ-renderCategoryFilterChips כדי לא לרענן יתר על המידה יתרה/גרף.
function renderTodayList() {
  renderTransactionList(onRowClick, onSwipeDeleted);
}

// מחיקה בהחלקה לא טוענת מחדש בעצמה (בניגוד לגיליון העריכה) — בלי הטעינה
// כאן השורה והיתרה נשארים על המסך עד רענון.
async function onSwipeDeleted() {
  try {
    await loadPeriodTransactions(userId, period);
    await onDataChanged();
  } catch (err) {
    toast(t(err.message), 'error');
  }
}

function renderTodayScreen() {
  renderBalanceCard();
  renderCategoryFilterChips(renderTodayList);
  renderTodayList();
  renderTrend(period);
}

async function refreshPeriodData() {
  if (!userId) return;
  try {
    await loadPeriodTransactions(userId, period);
    renderTodayScreen();
    await loadAnalysisData(userId, period);
    renderAnalysis(period);
    await renderSummary(userId, period);
  } catch (err) {
    toast(t(err.message), 'error');
  }
}

function initPeriodNav() {
  $('#period-prev').addEventListener('click', () => {
    period = shiftPeriod(period, -1);
    resetCategoryFilter();
    renderPeriod();
    refreshPeriodData();
  });
  $('#period-next').addEventListener('click', () => {
    if (isCurrentPeriod(period)) return;
    period = shiftPeriod(period, 1);
    resetCategoryFilter();
    renderPeriod();
    refreshPeriodData();
  });
}

// ------------------------------------------------------------
// אימות
// ------------------------------------------------------------
function setAuthMode(mode) {
  authMode = mode;
  const isSignin = mode === 'signin';
  $('#auth-submit').textContent = t(isSignin ? 'auth.signIn' : 'auth.signUp');
  $('#auth-switch-q').textContent = t(isSignin ? 'auth.noAccount' : 'auth.haveAccount');
  $('#auth-toggle').textContent = t(isSignin ? 'auth.toSignUp' : 'auth.toSignIn');
  $('#auth-password').autocomplete = isSignin ? 'current-password' : 'new-password';
  $('#auth-error').hidden = true;
}

function initAuthForm() {
  $('#auth-toggle').addEventListener('click', () => {
    setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
  });

  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#auth-email').value;
    const password = $('#auth-password').value;
    const errorBox = $('#auth-error');
    const submitBtn = $('#auth-submit');

    errorBox.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = t('auth.submitting');

    try {
      if (authMode === 'signin') {
        await signIn(email, password);
        // onAuthChange מטפל במעבר למסך האפליקציה
      } else {
        const { needsConfirm } = await signUp(email, password);
        if (needsConfirm) {
          toast(t('auth.signedUpNeedsConfirm'), 'ok');
          setAuthMode('signin');
        }
      }
    } catch (err) {
      errorBox.textContent = t(err.message);
      errorBox.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = t(authMode === 'signin' ? 'auth.signIn' : 'auth.signUp');
    }
  });

  $('#signout-btn').addEventListener('click', async () => {
    try {
      await signOut();
    } catch (err) {
      toast(t(err.message), 'error');
    }
  });
}

// ------------------------------------------------------------
// כפתורי ההזנה המהירה + לחיצה על תנועה קיימת לעריכה
// תנועה חדשה/מעודכנת/נמחקת משפיעה גם על גרפי הניתוח, לא רק על היום.
// ------------------------------------------------------------
async function onDataChanged() {
  renderTodayScreen();
  try {
    await loadAnalysisData(userId, period);
    renderAnalysis(period);
    await renderSummary(userId, period);
  } catch (err) {
    toast(t(err.message), 'error');
  }
}

function onRowClick(txId) {
  openEditSheet(txId, userId, period, onDataChanged);
}

function initQuickActions() {
  $('#add-income').addEventListener('click', () => openEntrySheet('income', userId, period, onDataChanged));
  $('#add-expense').addEventListener('click', () => openEntrySheet('expense', userId, period, onDataChanged));
}

// ------------------------------------------------------------
// מעברי מסך אימות ↔ אפליקציה
// ------------------------------------------------------------
function showAuthScreen() {
  $('#app').hidden = true;
  $('#auth-screen').hidden = false;
}

function showAppScreen() {
  $('#auth-screen').hidden = true;
  $('#auth-form').reset();
  $('#app').hidden = false;
}

async function handleSession(session) {
  if (!session) {
    userId = null;
    showAuthScreen();
    return;
  }

  userId = session.user.id;
  showAppScreen();
  initSummary(userId, refreshPeriodData);
  try {
    await loadCategories(userId);
    await runRecurringGeneration(userId);
    await refreshPeriodData();
  } catch (err) {
    toast(t(err.message), 'error');
  }
}

// ------------------------------------------------------------
// PWA — אופליין לקריאה. נכשל בשקט ברשת מקומית לא-HTTPS (מותר —
// service worker דורש HTTPS או localhost, זו מגבלת הדפדפן, לא באג).
// ------------------------------------------------------------
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch((err) => {
    console.warn('[sw] registration failed:', err);
  });
}

// ------------------------------------------------------------
// אתחול
// ------------------------------------------------------------
async function boot() {
  applyI18n();

  if (!isConfigured) {
    $('#boot').innerHTML =
      `<div class="empty"><div class="empty__title">${t('config.missing.title')}</div>` +
      `<p class="empty__text">${t('config.missing.text')}</p></div>`;
    return;
  }

  initUI();
  initLangToggle();
  initPeriodNav();
  initAuthForm();
  initQuickActions();
  renderPeriod();
  registerServiceWorker();

  const session = await getSession();
  await handleSession(session);
  $('#boot').hidden = true;

  onAuthChange((session) => { handleSession(session); });
}

boot();
