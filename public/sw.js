// SafaiSeva service worker.
// - Static assets (icons, fonts, manifest): cache-first.
// - Navigations and the app shell: network-first, cache as offline fallback.
// - Everything the app treats as live — /api/*, dev/HMR endpoints, cross-origin
//   (map tiles, geocoder) — is NEVER served from cache (audit B4).

const CACHE_NAME = 'safaiseva-v3';

const PRECACHE = [
  '/manifest.webmanifest',
  '/manifest.json',
  '/favicon.svg',
  '/favicon.ico',
  '/icon-16.png',
  '/icon-32.png',
  '/icon-48.png',
  '/icon-72.png',
  '/icon-96.png',
  '/icon-144.png',
  '/icon-192.png',
  '/icon-192-maskable.png',
  '/icon-384.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
  '/fonts/ibm-plex-sans-latin-400.woff2',
  '/fonts/ibm-plex-sans-latin-500.woff2',
  '/fonts/ibm-plex-sans-latin-600.woff2',
  '/fonts/ibm-plex-sans-latin-700.woff2',
  '/fonts/ibm-plex-mono-latin-400.woff2',
  '/fonts/ibm-plex-mono-latin-600.woff2',
  '/fonts/ibm-plex-sans-devanagari-400.woff2',
  '/fonts/ibm-plex-sans-devanagari-600.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Paths that must always hit the network (never cached / never served stale).
function isLive(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/@vite') ||
    url.pathname.startsWith('/@react-refresh') ||
    url.pathname.startsWith('/@fs') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.includes('hot-update')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Different origin (map tiles, geocoder, fonts CDN, …) or a live endpoint: pass through.
  if (url.origin !== self.location.origin || isLive(url)) return;

  // Navigations + app shell: network-first, fall back to cache when offline.
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Precached static assets: cache-first, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
