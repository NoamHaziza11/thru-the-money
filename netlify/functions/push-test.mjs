// ============================================================
// push-test.mjs — שולח מיד תזכורת לבדיקה, למכשירים של המשתמש המחובר.
//
// נקרא מכפתור "שלח תזכורת לבדיקה" בהגדרות. מאמת את ה-JWT של Supabase,
// ואז קורא את המנויים עם הטוקן של המשתמש עצמו. ה-RLS מחזיר רק את שלו.
// ============================================================

import { sendPush, cleanEnv } from '../lib/webpush.mjs';
import { testMessage } from '../lib/reminders.mjs';

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('authorization');
  if (!authHeader) return json(401, { error: 'missing_auth' });

  const url = cleanEnv(process.env.SUPABASE_URL).replace(/\/+$/, '');
  const anon = cleanEnv(process.env.SUPABASE_ANON_KEY);
  const vapid = {
    publicKey: cleanEnv(process.env.VAPID_PUBLIC_KEY),
    privateKey: cleanEnv(process.env.VAPID_PRIVATE_KEY),
    subject: 'https://thru-the-money.netlify.app',
  };
  if (!url || !anon || !vapid.publicKey || !vapid.privateKey) {
    console.error('[push-test] missing environment variables');
    return json(500, { error: 'server_misconfigured' });
  }

  const headers = { Authorization: authHeader, apikey: anon };

  let userRes;
  try {
    userRes = await fetch(`${url}/auth/v1/user`, { headers });
  } catch (err) {
    console.error('[push-test] auth verification failed:', err);
    return json(502, { error: 'auth_check_failed' });
  }
  if (!userRes.ok) return json(401, { error: 'invalid_token' });

  const subsRes = await fetch(`${url}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth,lang`, { headers });
  if (!subsRes.ok) {
    console.error('[push-test] reading subscriptions failed:', subsRes.status, await subsRes.text());
    return json(502, { error: 'subscriptions_failed' });
  }
  const subs = await subsRes.json();
  if (!subs.length) return json(404, { error: 'no_subscriptions' });

  const statuses = [];
  for (const sub of subs) {
    try {
      statuses.push(await sendPush(sub, testMessage(sub.lang), vapid));
    } catch (err) {
      console.error('[push-test] send failed:', err.message);
      statuses.push('error');
    }
  }
  console.log(`[push-test] statuses=${statuses.join(',')}`);

  const delivered = statuses.some((s) => s === 201 || s === 200);
  return json(delivered ? 200 : 502, { delivered, statuses });
};
