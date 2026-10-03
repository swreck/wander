/**
 * SheetNotesCard — "From the Guide"
 *
 * Renders every non-structural tab from Larisa's spreadsheet. Three kinds of content:
 *
 *   1. Text rows (narrative tabs like Flight info, Tokyo Hotel Info, meeting summaries)
 *      — the actual readable text, grouped by source tab.
 *
 *   2. Visual-only tabs (maps, metro diagrams) — the Google Sheets API returns zero text
 *      for these because the content is pasted images/merged cells. Each such tab lands
 *      with a sentinel row (rowIndex === -1). The UI treats these as "live replacement"
 *      opportunities: for known patterns (/map.*tokyo/, /metro|subway/, /map.*japan/) we
 *      render a link to an interactive Wander feature or external live map instead of
 *      the static screenshot Larisa would've pasted.
 *
 *   3. Unknown visual tabs — fall back to a plain "See in the Guide" link with the tab name.
 *
 * Collapsible by default so it doesn't dominate the trip home. Hidden entirely when
 * the trip has no notes at all.
 */

import { useState, useEffect } from "react";
import { api } from "../lib/api";
import useBackToClose from "../hooks/useBackToClose";
import { LinkedText } from "./GuideText";
import { useAuth } from "../contexts/AuthContext";
import { tabLabel, voiceFor } from "../lib/guideDisplay";
import FindInGuide from "./FindInGuide";
import PictureViewer from "./PictureViewer";

interface SheetNote {
  id: string;
  tabName: string;
  rowIndex: number;
  text: string;
}

// Her pictures, by tab, with short-lived links (GET /guide/pictures) — fetched once, when a picture is first asked for
type TabPictures = { tab: string; pictures: { anchor: string; url: string }[] }[];
let picturesLoad: { tripId: string; p: Promise<TabPictures> } | null = null;
function picturesOf(tripId: string): Promise<TabPictures> {
  if (!picturesLoad || picturesLoad.tripId !== tripId) {
    const p = api.get<TabPictures>(`/guide/pictures/${tripId}`).catch(() => { picturesLoad = null; return [] as TabPictures; });
    picturesLoad = { tripId, p };
  }
  return picturesLoad.p;
}

