import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { replayQueue, replayCaptureQueue } from './lib/offlineStore'

// The iPad Home Screen app: its window controls sit in the top-left corner (index.css, html.ipad-app). An iPad's Safari
// calls itself a Mac, with touch; in Safari itself (not the Home Screen app) the browser's own bar is above the page.
{
  const ua = navigator.userAgent;
  const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const homeScreenApp = (navigator as any).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
  if (iPad && homeScreenApp) document.documentElement.classList.add('ipad-app');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ── Service Worker Registration ──
// skipWaiting + clientsClaim in sw.ts ensures new versions activate immediately.
// The SW caches app shell, API responses, maps, and images for offline use.
// (Never delete its caches on load: that erased the trip copy the phone keeps for no signal.)
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

// Send anything saved on the phone with no signal (notes, same-day plans, captures): when the
// signal comes back, when Wander opens, and when someone returns to it. (Only on "back online"
// meant a note typed in a tunnel, with the app closed before signal returned, never went out.)
let syncing = false;
async function sendSavedOnPhone() {
  if (syncing || navigator.onLine === false) return;
  syncing = true;
  try { await replaySaved(); } finally { syncing = false; }
}
window.addEventListener('online', sendSavedOnPhone);
window.addEventListener('load', () => setTimeout(sendSavedOnPhone, 2000));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sendSavedOnPhone(); });

async function replaySaved() {
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
}
