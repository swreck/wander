import { useState, useEffect } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { getQueueCount } from '../lib/offlineStore';

/**
 * Offline indicator with queued item count.
 * Shows when offline, and briefly after coming back online if items synced.
 */
export default function OfflineIndicator() {
  const online = useOnlineStatus();
  const [queuedCount, setQueuedCount] = useState(0);

  // Update count when items are queued or on mount
  useEffect(() => {
    if (online) return;

    getQueueCount().then(setQueuedCount).catch(() => {});

    const handler = (e: Event) => {
      const count = (e as CustomEvent).detail?.count ?? 0;
      setQueuedCount(count);
    };
    window.addEventListener('wander:offline-queued', handler);
    return () => window.removeEventListener('wander:offline-queued', handler);
  }, [online]);

  if (online) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-30 flex items-center gap-1.5 px-2.5 py-1.5
                 bg-[#514636]/90 text-white/90 text-xs rounded-full backdrop-blur-sm
                 shadow-sm pointer-events-none select-none"
      aria-live="polite"
      role="status"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Cloud with slash */}
        <path d="M4.14 15.08A3.5 3.5 0 0 1 5.5 8.5h1.2A5.5 5.5 0 0 1 17 7.2" />
        <path d="M20.83 11.24a4.5 4.5 0 0 1-1.38 8.26H9" />
        <line x1="2" y1="2" x2="22" y2="22" />
      </svg>
      Offline
      {queuedCount > 0 && (
        <span className="ml-0.5 px-1.5 py-0.5 bg-white/20 rounded-full text-[10px] font-medium">
          {queuedCount} queued
        </span>
      )}
    </div>
  );
}
