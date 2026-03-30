import { queueRequest, getQueueCount } from "./offlineStore";

const API_BASE = "/api";

// Paths where offline queueing makes sense (user-initiated mutations)
const QUEUEABLE_PATHS = [
  "/experiences", "/reservations", "/accommodations",
  "/days", "/cities", "/route-segments", "/captures",
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

  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

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
  } catch (err) {
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
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) => uploadRequest<T>(path, formData),
};
