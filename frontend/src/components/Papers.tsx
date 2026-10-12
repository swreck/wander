/**
 * Papers kept from the trip (lib/papers.ts — Ken, Oct 12 2026: "documents that I'm not sure I want to throw away, but I
 * don't want to carry paper. and I want to associate with the date"). In Notes: "Keep a paper" in a fixed row under the
 * writing box, and the list after the person's own notes (verify21: the list arriving above their notes pushed them down
 * the screen); on a day's page: that day's papers, at the end with the other things kept for reference. Tapping one
 * opens it in the phone's own viewer (zoom, share, save).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { papersOf, keepPaperFile, removePaper, shortDay, type Paper } from "../lib/papers";

const CHANGED = "wander:papers-changed";

/** The papers this person may see, kept current when one is kept or removed here, by Scout, or on another phone */
function usePapers(tripId: string, date?: string) {
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [sharedWith, setSharedWith] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { const r = await papersOf(tripId, date); setPapers(r.papers); setSharedWith(r.sharedWith); } catch { setPapers((p) => p ?? []); }
  }, [tripId, date]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const again = () => { void load(); };
    window.addEventListener("wander:data-changed", again);
    window.addEventListener(CHANGED, again);
    return () => { window.removeEventListener("wander:data-changed", again); window.removeEventListener(CHANGED, again); };
  }, [load]);
  return { papers, sharedWith };
}
const changed = () => window.dispatchEvent(new Event(CHANGED));

function PaperRow({ p, showDay = true }: { p: Paper; showDay?: boolean }) {
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <li id={`paper-${p.id}`} className="bg-white rounded-xl border border-[#e0d8cc] p-3 flex gap-3">
      <a href={p.url} target="_blank" rel="noreferrer" aria-label={`Open ${p.title}`}
        className="shrink-0 w-14 h-[72px] rounded-lg overflow-hidden border border-[#e0d8cc] bg-[#f0ebe3] flex items-center justify-center">
        {p.smallUrl
          ? <img src={p.smallUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          : <span className="text-[11px] font-medium text-[#6b5d4a]">{p.pdf ? "PDF" : "Photo"}</span>}
      </a>
      <div className="min-w-0 flex-1">
        <a href={p.url} target="_blank" rel="noreferrer" className="block text-[15px] text-[#3a3128] font-medium [overflow-wrap:anywhere]">{p.title}</a>
        <p className="text-xs text-[#6b5d4a] mt-0.5">
          {showDay && p.dayDate
            ? <button onClick={() => navigate(`/day/${p.dayDate}`)} className="inline-block py-3 -my-3 underline underline-offset-2">{shortDay(p.dayDate)}{p.town ? ` · ${p.town}` : ""}</button>
            : showDay ? "No day" : null}
          {!p.mine && <>{showDay ? " · " : ""}kept by {p.authorName}</>}
        </p>
        {p.summary && <p className="text-sm text-[#514636] mt-1 line-clamp-3 [overflow-wrap:anywhere]">{p.summary}</p>}
        {p.mine && (asking ? (
          <div className="mt-1">
            <p className="text-sm text-[#3a3128]">Remove this paper from Wander?</p>
            <div className="flex gap-2">
              <button disabled={busy} onClick={async () => { setBusy(true); try { await removePaper(p.id); changed(); } catch { setBusy(false); } }}
                className="min-h-[44px] px-3 text-sm text-[#8a3a1a] disabled:opacity-50">Remove it</button>
              <button onClick={() => setAsking(false)} className="min-h-[44px] px-3 text-sm text-[#514636]">Keep it</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAsking(true)} className="-mb-2 min-h-[44px] text-sm text-[#6b5d4a]">Remove</button>
        ))}
      </div>
    </li>
  );
}

