/// <reference lib="webworker" />
// SafaiSeva service worker (built by vite-plugin-pwa, injectManifest).
//
// - The app shell (index.html + hashed JS/CSS + icons/fonts) is precached with revisions,
//   so the installed app opens with no network (audit F9 — the old hand-written worker
//   never cached index.html, so an offline launch showed the browser's error page).
// - Navigations are network-first: an online launch always gets the newest index.html,
//   offline falls back to the precached shell.
// - /api/* and every cross-origin request (map tiles, geocoder, Clerk) are never cached.
// - A new worker waits until the page asks it to take over (the "new version" prompt),
//   instead of swapping code under a running capture.
// - Web Push: shows the notification and focuses / opens the app on tap.

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA navigations: try the network (fresh index.html after a deploy), fall back to the
// precached shell when offline.
const shell = createHandlerBoundToURL('/index.html');
const networkFirst = new NetworkFirst({ cacheName: 'safaiseva-pages', networkTimeoutSeconds: 4 });
registerRoute(
  new NavigationRoute(
    async (options) => {
      try {
        const res = await networkFirst.handle(options);
        if (res && res.ok) return res;
      } catch {
        /* offline — use the shell */
      }
      return shell(options);
    },
    { denylist: [/^\/api\//] }
  )
);

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ---- Web Push ----------------------------------------------------------------------
interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

self.addEventListener('push', (event) => {
  let data: PushPayload = { title: 'SafaiSeva', body: 'You have an update.' };
  try {
    if (event.data) data = { ...data, ...(event.data.json() as PushPayload) };
  } catch {
    /* non-JSON payload — keep the default text */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-96.png',
      tag: data.tag,
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data?.url as string) || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin) {
          // Never reload an open app (it may be mid-capture): focus it and let it switch
          // screens itself.
          await w.focus();
          w.postMessage({ type: 'open-target', url: target });
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
