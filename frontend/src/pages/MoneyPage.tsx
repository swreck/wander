/**
 * Who pays next (Oct 15 2026) — Larisa's idea, through Ken: "a simple button that is something like who pays next and it
 * just points to the couple that currently has the smaller total". Every payment either couple makes for the group is
 * kept; shared half and half, the couple that paid less owes the other half the difference. Yen as said, or dollars
 * kept with that day's yen. All four see it. Scout keeps payments too ("we paid ¥12,400 for dinner").
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { loadLedger, savedLedger, addPayment, removePayment, yen, MONEY_CHANGED, type Ledger } from "../lib/expenses";
import PayNextBadge from "../components/PayNextBadge";

const shortDay = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "");
const first = (s: string) => s.trim().split(/\s+/)[0].toLowerCase();

export default function MoneyPage() {
  const navigate = useNavigate();
  const me = useAuth().user?.displayName || "";
  const [tripId, setTripId] = useState<string | null>(() => { try { return localStorage.getItem("wander:last-trip-id"); } catch { return null; } });
  const [l, setL] = useState<Ledger | null>(() => (tripId ? savedLedger(tripId) : null));
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"JPY" | "USD">("JPY");
  const [what, setWhat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  // (the form opens from "Add entry", always under the total — Ken, Oct 15: "should always be another button that says
  // add entry for another one to be added then")
  const [adding, setAdding] = useState(false);

  useEffect(() => { if (!tripId) api.get<{ id?: string } | null>("/trips/active").then((t) => setTripId(t?.id || null)).catch(() => {}); }, [tripId]);
  useEffect(() => {
    if (!tripId) return;
    let live = true;
    const get = () => loadLedger(tripId).then((x) => { if (live && x) setL(x); });
    get();
    window.addEventListener(MONEY_CHANGED, get);
    return () => { live = false; window.removeEventListener(MONEY_CHANGED, get); };
  }, [tripId]);
  // (the couple you're in, ready as "paid by")
  const mine = l?.parties.find((p) => p.split(/\s*&\s*/).some((x) => first(x) === first(me))) || null;
  useEffect(() => { if (!paidBy && mine) setPaidBy(mine); }, [mine, paidBy]);
  useEffect(() => { if (!kept) return; const t = setTimeout(() => setKept(null), 4000); return () => clearTimeout(t); }, [kept]);

  const add = async () => {
    const n = Number(amount.replace(/[,¥$\s]/g, ""));
    if (!tripId || !paidBy || !(n > 0)) { setError(!paidBy ? "Which couple paid?" : "How much was it?"); return; }
    setBusy(true); setError(null);
    const err = await addPayment(tripId, { paidBy, amount: n, currency, what: what.trim() || undefined });
    setBusy(false);
    if (err) { setError(err); return; }
    setKept(`Kept: ${paidBy}, ${currency === "USD" ? `$${n}` : yen(n)}`);
    setAmount(""); setWhat(""); setAdding(false);
  };

  const back = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/"));
  return (
    <div className="min-h-screen bg-[#faf8f5] pb-28">
      <header className="pb-6 bg-gradient-to-b from-[#e7efe3] to-[#faf8f5]" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}>
        <div className="max-w-xl mx-auto px-4">
          <button type="button" onClick={back} className="min-h-[44px] min-w-[44px] pr-2 text-sm text-[#514636]">‹ Back</button>
          <p className="text-[12px] uppercase tracking-[.14em] text-[#5b6b52] mt-1">Budget</p>
          <h1 className="text-[32px] font-light text-[#2f3a2a] leading-tight mt-0.5">{!l ? "…" : l.items.length ? `${yen(Object.values(l.totals).reduce((a, b) => a + b, 0))} shared so far` : "Nothing kept yet"}</h1>
          {l && l.parties.length === 2 && l.items.length > 0 && (
            <p className="text-[15px] text-[#3a3128] mt-2">
              {l.parties.map((p) => `${p} paid ${yen(l.totals[p] || 0)}`).join(" · ")}
            </p>
          )}
          {l && <p className="text-[15px] text-[#3a3128] mt-1">Who pays next: {l.next && <PayNextBadge party={l.next} className="mr-1" />}<span className="font-medium">{l.next || (l.items.length ? "either — you're even" : "either couple")}</span></p>}
          {l?.owes && <p className="text-[14px] text-[#514636] mt-1">To be even now, {l.owes.from} would pay {l.owes.to} {yen(l.owes.yen)}.</p>}
          {l && !l.items.length && <p className="text-[14px] text-[#514636] mt-1">When one couple pays for the group, add it here. Each cost is shared half and half.</p>}
        </div>
      </header>

      <main className="px-4 max-w-xl mx-auto flex flex-col gap-5">
        {!adding && (
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => { setAdding(true); setError(null); }} className="min-h-[48px] px-6 rounded-xl bg-[#514636] text-white text-[15px] font-medium">+ Add entry</button>
            {kept && <span className="text-sm text-[#4a6a3a]" role="status">✓ {kept}</span>}
          </div>
        )}
        {adding && <section className="bg-white rounded-2xl border border-[#e0d8cc] p-4 flex flex-col gap-3" aria-label="Add entry">
          <h2 className="text-[17px] font-medium text-[#3a3128]">Add entry</h2>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Who paid">
            {(l?.parties || []).map((p) => (
              <button key={p} type="button" onClick={() => setPaidBy(p)} aria-pressed={paidBy === p}
                className={`min-h-[48px] rounded-xl border text-[15px] ${paidBy === p ? "bg-[#3a3128] text-white border-[#3a3128]" : "bg-white text-[#3a3128] border-[#e0d8cc]"}`}>{p}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="flex rounded-xl border border-[#e0d8cc] overflow-hidden shrink-0" role="group" aria-label="Yen or dollars">
              {(["JPY", "USD"] as const).map((c) => (
                <button key={c} type="button" onClick={() => setCurrency(c)} aria-pressed={currency === c}
                  className={`min-w-[48px] min-h-[48px] text-[17px] ${currency === c ? "bg-[#3a3128] text-white" : "bg-white text-[#514636]"}`}>{c === "JPY" ? "¥" : "$"}</button>
              ))}
            </div>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={currency === "JPY" ? "Amount in yen" : "Amount in dollars"} aria-label="Amount"
              className="flex-1 min-w-0 min-h-[48px] rounded-xl border border-[#e0d8cc] px-3 text-[17px] text-[#3a3128] focus:outline-none focus:border-[#a89880]" />
          </div>
          <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What for (if you like)" aria-label="What for"
            className="min-h-[48px] rounded-xl border border-[#e0d8cc] px-3 text-[16px] text-[#3a3128] focus:outline-none focus:border-[#a89880]" />
          <div className="flex items-center gap-3">
            <button type="button" onClick={add} disabled={busy} className="min-h-[48px] px-6 rounded-xl bg-[#514636] text-white text-[15px] font-medium disabled:opacity-50">{busy ? "Keeping…" : "Keep it"}</button>
            <button type="button" onClick={() => { setAdding(false); setError(null); }} className="min-h-[48px] px-2 text-[15px] text-[#514636] underline underline-offset-2">Cancel</button>
          </div>
          {error && <p className="text-sm text-[#8a3a1a]" role="alert">{error}</p>}
          <p className="text-[12px] text-[#8a7d68]">Or tell Scout: “We paid ¥8,000 for lunch.” Dollars are kept with that day's yen.</p>
        </section>}

        {l && l.items.length > 0 && (
          <section aria-label="Payments kept">
            <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-2">Every entry</h2>
            <ul className="bg-white rounded-2xl border border-[#e0d8cc] divide-y divide-[#f0ebe3]">
              {l.items.map((x) => (
                <li key={x.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[15px] text-[#3a3128]"><span className="font-medium">{x.party}</span>{x.what ? ` · ${x.what}` : ""}</p>
                    <p className="text-[15px] text-[#3a3128] shrink-0">{x.currency === "USD" ? `$${x.amount}` : yen(x.amount)}</p>
                  </div>
                  <p className="text-xs text-[#6b5d4a] mt-0.5">{shortDay(x.dayDate)} · kept by {first(x.addedByName) === first(me) ? "you" : x.addedByName}{x.currency === "USD" ? ` · ${yen(x.yen)} at ${x.rate?.toFixed(2)} yen to the dollar` : ""}</p>
                  {x.mayRemove && (confirming === x.id ? (
                    <div className="flex gap-3 mt-1">
                      <button type="button" onClick={async () => { setConfirming(null); const e = tripId ? await removePayment(tripId, x.id) : null; if (e) setError(e); }} className="min-h-[44px] text-sm text-[#8a3a1a] underline">Remove it</button>
                      <button type="button" onClick={() => setConfirming(null)} className="min-h-[44px] text-sm text-[#514636] underline">Keep it</button>
                    </div>
                  ) : <button type="button" onClick={() => setConfirming(x.id)} className="min-h-[44px] -mb-2 text-sm text-[#6b5d4a] underline underline-offset-2">Remove</button>)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
