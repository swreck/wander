/**
 * Offline capture queue.
 * Stores failed POST/PATCH requests in IndexedDB so the service worker
 * can replay them when connectivity returns.
 *
 * Also stores pending capture items (paste/drop/camera while offline)
 * in a separate 'capture-queue' store for replay on reconnect.
 */

interface QueuedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  timestamp: number;
}

export interface QueuedCapture {
  tripId: string;
  source: string;
  text: string | null;
  // Files can't be stored in IDB directly as File objects — store as ArrayBuffer + metadata
  fileData: ArrayBuffer | null;
  fileName: string | null;
  fileType: string | null;
  cityId: string | null;
  timestamp: number;
}

const DB_NAME = 'wander-offline';
const DB_VERSION = 2;
const STORE_NAME = 'queue';
const CAPTURE_STORE = 'capture-queue';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(CAPTURE_STORE)) {
        db.createObjectStore(CAPTURE_STORE, { autoIncrement: true });
      }
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

// ── Capture queue (paste/drop/camera while offline) ────────────

/**
 * Queue a capture for later processing when back online.
 */
export async function queueCapture(entry: QueuedCapture): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(CAPTURE_STORE, 'readwrite');
  tx.objectStore(CAPTURE_STORE).add(entry);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get all queued captures.
 */
export async function getCaptureQueue(): Promise<Array<{ key: IDBValidKey; value: QueuedCapture }>> {
  const db = await openDB();
  const tx = db.transaction(CAPTURE_STORE, 'readonly');
  const store = tx.objectStore(CAPTURE_STORE);

  const allKeys: IDBValidKey[] = await new Promise((resolve, reject) => {
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const entries: Array<{ key: IDBValidKey; value: QueuedCapture }> = [];
  for (const key of allKeys) {
    const value: QueuedCapture = await new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    entries.push({ key, value });
  }
  return entries;
}

/**
 * Get count of queued captures.
 */
export async function getCaptureQueueCount(): Promise<number> {
  const db = await openDB();
  const tx = db.transaction(CAPTURE_STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(CAPTURE_STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete a queued capture after successful processing.
 */
export async function deleteQueuedCapture(key: IDBValidKey): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(CAPTURE_STORE, 'readwrite');
  tx.objectStore(CAPTURE_STORE).delete(key);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Replay all queued captures by re-submitting to the extraction endpoint.
 * Returns count of successes and failures.
 */
export async function replayCaptureQueue(): Promise<{ success: number; failed: number }> {
  const entries = await getCaptureQueue();
  let success = 0;
  let failed = 0;

  const token = localStorage.getItem("wander_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  for (const { key, value } of entries) {
    try {
      const formData = new FormData();
      formData.append("tripId", value.tripId);
      if (value.text) formData.append("text", value.text);
      if (value.fileData && value.fileName && value.fileType) {
        const blob = new Blob([value.fileData], { type: value.fileType });
        formData.append("image", blob, value.fileName);
      }
      if (value.cityId) formData.append("cityId", value.cityId);

      const res = await fetch("/api/import/universal-extract", {
        method: "POST",
        headers,
        body: formData,
      });

      if (res.ok || res.status < 500) {
        await deleteQueuedCapture(key);
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
