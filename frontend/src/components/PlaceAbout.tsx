/**
 * "About this place" — a bold, coloured button beside a line's photos, on the day's list and on Next (Ken, Oct 27:
 * "colored and bold so it's evident but tasteful"), and what it opens: full screen inside Wander, one sentence first,
 * then 3 to 5 short paragraphs — what reviewers say about a place to eat or drink, the background of anything else.
 * Said as Wander's, from Google and the web, never as Larisa's Guide; where it comes from behind a tap (Ken, Sep 30:
 * sources only when asked). lib/placeAbout.ts.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import useBackToClose from "../hooks/useBackToClose";
import { aboutOf, aboutLines, keptAbout, lineKey, type About } from "../lib/placeAbout";

/** The line's own piece, when Wander wrote one for a line with no Google place (Wednesday's studios): its key, or null */
export function useLineAbout(title: string | null | undefined): string | null {
  const [known, setKnown] = useState<Set<string> | null>(null);
  useEffect(() => { let live = true; aboutLines().then((s) => { if (live) setKnown(s); }); return () => { live = false; }; }, []);
  if (!title || !known) return null;
  const k = lineKey(title);
  return known.has(k) ? k : null;
}

function AboutSheet({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  useBackToClose(true, onClose);
  const [about, setAbout] = useState<About | null>(() => keptAbout(id));
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let live = true;
    setError(null);
    aboutOf(id).then((a) => { if (!live) return; if ("error" in a) { if (!about) setError(a.error); } else setAbout(a); });
    return () => { live = false; };
  }, [id, tries]); // eslint-disable-line react-hooks/exhaustive-deps
  // (the name the person tapped — it switched to Google's, typos and all: "Nineizaka"; design review, Oct 27)
  const name = title.replace(/^./, (c) => c.toUpperCase());
  // (one line per site: twelve raw page titles read like search results, Tripadvisor three times)
  const site = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
  const bySite = about ? about.sources.filter((s, i, all) => all.findIndex((o) => site(o.url) === site(s.url)) === i) : [];
  return createPortal(
    <div className="fixed inset-0 z-[92] bg-[#faf8f5] flex flex-col" role="dialog" aria-modal="true" aria-label={`About ${name}`} data-place-about>
      <div className="flex items-center justify-between gap-2 px-4 border-b border-[#e0d8cc]" style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 8px)" }}>
        <p className="min-w-0 truncate text-[16px] font-medium text-[#3a3128]">{name}</p>
        <button onClick={onClose} className="shrink-0 min-h-[44px] min-w-[56px] text-right text-[15px] font-medium text-[#514636]">Done</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pt-4" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 24px)" }}>
        {!about && !error && (
          <div role="status" className="mt-10 text-center">
            <p className="text-[15px] text-[#514636]">Reading about it…</p>
            <p className="text-[13px] text-[#6b5d4a] mt-1">The first time takes about a minute: Wander reads and checks it. After that it opens at once, for everyone.</p>
          </div>
        )}
        {!about && error && (
          <div className="mt-10 text-center">
            <p role="alert" className="text-[15px] text-[#8a3a1a]">{error}</p>
            <button onClick={() => setTries((t) => t + 1)} className="mt-3 min-h-[44px] px-5 rounded-xl bg-[#514636] text-white text-sm">Try again</button>
          </div>
        )}
        {about && (
          <article className="max-w-xl mx-auto">
            <p className="text-xs uppercase tracking-wide text-[#a0521f] font-semibold">{about.kind === "reviews" ? "What reviewers say" : "Background"}</p>
            {about.kind === "reviews" && about.rating != null && (
              <p className="mt-1 text-[14px] text-[#514636]"><span className="text-[#c98a1b]" aria-hidden>★ </span>{about.rating.toFixed(1)} on Google{about.ratingCount ? ` · ${about.ratingCount.toLocaleString("en-US")} reviews` : ""}</p>
            )}
            <p className="mt-3 text-[17px] leading-snug font-semibold text-[#3a3128]">{about.gist}</p>
            {about.paragraphs.map((p, i) => <p key={i} className="mt-3 text-[16px] leading-relaxed text-[#3a3128]">{p}</p>)}
            <p className="mt-6 text-[13px] text-[#6b5d4a]">{id.startsWith("line:")
              ? "Written by Wander from pages on the web; Google has no listing for it. It isn't from Larisa's Guide."
              : "Written by Wander from Google's listing and reviews and pages on the web. It isn't from Larisa's Guide."}</p>
            {about.sources.length > 0 && (
              <>
                <button onClick={() => setSources((s) => !s)} className="min-h-[44px] text-[13px] text-[#514636] underline underline-offset-2">{sources ? "Hide where this comes from" : "Where this comes from ›"}</button>
                {sources && (
                  <ul className="pb-2 space-y-1">
                    {bySite.map((s) => (
                      <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="block py-1.5 text-[13px] text-[#514636] [overflow-wrap:anywhere]">
                        <span className="underline underline-offset-2">{/google\.com\/maps/.test(s.url) ? "Google Maps" : site(s.url)}</span>
                        {!/google\.com\/maps/.test(s.url) && <span className="block text-[12px] text-[#6b5d4a] no-underline">{s.title}</span>}
                      </a></li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </article>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** The button: amber, bold, beside the line's photos — "About this place" */
export default function AboutPlaceButton({ id, title, dark = false, inRow = false }: { id: string; title: string; dark?: boolean; inRow?: boolean }) {
  const [open, setOpen] = useState(false);
  // (its own line, with room above and below — inline, Next's "Maps ↗" ran into it at another height (Ken, Oct 27
  // 8:54 AM), and the words under it sat 3 pt below (design review); in a row with Maps, the row gives the room)
  return (
    <div className={inRow ? "" : "mt-3 mb-2"}>
      <button type="button" onClick={() => setOpen(true)} data-about-place
        className={`inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full text-[14px] font-semibold shadow-sm ${dark ? "bg-[#e9a35a] text-[#2b2118]" : "bg-[#b8662a] text-white"}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2z" /><path d="M22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z" />
        </svg>
        About this place
      </button>
      {open && <AboutSheet id={id} title={title} onClose={() => setOpen(false)} />}
    </div>
  );
}
