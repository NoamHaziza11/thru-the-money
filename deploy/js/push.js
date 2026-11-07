// ============================================================
// push.js — תזכורות מהאפליקציה: הפעלה, כיבוי ובדיקה.
// השרת שולח בשעות קבועות (netlify/functions/push-reminders.mjs),
// וה-service worker מציג את ההתראה (sw.js → 'push').
//
// באייפון זה עובד רק כשהאפליקציה מותקנת במסך הבית (iOS 16.4 ומעלה),
// ורק אחרי לחיצה על כפתור. מגבלה של אפל, לא שלנו.
// ============================================================

import { supabase, upsertPushSubscription, deletePushSubscription, updatePushLang } from './db.js';
import { VAPID_PUBLIC_KEY } from './config.js';
import { esc, toast } from './ui.js';
import { t, getLang } from './i18n.js';

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function supported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function currentSubscription() {
  if (!supported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** 'unsupported' | 'denied' | 'on' | 'off' */
async function pushState() {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return (await currentSubscription()) ? 'on' : 'off';
}

async function enablePush(userId) {
  // חייב להיות הדבר הראשון בתגובה ללחיצה. אחרת iOS לא מציג את חלון האישור.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('push.permissionDenied');

  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(VAPID_PUBLIC_KEY) });
  const { endpoint, keys } = sub.toJSON();
  await upsertPushSubscription(userId, { endpoint, p256dh: keys.p256dh, auth: keys.auth, lang: getLang() });
}

async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await deletePushSubscription(sub.endpoint);
  await sub.unsubscribe();
}

async function sendTestPush() {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/.netlify/functions/push-test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) throw new Error('push.testFailed');
}

// התזכורות נכתבות בשפת הממשק — כשמחליפים שפה, השרת צריך לדעת
document.addEventListener('langchange', async () => {
  try {
    const sub = await currentSubscription();
    if (sub) await updatePushLang(sub.endpoint, getLang());
  } catch (err) {
    console.warn('[push] language sync failed:', err);
  }
});

/** אזור "תזכורות" בגיליון ההגדרות */
export function pushSectionHtml() {
  return `
    <h3 class="screen__title">${esc(t('push.title'))}</h3>
    <p class="push__desc">${esc(t('push.desc'))}</p>
    <p class="push__status" id="push-status"></p>
    <div class="push__actions">
      <button class="btn btn--block" id="push-toggle" type="button" hidden></button>
      <button class="btn btn--ghost btn--block" id="push-test" type="button" hidden>${esc(t('push.test'))}</button>
    </div>`;
}

export async function wirePushSection(sheetEl, userId) {
  const statusEl = sheetEl.querySelector('#push-status');
  const toggleEl = sheetEl.querySelector('#push-toggle');
  const testEl = sheetEl.querySelector('#push-test');
  if (!statusEl) return;

  const render = async () => {
    const state = await pushState();
    statusEl.textContent = t(`push.state.${state}`);
    toggleEl.hidden = state === 'unsupported' || state === 'denied';
    toggleEl.textContent = t(state === 'on' ? 'push.disable' : 'push.enable');
    toggleEl.classList.toggle('btn--primary', state !== 'on');
    toggleEl.classList.toggle('btn--ghost', state === 'on');
    testEl.hidden = state !== 'on';
    return state;
  };

  // שגיאה של הדפדפן עצמו (לא מפתח תרגום שלנו) → הודעה כללית בשפה הנוכחית
  const errorKey = (err) => (/^(push|error)\./.test(err?.message || '') ? err.message : 'push.saveFailed');

  toggleEl.addEventListener('click', async () => {
    toggleEl.disabled = true;
    try {
      if ((await pushState()) === 'on') {
        await disablePush();
        toast(t('push.disabled'), 'ok');
      } else {
        await enablePush(userId);
        toast(t('push.enabled'), 'ok');
      }
    } catch (err) {
      console.error('[push]', err);
      toast(t(errorKey(err)), 'error');
    } finally {
      toggleEl.disabled = false;
      await render();
    }
  });

  testEl.addEventListener('click', async () => {
    testEl.disabled = true;
    try {
      await sendTestPush();
      toast(t('push.testSent'), 'ok');
    } catch (err) {
      console.error('[push]', err);
      toast(t('push.testFailed'), 'error');
    } finally {
      testEl.disabled = false;
    }
  });

  await render();
}
