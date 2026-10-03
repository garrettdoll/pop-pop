// POP! POP! service worker.
//  - data/*.json: network-first, never stale while online. If offline, fall back to the last copy
//    (marked with an x-pop-cache header so the app can show its offline banner).
//  - app shell (HTML, CSS, JS, fonts, icons): cached so the app opens instantly and offline.
//    Served from cache and refreshed in the background.
//  - Everything else (the GitHub API, other origins) goes straight to the network.

const VERSION = 'pop-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;

const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'app/tokens.css', 'app/styles.css',
  'app/main.js', 'app/config.js', 'app/storage.js', 'app/util.js', 'app/dates.js', 'app/derive.js', 'app/normalize.js',
  'app/github.js', 'app/ops.js', 'app/store.js', 'app/ui.js', 'app/card.js',
  'app/views/home.js', 'app/views/markets.js', 'app/views/calendar.js', 'app/views/explore.js',
  'app/views/organizers.js', 'app/views/questions.js', 'app/views/settings.js',
  'app/fonts/archivo-latin.woff2', 'app/fonts/archivo-latin-ext.woff2',
  'icons/favicon.svg', 'icons/favicon-32.png', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png',
].map((p) => new URL(p, self.registration.scope).href);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => { /* one missing file must not block install */ })))).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isData = (url) => url.pathname.includes('/data/') && url.pathname.endsWith('.json');

async function networkFirstData(request, url) {
  const cache = await caches.open(DATA_CACHE);
  const key = new Request(url.origin + url.pathname); // ignore the ?t= cache-buster
  try {
    const res = await fetch(request, { cache: 'no-store' });
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch {
    const saved = await cache.match(key);
    if (!saved) return new Response('{"error":"offline"}', { status: 503, headers: { 'Content-Type': 'application/json' } });
    const headers = new Headers(saved.headers);
    headers.set('x-pop-cache', '1');
    return new Response(await saved.blob(), { status: 200, headers });
  }
}

async function shell(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const refresh = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  if (cached) return cached; // instant; the background refresh is picked up next launch
  const fresh = await refresh;
  if (fresh) return fresh;
  if (request.mode === 'navigate') {
    const index = await cache.match(new URL('index.html', self.registration.scope).href);
    if (index) return index;
  }
  return new Response('Offline', { status: 503 });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // GitHub API etc.
  if (isData(url)) event.respondWith(networkFirstData(request, url));
  else event.respondWith(shell(request));
});
