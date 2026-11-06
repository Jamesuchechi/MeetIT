const CACHE_NAME = 'meetit-shell-v2';
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

  // Navigation requests (including /m/:code and /?share-target=1):
  // Network first; if network fails or returns 404 from host CDN, fallback to /index.html shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (!response || response.status === 404 || !response.ok) {
            const cachedShell =
              (await caches.match('/index.html')) || (await caches.match('/'));
            if (cachedShell) return cachedShell;
            return fetch('/index.html');
          }
          const clone = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put('/index.html', clone));
          return response;
        })
        .catch(async () => {
          const cached =
            (await caches.match('/index.html')) || (await caches.match('/'));
          if (cached) return cached;
          return fetch('/index.html').catch(
            () =>
              new Response('MeetIT is offline.', {
                status: 503,
                headers: { 'Content-Type': 'text/plain' },
              }),
          );
        }),
    );
    return;
  }

  // Static shell assets (.js, .css, .svg, .webmanifest): stale-while-revalidate with guaranteed Response
  event.respondWith(
    caches.match(request).then(async (cached) => {
      try {
        const response = await fetch(request);
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      } catch {
        if (cached) return cached;
        return new Response('Asset unavailable offline', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    }),
  );
});
