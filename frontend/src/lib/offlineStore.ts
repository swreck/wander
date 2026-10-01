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

  // Request background sync if available. `serviceWorker.ready` never settles when there's no service worker (a
  // first visit, a private window, one that's blocked) — waited on, the save sat on "Saving…" for good (Oct 1 2026).
  // The request is already kept, so wait a second at most; it's sent on the next open or when signal returns anyway.
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
    ]);
    try {
      if (reg) await (reg as any).sync.register('wander-capture-sync');
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
 * What's still waiting to send, for one kind of request ("/api/day-choices/<trip>") — so a plan or a
 * note saved with no signal still shows as waiting after Wander is closed and opened again.
 */
/** Whose sign-in a token is (the person's id inside it — read only to tell people apart on a shared phone; the server
 *  is what checks it) */
export function whoIs(token: string | null | undefined): string | null {
  try {
    const part = (token || "").replace(/^Bearer\s+/i, "").split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return json.travelerId || json.code || null;
  } catch { return null; }
}

/** The person signed in on this phone now, for naming what the phone keeps of theirs ("nobody" when signed out) */
export const phonePerson = () => whoIs(localStorage.getItem("wander_token")) || "nobody";

/** What's still waiting to send — only the signed-in person's own (on a phone handed from Ken to Andy, Ken's waiting
 *  idea note showed on Andy's screen as Andy's; confirmation tester k2, Oct 1 2026) */
export async function queuedBodies(urlPart: string, method = "POST"): Promise<Array<Record<string, unknown> & { _url: string; _at: number; _who: string | null }>> {
  const me = whoIs(localStorage.getItem("wander_token"));
  return (await queuedBodiesOfAnyone(urlPart, method)).filter((q) => !!me && q._who === me);
}

async function queuedBodiesOfAnyone(urlPart: string, method = "POST"): Promise<Array<Record<string, unknown> & { _url: string; _at: number; _who: string | null }>> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const all: QueuedRequest[] = await new Promise((resolve, reject) => {
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result as QueuedRequest[]);
      req.onerror = () => reject(req.error);
    });
    return all
      .filter((q) => q.method === method && q.url.includes(urlPart) && q.body)
      .map((q) => {
        try { return { ...(JSON.parse(q.body as string) as Record<string, unknown>), _url: q.url, _at: q.timestamp, _who: whoIs(q.headers?.Authorization) }; } catch { return null; }
      })
      .filter((x): x is Record<string, unknown> & { _url: string; _at: number; _who: string | null } => !!x);
  } catch {
    return [];
  }
}

/**
 * Take back something still waiting to send ("Undo" on a pick made with no signal) — otherwise it would
 * go out later, after the person had changed their mind.
 */
export async function dropQueued(urlPart: string, matches: (body: Record<string, unknown>) => boolean, method = "POST"): Promise<number> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    let dropped = 0;
    await new Promise<void>((resolve, reject) => {
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const q = cursor.value as QueuedRequest;
        let body: Record<string, unknown> | null = null;
        try { body = q.body ? JSON.parse(q.body) : null; } catch { body = null; }
        if (q.method === method && q.url.includes(urlPart) && body && matches(body)) { cursor.delete(); dropped++; }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return dropped;
  } catch {
    return 0;
  }
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
    // A trip note leaves this phone only when the server has it (Oct 1 2026: a refused send was dropped, words and
    // all), and always under the sign-in of the person who wrote it — on a phone handed to someone else, a note waiting
    // for signal must never arrive as theirs (privacy tester, Oct 1). Sign-ins last a year; one refused waits.
    const isNote = value.url.includes("/trip-notes");
    try {
      const res = await fetch(value.url, { method: value.method, headers: value.headers, body: value.body });
      if (isNote ? res.ok : (res.ok || res.status < 500)) {
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
