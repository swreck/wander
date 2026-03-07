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
    }
  });
}
