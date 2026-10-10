/**
 * "Sources" under a Scout answer: where each part of it came from — her Guide's tab, cell and exact words;
 * something Wander worked out and what from; a plan someone added in Wander; a web page. Parts with no source
 * are listed as Scout's own words. All of it was recorded as Scout answered (backend answerSources.ts); this
 * screen only shows it. Opened only when someone asks. (Ken, Sep 30 2026: a wrong source is worse than none.)
 */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { voiceFor } from "../lib/guideDisplay";
import PictureViewer from "./PictureViewer";
import { sheetLinks, rangeOf, type SheetLink, type SheetLinks } from "../lib/sheetLinks";

type CellWords =
  | { kind: "cell"; tab: string; a1: string; text: string; part?: boolean }
  | { kind: "picture"; tab: string; anchor: string; sha256: string }
  | { kind: "tab"; tab: string };

type SourceView =
  | { type: "guide"; label: string; cells: CellWords[]; wanderNotes?: string[] }
  | { type: "wander"; what: string; from: { label: string; cells: CellWords[] }[] }
  | { type: "added"; by: string; text: string }
  | { type: "web"; title: string; url: string; quote: string }
  | { type: "sheet"; source: string; owner: string; authorship: string | null; label: string; cells: CellWords[] }
  | { type: "map"; guide: string; link: string; readAt: string; places: { name: string; address: string | null }[]; worked?: boolean }
  // A document someone gave Wander (Backroads' itinerary): whose words, where in it, the words
  | { type: "document"; document: string; from: string; version: string; place: string; quote: string; aside?: string };

export interface AnswerSources {
  copy: string | null;
  // matched: Scout quoted these words without pointing to them; Wander found the one line holding them, word for word
  claims: { said: string; sources: SourceView[]; unmatchedTimes?: string[]; matched?: boolean }[];
  ownWords: string[];
  /** a photo came with the question: what Scout read from it has no Guide source */
  photo?: boolean;
}

/** An answer that quotes her Guide (a claim pointing at her tabs) — not one only in Scout's own words or from the web */
export function citesGuide(s: AnswerSources | undefined | null): boolean {
  return !!s && (s.claims || []).some((c) => c.sources.some((v) => v.type === "guide"));
}

export function hasSources(s: AnswerSources | undefined | null): s is AnswerSources {
  return !!s && ((s.claims?.length || 0) > 0 || (s.ownWords?.length || 0) > 0);
}

/** Which sheet the cells below are in, and how to say it to this person ("your sheet", "Larisa's sheet") */
const SheetOf = createContext<{ link: SheetLink | null; whose: string } | null>(null);

/** "Open at this spot in her sheet ↗" — the exact tab and cells when Wander knows the tab's id; otherwise her sheet,
 *  with the tab and cell said in words (Ken, Oct 2: asking Scout should be the fastest way to find the exact spot) */
