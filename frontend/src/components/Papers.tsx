/**
 * Papers kept from the trip (lib/papers.ts — Ken, Oct 12 2026: "documents that I'm not sure I want to throw away, but I
 * don't want to carry paper. and I want to associate with the date"). In Notes: "Keep a paper" in a fixed row under the
 * writing box, and the list after the person's own notes (verify21: the list arriving above their notes pushed them down
 * the screen); on a day's page: that day's papers, at the end with the other things kept for reference.
 * Tapping one opens it full screen inside Wander (PaperViewer): pinch to zoom, Done or Back to close, who sees it, and
 * save or send. (Ken, Oct 25, on the Baian ryokan's welcome sheet: "At this screen should be able to zoom in or change
 * the distribution between self and group. Think through use case" — it had opened the bare photo in its own window,
 * which in the Home Screen app has no way back.)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import PictureViewer from "./PictureViewer";
import { papersOf, keepPaperFile, removePaper, sharePaper, namesInWords, shortDay, type Paper, type PaperShare } from "../lib/papers";

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

/** Who sees it, in a few words, for the list and the viewer */
function whoSees(p: Pick<Paper, "mine" | "share" | "authorName">, partner: string | null): string {
  if (!p.mine) return p.share === "group" ? `${p.authorName} shared it with everyone` : `Kept by ${p.authorName}`;
  return p.share === "group" ? "Everyone on the trip sees it" : p.share === "pair" && partner ? `You and ${partner} see it` : "Only you see it";
}

/** The file, ready to hand to the phone's share sheet the moment Save or send is tapped (an iPhone allows the sheet only
 *  straight from the tap, so it's fetched when the viewer opens) */
function useFileFor(p: Paper) {
  const [file, setFile] = useState<File | null>(null);
  // (kept back or removed by its keeper since this card or list was drawn: the server refuses it)
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    let gone = false;
    fetch(p.url).then((r) => { if (r.status === 403 || r.status === 404) { if (!gone) setRefused(true); return null; } return r.ok ? r.blob() : null; }).then((b) => {
      if (!b || gone) return;
      const name = `${p.title.replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "Paper"}.${p.pdf ? "pdf" : "jpg"}`;
      setFile(new File([b], name, { type: b.type || (p.pdf ? "application/pdf" : "image/jpeg") }));
    }).catch(() => { /* Save or send falls back to a download */ });
    return () => { gone = true; };
  }, [p.url, p.title, p.pdf]);
  return { file, refused };
}

