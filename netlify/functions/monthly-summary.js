// ============================================================
// monthly-summary.js — Netlify Function: המלצות AI לדוח החודשי.
//
// מפתח Anthropic חי רק כאן, ב-Environment Variables של Netlify.
// לפני כל קריאה ל-Anthropic מאמתים את ה-JWT של Supabase שהלקוח שולח
// (מול Supabase Auth עצמו) — כדי שאף אחד לא יוכל לשרוף את מכסת ה-API
// בלי להיות מחובר בפועל. ראה CLAUDE.md §3.3 להחלטה.
// ============================================================

const ANTHROPIC_MODEL = 'claude-sonnet-5';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: 'missing_auth' }) };
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ANTHROPIC_API_KEY) {
    console.error('[monthly-summary] missing environment variables');
    return { statusCode: 500, body: JSON.stringify({ error: 'server_misconfigured' }) };
  }

  // אימות ה-JWT מול Supabase Auth עצמו — לא סומכים על שום דבר מהלקוח בלי לבדוק.
  let verifyRes;
  try {
    verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: SUPABASE_ANON_KEY },
    });
  } catch (err) {
    console.error('[monthly-summary] auth verification failed:', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'auth_check_failed' }) };
  }
  if (!verifyRes.ok) {
    return { statusCode: 401, body: JSON.stringify({ error: 'invalid_token' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'bad_json' }) };
  }

  const { periodLabel, lang, totalIn, totalOut, byCategory, prevTotalIn, prevTotalOut } = payload;
  if (typeof totalIn !== 'number' || typeof totalOut !== 'number' || !Array.isArray(byCategory)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'bad_payload' }) };
  }

  const prompt = buildPrompt({ periodLabel, lang, totalIn, totalOut, byCategory, prevTotalIn, prevTotalOut });

  let anthropicRes;
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    console.error('[monthly-summary] Anthropic request failed:', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'ai_unreachable' }) };
  }

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    console.error('[monthly-summary] Anthropic API error:', anthropicRes.status, errText);
    return { statusCode: 502, body: JSON.stringify({ error: 'ai_failed' }) };
  }

  const data = await anthropicRes.json();
  const text = data.content?.[0]?.text?.trim() || '';

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  };
};

function buildPrompt({ periodLabel, lang, totalIn, totalOut, byCategory, prevTotalIn, prevTotalOut }) {
  const catLines = byCategory.map((c) => `- ${c.name}: $${c.amount.toFixed(2)}`).join('\n');
  const prevLine = (prevTotalIn != null && prevTotalOut != null)
    ? `\nחודש קודם: נכנס $${prevTotalIn.toFixed(2)}, יצא $${prevTotalOut.toFixed(2)}.`
    : '';

  if (lang === 'en') {
    return `You are a personal finance assistant for a commission-based garage door technician in California, whose income varies week to week. Based on the numbers below for ${periodLabel || 'this month'}, write 3 to 5 short, practical insights in English.

Each insight: one sentence about what happened + one sentence about what to do. Base it only on the numbers — no generic advice, no "you should save more."

A good insight sounds like: "Fuel spending rose 22% while income dropped 8% — worth checking if you're driving further for smaller jobs."

Data:
Total in: $${totalIn.toFixed(2)}
Total out: $${totalOut.toFixed(2)}
Expenses by category:
${catLines || '(none)'}${prevLine.replace('חודש קודם', 'Previous month').replace('נכנס', 'in').replace('יצא', 'out')}

Return only the insights, one per line, no numbering, no preamble.`;
  }

  return `אתה עוזר פיננסי אישי לטכנאי דלתות מוסך בקליפורניה שעובד בעמלות, עם הכנסה משתנה משבוע לשבוע. בהתבסס על הנתונים הבאים לחודש ${periodLabel || 'הנוכחי'}, כתוב 3 עד 5 תובנות קצרות ומעשיות בעברית.

כל תובנה: משפט אחד על מה קרה + משפט אחד על מה לעשות. תתבסס רק על המספרים — בלי מוסר השכל כללי, בלי "כדאי לחסוך יותר".

תובנה טובה נשמעת ככה: "ההוצאה על דלק עלתה 22% אבל ההכנסה ירדה 8% — שווה לבדוק אם אתה נוסע רחוק יותר לג'ובים קטנים יותר."

נתונים:
סה"כ נכנס: $${totalIn.toFixed(2)}
סה"כ יצא: $${totalOut.toFixed(2)}
הוצאות לפי קטגוריה:
${catLines || '(אין)'}${prevLine}

החזר רק את התובנות, שורה לכל תובנה, בלי מספור, בלי הקדמה.`;
}