/** The nth picture she pasted in a tab, opened on request (links last ten minutes, so each opening asks afresh) */
function TabPicture({ tripId, tab, nth }: { tripId: string; tab: string; nth: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "opening" | "shown" | "missing">("idle");
  // full screen, to read a map she pasted (round 16)
  const [full, setFull] = useState(false);
  const open = async () => {
    setState("opening");
    picturesLoad = null; // a fresh link
    const all = await picturesOf(tripId);
    const pic = all.find((t) => t.tab === tab)?.pictures[nth];
    if (!pic) { setState("missing"); return; }
    setUrl(pic.url);
    setState("shown");
  };
  if (state === "shown" && url) {
    return (
      <span className="block mt-2">
        <button onClick={() => setFull(true)} className="block w-full" aria-label="See this picture full screen">
          <img src={url} alt={`A picture Larisa pasted in her ${tab} tab`} className="block max-w-full h-auto rounded border border-[#e0d8cc]" onError={() => setState("missing")} />
        </button>
        <span className="flex flex-wrap gap-x-5">
          <button onClick={() => setFull(true)} className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">See it full screen ›</button>
          <button onClick={() => setState("idle")} className="min-h-[44px] text-sm text-[#514636]">Hide the picture ‹</button>
        </span>
        {full && <PictureViewer src={url} alt={`A picture Larisa pasted in her ${tab} tab`} onClose={() => setFull(false)} />}
      </span>
    );
  }
  return (
    <button onClick={open} disabled={state === "opening"} className="block min-h-[44px] text-sm text-[#514636] underline underline-offset-2 disabled:opacity-60">
      {state === "opening" ? "Opening the picture…" : state === "missing" ? "Wander can't open this picture right now — try again with signal ›" : "See the picture ›"}
    </button>
  );
}

interface NotesResponse {
  notes: SheetNote[];
  byTab: Record<string, { rowIndex: number; text: string }[]>;
  tabOrder?: string[];
  tabGids?: Record<string, number>;
}

// Interactive replacements for common visual tabs. Each entry returns a user-facing
// label and a URL that gives planners a LIVE version of what Larisa pasted as a static
// image. The goal is "value-add front end": Larisa shows a subway diagram, Wander shows
// a zoomable interactive one.
function interactiveReplacement(tabName: string): { label: string; url: string } | null {
  const lower = tabName.toLowerCase();

  // Each label says it's Wander's, never hers — these sit under "as she wrote them" (round 12: Larisa read "Open
  // live map of Japan" as a line of her tab). No route planner: a fixed Tokyo → Kyoto search matched none of
  // this trip's trains.

  // Tokyo Metro / subway map → Google's transit layer centered on Tokyo
  if (lower.includes("metro") || lower.includes("subway")) {
    return {
      label: "Wander's link: live Tokyo transit map",
      url: "https://www.google.com/maps/@35.6812,139.7671,13z/data=!5m1!1e3",
    };
  }

  // Map of Tokyo → Google Maps zoomed on central Tokyo
  if (lower.includes("map") && lower.includes("tokyo")) {
    return {
      label: "Wander's link: live map of Tokyo",
      url: "https://www.google.com/maps/place/Tokyo,+Japan/@35.6762,139.6503,11z",
    };
  }

  // Map of Japan (generic, not her bullet-train map) → Google Maps Japan overview
  if (lower.includes("map") && lower.includes("japan") && !lower.includes("bullet") && !lower.includes("shinkansen")) {
    return {
      label: "Wander's link: live map of Japan",
      url: "https://www.google.com/maps/place/Japan/@36.2048,138.2529,6z",
    };
  }

  return null;
}

export default function SheetNotesCard({ tripId }: { tripId: string }) {
  // To Larisa herself: "Your Guide, tab by tab" (delight audit)
  const v = voiceFor(useAuth().user?.displayName);
  const [byTab, setByTab] = useState<Record<string, { rowIndex: number; text: string }[]>>({});
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [tabGids, setTabGids] = useState<Record<string, number>>({});
  const [tabOrder, setTabOrder] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  // One tab open at a time — a list of Larisa's tabs, not one endless page
  const [openTab, setOpenTab] = useState<string | null>(null);
  // The phone's Back closes the tab being read, instead of leaving Wander
  useBackToClose(!!openTab, () => setOpenTab(null));

  function closeTab(tabName: string) {
    setOpenTab(null);
    // Long tabs: bring the tab's name back into view once it folds up
    requestAnimationFrame(() => document.getElementById(`guide-tab-${tabName}`)?.scrollIntoView({ block: "nearest" }));
  }

  useEffect(() => {
    api.get<NotesResponse>(`/sheets-sync/notes/${tripId}`)
      .then(res => {
        setByTab(res?.byTab || {});
        if (res?.tabGids) setTabGids(res.tabGids);
        if (res?.tabOrder) setTabOrder(res.tabOrder);
      })
      .catch(() => {});
    // Her sheet's address and tab ids — the same ones Scout's Sources open (backend sheetLink.ts). The April sync
    // record's empty address hid this link on every tab (round 16)
    api.get<{ link: { url: string; tabs: Record<string, number> } | null }>(`/guide/sheet-link/${tripId}`)
      .then(res => {
        const m = res?.link?.url.match(/\/spreadsheets\/d\/([\w-]+)\//);
        if (m) { setSpreadsheetId(m[1]); setTabGids((old) => ({ ...old, ...res!.link!.tabs })); }
      })
      .catch(() => {});
  }, [tripId]);

  // In her sheet's order (a tab Wander doesn't know the place of goes last, A–Z)
  const place = (t: string) => { const n = tabOrder.indexOf(t); return n < 0 ? 9999 : n; };
  const tabNames = Object.keys(byTab).sort((a, b) => place(a) - place(b) || a.localeCompare(b));
  if (tabNames.length === 0) return null;

  // A visual-only tab is one with a single sentinel row (rowIndex -1, empty text).
  // See parseSheetNotes in sheetsSync.ts — we emit a sentinel for any unstructured tab
  // that the API returned with no text rows, so the UI can still render a card for it.
  const isVisualOnly = (rows: { rowIndex: number; text: string }[]) =>
    rows.length === 1 && rows[0].rowIndex === -1 && !rows[0].text;

  // A tab with nothing readable (a lone "A" left from a heading) isn't worth opening
  const hasWords = (rows: { text: string }[]) => rows.some((r) => r.text.replace(/\s+/g, "").length > 2);
  const textTabs = tabNames.filter(t => !isVisualOnly(byTab[t]) && hasWords(byTab[t]));
  // (her "Archives" tab holds nothing to show — it was a leftover-looking card; round 12)
  const visualTabs = tabNames.filter(t => isVisualOnly(byTab[t]) && !/^archives?$/i.test(t.trim()));


  function openSheetTab(tabName?: string) {
    if (!spreadsheetId) return;
    const gid = tabName ? tabGids[tabName] : undefined;
    const url = gid != null
      ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?gid=${gid}#gid=${gid}`
      : `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function openExternal(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-center justify-between min-h-[44px] py-2 mb-1"
      >
        <h2 className="text-sm font-medium text-[#514636]">
          {v.mine ? "Your Guide" : "Larisa's Guide"}, tab by tab
          <span className="block text-[#6b5d4a] font-normal text-xs mt-0.5">
            {v.mine
              ? "Your other tabs, as you wrote them, in your order. Where you pasted a picture, Wander describes it and shows it when tapped. The Itinerary is the days above; Activities are in Maybes; Actions are in Actions."
              : "Her other tabs, as she wrote them, in her order. Where she pasted a picture, Wander describes it and shows it when you tap. The Itinerary is the days above; Activities are in Maybes; Actions are in Actions."}
          </span>
        </h2>
        <span className="text-sm text-[#6b5d4a]">{expanded ? "\u25B4" : "\u25BE"}</span>
      </button>

      {/* Find a word anywhere in her tabs \u2014 the cell, the day, and the spot in her sheet (round 16) */}
      <FindInGuide tripId={tripId} />

      {expanded && (
        <div className="space-y-3">
          {/* Text tabs — narrative notes grouped by source tab. Tabs with a known map
              pattern ALSO get the interactive CTA (e.g. "Tokyo Metro" has a "Tokyo Subway
              Map" header row but the actual content is an image — the live version is
              still the real value-add). */}
          {textTabs.map(tabName => {
            const interactive = interactiveReplacement(tabName);
            return (
              <div key={tabName} id={`guide-tab-${tabName}`} className="bg-white rounded-lg border border-[#e0d8cc] p-3 min-w-0 scroll-mt-4">
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                  <button
                    onClick={() => {
                      if (openTab === tabName) { closeTab(tabName); return; }
                      setOpenTab(tabName);
                      // Its words start right here, not below the bottom of the screen
                      requestAnimationFrame(() => document.getElementById(`guide-tab-${tabName}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
                    }}
                    aria-expanded={openTab === tabName}
                    // A line of its own, links below (round 9: at large text the title shrank to a letter or two
                    // per line beside "Open Japan rail route planner →", with "Read" printed over it)
                    className="basis-full min-w-0 min-h-[44px] text-left flex items-center justify-between gap-3"
                  >
                    <h3 className="text-sm font-medium text-[#3a3128] [overflow-wrap:break-word] min-w-0">{tabLabel(tabName)}</h3>
                    <span className="text-sm text-[#514636] shrink-0 inline-flex items-center min-h-[44px]">{openTab === tabName ? "Close ▴" : "Read ▾"}</span>
                  </button>
                  <div className="flex items-center gap-3">
                    {interactive && (
                      <button
                        onClick={() => openExternal(interactive.url)}
                        className="text-sm text-[#514636] font-medium hover:text-[#3a3128] transition-colors min-h-[44px] flex items-center"
                        title={interactive.label}
                      >
                        {interactive.label} &rarr;
                      </button>
                    )}
                    {spreadsheetId && (
                      <button
                        onClick={() => openSheetTab(tabName)}
                        className="text-xs text-[#6b5d4a] hover:text-[#6b5d4a] transition-colors min-h-[44px] flex items-center"
                        title="Open this in Larisa's Guide"
                      >
                        Open in the Guide &rarr;
                      </button>
                    )}
                  </div>
                </div>
                {openTab === tabName && (
                  <>
                    <ul className="space-y-1.5 mt-1">
                      {byTab[tabName].map((note, n) => note.text.startsWith("Picture") ? (
                        // Wander's words about a picture she pasted — never passed off as hers — and the picture itself
                        // one tap away (round 12: "you can't see the subway map")
                        <li key={note.rowIndex} className="text-sm text-[#514636] leading-relaxed whitespace-pre-line [overflow-wrap:anywhere] bg-[#f6f1e8] rounded-lg px-3 py-2">
                          <span className="block text-xs text-[#6b5d4a] mb-0.5">{v.mine ? "A picture you pasted" : "A picture Larisa pasted"} — Wander's description</span>
                          {note.text.replace(/^Picture:\s*/, "").replace(/^Picture \(not read yet\)$/, "Not described yet.")}
                          <TabPicture tripId={tripId} tab={tabName} nth={byTab[tabName].slice(0, n).filter((x) => x.text.startsWith("Picture")).length} />
                        </li>
                      ) : (
                        <li key={note.rowIndex} className="text-sm text-[#3a3128] leading-relaxed whitespace-pre-line [overflow-wrap:anywhere]">
                          {/* Web addresses as short links you can tap, phone numbers to call (round 10) */}
                          <LinkedText text={note.text.replace(/[ \t]{3,}/g, "  ")} />
                        </li>
                      ))}
                    </ul>
                    <button onClick={() => closeTab(tabName)} className="mt-2 min-h-[44px] text-sm text-[#514636]">Close {tabLabel(tabName)} ▴</button>
                  </>
                )}
              </div>
            );
          })}

          {/* Visual-only tabs — maps, diagrams. For known patterns, offer a live version. */}
          {visualTabs.length > 0 && (
            <div className="bg-white rounded-lg border border-[#e0d8cc] p-3">
              <h3 className="text-xs font-medium text-[#6b5d4a] uppercase tracking-wider mb-2">
                Maps and images
              </h3>
              <ul className="space-y-2.5">
                {visualTabs.map(tabName => {
                  const interactive = interactiveReplacement(tabName);
                  return (
                    <li key={tabName}>
                      <span className="text-xs text-[#6b5d4a]">{tabLabel(tabName)}</span>
                      <TabPicture tripId={tripId} tab={tabName} nth={0} />
                      <div className="flex items-center gap-3 mt-1">
                        {interactive && (
                          <button
                            onClick={() => openExternal(interactive.url)}
                            className="text-sm text-[#514636] font-medium hover:text-[#3a3128] transition-colors min-h-[44px] flex items-center"
                            title={interactive.label}
                          >
                            {interactive.label} &rarr;
                          </button>
                        )}
                        {spreadsheetId && (
                          <button
                            onClick={() => openSheetTab(tabName)}
                            className="text-xs text-[#6b5d4a] hover:text-[#6b5d4a] transition-colors min-h-[44px] flex items-center"
                          >
                            See in the Guide
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[13px] text-[#6b5d4a] mt-2">
                Tabs where Larisa pasted only a picture. Tap to see it; a live map sits beside the ones that have one.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
