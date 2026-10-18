/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim } from 'workbox-core';

declare let self: ServiceWorkerGlobalScope;

// ── Activate new SW immediately, don't wait for old tabs to close ──
self.skipWaiting();
clientsClaim();

// ── Precache app shell (injected by vite-plugin-pwa at build time) ──
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ── Force update on message from client ──
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Cache names ──
const API_CACHE = 'wander-api-v1';
const STATIC_CACHE = 'wander-static-v1';
const DAY_CACHE = 'wander-days-v1';
const MAP_CACHE = 'wander-maps-v1';
const IMAGE_CACHE = 'wander-images-v1';

// ── Your own photos: asked fresh each time, the saved copy only with no signal ──
// (a photo made private again or deleted stops showing at once: its saved copy goes when the answer is "not there"; each
// link is made for one person, so one person's saved copy is never another's — tourist75, Oct 15 2026)
const PHOTO_CACHE = 'wander-photos-v1';
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/trip-photos/image/'),
  // (no time limit on the answer: on a weak signal the saved copy of a photo its taker had just made private showed after
  // 4 s — tourist77. A slow photo loads slowly; the saved copy is only for no signal at all)
  new NetworkFirst({
    cacheName: PHOTO_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 3 * 24 * 60 * 60 }),
      { fetchDidSucceed: async ({ request, response }: { request: Request; response: Response }) => {
        if (response.status === 404 || response.status === 403) await (await caches.open(PHOTO_CACHE)).delete(request);
        return response;
      } },
    ],
  })
);

// ── A place's or a city's photo, through Wander's server: the saved copy first ──
// (each address names its photo — ?v= changes when the photo does — and the server marks them unchanging for a week; under
// the general image rule below, every view asked the server again, and after a deploy the server asks Google again: cost
// audit, Oct 16. Their own store, so other images don't push them out)
registerRoute(
  ({ url }) => url.origin === self.location.origin && /^\/api\/(place-photos\/[^/]+\/\d+|city-photo\/[^/]+\/image)$/.test(url.pathname) && url.searchParams.has('v'),
  new CacheFirst({
    cacheName: 'wander-place-photos-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  })
);

// ── Google Maps Static API images (city thumbnails, experience maps): the saved copy first ──
// (above the general image rule, which caught them first, so this rule never ran and each view was a billed Static Maps
// request — cost audit, Oct 16)
registerRoute(
  ({ url }) => url.hostname === 'maps.googleapis.com' && url.pathname.includes('/staticmap'),
  new CacheFirst({
    cacheName: MAP_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
);

// ── Static assets: StaleWhileRevalidate — but NOT the precached app bundle ──
// The main JS/CSS bundles are handled by precacheAndRoute above (which uses
// cache-first with hash-based versioning). This route is for other static
// assets like fonts, images, and third-party scripts.
registerRoute(
  ({ request, url }) =>
    (request.destination === 'font' || request.destination === 'image') ||
    ((request.destination === 'style' || request.destination === 'script') &&
     !url.pathname.startsWith('/assets/')),
  new StaleWhileRevalidate({
    cacheName: STATIC_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
);

// ── Google Maps JS API tiles (interactive map) ──
registerRoute(
  ({ url }) =>
    (url.hostname.endsWith('.googleapis.com') || url.hostname.endsWith('.gstatic.com')) &&
    (url.pathname.includes('/maps/') || url.pathname.includes('/vt/')),
  new StaleWhileRevalidate({
    cacheName: MAP_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  })
);

// ── Cloudinary images (experience photos) ──
registerRoute(
  ({ url }) => url.hostname === 'res.cloudinary.com',
  new CacheFirst({
    cacheName: IMAGE_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
);

// ── API data: fresh when there's signal, the phone's saved copy when there isn't ──
// One expiry rule per store. (Several rules with different limits on one store trimmed each
// other's entries — a 5-entry rule quietly threw away the saved sign-in and trip answers.)
const apiExpiry = new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 40 * 24 * 60 * 60 });
const guideExpiry = new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 40 * 24 * 60 * 60 });

// An answer from the saved copy says so, so the screen can tell people what they're looking at
// ("Weak signal — showing what this phone saved at 7:47 AM").
const markSavedCopy = {
  cachedResponseWillBeUsed: async ({ cachedResponse }: { cachedResponse?: Response }) => {
    if (!cachedResponse) return null;
    const headers = new Headers(cachedResponse.headers);
    headers.set('x-wander-saved-copy', cachedResponse.headers.get('date') || 'yes');
    return new Response(await cachedResponse.blob(), { status: cachedResponse.status, statusText: cachedResponse.statusText, headers });
  },
};

function freshOrSaved(cacheName: string, expiry: ExpirationPlugin) {
  return new NetworkFirst({
    cacheName,
    plugins: [new CacheableResponsePlugin({ statuses: [200] }), expiry, markSavedCopy],
    networkTimeoutSeconds: 3,
  });
}

// Larisa's Guide — the whole trip's day-by-day items and how current they are, kept for the length of a trip
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/guide/items/') || url.pathname.startsWith('/api/guide/status/'),
  freshOrSaved(DAY_CACHE, guideExpiry)
);

// Everything else Wander reads. Never the live-update stream, sign-in or Scout: a stream never
// ends, so trying to keep a copy held its connection open for good — after a few opens the
// browser ran out of connections and Wander went blank. Those go straight to the network.
// (trip notes too: this copy is the phone's, not the person's — on a phone handed to someone else, a saved copy of one
// person's notes showed to the next with no signal. The Notes screen keeps its own copy, per person. Oct 1 2026)
// (and the photo lists, for the same reason: the Day screen keeps its own copy, per person — Oct 15 2026)
// (/api/alerts: a kept copy would show a message already marked Got it again, offline)
const NEVER_CACHED = ['/api/sse', '/api/auth/', '/api/chat', '/api/trip-notes', '/api/trip-photos', '/api/alerts'];
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/api/') && request.method === 'GET' &&
    !NEVER_CACHED.some((p) => url.pathname.startsWith(p)) &&
    !(request.headers.get('accept') || '').includes('text/event-stream'),
  freshOrSaved(API_CACHE, apiExpiry)
);

// ── Opening any Wander address (a day, Now, a reload) ──
// Fresh when there's signal; with none, the app from the phone, which then shows the saved trip.
// (Only "/" used to have a saved page — reloading a day with no signal showed the browser's error.)
const pageFromNetwork = new NetworkFirst({ cacheName: 'wander-navigation-v1', networkTimeoutSeconds: 3 });
registerRoute(
  new NavigationRoute(async (options) => {
    try {
      const fresh = await pageFromNetwork.handle(options);
      if (fresh) return fresh;
    } catch { /* no signal */ }
    return (await matchPrecache('/index.html')) || (await matchPrecache('index.html')) || Response.error();
  })
);


// ── "Scout answered" (lib/buzz.ts, backend services/push.ts — Ken, Oct 12: a buzz when an answer is ready) ──
// Every push shows (Apple withdraws a web app's notifications if one doesn't); the newest replaces the last.
self.addEventListener('push', (event: PushEvent) => {
  let d: { title?: string; body?: string; tag?: string; url?: string } = {};
  try { d = event.data?.json() ?? {}; } catch { /* plain text or nothing */ }
  event.waitUntil(self.registration.showNotification(d.title || 'Scout answered', {
    body: d.body || 'Your answer is ready.',
    tag: d.tag || 'scout-answer',
    icon: '/icons/icon-192.png',
    data: { url: d.url || '/?scout=open' },
  }));
});
// Tapped: Wander in front with Scout open — the open window if there is one, else a new one
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/?scout=open';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins[0] as WindowClient | undefined;
    if (win) { await win.focus(); win.postMessage({ type: 'open-scout' }); return; }
    await self.clients.openWindow(url);
  })());
});

