/**
 * "Sources" under a Scout answer: where each part of it came from — her Guide's tab, cell and exact words;
 * something Wander worked out and what from; a plan someone added in Wander; a web page. Parts with no source
 * are listed as Scout's own words. All of it was recorded as Scout answered (backend answerSources.ts); this
 * screen only shows it. Opened only when someone asks. (Ken, Sep 30 2026: a wrong source is worse than none.)
 */
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

type CellWords =
  | { kind: "cell"; tab: string; a1: string; text: string; part?: boolean }
  | { kind: "picture"; tab: string; anchor: string; sha256: string }
  | { kind: "tab"; tab: string };

type SourceView =
  | { type: "guide"; label: string; cells: CellWords[]; wanderNotes?: string[] }
  | { type: "wander"; what: string; from: { label: string; cells: CellWords[] }[] }
  | { type: "added"; by: string; text: string }
  | { type: "web"; title: string; url: string; quote: string };

export interface AnswerSources {
  copy: string | null;
  claims: { said: string; sources: SourceView[]; unmatchedTimes?: string[] }[];
  ownWords: string[];
}

export function hasSources(s: AnswerSources | undefined | null): s is AnswerSources {
  return !!s && ((s.claims?.length || 0) > 0 || (s.ownWords?.length || 0) > 0);
}

/** Her cells, as she'd find them in her sheet: the tab, the cell, and exactly what's in it */
function Cells({ cells, tripId }: { cells: CellWords[]; tripId?: string }) {
  if (!cells.length) return <p className="text-sm text-[#6b5d4a]">Wander couldn't point to the one cell for this.</p>;
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
            <p className="text-sm text-[#3a3128]">Her {c.tab} tab <span className="text-[#6b5d4a]">(Wander couldn't pin the exact cell)</span></p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A screenshot she pasted into the Guide — opened on request */
function Picture({ tab, anchor, sha256, tripId }: { tab: string; anchor: string; sha256: string; tripId?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  // "Opening…" lasts until the picture has actually arrived (a screenshot can be half a megabyte on hotel wifi)
  const [state, setState] = useState<"idle" | "opening" | "shown" | "failed">("idle");
  return (
    <div>
      <p className="text-[13px] text-[#6b5d4a]">A picture in her {tab} tab{anchor ? ` (at ${anchor})` : ""}</p>
      {state !== "shown" && (
        <button
          disabled={!tripId || state === "opening"}
          onClick={async () => {
            setState("opening");
            try { setUrl((await api.get<{ url: string }>(`/guide/picture-link/${tripId}/${sha256}`)).url); }
            catch { setState("failed"); }
          }}
          className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2 disabled:opacity-50"
        >
          {state === "opening" ? "Opening…" : state === "failed" ? "Couldn't open it — try again?" : "See the picture"}
        </button>
      )}
      {url && state !== "failed" && (
        <img src={url} alt={`The picture in her ${tab} tab`} onLoad={() => setState("shown")} onError={() => { setUrl(null); setState("failed"); }}
          className={state === "shown" ? "mt-1 w-full rounded-md border border-[#e0d8cc]" : "hidden"} />
      )}
    </div>
  );
}

function Source({ s, tripId }: { s: SourceView; tripId?: string }) {
  if (s.type === "guide") {
    return (
      <div>
        <p className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-1">Larisa's Guide</p>
        <Cells cells={s.cells} tripId={tripId} />
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
            <p className="text-[13px] text-[#6b5d4a]">From her Guide:</p>
            {s.from.map((f, i) => <Cells key={i} cells={f.cells} tripId={tripId} />)}
          </div>
        )}
      </div>
    );
  }
  if (s.type === "added") {
    return (
      <div>
        <p className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-1">Added in Wander by {s.by}</p>
        <p className="text-sm text-[#3a3128]">“{s.text}” <span className="text-[#6b5d4a]">— not in Larisa's Guide</span></p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-1">From the web — not Larisa's Guide</p>
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

export default function ScoutSources({ sources, tripId, onClose }: { sources: AnswerSources; tripId?: string; onClose: () => void }) {
  useBackClosesPanel(onClose);
  return (
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
            <p className="text-[13px] text-[#6b5d4a]">Her Guide as Wander last read it — the copy called “{sources.copy}”. She may have changed it since.</p>
          )}
          {sources.claims.map((c, i) => (
            <section key={i} className="space-y-2">
              <p className="text-[15px] text-[#3a3128] italic">“{c.said}”</p>
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
              <p className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-1">Scout's own words — no source</p>
              <ul className="space-y-1.5">
                {sources.ownWords.map((w, i) => <li key={i} className="text-sm text-[#3a3128]">“{w}”</li>)}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