/** One paper, full screen: the picture to pinch and drag, what Wander read on it, who sees it, and save or send */
export function PaperViewer({ paper, partner, onClose, onShare }: { paper: Paper; partner: string | null; onClose: () => void; onShare?: (s: PaperShare) => void }) {
  const [share, setShare] = useState<PaperShare>(paper.share);
  const [said, setSaid] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const { file, refused } = useFileFor(paper);
  const choose = async (s: PaperShare) => {
    if (s === share || busy) return;
    const was = share;
    setShare(s); setBusy(true); setSaid(null);
    try {
      const r = await sharePaper(paper.id, s);
      setShare(r.share);
      setSaid({ text: r.share === "group"
        ? `Everyone on the trip can see it now.${r.told.length ? ` ${namesInWords(r.told)} will see a card about it the next time they open Wander.` : ""}`
        : r.share === "pair" ? `Now only you and ${partner} see it.` : "Now only you see it." });
      onShare?.(r.share);
      changed();
    } catch {
      setShare(was);
      setSaid({ text: "That didn't change. Try again in a moment.", bad: true });
    } finally { setBusy(false); }
  };
  const save = async () => {
    try {
      if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: paper.title }); return; }
    } catch (e: any) { if (e?.name === "AbortError") return; }
    // (no share sheet, a computer's browser: download it)
    const a = document.createElement("a");
    a.href = paper.url; a.download = file?.name || paper.title; a.rel = "noreferrer";
    document.body.appendChild(a); a.click(); a.remove();
  };
  const options: { s: PaperShare; label: string }[] = [
    { s: "me", label: "Just me" },
    ...(partner ? [{ s: "pair" as const, label: `${partner} and me` }] : []),
    { s: "group", label: "Everyone" },
  ];
  // (on the page itself, so no screen it's opened from can clip or shift it)
  if (refused) return createPortal(
    <PictureViewer src="" alt={paper.title} title={paper.title} onClose={onClose}
      missing={paper.mine ? "This paper was removed from Wander." : "This paper isn't shared with you any more."} />,
    document.body,
  );
  return createPortal(
    <PictureViewer src={paper.url} alt={paper.title} title={paper.title} pdf={paper.pdf} onClose={onClose}
      // (the summary stays while zoomed: hiding it grew the picture's space and the picture hopped under the fingers)
      footer={() => (
        <div data-paper-footer className="bg-[#1d1813] text-white px-4 pt-3" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}>
          {paper.summary && (
            <button onClick={() => setMore((m) => !m)} className={`w-full min-h-[44px] text-left text-[14px] leading-snug text-white/85 ${more ? "block max-h-[30vh] overflow-y-auto" : "line-clamp-2"}`}>
              {paper.summary}
            </button>
          )}
          {paper.mine ? (
            <div className="mt-3" role="group" aria-label="Who sees it">
              <p className="text-xs uppercase tracking-wide text-white/60">Who sees it</p>
              <div className="flex gap-1 mt-1 rounded-xl bg-white/10 p-1">
                {options.map((o) => (
                  <button key={o.s} onClick={() => void choose(o.s)} disabled={busy} aria-pressed={share === o.s}
                    className={`flex-1 min-h-[44px] rounded-lg text-[14px] ${share === o.s ? "bg-white text-[#3a3128] font-medium" : "text-white/85"} disabled:opacity-70`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[13px] text-white/70">{whoSees({ ...paper, share }, partner)}.</p>
          )}
          {said && <p role="status" className={`mt-2 text-[13px] ${said.bad ? "text-[#f3b39a]" : "text-white/85"}`}>{said.text}</p>}
          <button onClick={() => void save()} className="mt-2 min-h-[44px] text-[15px] text-white underline underline-offset-2">Save or send</button>
        </div>
      )} />,
    document.body,
  );
}

function PaperRow({ p, showDay = true, partner, onOpen }: { p: Paper; showDay?: boolean; partner: string | null; onOpen: (p: Paper) => void }) {
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <li id={`paper-${p.id}`} className="bg-white rounded-xl border border-[#e0d8cc] p-3 flex gap-3">
      <button onClick={() => onOpen(p)} aria-label={`Open ${p.title}`}
        className="shrink-0 w-14 h-[72px] rounded-lg overflow-hidden border border-[#e0d8cc] bg-[#f0ebe3] flex items-center justify-center">
        {p.smallUrl
          ? <img src={p.smallUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          : <span className="text-[11px] font-medium text-[#6b5d4a]">{p.pdf ? "PDF" : "Photo"}</span>}
      </button>
      <div className="min-w-0 flex-1">
        <button onClick={() => onOpen(p)} className="block text-left text-[15px] text-[#3a3128] font-medium [overflow-wrap:anywhere]">{p.title}</button>
        <p className="text-xs text-[#6b5d4a] mt-0.5">
          {showDay && p.dayDate
            ? <button onClick={() => navigate(`/day/${p.dayDate}`)} className="inline-block py-3 -my-3 underline underline-offset-2">{shortDay(p.dayDate)}{p.town ? ` · ${p.town}` : ""}</button>
            : showDay ? "No day" : null}
          {/* (who sees it, when it isn't how theirs usually are) */}
          {(!p.mine || p.share === "group" || (p.share === "me" && partner)) && <>{showDay ? " · " : ""}{whoSees(p, partner)}</>}
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

/** The paper open full screen, by id, so it follows the list as it reloads (a change of who sees it shows at once) */
function useOpenPaper(papers: Paper[] | null) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? papers?.find((p) => p.id === openId) ?? null : null;
  return { open, setOpenId };
}

/** Notes, under the writing box: "Keep a paper" — a row that never changes height while the page loads */
export function PapersKeep({ tripId }: { tripId: string }) {
  const { papers, sharedWith } = usePapers(tripId);
  const { open, setOpenId } = useOpenPaper(papers);
  const [status, setStatus] = useState<{ kind: "reading" | "kept" | "error"; text: string; id?: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const keep = async (file: File) => {
    setStatus({ kind: "reading", text: "Reading it…" });
    const r = await keepPaperFile(tripId, file);
    if ("error" in r) { setStatus({ kind: "error", text: r.error }); return; }
    const p = r.paper;
    changed();
    const where = p.dayDate ? ` under ${shortDay(p.dayDate)}${p.town ? ` · ${p.town}` : ""}` : ", without a day";
    setStatus({ kind: "kept", id: p.id, text: `${p.read ? `Kept “${p.title}”${where}.` : `Kept. Wander couldn't read it, so it's${where}.`}${r.alsoKept ? ` ${r.alsoKept.by} kept one like it on that day. Remove one if it's the same paper.` : ""}` });
  };
  const kept = status?.id ? papers?.find((p) => p.id === status.id) : undefined;
  return (
    <section className="mt-6" aria-labelledby="papers-h">
      <div className="flex items-center gap-3">
        <h2 id="papers-h" className="text-xs uppercase tracking-wide text-[#6b5d4a]">Papers</h2>
        {/* (how many, in the row's own height — the list itself is below the notes) */}
        {papers && papers.length > 0 && (
          <button onClick={() => document.getElementById("papers-list")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">{papers.length} paper{papers.length === 1 ? "" : "s"} ↓</button>
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
          {/* (straight to it full screen, where who sees it is chosen — the welcome sheet everyone wants; on its own line:
              inline, its height opened a gap in the sentence) */}
          {kept && <button onClick={() => setOpenId(kept.id)} className="block min-h-[44px] underline underline-offset-2">See it or share it</button>}
        </p>
      )}
      {open && <PaperViewer paper={open} partner={sharedWith} onClose={() => setOpenId(null)} />}
    </section>
  );
}

/** Notes, after the person's own notes: the papers they may see, newest days first */
export function PapersList({ tripId }: { tripId: string }) {
  const { papers, sharedWith } = usePapers(tripId);
  const { open, setOpenId } = useOpenPaper(papers);
  const [all, setAll] = useState(false);
  if (!papers || !papers.length) return null;
  return (
    <section id="papers-list" className="mt-8 scroll-mt-20" aria-labelledby="papers-list-h">
      <h2 id="papers-list-h" className="text-xs uppercase tracking-wide text-[#6b5d4a]">Papers</h2>
      <p className="text-[13px] text-[#6b5d4a] mt-1">{sharedWith ? `You and ${sharedWith} see each other's.` : "Only you see yours."} Open one to zoom in, or to share yours with everyone.</p>
      <ul className="space-y-2 mt-2">
        {(all ? papers : papers.slice(0, 5)).map((p) => <PaperRow key={p.id} p={p} partner={sharedWith} onOpen={(x) => setOpenId(x.id)} />)}
      </ul>
      {papers.length > 5 && (
        <button onClick={() => setAll((a) => !a)} className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">
          {all ? "Show fewer" : `Show all ${papers.length} papers`}
        </button>
      )}
      {open && <PaperViewer paper={open} partner={sharedWith} onClose={() => setOpenId(null)} />}
    </section>
  );
}

/** A day's page: that day's papers, when there are any */
export function DayPapers({ tripId, date }: { tripId: string; date: string }) {
  const { papers, sharedWith } = usePapers(tripId, date);
  const { open, setOpenId } = useOpenPaper(papers);
  if (!papers || !papers.length) return null;
  return (
    <section className="mt-6" aria-labelledby={`papers-${date}`}>
      <h2 id={`papers-${date}`} className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-2">Papers</h2>
      <ul className="space-y-2">
        {papers.map((p) => <PaperRow key={p.id} p={p} showDay={false} partner={sharedWith} onOpen={(x) => setOpenId(x.id)} />)}
      </ul>
      {open && <PaperViewer paper={open} partner={sharedWith} onClose={() => setOpenId(null)} />}
    </section>
  );
}
