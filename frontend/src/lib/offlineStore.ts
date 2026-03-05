/**
 * Offline capture queue.
 * Stores failed POST/PATCH requests in IndexedDB so the service worker
 * can replay them when connectivity returns.
 */

interface QueuedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  timestamp: number;
}

const DB_NAME = 'wander-offline';
const DB_VERSION = 1;
const STORE_NAME = 'queue';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Queue a failed request for later replay.
 */
export async function queueRequest(entry: QueuedRequest): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).add(entry);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Request background sync if available
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready;
    try {
      await (reg as any).sync.register('wander-capture-sync');
    } catch {
      // Background sync not supported or permission denied; queue remains
    }
  }
}

/**
 * Get count of queued items (for UI display).
 */
export async function getQueueCount(): Promise<number> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve, reject) => {
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Attempt to replay all queued requests (called on reconnect).
 */
export async function replayQueue(): Promise<{ success: number; failed: number }> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  const allKeys: IDBValidKey[] = await new Promise((resolve, reject) => {
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const entries: Array<{ key: IDBValidKey; value: QueuedRequest }> = [];
  for (const key of allKeys) {
    const value: QueuedRequest = await new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    entries.push({ key, value });
  }

  let success = 0;
  let failed = 0;

  for (const { key, value } of entries) {
    try {
      const res = await fetch(value.url, {
        method: value.method,
        headers: value.headers,
        body: value.body,
      });
      if (res.ok || res.status < 500) {
        const delTx = db.transaction(STORE_NAME, 'readwrite');
        delTx.objectStore(STORE_NAME).delete(key);
        success++;
      } else {
        failed++;
      }
    } catch {
      failed++;
      break; // Still offline
    }
  }

  return { success, failed };
}
