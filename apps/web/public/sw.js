const CACHE_NAME = 'meetit-shell-v1';
const OFFLINE_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(OFFLINE_SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((staleKey) => caches.delete(staleKey)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache WebSocket upgrades or live signaling API endpoints
  if (
    url.pathname.startsWith('/ws') ||
    url.pathname.startsWith('/rooms') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.startsWith('/healthz') ||
    url.pathname.startsWith('/readyz')
  ) {
    return;
  }

  // Navigation requests (including /m/:code and /?share-target=1): network first, fallback to cached index.html shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put('/index.html', clone));
          return response;
        })
        .catch(async () => {
          const cached =
            (await caches.match('/index.html')) || (await caches.match('/'));
          return (
            cached ||
            new Response('MeetIT is offline.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            })
          );
        }),
    );
    return;
  }

  // Static shell assets (.js, .css, .svg, .webmanifest): stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    }),
  );
});
