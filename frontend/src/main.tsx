import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { replayQueue, replayCaptureQueue } from './lib/offlineStore'

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

// When coming back online, replay any queued mutations and captures (works without SW)
window.addEventListener('online', async () => {
  const [mutations, captures] = await Promise.all([
    replayQueue(),
    replayCaptureQueue(),
  ]);
  const totalSuccess = mutations.success + captures.success;
  const totalFailed = mutations.failed + captures.failed;
  if (totalSuccess > 0) {
    console.log(`[Wander] Synced ${totalSuccess} queued item(s), ${totalFailed} failed`);
    window.dispatchEvent(new CustomEvent('wander:offline-synced', {
      detail: { success: totalSuccess, failed: totalFailed },
    }));
    window.dispatchEvent(new CustomEvent('wander:data-changed'));
  }
});
