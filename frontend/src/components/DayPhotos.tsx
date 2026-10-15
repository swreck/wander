/**
 * "Photos from the day" on a day page (Oct 15 2026 — Ken: "Yes. Value, delight. Not gimmicks. Go"): your own photos and
 * the ones the others shared, by when they were taken; "+ Add photos" on a day that's come (today or before). Each new
 * photo is yours alone unless "Share with the trip" is on — that switch starts where you left it last time. A tap opens
 * the day's photos full screen, a swipe for the next; on your own, share or not, or delete (gone for real).
 */
import { useEffect, useRef, useState } from "react";
import useBackToClose from "../hooks/useBackToClose";
import { lockScroll } from "../lib/scrollLock";
import { photosOf, savedPhotos, keepPhotos, sharePhoto, captionPhoto, deletePhoto, useShowable, PHOTOS_CHANGED, type TripPhoto } from "../lib/tripPhotos";

const timeOf = (p: TripPhoto) => {
  const t = p.takenAt?.slice(11, 16);
  if (!t) return null;
  const h = Number(t.slice(0, 2)), m = t.slice(3, 5);
  return `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
};

export function PhotoViewer({ photos: all, start, me, onClose }: { photos: TripPhoto[]; start: number; me?: boolean; onClose: () => void }) {
  useBackToClose(true, onClose);
  const [at, setAt] = useState(Math.min(start, all.length - 1));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState<boolean | null>(null);   // a share or keep-it-mine on its way
  const [words, setWords] = useState<string | null>(null);     // the caption being written, while it is
  const [gone, setGone] = useState<Record<string, boolean>>({}); // pictures the server says aren't there for you anymore
  const x0 = useRef<number | null>(null);
  const photos = all.filter((x) => !gone[x.id]);
  useEffect(() => { const unlock = lockScroll(); return unlock; }, []);
  // (the list is the live one: a photo deleted or made private again leaves it at once, here as everywhere)
  useEffect(() => { if (!photos.length) onClose(); }, [photos.length, onClose]);
  useEffect(() => { if (at > photos.length - 1 && photos.length) setAt(photos.length - 1); }, [at, photos.length]);
  useEffect(() => { setWords(null); setConfirming(false); }, [at]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "ArrowRight") setAt((i) => Math.min(i + 1, photos.length - 1)); else if (e.key === "ArrowLeft") setAt((i) => Math.max(i - 1, 0)); else if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [photos.length, onClose]);
  const p = photos[Math.min(at, photos.length - 1)];
  if (!p) return null;
  const saveWords = async () => { if (words === null) return; setBusy(true); await captionPhoto(p.id, words); setBusy(false); setWords(null); };
  return (
    <div role="dialog" aria-modal="true" aria-label="Photos from the day" className="fixed inset-0 z-[320] bg-black text-white select-none"
      onTouchStart={(e) => { x0.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { if (x0.current === null) return; const dx = e.changedTouches[0].clientX - x0.current; x0.current = null; if (dx < -50) setAt((i) => Math.min(i + 1, photos.length - 1)); else if (dx > 50) setAt((i) => Math.max(i - 1, 0)); }}>
      {/* (a tap on its right goes on, on its left goes back — as Play does; user-andy2, Oct 16: only a swipe worked) */}
      <img key={p.id} src={p.url} alt={p.caption || `A photo ${p.mine ? "you" : p.authorName} took`} className="absolute inset-0 w-full h-full object-contain motion-safe:animate-[fadeIn_.25s_ease-out]"
        onClick={(e) => { if (words !== null) return; const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); if (e.clientX > r.left + r.width * 0.6) setAt((i) => Math.min(i + 1, photos.length - 1)); else if (e.clientX < r.left + r.width * 0.4) setAt((i) => Math.max(i - 1, 0)); }}
        onError={() => { setGone((g) => ({ ...g, [p.id]: true })); window.dispatchEvent(new Event(PHOTOS_CHANGED)); }} />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 bg-gradient-to-b from-black/60 to-transparent" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 6px)" }}>
        <span className="text-[13px] text-white/85">{at + 1} of {photos.length}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="min-w-[44px] min-h-[44px] text-xl">✕</button>
      </div>
      {/* (a darker backing: plain white words over a bright photo were hard to read — user-andy2) */}
      <div className="absolute inset-x-0 bottom-0 px-4 pt-14 bg-gradient-to-t from-black/90 via-black/70 to-transparent" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
        <p className="text-[15px]">{p.mine ? "You" : p.authorName}{timeOf(p) ? ` · ${timeOf(p)}` : ""}{!p.mine ? "" : p.shared ? " · shared with the trip" : " · just you"}</p>
        {words !== null ? (
          <form onSubmit={(e) => { e.preventDefault(); saveWords(); }} className="flex items-center gap-2 mt-2">
            <input autoFocus value={words} maxLength={300} onChange={(e) => setWords(e.target.value)} placeholder="What it is, or what happened"
              className="flex-1 min-w-0 min-h-[44px] rounded-lg bg-white/15 px-3 py-2 text-[16px] text-white placeholder:text-white/60 outline-none focus:bg-white/20" />
            <button type="submit" disabled={busy} className="min-h-[44px] px-2 text-[15px] font-medium">Save</button>
            <button type="button" onClick={() => setWords(null)} className="min-h-[44px] px-1 text-[15px] text-white/80">Cancel</button>
          </form>
        ) : p.caption ? <p className="text-[14px] text-white/85 mt-0.5">{p.caption}</p> : null}
        {p.mine && me !== false && words === null && (
          <div className="flex flex-wrap items-center gap-x-5 mt-1">
            <button type="button" onClick={() => setWords(p.caption || "")} className="min-h-[44px] text-[15px] underline underline-offset-4">{p.caption ? "Change the words" : "Add a few words"}</button>
            {/* (says it's on its way: on a slow signal the tap showed nothing for seconds — a second tap would undo it) */}
            <button type="button" disabled={busy} onClick={async () => { setBusy(true); setSharing(!p.shared); await sharePhoto(p.id, !p.shared); setSharing(null); setBusy(false); }}
              className="min-h-[44px] text-[15px] underline underline-offset-4 disabled:opacity-70">{sharing === false ? "Keeping it just for you…" : sharing === true ? "Sharing it with the trip…" : p.shared ? "Keep it just for me" : "Share with the trip"}</button>
            {confirming ? (
              <>
                <button type="button" disabled={busy} onClick={async () => { setBusy(true); const ok = await deletePhoto(p.id); setBusy(false); setConfirming(false); if (ok && photos.length <= 1) onClose(); }}
                  className="min-h-[44px] text-[15px] text-[#ffb4a0] underline underline-offset-4">Delete for good</button>
                <button type="button" onClick={() => setConfirming(false)} className="min-h-[44px] text-[15px] underline underline-offset-4">Don't delete</button>
              </>
            ) : <button type="button" onClick={() => setConfirming(true)} className="min-h-[44px] text-[15px] text-white/80 underline underline-offset-4">Delete</button>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DayPhotos({ tripId, date, canAdd, trip }: { tripId: string; date: string; canAdd: boolean; trip: { first: string; last: string } }) {
  const [listed, setPhotos] = useState<TripPhoto[]>(() => savedPhotos(tripId, date) || []);
  const photos = useShowable(listed);
  const [share, setShare] = useState(false);
  const [adding, setAdding] = useState<{ done: number; total: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let live = true;
    const get = () => photosOf(tripId, date).then((r) => { if (live && r) { setPhotos(r.photos); setShare(r.shareDefault); } });
    get();
    window.addEventListener(PHOTOS_CHANGED, get);
    return () => { live = false; window.removeEventListener(PHOTOS_CHANGED, get); };
  }, [tripId, date]);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 6000); return () => clearTimeout(t); }, [note]);

  if (!photos.length && !canAdd) return null;
  const pick = async (files: FileList | null) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith("image/") || !f.type).slice(0, 30);
    if (!list.length) return;
    setNote(null);
    setAdding({ done: 0, total: list.length });
    const r = await keepPhotos(tripId, list, date, share, trip, (done, total) => setAdding({ done, total }));
    // (the new ones in the strip before "added" is said — the note and the photos arrive together)
    const fresh = await photosOf(tripId, date);
    if (fresh) setPhotos(fresh.photos);
    setAdding(null);
    const elsewhere = r.days.filter((d) => d !== date);
    // (where the others went, by name: "3 added, shared with the trip (some on Oct 14, when they were taken)")
    const named = elsewhere.slice().sort().map((d) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    const days = named.length <= 2 ? named.join(" and ") : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
    const away = r.elsewhereCount;
    setNote(r.error ? r.error : `${r.kept === 1 ? "Added" : `${r.kept} added`}${share ? ", shared with the trip" : ", just for you"}${away ? ` (${away === r.kept ? "" : away === 1 ? "one " : "some "}on ${days}, when ${away === 1 ? "it was" : "they were"} taken)` : ""}.`);
  };
  return (
    <section aria-label="Photos from the day" className="mt-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a]">Photos from the day</h2>
        {canAdd && (
          <label className="flex items-center gap-2 text-[13px] text-[#514636] min-h-[44px] cursor-pointer">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="w-5 h-5 accent-[#514636]" />
            {/* (what this box does: the photos you add next — beside Andy's photo, "Share with the trip" read to Julie as if
                it might share what's already there; user-julie1) */}
            Share the ones I add
          </label>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mr-4 pr-4">
        {canAdd && (
          <button type="button" onClick={() => input.current?.click()} disabled={!!adding}
            className="shrink-0 w-[104px] h-[104px] rounded-xl border-2 border-dashed border-[#d9c7a6] bg-[#fdf8f0] flex flex-col items-center justify-center text-[#8a5a1a] disabled:opacity-60">
            <span className="text-2xl leading-none" aria-hidden>+</span>
            <span className="text-[12px] mt-1">{adding ? `Adding ${Math.min(adding.done + 1, adding.total)} of ${adding.total}` : "Add photos"}</span>
          </button>
        )}
        {photos.map((p, i) => (
          <button key={p.id} type="button" onClick={() => setOpen(i)} aria-label={`${p.mine ? "Your" : `${p.authorName}'s`} photo${timeOf(p) ? ` at ${timeOf(p)}` : ""}`}
            className="relative shrink-0 w-[104px] h-[104px] rounded-xl overflow-hidden bg-[#efe8dc]">
            {/* (a picture that's gone — made private again or deleted — hides rather than show a broken tile) */}
            <img src={p.thumbUrl} alt="" loading="lazy" className="w-full h-full object-cover" onError={(e) => { const tile = e.currentTarget.parentElement; if (tile) tile.style.display = "none"; }} />
            {!p.mine && <span className="absolute left-1 bottom-1 text-[10px] text-white bg-black/45 rounded px-1">{p.authorName}</span>}
            {p.mine && !p.shared && <span className="absolute left-1 bottom-1 text-[10px] text-white bg-black/45 rounded px-1">just you</span>}
          </button>
        ))}
      </div>
      {/* (says what the box above says — with it ticked, "Just yours unless you share them" left Andy unsure which wins;
          user-andy3) */}
      {!photos.length && canAdd && <p className="text-[13px] text-[#6b5d4a] mt-1">Your photos from this day, kept with it. {share ? "The ones you add are shared with the trip." : "The ones you add are just yours."}</p>}
      {note && <p className="text-[13px] text-[#4a6a3a] mt-1" role="status">{note}</p>}
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      {open !== null && <PhotoViewer photos={photos} start={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