/** Notes, under the writing box: "Keep a paper" — a row that never changes height while the page loads */
export function PapersKeep({ tripId }: { tripId: string }) {
  const { papers } = usePapers(tripId);
  const [status, setStatus] = useState<{ kind: "reading" | "kept" | "error"; text: string; id?: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const keep = async (file: File) => {
    setStatus({ kind: "reading", text: "Reading it…" });
    const r = await keepPaperFile(tripId, file);
    if ("error" in r) { setStatus({ kind: "error", text: r.error }); return; }
    const p = r.paper;
    changed();
    const where = p.dayDate ? ` under ${shortDay(p.dayDate)}${p.town ? ` · ${p.town}` : ""}` : ", without a day";
    setStatus({ kind: "kept", id: p.id, text: `${p.read ? `Kept “${p.title}”${where}.` : `Kept. Wander couldn't read it, so it's${where}.`}${r.alsoKept ? ` ${r.alsoKept.by} kept one like it on that day — remove one if it's the same paper.` : ""}` });
  };
  return (
    <section className="mt-6" aria-labelledby="papers-h">
      <div className="flex items-center gap-3">
        <h2 id="papers-h" className="text-xs uppercase tracking-wide text-[#6b5d4a]">Papers</h2>
        {/* (how many, in the row's own height — the list itself is below the notes) */}
        {papers && papers.length > 0 && (
          <button onClick={() => document.getElementById("papers-list")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">{papers.length} kept ↓</button>
        )}
        <button onClick={() => input.current?.click()} disabled={status?.kind === "reading"}
          className="ml-auto min-h-[44px] px-4 rounded-xl bg-[#f0ebe3] text-sm text-[#514636] disabled:opacity-50">
          {status?.kind === "reading" ? "Reading it…" : "Keep a paper"}
        </button>
        {/* (an iPhone offers Take Photo, Photo Library and Choose File from this) */}
        <input ref={input} type="file" accept="image/*,application/pdf" className="hidden" aria-hidden tabIndex={-1}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void keep(f); }} />
      </div>
      <p className="text-[13px] text-[#6b5d4a] mt-1">Receipts, tickets and bills, kept here so you needn't carry them. Wander files each under its day.</p>
      {status && status.kind !== "reading" && (
        <p role="status" className={`mt-2 text-sm ${status.kind === "error" ? "text-[#8a3a1a]" : "text-[#3f5a2a]"}`}>
          {status.text}
          {/* (the list opens fully first — a paper past the first five was behind "Show all" and the tap did nothing;
              verify22) */}
          {status.id && <> <button onClick={() => window.dispatchEvent(new CustomEvent("wander:papers-see", { detail: { id: status.id } }))}
            className="min-h-[44px] underline underline-offset-2">See it ↓</button></>}
        </p>
      )}
    </section>
  );
}

/** Notes, after the person's own notes: the papers they may see, newest days first */
export function PapersList({ tripId }: { tripId: string }) {
  const { papers, sharedWith } = usePapers(tripId);
  const [all, setAll] = useState(false);
  // ("See it ↓" after keeping one: the whole list, then that paper)
  useEffect(() => {
    const see = (e: Event) => {
      const id = (e as CustomEvent).detail?.id;
      setAll(true);
      setTimeout(() => document.getElementById(`paper-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    };
    window.addEventListener("wander:papers-see", see);
    return () => window.removeEventListener("wander:papers-see", see);
  }, []);
  if (!papers || !papers.length) return null;
  return (
    <section id="papers-list" className="mt-8 scroll-mt-20" aria-labelledby="papers-list-h">
      <h2 id="papers-list-h" className="text-xs uppercase tracking-wide text-[#6b5d4a]">Papers</h2>
      <p className="text-[13px] text-[#6b5d4a] mt-1">{sharedWith ? `You and ${sharedWith} see each other's.` : "Only you see yours."}</p>
      <ul className="space-y-2 mt-2">
        {(all ? papers : papers.slice(0, 5)).map((p) => <PaperRow key={p.id} p={p} />)}
      </ul>
      {papers.length > 5 && (
        <button onClick={() => setAll((a) => !a)} className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">
          {all ? "Show fewer" : `Show all ${papers.length} papers`}
        </button>
      )}
    </section>
  );
}

/** A day's page: that day's papers, when there are any */
export function DayPapers({ tripId, date }: { tripId: string; date: string }) {
  const { papers } = usePapers(tripId, date);
  if (!papers || !papers.length) return null;
  return (
    <section className="mt-6" aria-labelledby={`papers-${date}`}>
      <h2 id={`papers-${date}`} className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-2">Papers</h2>
      <ul className="space-y-2">
        {papers.map((p) => <PaperRow key={p.id} p={p} showDay={false} />)}
      </ul>
    </section>
  );
}
