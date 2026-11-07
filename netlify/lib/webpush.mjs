// ============================================================
// webpush.mjs — שליחת Web Push בלי תלויות חיצוניות.
//
// משתמש רק ב-WebCrypto (globalThis.crypto.subtle), שקיים גם ב-Node 20
// של Netlify וגם בדפדפן. ככה אפשר לבדוק את אותו קוד בדיוק בדפדפן.
//   • RFC 8291 — הצפנת תוכן ההודעה (aes128gcm)
//   • RFC 8292 — זיהוי השרת מול שירות ההתראות (VAPID)
// נבדק מול וקטור הבדיקה של RFC 8291, נספח A (ראה CLAUDE.md, שלב 9).
// ============================================================

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();

export function b64urlToBytes(s) {
  const b64 = String(s).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function bytesToB64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

// מפתח P-256 "גולמי" (65 בתים: 0x04 ואחריו x ו-y) + d אופציונלי → JWK
function jwkFromRaw(publicRaw, privateD) {
  const jwk = {
    kty: 'EC', crv: 'P-256', ext: true,
    x: bytesToB64url(publicRaw.slice(1, 33)),
    y: bytesToB64url(publicRaw.slice(33, 65)),
  };
  if (privateD) jwk.d = bytesToB64url(privateD);
  return jwk;
}

/**
 * מצפין הודעה למנוי אחד. asPublic/asPrivateD/salt קיימים רק בשביל וקטור
 * הבדיקה. בשימוש רגיל נוצרים מפתח זמני ומלח אקראיים לכל הודעה.
 */
export async function encryptPayload({ uaPublic, authSecret, plaintext, asPublic, asPrivateD, salt }) {
  let asPub = asPublic;
  let privateKey;
  if (asPrivateD) {
    privateKey = await subtle.importKey(
      'jwk', jwkFromRaw(asPublic, asPrivateD), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'],
    );
  } else {
    const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    privateKey = pair.privateKey;
    asPub = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  }

  const uaKey = await subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaKey }, privateKey, 256));

  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPub);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const saltBytes = salt || globalThis.crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(saltBytes, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(saltBytes, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const padded = concat(plaintext, new Uint8Array([2])); // 0x02 = הרשומה האחרונה (והיחידה)
  const ciphertext = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  // כותרת: salt (16) · record size (4, big-endian) · אורך המפתח (1) · המפתח הציבורי של השרת
  const header = new Uint8Array(21 + asPub.length);
  header.set(saltBytes, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPub.length;
  header.set(asPub, 21);

  return concat(header, ciphertext);
}

/** כותרת Authorization של VAPID לשירות ההתראות של ה-endpoint */
export async function vapidAuthorization(endpoint, { publicKey, privateKey, subject }) {
  const key = await subtle.importKey(
    'jwk', jwkFromRaw(b64urlToBytes(publicKey), b64urlToBytes(privateKey)),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToB64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  })));
  const signingInput = `${header}.${claims}`;
  // WebCrypto מחזיר חתימת ECDSA בפורמט r||s (64 בתים) — בדיוק מה ש-JWT ES256 דורש
  const signature = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signingInput)));
  return `vapid t=${signingInput}.${bytesToB64url(signature)}, k=${publicKey}`;
}

/**
 * שולח הודעה אחת למנוי אחד ומחזיר את סטטוס ה-HTTP.
 * 201 = התקבל · 404/410 = המנוי כבר לא קיים (צריך למחוק אותו).
 */
export async function sendPush(subscription, message, vapid) {
  const body = await encryptPayload({
    uaPublic: b64urlToBytes(subscription.p256dh),
    authSecret: b64urlToBytes(subscription.auth),
    plaintext: enc.encode(JSON.stringify(message)),
  });
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '3600', // תזכורת שלא הגיעה תוך שעה כבר לא רלוונטית
      Urgency: 'normal',
    },
    body,
  });
  return res.status;
}

/** ערך ממשתני הסביבה בלי רווחים ובלי תווים בלתי נראים (כמו סימני כיווניות שנדבקים מעברית) */
export function cleanEnv(value) {
  return String(value || '').replace(/[^\x21-\x7E]/g, '');
}
