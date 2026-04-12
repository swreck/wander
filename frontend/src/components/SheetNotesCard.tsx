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
 *   3. Unknown visual tabs — fall back to a plain "See in sheet" link with the tab name.
 *
 * Collapsible by default so it doesn't dominate the trip home. Hidden entirely when
 * the trip has no notes at all.
 */

import { useState, useEffect } from "react";
import { api } from "../lib/api";

interface SheetNote {
  id: string;
  tabName: string;
  rowIndex: number;
  text: string;
}

interface NotesResponse {
  notes: SheetNote[];
  byTab: Record<string, { rowIndex: number; text: string }[]>;
}

interface SyncStatus {
  configured: boolean;
  spreadsheetId?: string;
}

// Interactive replacements for common visual tabs. Each entry returns a user-facing
// label and a URL that gives planners a LIVE version of what Larisa pasted as a static
// image. The goal is "value-add front end": Larisa shows a subway diagram, Wander shows
// a zoomable interactive one.
function interactiveReplacement(tabName: string): { label: string; url: string } | null {
  const lower = tabName.toLowerCase();

  // Tokyo Metro / subway map → Google's transit layer centered on Tokyo
  if (lower.includes("metro") || lower.includes("subway")) {
    return {
      label: "Open live Tokyo transit map",
      url: "https://www.google.com/maps/@35.6812,139.7671,13z/data=!5m1!1e3",
    };
  }

  // Map of Tokyo → Google Maps zoomed on central Tokyo
  if (lower.includes("map") && lower.includes("tokyo")) {
    return {
      label: "Open live map of Tokyo",
      url: "https://www.google.com/maps/place/Tokyo,+Japan/@35.6762,139.6503,11z",
    };
  }

  // Bullet train / shinkansen — use Google directions to show the route
  if (lower.includes("bullet") || lower.includes("shinkansen")) {
    return {
      label: "Open Japan rail route planner",
      url: "https://www.google.com/maps/dir/Tokyo+Station/Kyoto+Station/data=!4m2!4m1!3e3",
    };
  }

  // Map of Japan (generic) → Google Maps Japan overview
  if (lower.includes("map") && lower.includes("japan")) {
    return {
      label: "Open live map of Japan",
      url: "https://www.google.com/maps/place/Japan/@36.2048,138.2529,6z",
    };
  }

  return null;
}

export default function SheetNotesCard({ tripId }: { tripId: string }) {
  const [byTab, setByTab] = useState<Record<string, { rowIndex: number; text: string }[]>>({});
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    api.get<NotesResponse>(`/sheets-sync/notes/${tripId}`)
      .then(res => setByTab(res?.byTab || {}))
      .catch(() => {});
    api.get<SyncStatus>(`/sheets-sync/status/${tripId}`)
      .then(res => { if (res?.configured && res.spreadsheetId) setSpreadsheetId(res.spreadsheetId); })
      .catch(() => {});
  }, [tripId]);

  const tabNames = Object.keys(byTab).sort();
  if (tabNames.length === 0) return null;

  // A visual-only tab is one with a single sentinel row (rowIndex -1, empty text).
  // See parseSheetNotes in sheetsSync.ts — we emit a sentinel for any unstructured tab
  // that the API returned with no text rows, so the UI can still render a card for it.
  const isVisualOnly = (rows: { rowIndex: number; text: string }[]) =>
    rows.length === 1 && rows[0].rowIndex === -1 && !rows[0].text;

  const textTabs = tabNames.filter(t => !isVisualOnly(byTab[t]));
  const visualTabs = tabNames.filter(t => isVisualOnly(byTab[t]));

  const totalTextRows = textTabs.reduce((sum, t) => sum + byTab[t].length, 0);
  const tabCountLabel = tabNames.length === 1 ? "1 tab" : `${tabNames.length} tabs`;

  function openSheet() {
    if (!spreadsheetId) return;
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function openExternal(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-center justify-between mb-2"
      >
        <h2 className="text-sm font-medium text-[#3a3128]">
          From the Guide
          <span className="ml-2 text-[#a89880] font-normal">
            {tabCountLabel}{totalTextRows > 0 && `, ${totalTextRows} ${totalTextRows === 1 ? "note" : "notes"}`}
          </span>
        </h2>
        <span className="text-sm text-[#a89880]">{expanded ? "\u25B4" : "\u25BE"}</span>
      </button>

      {expanded && (
        <div className="space-y-3">
          {/* Text tabs — narrative notes grouped by source tab */}
          {textTabs.map(tabName => (
            <div key={tabName} className="bg-white rounded-lg border border-[#e0d8cc] p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-[#6b5d4a] uppercase tracking-wider">{tabName}</h3>
                {spreadsheetId && (
                  <button
                    onClick={openSheet}
                    className="text-xs text-[#8a7a62] hover:text-[#3a3128] transition-colors"
                    title="Open this tab in the source spreadsheet"
                  >
                    Open in sheet &rarr;
                  </button>
                )}
              </div>
              <ul className="space-y-1.5">
                {byTab[tabName].map(note => (
                  <li key={note.rowIndex} className="text-sm text-[#3a3128] leading-relaxed">
                    {note.text}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Visual-only tabs — maps, diagrams. For known patterns, offer a live version. */}
          {visualTabs.length > 0 && (
            <div className="bg-white rounded-lg border border-[#e0d8cc] p-3">
              <h3 className="text-xs font-medium text-[#6b5d4a] uppercase tracking-wider mb-2">
                Visual references
              </h3>
              <ul className="space-y-2">
                {visualTabs.map(tabName => {
                  const interactive = interactiveReplacement(tabName);
                  return (
                    <li key={tabName} className="flex items-start justify-between gap-2">
                      <span className="text-sm text-[#3a3128] pt-0.5">{tabName}</span>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {interactive && (
                          <button
                            onClick={() => openExternal(interactive.url)}
                            className="text-xs text-[#514636] font-medium hover:text-[#3a3128] transition-colors text-right"
                            title={interactive.label}
                          >
                            {interactive.label} &rarr;
                          </button>
                        )}
                        {spreadsheetId && (
                          <button
                            onClick={openSheet}
                            className="text-xs text-[#8a7a62] hover:text-[#3a3128] transition-colors"
                          >
                            See in sheet
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-[#a89880] italic mt-2">
                Larisa pastes maps and diagrams as images. Wander offers live versions above when a match is known.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
