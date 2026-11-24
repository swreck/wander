/**
 * The budget on Home: what's been shared so far, and who pays next (Oct 15 2026 — Larisa's "simple button that is
 * something like who pays next"; Ken: "a button on the homepage that actually shows the total and then has all the detail
 * below it"). A tap opens the budget page. Drawn from this phone's copy first, so it never waits.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadLedger, savedLedger, yen, MONEY_CHANGED, type Ledger, type FamilyLedger } from "../lib/expenses";
import { money } from "../lib/rates";
import PayNextBadge, { familyColor } from "./PayNextBadge";

const openTripId = () => { try { return localStorage.getItem("wander:last-trip-id"); } catch { return null; } };

export default function WhoPaysNextLine({ tripId }: { tripId: string }) {
  const navigate = useNavigate();
  const [l, setL] = useState<Ledger | null>(() => savedLedger(tripId));
  useEffect(() => {
    let live = true;
    // (another trip: its own copy at once, never the last trip's line while the answer is on its way)
    setL(savedLedger(tripId));
    // (an answer about a trip that's no longer the open one changes nothing, as the bar's badge does)
    const get = () => loadLedger(tripId).then((x) => { if (live && x && (openTripId() || tripId) === tripId) setL(x); });
    get();
    window.addEventListener(MONEY_CHANGED, get);
    window.addEventListener("focus", get);
    return () => { live = false; window.removeEventListener(MONEY_CHANGED, get); window.removeEventListener("focus", get); };
  }, [tripId]);
  // A trip whose payers are families: its own line; one whose families aren't in yet: nothing
  if (l?.notSetUp) return null;
  if (l?.family) return <FamilyLine f={l.family} onOpen={() => navigate("/money")} />;
  if (!l || l.parties.length !== 2) return null;
  // Only the next action: who pays next and the difference (Ken, Oct 16: "people do not want to be reminded how much
  // they've paid. They simply want to understand the next action, which is who pays next and what the difference is" —
  // the line "Budget: ¥204,090 shared so far" is gone)
  return (
    <button type="button" onClick={() => navigate("/money")} data-home-budget-line
      className="w-full text-left mb-3 min-h-[44px] px-3 py-2 rounded-lg bg-white border border-[#e0d8cc] text-sm text-[#514636] flex items-center justify-between gap-2">
      <span className="text-[15px]">
        {!l.items.length ? <><span className="text-[#6b5d4a]">Budget: </span><span className="text-[#3a3128]">nothing kept yet</span></>
          : (
            <>
              <span className="text-[#6b5d4a]">Who pays next: </span>
              {l.next && <PayNextBadge party={l.next} className="mr-1" />}
              <span className="font-medium text-[#3a3128]">{l.next || "either couple, you're even"}</span>
              {l.owes && <span className="text-[#6b5d4a]"> · {yen(l.owes.yen)} to be even</span>}
            </>
          )}
      </span>
      <span aria-hidden>›</span>
    </button>
  );
}

/** Home's line on a trip whose payers are families, in dollars: who pays next and what makes them even (spec §7) */
function FamilyLine({ f, onOpen }: { f: FamilyLedger; onOpen: () => void }) {
  // (all the family paying next would pay to be even, to one family or two; none when it pays nothing there. The first
  // payment alone said "$76.24 to be even" of a family that owed another $21.36 as well)
  const owed = f.next ? Math.round(f.even.filter((e) => e.from === f.next).reduce((sum, e) => sum + e.usd, 0) * 100) / 100 : 0;
  const first = f.even[0];
  return (
    <button type="button" onClick={onOpen} data-home-budget-line
      className="w-full text-left mb-3 min-h-[44px] px-3 py-2 rounded-lg bg-white border border-[#e0d8cc] text-sm text-[#514636] flex items-center justify-between gap-2">
      <span className="text-[15px]">
        {!f.items.length ? <><span className="text-[#6b5d4a]">Budget: </span><span className="text-[#3a3128]">nothing kept yet</span></>
          : f.next ? (
            <>
              <span className="text-[#6b5d4a]">Who pays next: </span>
              <PayNextBadge party={f.next} color={familyColor(f.parties.indexOf(f.next))} className="mr-1" />
              <span className="font-medium text-[#3a3128]">{f.next}</span>
              {owed > 0 && <span className="text-[#6b5d4a]"> · {money(owed, "USD")} to be even</span>}
            </>
          )
          : f.settled || !first ? <><span className="text-[#6b5d4a]">Budget: </span><span className="text-[#3a3128]">you're even</span></>
          // (one payment is said; more are counted, and Budget names each)
          : f.even.length > 1 ? <span className="text-[#3a3128]">{f.even.length} payments would make the families even</span>
          : <><span className="text-[#6b5d4a]">To be even: </span><span className="text-[#3a3128]">{first.from} would pay {first.to} {money(first.usd, "USD")}</span></>}
      </span>
      <span aria-hidden>›</span>
    </button>
  );
}
