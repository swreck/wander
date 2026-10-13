/**
 * Papers kept from the trip (Ken, Oct 12 2026): receipts, tickets, bills — kept in Wander instead of carried, filed under
 * the trip day they belong to. Seen by whoever kept them, and between Ken and Larisa both ways. Backend:
 * routes/papers.ts, services/papers.ts.
 */
import { api } from "./api";
import { phoneReport } from "./phoneReport";

export interface Paper {
  id: string; title: string; summary: string; dayDate: string | null; town: string | null; authorName: string;
  mine: boolean; pdf: boolean; createdAt: string; url: string; smallUrl: string | null;
}
export interface Papers { papers: Paper[]; sharedWith: string | null }

export const papersOf = (tripId: string, date?: string) =>
  api.get<Papers>(`/papers/trip/${tripId}${date ? `?date=${date}` : ""}`);

export const removePaper = (id: string) => api.post<{ ok: boolean }>(`/papers/${id}/remove`, {});

/** A picture, shrunk on the phone so its words stay sharp (longest side 2000 px) — plus a small copy for the list */
async function shrink(file: File): Promise<{ data: string; thumb: string } | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const draw = (max: number, q: number) => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext("2d");
      if (!g) return "";
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", q);
    };
    const full = draw(2000, 0.85), thumb = draw(240, 0.7);
    return full && thumb ? { data: full.split(",")[1], thumb } : null;
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}
const asBase64 = (file: File) => new Promise<string | null>((ok) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result || "").split(",")[1] || null);
  r.onerror = () => ok(null);
  r.readAsDataURL(file);
});

/** Keep one paper: Wander reads it and files it under its day. The kept paper, or why it couldn't be kept. */
export async function keepPaperFile(tripId: string, file: File): Promise<{ paper: { id: string; title: string; dayDate: string | null; town: string | null; read: boolean }; alsoKept?: { by: string; title: string } | null } | { error: string }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { error: "No signal right now. Keep it again when there's signal — the paper stays on your phone meanwhile." };
  let body: { mediaType: string; data: string; name: string; thumb?: string };
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    if (file.size > 10 * 1024 * 1024) return { error: "That PDF is too large to keep (over 10 MB). A photo of it works." };
    const data = await asBase64(file);
    if (!data) return { error: "That file couldn't be read on this phone." };
    body = { mediaType: "application/pdf", data, name: file.name || "document.pdf" };
  } else if (file.type.startsWith("image/") || !file.type) {
    const p = await shrink(file);
    if (!p) return { error: "That picture couldn't be read on this phone. A screenshot of it works." };
    body = { mediaType: "image/jpeg", data: p.data, name: file.name || "photo.jpg", thumb: p.thumb };
  } else {
    return { error: "Only a photo, a picture or a PDF can be kept as a paper." };
  }
  // (the phone's own date — a paper Wander can't read goes under today as this person lives it, not the server's UTC day;
  // verify21) — and never "Reading it…" for ever: the server gives up reading at 45 s and keeps it as it is
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return Promise.race([
    send(tripId, { file: body, today }, Math.round(((body.data.length + (body.thumb?.length || 0)) * 0.75) / 1024)),
    new Promise<{ error: string }>((ok) => setTimeout(() => ok({ error: "That took too long — the signal may be weak. If it was kept, it shows below in a moment; if not, try again." }), 90_000)),
  ]);
}

type Kept = { paper: { id: string; title: string; dayDate: string | null; town: string | null; read: boolean }; alsoKept?: { by: string; title: string } | null };
/** Send it — again, by itself, when the connection breaks partway (Ken, Oct 13 10:01 JST, full bars: "Wander couldn't
 *  keep it just now — the signal may have dropped"; the server saw the send cut off mid-photo, and his second try
 *  worked). A send cut off partway keeps nothing, so sending again can't make two. Up to three tries; while Wander is in
 *  the background it waits to be back first. What happened goes to the server's log (numbers only). */
async function send(tripId: string, payload: unknown, kb: number): Promise<Kept | { error: string }> {
  const t0 = Date.now();
  let hidden = false;
  const seen = () => { if (document.visibilityState === "hidden") hidden = true; };
  document.addEventListener("visibilitychange", seen);
  const back = () => document.visibilityState === "visible" ? Promise.resolve() : new Promise<void>((ok) => {
    const f = () => { if (document.visibilityState === "visible") { document.removeEventListener("visibilitychange", f); ok(); } };
    document.addEventListener("visibilitychange", f);
  });
  const report = (result: "kept-after-retry" | "failed-after-retries", tries: number) => {
    phoneReport("paper", { result, tries, kb, secs: Math.round((Date.now() - t0) / 1000), online: navigator.onLine !== false, hidden });
  };
  try {
    for (let tries = 1; ; tries++) {
      try {
        const r = await api.post<Kept>(`/papers/trip/${tripId}`, payload);
        if (tries > 1) report("kept-after-retry", tries);
        return r;
      } catch (e: any) {
        // (Wander answered: its own words, never tried again)
        if (typeof e?.status === "number") return { error: e?.body?.error || "Wander couldn't keep that one. Try again in a moment." };
        if (tries >= 3 || navigator.onLine === false) {
          report("failed-after-retries", tries);
          return { error: navigator.onLine === false
            ? "No signal right now. Keep it again when there's signal — the paper stays on your phone meanwhile."
            : "The paper didn't finish sending. Try again in a moment." };
        }
        await back();
        await new Promise((ok) => setTimeout(ok, tries === 1 ? 1500 : 4000));
      }
    }
  } finally {
    document.removeEventListener("visibilitychange", seen);
  }
}

/** "Oct 10" */
export const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
