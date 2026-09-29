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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
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
  const controller = method === "GET" && !options.signal ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 12_000) : null;

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
    if (controller?.signal.aborted) throw new TypeError("Failed to fetch: no answer (weak signal)");
    // Queue mutations when offline
    if (isNetworkError(err) && isQueueable(path, method)) {
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
  patch: <T>(path: string, body: unknown, extraHeaders?: Record<string, string>) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body), headers: extraHeaders }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) => uploadRequest<T>(path, formData),
};
