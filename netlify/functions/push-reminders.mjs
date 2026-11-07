// ============================================================
// push-reminders.mjs — Netlify Scheduled Function: שולח את התזכורות.
//
// רץ כל חצי שעה (לפי UTC). בכל ריצה בודק אם עכשיו, בשעון קליפורניה,
// זו אחת משעות התזכורת (reminders.mjs → SLOTS). אם לא — לא עושה כלום.
// ככה מעבר שעון קיץ/חורף לא מזיז את התזכורות.
//
// את המנויים קורא דרך הפונקציה push_targets ב-Supabase, שדורשת את
// PUSH_CRON_SECRET (sql/05_push_subscriptions.sql). אין כאן מפתח
// service_role, והפונקציה הזו לא רואה שום נתון כספי.
// ============================================================

import { sendPush, cleanEnv } from '../lib/webpush.mjs';
import { currentSlot, pickMessage } from '../lib/reminders.mjs';

export const config = { schedule: '*/30 * * * *' };

async function rpc(env, name, args) {
  const res = await fetch(`${env.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: env.anon, Authorization: `Bearer ${env.anon}` },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name} failed: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default async () => {
  const slot = currentSlot();
  if (!slot) return new Response('not a reminder time');

  const env = {
    url: cleanEnv(process.env.SUPABASE_URL).replace(/\/+$/, ''),
    anon: cleanEnv(process.env.SUPABASE_ANON_KEY),
    secret: cleanEnv(process.env.PUSH_CRON_SECRET),
  };
  const vapid = {
    publicKey: cleanEnv(process.env.VAPID_PUBLIC_KEY),
    privateKey: cleanEnv(process.env.VAPID_PRIVATE_KEY),
    subject: 'https://thru-the-money.netlify.app',
  };
  if (!env.url || !env.anon || !env.secret || !vapid.publicKey || !vapid.privateKey) {
    console.error('[push-reminders] missing environment variables');
    return new Response('server_misconfigured', { status: 500 });
  }

  let targets;
  try {
    targets = await rpc(env, 'push_targets', { p_secret: env.secret });
  } catch (err) {
    console.error('[push-reminders]', err.message);
    return new Response('targets_failed', { status: 502 });
  }

  const results = [];
  for (const target of targets || []) {
    try {
      const status = await sendPush(target, pickMessage(slot, target.lang), vapid);
      results.push(status);
      if (status === 404 || status === 410) {
        await rpc(env, 'push_drop', { p_secret: env.secret, p_endpoint: target.endpoint });
      }
    } catch (err) {
      results.push('error');
      console.error('[push-reminders] send failed:', err.message);
    }
  }

  console.log(`[push-reminders] slot=${slot} targets=${(targets || []).length} results=${results.join(',')}`);
  return new Response('ok');
};
