import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { replayQueue } from './lib/offlineStore'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ── Service Worker registration ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(
        import.meta.env.MODE === 'production' ? '/sw.js' : '/dev-sw.js?dev-sw',
        { type: import.meta.env.MODE === 'production' ? 'classic' : 'module' }
      );
      console.log('[Wander] SW registered, scope:', reg.scope);

      // When a new SW takes over, reload to get fresh assets
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
            // New SW activated — reload to pick up new code
            window.location.reload();
          }
        });
      });
    } catch (err) {
      console.warn('[Wander] SW registration failed:', err);
    }
  });

  // When coming back online, replay any queued captures
  window.addEventListener('online', async () => {
    const { success, failed } = await replayQueue();
    if (success > 0) {
      console.log(`[Wander] Synced ${success} queued item(s), ${failed} failed`);
      // Notify UI to show toast and refresh data
      window.dispatchEvent(new CustomEvent('wander:offline-synced', {
        detail: { success, failed },
      }));
      window.dispatchEvent(new CustomEvent('wander:data-changed'));
    }
  });
}

// ── Prefetch today's data + city images into SW cache on app start ──
// Eagerly hits the API endpoints and static map URLs so everything is warm
// in the cache before the user goes offline or clicks into a city.
window.addEventListener('load', async () => {
  const token = localStorage.getItem('wander_token');
  if (!token || !navigator.onLine) return;

  // Small delay so it doesn't compete with initial page load
  await new Promise((r) => setTimeout(r, 2000));

  try {
    const headers = { Authorization: `Bearer ${token}` };

    // Prefetch trip data (SW caches these)
    const tripRes = await fetch('/api/trips/active', { headers });
    if (!tripRes.ok) return;
    const trip = await tripRes.json();
    if (!trip?.id) return;

    // Prefetch days (includes experiences, reservations, accommodations)
    // and trip structure (includes route segments, cities with coordinates)
    const [, tripDetail] = await Promise.all([
      fetch(`/api/days/trip/${trip.id}`, { headers }),
      fetch(`/api/trips/${trip.id}`, { headers }).then((r) => r.ok ? r.json() : null),
    ]);

    // Prefetch static map images for all cities with coordinates
    const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';
    if (apiKey && tripDetail?.cities) {
      const mapStyle = 'style=feature:all|saturation:-50&style=feature:all|element:labels.text|visibility:off';
      for (const city of tripDetail.cities) {
        if (!city.latitude || !city.longitude) continue;
        // TripOverview size (120x120) and PlanPage size (240x120)
        const sizes = ['120x120', '240x120'];
        for (const size of sizes) {
          const url = `https://maps.googleapis.com/maps/api/staticmap?center=${city.latitude},${city.longitude}&zoom=13&size=${size}&scale=2&maptype=roadmap&${mapStyle}&key=${apiKey}`;
          // Fire-and-forget — SW caches the response via CacheFirst rule
          fetch(url).catch(() => {});
        }
      }
    }
  } catch {
    // Prefetch is best-effort — don't crash if it fails
  }
});