function OpenSpot({ tab, a1s }: { tab: string; a1s: string[] }) {
  const sheet = useContext(SheetOf);
  if (!sheet?.link) return null;
  const gid = sheet.link.tabs[tab];
  const range = a1s.length ? rangeOf(a1s) : "";
  const href = gid === undefined ? sheet.link.url : `${sheet.link.url}?gid=${gid}#gid=${gid}${range ? `&range=${range}` : ""}`;
  return (
    <p className="text-sm">
      <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center min-h-[44px] text-[#514636] underline underline-offset-2">
        {gid === undefined ? `Open ${sheet.whose} ↗` : `Open at this spot in ${sheet.whose} ↗`}
      </a>
      {gid === undefined && <span className="text-[13px] text-[#6b5d4a]"> — then the “{tab}” tab{range ? `, ${range.includes(":") ? "cells" : "cell"} ${range}` : ""}</span>}
    </p>
  );
}

/** Her cells, as she'd find them in her sheet: the tab, the cell, and exactly what's in it — then a way to open
 *  that spot in her sheet, once per tab */
function Cells({ cells, tripId }: { cells: CellWords[]; tripId?: string }) {
  // (her own words to Larisa: "your … tab")
  const v = voiceFor(useAuth().user?.displayName);
  if (!cells.length) return <p className="text-sm text-[#6b5d4a]">Wander couldn't point to the one cell for this.</p>;
  // (after the last of a tab's cells: one way in for all of them)
  const lastOfTab = (i: number) => !cells.slice(i + 1).some((c) => c.tab === cells[i].tab);
  const spotsIn = (tab: string) => cells.flatMap((c) => (c.tab !== tab ? [] : c.kind === "cell" ? [c.a1] : c.kind === "picture" && c.anchor ? [c.anchor] : []));
  return (
    <ul className="space-y-1.5">
      {cells.map((c, i) => (
        <li key={i}>
          {c.kind === "cell" ? (
            <>
              <p className="text-[13px] text-[#6b5d4a]">{c.tab} · {c.a1}{c.part ? " (part of the cell)" : ""}</p>
              <p className="text-sm text-[#3a3128] whitespace-pre-wrap [overflow-wrap:anywhere] bg-white border border-[#e0d8cc] rounded-md px-2 py-1">{c.text}</p>
            </>
          ) : c.kind === "picture" ? (
            <Picture tab={c.tab} anchor={c.anchor} sha256={c.sha256} tripId={tripId} />
          ) : (
            <p className="text-sm text-[#3a3128]">{v.Her} {c.tab} tab <span className="text-[#6b5d4a]">(Wander couldn't pin the exact cell)</span></p>
          )}
          {lastOfTab(i) && <OpenSpot tab={c.tab} a1s={spotsIn(c.tab)} />}
        </li>
      ))}
    </ul>
  );
}

/** A screenshot she pasted into the Guide — opened on request */
function Picture({ tab, anchor, sha256, tripId }: { tab: string; anchor: string; sha256: string; tripId?: string }) {
  const v = voiceFor(useAuth().user?.displayName);
  const [url, setUrl] = useState<string | null>(null);
  // "Opening…" lasts until the picture has actually arrived (a screenshot can be half a megabyte on hotel wifi)
  const [state, setState] = useState<"idle" | "opening" | "shown" | "failed" | "personal">("idle");
  const [full, setFull] = useState(false);
  return (
    <div>
      <p className="text-[13px] text-[#6b5d4a]">A picture in {v.her} {tab} tab{anchor ? ` (at ${anchor})` : ""}</p>
      {/* (someone's own travel numbers are on it — Ken, Oct 4: Wander doesn't surprise people with them) */}
      {state === "personal" && <p className="text-sm text-[#514636] mt-1">Wander keeps this one to {v.owners} sheet — it has people's own travel numbers on it.</p>}
      {state !== "shown" && state !== "personal" && (
        <button
          disabled={!tripId || state === "opening"}
          onClick={async () => {
            setState("opening");
            try {
              const r = await api.get<{ url: string | null; personal?: boolean }>(`/guide/picture-link/${tripId}/${sha256}`);
              if (r.personal || !r.url) setState("personal"); else setUrl(r.url);
            } catch { setState("failed"); }
          }}
          className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2 disabled:opacity-50"
        >
          {state === "opening" ? "Opening…" : state === "failed" ? "Couldn't open it — try again?" : "See the picture"}
        </button>
      )}
      {url && state !== "failed" && (
        <button onClick={() => state === "shown" && setFull(true)} className={state === "shown" ? "block w-full" : "hidden"} aria-label="See this picture full screen">
          <img src={url} alt={`The picture in ${v.her} ${tab} tab`} onLoad={() => setState("shown")} onError={() => { setUrl(null); setState("failed"); }}
            className="mt-1 w-full rounded-md border border-[#e0d8cc]" />
        </button>
      )}
      {url && state === "shown" && <button onClick={() => setFull(true)} className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">See it full screen ›</button>}
      {full && url && <PictureViewer src={url} alt={`The picture in ${v.her} ${tab} tab`} onClose={() => setFull(false)} />}
    </div>
  );
}

const LinksOf = createContext<SheetLinks | null>(null);
/** Her Guide's own sheet — "your sheet" on Larisa's phone */
function HerSheet({ children }: { children: React.ReactNode }) {
  const links = useContext(LinksOf);
  const me = useAuth().user?.displayName?.trim().toLowerCase();
  return <SheetOf.Provider value={{ link: links?.link ?? null, whose: me === "larisa" ? "your sheet" : "Larisa's sheet" }}>{children}</SheetOf.Provider>;
}
/** Another sheet Wander reads (Ken's rail sheet) — "your rail sheet" on Ken's phone */
function OtherSheet({ name, owner, children }: { name: string; owner: string; children: React.ReactNode }) {
  const links = useContext(LinksOf);
  const me = useAuth().user?.displayName?.trim().toLowerCase();
  const whose = me === owner.trim().toLowerCase() ? `your ${name.toLowerCase()}` : `${owner}'s ${name.toLowerCase()}`;
  return <SheetOf.Provider value={{ link: links?.others?.[name] ?? null, whose }}>{children}</SheetOf.Provider>;
}

function Source({ s, tripId }: { s: SourceView; tripId?: string }) {
  const v = voiceFor(useAuth().user?.displayName);
  const guide = v.mine ? "your Guide" : "Larisa's Guide";
  if (s.type === "guide") {
    return (
      <div>
        <p className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-1">{v.mine ? "Your Guide" : "Larisa's Guide"}</p>
        <HerSheet><Cells cells={s.cells} tripId={tripId} /></HerSheet>
        {s.wanderNotes?.map((n) => (
          <p key={n} className="text-[13px] text-[#8a5a1a] bg-[#fff8ec] rounded-md px-2 py-1 mt-1.5">Wander's note, not her words: {n}</p>
        ))}
      </div>
    );
  }
  if (s.type === "wander") {
    return (
      <div>
        <p className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-1">Worked out by Wander</p>
        <p className="text-sm text-[#3a3128]">{s.what}.</p>
        {s.from.length > 0 && (
          <div className="mt-1.5 pl-2 border-l-2 border-[#e0d8cc] space-y-2">
            <p className="text-[13px] text-[#6b5d4a]">From {v.her} Guide:</p>
            <HerSheet>{s.from.map((f, i) => <Cells key={i} cells={f.cells} tripId={tripId} />)}</HerSheet>
          </div>
        )}
      </div>
    );
  }
  if (s.type === "sheet") {
    // Another source (Ken's rail sheet): named, whose it is and how it was written — never passed off as her Guide
    return (
      <div>
        <p className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-1">{s.owner}'s {s.source.toLowerCase()}{s.authorship ? `, ${s.authorship}` : ""} — not {guide}</p>
        <OtherSheet name={s.source} owner={s.owner}><Cells cells={s.cells} tripId={tripId} /></OtherSheet>
      </div>
    );
  }
  if (s.type === "document") {
    // Backroads' itinerary (Oct 4): their words, the day and page — never passed off as her Guide
    return (
      <div>
        <p className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-1">{s.document} — not {guide}</p>
        {s.place && <p className="text-[13px] text-[#6b5d4a]">{s.place}</p>}
        <p className="text-sm text-[#3a3128] whitespace-pre-line">“{s.quote}”</p>
        {/* ("their general itinerary, dated May 7, 2026" → "Backroads' general itinerary, dated May 7, 2026"; a file sent
            with the question: "Sent with the question — Wander doesn't keep it") */}
        <p className="text-xs text-[#6b5d4a] mt-1">{s.version.replace(/^their\b/, s.from.endsWith("s") ? `${s.from}'` : `${s.from}'s`).replace(/^./, (c) => c.toUpperCase())}.{s.aside ? ` ${s.aside}` : ""}</p>
      </div>
    );
  }
  if (s.type === "map") {
    // Her Apple Maps guide for a day — her map, not her sheet; distances are Wander's, between the map's own places
    const read = new Date(s.readAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return (
      <div>
        <p className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-1">
          {s.worked ? `Worked out by Wander from ${v.her} Apple Maps guide` : `${v.Her} Apple Maps guide`} — not {guide}
        </p>
        {s.worked && <p className="text-sm text-[#3a3128]">Straight-line distances between the places on {v.her} map, not walking times.</p>}
        <p className="text-sm text-[#3a3128]">“{s.guide}”, as Wander read it {read}: {s.places.map((p) => p.name).join(" · ")}</p>
        <a href={s.link} target="_blank" rel="noreferrer" className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2">
          Open {v.her} map ↗
        </a>
      </div>
    );
  }
  if (s.type === "added") {
    return (
      <div>
        <p className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-1">Added in Wander by {s.by}</p>
        <p className="text-sm text-[#3a3128]">“{s.text}” <span className="text-[#6b5d4a]">— not in {guide}</span></p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-1">From the web — not {guide}</p>
      <a href={s.url} target="_blank" rel="noreferrer" className="block min-h-[44px] py-1 text-sm text-[#514636] underline underline-offset-2 [overflow-wrap:anywhere]">
        {s.title}
        <span className="block text-[13px] text-[#6b5d4a] no-underline">{s.url}</span>
      </a>
      {s.quote && <p className="text-sm text-[#3a3128] bg-white border border-[#e0d8cc] rounded-md px-2 py-1 whitespace-pre-wrap [overflow-wrap:anywhere]">“{s.quote.trim()}”</p>}
    </div>
  );
}

// The history step this panel added, when it's about to be taken back. React runs a panel's first setup twice
// in development (set up, clean up, set up): the clean-up's "take the step back" waits a moment, and a set-up
// right behind it keeps the step instead — otherwise the panel shut the instant it opened.
let stepLeaving: ReturnType<typeof setTimeout> | null = null;

/** Back closes the Sources panel, and only it (Scout's conversation stays) */
function useBackClosesPanel(onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (stepLeaving) { clearTimeout(stepLeaving); stepLeaving = null; }
    else window.history.pushState({ ...(window.history.state || {}), wanderSources: true }, "");
    let closedByBack = false;
    const onPop = () => {
      if (window.history.state?.wanderSources) return;
      closedByBack = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!closedByBack && window.history.state?.wanderSources) {
        stepLeaving = setTimeout(() => { stepLeaving = null; window.history.back(); }, 0);
      }
    };
  }, []);
}

/** Escape (a Mac or iPad keyboard) closes the Sources panel, and only it — wherever the focus is. Caught before Scout
 *  sees it: Scout's own Escape made Scout small and left the panel up, or did nothing (found Oct 4 2026, Mac). */
function useEscapeClosesPanel(onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}

export default function ScoutSources({ sources, tripId, onClose }: { sources: AnswerSources; tripId?: string; onClose: () => void }) {
  useBackClosesPanel(onClose);
  useEscapeClosesPanel(onClose);
  const [links, setLinks] = useState<SheetLinks | null>(null);
  const v = voiceFor(useAuth().user?.displayName);
  useEffect(() => {
    if (!tripId) return;
    let live = true;
    sheetLinks(tripId).then((l) => { if (live) setLinks(l); });
    return () => { live = false; };
  }, [tripId]);
  return (
    <LinksOf.Provider value={links}>
    <div className="fixed inset-0 z-[70] bg-black/30 flex items-end sm:items-center justify-center" onClick={onClose} role="presentation">
      <div
        role="dialog" aria-modal="true" aria-label="Where this answer came from"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[85dvh] flex flex-col bg-[#faf8f5] rounded-t-2xl sm:rounded-2xl shadow-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[#e0d8cc]">
          <h2 className="text-base font-medium text-[#3a3128]">Where this came from</h2>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] text-sm text-[#514636]" aria-label="Close sources">Done</button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 py-3 space-y-4">
          {sources.copy && (
            <p className="text-[13px] text-[#6b5d4a]">{v.Her} Guide as Wander last read it — the copy called “{sources.copy}”. {v.mine ? "You" : "She"} may have changed it since.</p>
          )}
          {sources.claims.map((c, i) => (
            <section key={i} className="space-y-2">
              <p className="text-[15px] text-[#3a3128] italic">“{c.said}”</p>
              {c.matched && <p className="text-[13px] text-[#6b5d4a]">Scout quoted these words without pointing to them — Wander found them here, word for word.</p>}
              {c.unmatchedTimes && (
                <p className="text-[13px] text-[#8a5a1a] bg-[#fff8ec] rounded-md px-2 py-1">
                  {c.unmatchedTimes.join(" and ")} {c.unmatchedTimes.length === 1 ? "isn't" : "aren't"} in the words below — Scout worked {c.unmatchedTimes.length === 1 ? "it" : "them"} out, or got {c.unmatchedTimes.length === 1 ? "it" : "them"} wrong. Worth checking.
                </p>
              )}
              <div className="space-y-3 pl-3 border-l-2 border-[#c8a060]/50">
                {c.sources.map((s, j) => <Source key={j} s={s} tripId={tripId} />)}
              </div>
            </section>
          ))}
          {sources.ownWords.length > 0 && (
            <section>
              <p className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-1">{sources.photo ? "Read from your photo, or Scout's own words — not from the Guide" : "Scout's own words — no source"}</p>
              <ul className="space-y-1.5">
                {sources.ownWords.map((w, i) => <li key={i} className="text-sm text-[#3a3128]">“{w}”</li>)}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
    </LinksOf.Provider>
  );
}
