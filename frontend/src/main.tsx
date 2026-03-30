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

// ── Service Worker Registration ──
// skipWaiting + clientsClaim in sw.ts ensures new versions activate immediately.
// The SW caches app shell, API responses, maps, and images for offline use.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Check for updates periodically (every 30 min)
      setInterval(() => reg.update(), 30 * 60 * 1000);
    }).catch((err) => {
      console.warn('[Wander] SW registration failed:', err);
    });
  });
}

// When coming back online, replay any queued mutations and captures
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
