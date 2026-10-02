/**
 * "Find a word in your Guide" — every tab of her sheet searched on the phone, each find shown with its tab and cell,
 * her words around it, the day it belongs to, and "Open this spot in your sheet ↗" (round 16: the reviewer found
 * "where did I write Kimiko?" a reason to open the sheet instead — its Find jumps to the cell). Her words are read
 * once (backend /guide/words) and kept, so a search works with no signal after that.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { voiceFor, tabLabel } from "../lib/guideDisplay";
import SheetSpots from "./SheetSpots";
import { sheetLinks, type SheetLinks } from "../lib/sheetLinks";

interface Words { tabs: { name: string; cells: [string, string][] }[]; pictures: { tab: string; anchor: string; text: string }[]; dayOf: Record<string, string> }
const byTrip = new Map<string, Promise<Words>>();
function wordsOf(tripId: string): Promise<Words> {
  if (!byTrip.has(tripId)) byTrip.set(tripId, api.get<Words>(`/guide/words/${tripId}`).catch((e) => { byTrip.delete(tripId); throw e; }));
  return byTrip.get(tripId)!;
}

// Letters as people type them: no case, no accents ("Ōsaka" is found by "osaka", "café" by "cafe")
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const shownTab = (t: string) => tabLabel(/-Itinerary$/i.test(t) ? "Itinerary" : t);
const dayWords = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const MAX = 40;

type Find = { key: string; tab: string; a1: string; text: string; picture: boolean; day: string | null };

/** Her words around the find, the find marked (a long pasted email shows only its neighbourhood) */
function Around({ text, q }: { text: string; q: string }) {
  const at = fold(text).indexOf(fold(q));
  if (at < 0) return <>{text.slice(0, 160)}</>;
  const from = Math.max(0, at - 70), to = Math.min(text.length, at + q.length + 90);
  return (
    <>
      {from > 0 && "…"}{text.slice(from, at)}
      <mark className="bg-[#f6e7bf] text-inherit rounded px-0.5">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length, to)}{to < text.length && "…"}
    </>
  );
}

export default function FindInGuide({ tripId }: { tripId: string }) {
  const navigate = useNavigate();
  const v = voiceFor(useAuth().user?.displayName);
  const [q, setQ] = useState("");
  const [words, setWords] = useState<Words | null>(null);
  const [state, setState] = useState<"idle" | "reading" | "ready" | "failed">("idle");
  const asked = useRef(false);
  const read = () => {
    if (asked.current) return;
    asked.current = true;
    setState("reading");
    wordsOf(tripId).then((w) => { setWords(w); setState("ready"); }).catch(() => { asked.current = false; setState("failed"); });
  };
  useEffect(() => { if (q.trim().length >= 2) read(); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const finds = useMemo<Find[]>(() => {
    const t = q.trim();
    if (!words || t.length < 2) return [];
    const want = fold(t);
    const out: Find[] = [];
    for (const tab of words.tabs) {
      for (const [a1, text] of tab.cells) if (fold(text).includes(want)) out.push({ key: `${tab.name}!${a1}`, tab: tab.name, a1, text, picture: false, day: words.dayOf[`${tab.name}!${a1}`] || null });
      for (const p of words.pictures.filter((x) => x.tab === tab.name)) if (fold(p.text).includes(want)) out.push({ key: `${tab.name}!pic!${p.anchor}`, tab: tab.name, a1: p.anchor, text: p.text, picture: true, day: words.dayOf[`${tab.name}!${p.anchor}`] || null });
    }
    return out;
  }, [words, q]);

  // Which finds' tabs Wander can't open directly (no tab id): their link opens the sheet on its first tab
  const [links, setLinks] = useState<SheetLinks | null>(null);
  useEffect(() => { if (finds.length && !links) sheetLinks(tripId).then(setLinks); }, [finds.length, links, tripId]);
  const notDirect = !!links?.link && finds.slice(0, MAX).some((f) => !f.picture && links.link!.tabs[f.tab] === undefined);

  const her = v.mine ? "your" : "her";
  return (
    <div className="mb-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={read} type="search" enterKeyHint="search"
        placeholder={v.mine ? "Find a word in your Guide" : "Find a word in Larisa's Guide"} aria-label={v.mine ? "Find a word in your Guide" : "Find a word in Larisa's Guide"}
        className="w-full min-h-[44px] bg-white border border-[#e0d8cc] rounded-xl px-3 text-[16px] text-[#3a3128] placeholder:text-[#6b5d4a]" />
      {q.trim().length >= 2 && (
        <div className="mt-2" role="region" aria-label="What Wander found">
          {state === "reading" && <p className="text-sm text-[#6b5d4a]">Reading {her} Guide…</p>}
          {state === "failed" && <p className="text-sm text-[#6b5d4a]">Wander needs a bar or two of signal to read {her} Guide once — then finding works anywhere.</p>}
          {state === "ready" && finds.length === 0 && (
            <p className="text-sm text-[#6b5d4a]">Nothing in {her} Guide says “{q.trim()}” — at least in the copy Wander has. Pictures are searched by what Wander read in them.</p>
          )}
          {finds.length > 0 && (
            <>
              <p className="text-xs text-[#6b5d4a]">{finds.length === 1 ? "Found once" : `Found in ${finds.length} places`}{finds.length > MAX ? ` — the first ${MAX} below; another word narrows it` : ""}</p>
              {/* Said once, not on every card: for a tab whose id Wander doesn't have, the sheet opens on its first tab
                  (Ken, Oct 2: "it opened the sheet but not to the spot") */}
              {notDirect && (
                <p className="text-xs text-[#6b5d4a] mt-0.5">“Open {v.mine ? "your" : "Larisa's"} sheet” opens it on its first tab. Then go to the tab and cell named on the card.</p>
              )}
              <ul className="mt-1 space-y-2">
                {finds.slice(0, MAX).map((f) => (
                  <li key={f.key} className="bg-white rounded-lg border border-[#e0d8cc] px-3 py-2">
                    <p className="text-xs text-[#6b5d4a]">
                      {f.picture ? `A picture in the ${shownTab(f.tab)} tab` : `${shownTab(f.tab)} · ${f.a1}`}
                      {f.day && <> · <button onClick={() => navigate(`/day/${f.day}`)} className="min-h-[44px] underline underline-offset-2 text-[#514636]">{dayWords(f.day)} ›</button></>}
                    </p>
                    <p className="text-sm text-[#3a3128] [overflow-wrap:anywhere] whitespace-pre-wrap"><Around text={f.text} q={q.trim()} /></p>
                    <SheetSpots tripId={tripId} spots={[{ tab: f.tab, a1s: [f.a1] }]} placeSaid />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
