/**
 * SheetNotesCard — "Notes from the Guide"
 *
 * Renders text rows captured from Larisa's narrative tabs (Flight info, Hotel Info,
 * meeting summaries, etc.) that don't fit a structured schema. These tabs often contain
 * pasted screenshots and merged cells that the Google Sheets API can't read as text —
 * this component captures the text that IS readable and links planners to the source
 * sheet tab for the visual content.
 *
 * Collapsible by default so it doesn't dominate the trip home. Hidden entirely when
 * the trip has no notes.
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

  const tabNames = Object.keys(byTab);
  if (tabNames.length === 0) return null;

  const totalNotes = tabNames.reduce((sum, t) => sum + byTab[t].length, 0);

  function openSheetTab(tabName: string) {
    if (!spreadsheetId) return;
    // Google Sheets URL format. We don't know the gid for each tab without an extra API call,
    // so link to the spreadsheet root and rely on Google's last-viewed-tab behavior.
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-center justify-between mb-2"
      >
        <h2 className="text-sm font-medium text-[#3a3128]">
          Notes from the Guide
          <span className="ml-2 text-[#a89880] font-normal">{totalNotes} {totalNotes === 1 ? "note" : "notes"}</span>
        </h2>
        <span className="text-sm text-[#a89880]">{expanded ? "\u25B4" : "\u25BE"}</span>
      </button>

      {expanded && (
        <div className="space-y-3">
          {tabNames.map(tabName => (
            <div key={tabName} className="bg-white rounded-lg border border-[#e0d8cc] p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-[#6b5d4a] uppercase tracking-wider">{tabName}</h3>
                {spreadsheetId && (
                  <button
                    onClick={() => openSheetTab(tabName)}
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
          <p className="text-xs text-[#a89880] italic px-1">
            These are text rows from Larisa's Guide that don't fit the structured tabs.
            For visual content (images, merged cells), tap <em>Open in sheet &rarr;</em>.
          </p>
        </div>
      )}
    </section>
  );
}