// ── Offline capture queue: sync when connectivity returns ──
// POST/PATCH requests that fail offline are queued in IndexedDB by the app layer
// and replayed via the sync event below.

self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === 'wander-capture-sync') {
    event.waitUntil(replayOfflineQueue());
  }
});

async function replayOfflineQueue() {
  const db = await openOfflineDB();
  const tx = db.transaction('queue', 'readwrite');
  const store = tx.objectStore('queue');
  const allKeys = await idbGetAllKeys(store);

  for (const key of allKeys) {
    const entry = await idbGet(store, key);
    if (!entry) continue;

    try {
      const res = await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: entry.body,
      });
      // A trip note leaves the phone only when the server has it, under its writer's own sign-in (Oct 1 2026)
      if (entry.url.includes('/trip-notes') ? res.ok : (res.ok || res.status < 500)) {
        // Success or client error (don't retry client errors)
        const delTx = db.transaction('queue', 'readwrite');
        delTx.objectStore('queue').delete(key);
      }
    } catch {
      // Still offline, stop trying
      break;
    }
  }
}

// ── IndexedDB helpers for offline queue ──
function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('wander-offline', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('queue', { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGetAllKeys(store: IDBObjectStore): Promise<IDBValidKey[]> {
  return new Promise((resolve, reject) => {
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(store: IDBObjectStore, key: IDBValidKey): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── F1: Predictive city-transition-aware caching ──
// When the app detects an upcoming city change (within 2 days), it sends a
// PREFETCH_CITY message with the relevant API URLs. We fetch and cache them
// so the data is available offline before the traveler arrives.
async function prefetchUrls(urls: string[]) {
  const cache = await caches.open(DAY_CACHE);
  for (const url of urls) {
    try {
      // Only fetch if not already cached
      const existing = await cache.match(url);
      if (!existing) {
        const response = await fetch(url, { credentials: 'same-origin' });
        if (response.ok) {
          await cache.put(url, response);
        }
      }
    } catch {
      // Offline or failed — skip silently
    }
  }
}

// ── Handle messages from clients ──
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'PREFETCH_CITY' && Array.isArray(event.data.urls)) {
    event.waitUntil(prefetchUrls(event.data.urls));
  }
});
