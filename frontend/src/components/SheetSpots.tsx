/**
 * "Open this spot in your sheet ↗" under a line of the day — its tab and cells in her Google Sheet (round 16: the
 * reviewer found settling "your tabs differ" a reason to open the sheet instead; the day screen named the tab but
 * couldn't go there). A line her tabs disagree on carries each tab's spot, so both can be seen in her layout.
 * Nothing shows until Wander knows her sheet's address (lib/sheetLinks.ts).
 */
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { voiceFor, tabLabel } from "../lib/guideDisplay";
import { sheetLinks, spotHref, type SheetLinks } from "../lib/sheetLinks";

/**
 * `label`: the line's own source words ("From your Guide — the Dining Resos tab") become the link to the spot, with its
 * cells named — no extra line under every card. With no id for that tab, the words stay plain and a quiet "Open your
 * sheet ↗" follows. Several tabs (her tabs disagree): each one named, one tap each.
 */
/** Her tab as the rest of Wander names it: "Itinerary", not the download's "Japan-Oct26-Itinerary" */
const shownTab = (t: string) => tabLabel(/-Itinerary$/i.test(t) ? "Itinerary" : t);

export default function SheetSpots({ tripId, spots, label, className = "", wholeTable = false, placeSaid = false }: {
  tripId?: string | null; spots?: { tab: string; a1s: string[] }[]; label?: string; className?: string;
  /** a whole plan table, not one spot: its cells aren't named in the words ("A1:B67" read as code) */
  wholeTable?: boolean;
  /** the tab and cell are already said just above (a find): not again after "Open your sheet ↗" */
  placeSaid?: boolean;
}) {
  const [links, setLinks] = useState<SheetLinks | null>(null);
  const v = voiceFor(useAuth().user?.displayName);
  useEffect(() => {
    if (!tripId) return;
    let live = true;
    sheetLinks(tripId).then((l) => { if (live) setLinks(l); });
    return () => { live = false; };
  }, [tripId]);
  const link = links?.link;
  const list = (spots || []).filter((s) => s.tab && !/^image:/.test(s.tab));
  if (!link || !list.length) return label ? <p className={`text-xs text-[#6b5d4a] ${className}`}>{label}</p> : null;
  const whose = v.mine ? "your sheet" : "Larisa's sheet";
  const linkClass = "inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2";
  if (label && list.length === 1) {
    const { href, exact, range } = spotHref(link, list[0].tab, list[0].a1s);
    return exact ? (
      <p className={className}><a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center min-h-[44px] text-xs text-[#514636] underline underline-offset-2">{label}{range && !wholeTable ? `, ${range}` : ""} ↗</a></p>
    ) : (
      <p className={`text-xs text-[#6b5d4a] ${className}`}>
        {label}{range && !wholeTable ? `, ${range}` : ""} · <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center min-h-[44px] text-[#514636] underline underline-offset-2">Open {whose} ↗</a>
      </p>
    );
  }
  if (label) {
    return (
      <div className={className}>
        <p className="text-xs text-[#6b5d4a]">{label}</p>
        <SheetSpots tripId={tripId} spots={list} />
      </div>
    );
  }
  if (list.length === 1) {
    const { href, exact, range } = spotHref(link, list[0].tab, list[0].a1s);
    return (
      <p className={`text-sm ${className}`}>
        <a href={href} target="_blank" rel="noreferrer" className={linkClass}>{exact ? `Open this spot in ${whose} ↗` : `Open ${whose} ↗`}</a>
        {!exact && !placeSaid && <span className="text-[13px] text-[#6b5d4a]"> — then the “{shownTab(list[0].tab)}” tab{range ? `, ${range.includes(":") ? "cells" : "cell"} ${range}` : ""}</span>}
      </p>
    );
  }
  // Each tab named, with its cells — the two sides of a disagreement, one tap each
  return (
    <div className={`text-sm ${className}`}>
      <span className="text-[13px] text-[#6b5d4a]">In {whose}: </span>
      {list.map((s, n) => {
        const { href, range } = spotHref(link, s.tab, s.a1s);
        return (
          <span key={s.tab}>
            {n > 0 && <span className="text-[#6b5d4a]"> · </span>}
            <a href={href} target="_blank" rel="noreferrer" className={linkClass}>{shownTab(s.tab)}{range ? ` ${range}` : ""} ↗</a>
          </span>
        );
      })}
    </div>
  );
}
