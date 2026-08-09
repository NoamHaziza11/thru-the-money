// ============================================================
// sw.js — service worker. אופליין לקריאה: מטמין את שלד האפליקציה
// ואת פונטי Google כדי שהמסך ייטען גם בלי חיבור, על נתונים אחרונים
// שנטענו. קריאות ל-Supabase תמיד הולכות לרשת — אלה נתונים חיים,
// לא שדה לאופליין.
//
// כלל קבוע: בכל שינוי בקוד בתוך deploy/ — להעלות את המספר כאן.
// בלי זה הטלפון ממשיך להגיש גרסה ישנה מהמטמון.
// ============================================================

const CACHE_VERSION = 'v3';
const SHELL_CACHE = `ttm-shell-${CACHE_VERSION}`;
const FONT_CACHE = `ttm-fonts-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/auth.js',
  './js/categories.js',
  './js/charts.js',
  './js/config.js',
  './js/db.js',
  './js/format.js',
  './js/i18n.js',
  './js/recurring.js',
  './js/summary.js',
  './js/transactions.js',
  './js/ui.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names
        .filter((name) => name !== SHELL_CACHE && name !== FONT_CACHE)
        .map((name) => caches.delete(name)),
    )),
  );
  self.clients.claim();
});

function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then((cache) => cache.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    });
  }));
}

function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then((cache) => cache.match(request).then((cached) => {
    const network = fetch(request)
      .then((res) => {
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
      .catch(() => cached);
    return cached || network;
  }));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // כתיבות (POST וכו') תמיד רק ברשת

  const url = new URL(request.url);

  // פונטי Google — cache-first כדי שיעבדו אופליין אחרי טעינה ראשונה
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // Supabase — תמיד רשת. נתונים חיים, לא שדה לאופליין.
  if (url.hostname.endsWith('.supabase.co')) return;

  // ניווט (טעינת הדף עצמו) — קודם רשת, ואם אין חיבור נופלים לשלד השמור
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html')),
    );
    return;
  }

  // שאר קבצי השלד (JS/CSS/אייקונים) — טעינה מיידית מהמטמון, ועדכון ברקע
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
  }
});
