/* MTracker service worker — offline app shell.
 * - Precaches the HTML shell and whatever hashed assets the shell references.
 * - Navigation requests: network-first, fall back to the cached shell.
 * - Same-origin static assets: stale-while-revalidate.
 * - Never touches Supabase / API / font requests (they must stay live).
 * The version comes from the `?v=` query the app registers with, so each
 * release gets fresh caches and old ones are purged on activate.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const SHELL_CACHE = `tmf-shell-${VERSION}`;
const ASSET_CACHE = `tmf-assets-${VERSION}`;
const SHELL_URL = new URL('./', self.location.href).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll([SHELL_URL, `${SHELL_URL}manifest.webmanifest`]).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('tmf-') && k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isBypassed(url) {
  if (url.origin !== self.location.origin) return true; // Supabase, fonts, Yahoo…
  if (url.pathname.includes('/api/') || url.pathname.includes('/.netlify/')) return true;
  if (url.pathname.endsWith('/sw.js')) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isBypassed(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match(SHELL_URL).then((cached) => cached || Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.open(ASSET_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone()).catch(() => undefined);
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
