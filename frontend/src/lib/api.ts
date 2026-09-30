import { queueRequest, getQueueCount } from "./offlineStore";

const API_BASE = "/api";

// Paths where offline queueing makes sense (user-initiated mutations)
const QUEUEABLE_PATHS = [
  "/experiences", "/reservations", "/accommodations",
  "/days", "/cities", "/route-segments", "/captures",
  // Notes and same-day plans typed with no signal are kept on the phone and sent later
  "/experience-notes", "/day-choices",
];

function isQueueable(path: string, method: string): boolean {
  if (method === "GET") return false;
  return QUEUEABLE_PATHS.some((p) => path.startsWith(p));
}

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError && (
    (err as TypeError).message.includes("fetch") ||
    (err as TypeError).message.includes("network") ||
    (err as TypeError).message.includes("Failed to fetch") ||
    (err as TypeError).message.includes("Load failed")
  );
}

/**
 * `keepAfterMs`: for a save that's safe to send twice (a pick — the same pick again is the same pick). If
 * the server hasn't answered by then, the save is kept on the phone like one made with no signal, and sent
 * on the next open. Round 7: on a weak signal "Saving…" showed alone for 37 seconds, and closing Wander in
 * that time lost the change without a word.
 */
async function request<T>(path: string, options: RequestInit = {}, keepAfterMs?: number): Promise<T> {
  const token = localStorage.getItem("wander_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const method = options.method || "GET";

  // A read that hangs (bars showing, nothing answering) gives up after 12 seconds, so screens can
  // fall back to what the phone saved instead of waiting forever. Saves are never cut short.
  const patient = method !== "GET" && !!keepAfterMs && isQueueable(path, method);
  const controller = (method === "GET" || patient) && !options.signal ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), patient ? keepAfterMs! : 12_000) : null;

  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers, ...(controller ? { signal: controller.signal } : {}) });
    if (timer) clearTimeout(timer);

    // The offline helper answered from the phone's saved copy (weak or no signal)
    const saved = res.headers.get("x-wander-saved-copy");
    if (saved) window.dispatchEvent(new CustomEvent("wander:saved-copy", { detail: { savedAt: saved === "yes" ? null : saved } }));

    if (res.status === 401) {
      localStorage.removeItem("wander_token");
      localStorage.removeItem("wander_user");
      // Only a sign-in that was actually turned away is news. (After signing out on purpose, a request
      // still on its way comes back refused — that's not an "expired session".)
      if (token) window.dispatchEvent(new CustomEvent("wander:session-expired"));
      throw new Error("Unauthorized");
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // The status and the whole answer ride along, for screens that act on them (People: "same name?")
      throw Object.assign(new Error(body.error || `Request failed: ${res.status}`), { status: res.status, body });
    }

    return res.json();
  } catch (err) {
    if (timer) clearTimeout(timer);
    const gaveUp = !!controller?.signal.aborted;
    if (gaveUp && !patient) throw new TypeError("Failed to fetch: no answer (weak signal)");
    // Queue mutations when offline (or, for a save that's safe to repeat, when the signal is too weak to answer)
    if ((gaveUp || isNetworkError(err)) && isQueueable(path, method)) {
      await queueRequest({
        url: `${API_BASE}${path}`,
        method,
        headers,
        body: options.body as string | null,
        timestamp: Date.now(),
      });

      const count = await getQueueCount();
      window.dispatchEvent(new CustomEvent("wander:offline-queued", { detail: { count, path } }));

      // Return a synthetic response so the UI doesn't crash
      return { _queued: true } as T;
    }
    throw err;
  }
}

async function uploadRequest<T>(path: string, formData: FormData): Promise<T> {
  const token = localStorage.getItem("wander_token");
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  // Do NOT set Content-Type — browser sets it with boundary for multipart

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: formData,
    });
  } catch {
    throw new Error("You're offline — photos need a connection to upload. Try again when you're back online.");
  }

  if (res.status === 401) {
    localStorage.removeItem("wander_token");
    localStorage.removeItem("wander_user");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export const api = {
  get: <T>(path: string, extraHeaders?: Record<string, string>) =>
    request<T>(path, extraHeaders ? { headers: extraHeaders } : {}),
  post: <T>(path: string, body: unknown, extraHeaders?: Record<string, string>) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body), headers: extraHeaders }),
  /** A save that's safe to send twice: kept on the phone if the signal can't carry it within `ms` */
  postRepeatable: <T>(path: string, body: unknown, ms = 6000) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }, ms),
  patch: <T>(path: string, body: unknown, extraHeaders?: Record<string, string>) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body), headers: extraHeaders }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) => uploadRequest<T>(path, formData),
};
