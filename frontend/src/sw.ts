/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
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

// ── Cache names ──
const API_CACHE = 'wander-api-v1';
const STATIC_CACHE = 'wander-static-v1';
const DAY_CACHE = 'wander-days-v1';
const MAP_CACHE = 'wander-maps-v1';
const IMAGE_CACHE = 'wander-images-v1';

// ── Static assets: StaleWhileRevalidate (serve cached, fetch update in background) ──
registerRoute(
  ({ request }) =>
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: STATIC_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
);

// ── Google Maps Static API images (city thumbnails, experience maps) ──
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

// ── API: Active trip — NetworkFirst so Now screen works offline ──
registerRoute(
  ({ url }) => url.pathname === '/api/trips/active',
  new NetworkFirst({
    cacheName: API_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
    networkTimeoutSeconds: 3,
  })
);

// ── API: Trip structure overview (cities, dates, route segments) ──
registerRoute(
  ({ url }) => /^\/api\/trips\/[^/]+$/.test(url.pathname),
  new NetworkFirst({
    cacheName: API_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
    networkTimeoutSeconds: 3,
  })
);

// ── API: Days data — NetworkFirst for today/tomorrow instant offline loads ──
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/days/'),
  new NetworkFirst({
    cacheName: DAY_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
    networkTimeoutSeconds: 3,
  })
);

// ── API: Experiences for full trip (confirmed locations) ──
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/experiences'),
  new NetworkFirst({
    cacheName: API_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
    networkTimeoutSeconds: 3,
  })
);

// ── API: Accommodations — cache for offline Now page ──
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/accommodations'),
  new NetworkFirst({
    cacheName: API_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
    networkTimeoutSeconds: 3,
  })
);

// ── API: Reservations — cache for offline Now page ──
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/reservations'),
  new NetworkFirst({
    cacheName: API_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
    networkTimeoutSeconds: 3,
  })
);

// ── API: Route segments — cache for offline transport info ──
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/route-segments'),
  new NetworkFirst({
    cacheName: API_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
    networkTimeoutSeconds: 3,
  })
);

// ── API: All other GET requests — StaleWhileRevalidate ──
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/api/') && request.method === 'GET',
  new StaleWhileRevalidate({
    cacheName: API_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  })
);

// ── SPA navigation fallback ──
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: 'wander-navigation-v1',
      networkTimeoutSeconds: 3,
    })
  )
);

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
      if (res.ok || res.status < 500) {
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
