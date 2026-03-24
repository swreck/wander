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

// ── Service Worker DISABLED temporarily ──
// The SW was causing stale cache loops and reload cycles on devices with
// old cached versions. SW registration is disabled until all clients have
// cleared their old SWs (the inline script in index.html unregisters them).
// Offline support and prefetching are paused until re-enabled.
//
// TODO: Re-enable SW registration after all users have loaded this version.

// When coming back online, replay any queued captures (works without SW)
window.addEventListener('online', async () => {
  const { success, failed } = await replayQueue();
  if (success > 0) {
    console.log(`[Wander] Synced ${success} queued item(s), ${failed} failed`);
    window.dispatchEvent(new CustomEvent('wander:offline-synced', {
      detail: { success, failed },
    }));
    window.dispatchEvent(new CustomEvent('wander:data-changed'));
  }
});
