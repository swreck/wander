/**
 * The budget on Home: what's been shared so far, and who pays next (Oct 15 2026 — Larisa's "simple button that is
 * something like who pays next"; Ken: "a button on the homepage that actually shows the total and then has all the detail
 * below it"). A tap opens the budget page. Drawn from this phone's copy first, so it never waits.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadLedger, savedLedger, yen, MONEY_CHANGED, type Ledger } from "../lib/expenses";
import PayNextBadge from "./PayNextBadge";

export default function WhoPaysNextLine({ tripId }: { tripId: string }) {
  const navigate = useNavigate();
  const [l, setL] = useState<Ledger | null>(() => savedLedger(tripId));
  useEffect(() => {
    let live = true;
    const get = () => loadLedger(tripId).then((x) => { if (live && x) setL(x); });
    get();
    window.addEventListener(MONEY_CHANGED, get);
    window.addEventListener("focus", get);
    return () => { live = false; window.removeEventListener(MONEY_CHANGED, get); window.removeEventListener("focus", get); };
  }, [tripId]);
  if (!l || l.parties.length !== 2) return null;
  const total = Object.values(l.totals).reduce((a, b) => a + b, 0);
  return (
    <button type="button" onClick={() => navigate("/money")}
      className="w-full text-left mb-3 min-h-[44px] px-3 py-2 rounded-lg bg-white border border-[#e0d8cc] text-sm text-[#514636] flex items-center justify-between gap-2">
      <span>
        <span className="block">
          <span className="text-[#6b5d4a]">Budget: </span>
          <span className="font-medium text-[#3a3128]">{l.items.length ? `${yen(total)} shared so far` : "nothing kept yet"}</span>
        </span>
        <span className="block text-[13px]">
          <span className="text-[#6b5d4a]">Who pays next: </span>
          {l.next && <PayNextBadge party={l.next} className="mr-1" />}
          <span className="text-[#3a3128]">{l.next || "either couple"}</span>
          {l.owes && <span className="text-[#6b5d4a]"> · {yen(l.owes.yen)} to be even</span>}
        </span>
      </span>
      <span aria-hidden>›</span>
    </button>
  );
}
