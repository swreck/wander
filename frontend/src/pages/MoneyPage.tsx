/**
 * Who pays next (Oct 15 2026) — Larisa's idea, through Ken: "a simple button that is something like who pays next and it
 * just points to the couple that currently has the smaller total". Every payment either couple makes for the group is
 * kept; shared half and half, the couple that paid less owes the other half the difference. Yen as said, or dollars
 * kept with that day's yen. All four see it. Scout keeps payments too ("we paid ¥12,400 for dinner").
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { loadLedger, savedLedger, addPayment, removePayment, changePayment, loadHistory, sharedOf, yen, MONEY_CHANGED, type Ledger } from "../lib/expenses";
import PayNextBadge from "../components/PayNextBadge";
import useBackToClose from "../hooks/useBackToClose";

const shortDay = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "");
const first = (s: string) => s.trim().split(/\s+/)[0].toLowerCase();

export default function MoneyPage() {
  const navigate = useNavigate();
  const me = useAuth().user?.displayName || "";
  const [tripId, setTripId] = useState<string | null>(() => { try { return localStorage.getItem("wander:last-trip-id"); } catch { return null; } });
  const [l, setL] = useState<Ledger | null>(() => (tripId ? savedLedger(tripId) : null));
  const [kept, setKept] = useState<string | null>(null);
  // One sheet for a new entry and for changing one (Ken, Oct 16: "add edit button to budget page to go back and add
  // reason, change total, or change payer with a pop up, or remove item, or from that page add an entry including the pop
  // up and keyboard for money with tiny pop up for dollars yen (yen default)")
  const [sheet, setSheet] = useState<{ id: string | null } | null>(null);
  const [history, setHistory] = useState(false);
  // (an iPhone raises the keyboard only for a field focused in the tap itself: this one takes it on the tap, and the
  // sheet's amount takes it over when it's drawn)
  const keyboard = useRef<HTMLInputElement>(null);

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
  useEffect(() => { if (!kept) return; const t = setTimeout(() => setKept(null), 4000); return () => clearTimeout(t); }, [kept]);
  const openAdd = () => { keyboard.current?.focus(); setSheet({ id: null }); };

  const back = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/"));
  return (
    <div className="min-h-screen bg-[#faf8f5] pb-28">
      <header className="pb-6 bg-gradient-to-b from-[#e7efe3] to-[#faf8f5]" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}>
        <div className="max-w-xl mx-auto px-4">
          <button type="button" onClick={back} className="min-h-[44px] min-w-[44px] pr-2 text-sm text-[#514636]">‹ Back</button>
          <p className="text-[12px] uppercase tracking-[.14em] text-[#5b6b52] mt-1">Budget</p>
          <h1 className="text-[32px] font-light text-[#2f3a2a] leading-tight mt-0.5">{!l ? "…" : l.items.length ? `${yen(sharedOf(l))} shared so far` : "Nothing kept yet"}</h1>
          {/* (paid for one couple alone — Julie's ¥5,000 for Larisa's jacket: not shared, but owed back in full; Oct 16) */}
          {l && (l.alone || 0) > 0 && <p className="text-[14px] text-[#514636] mt-1">Plus {yen(l.alone!)} paid for one couple alone.</p>}
          {l && <p className="text-[15px] text-[#3a3128] mt-2">Who pays next: {l.next && <PayNextBadge party={l.next} className="mr-1" />}<span className="font-medium">{l.next || (l.items.length ? "either — you're even" : "either couple")}</span></p>}
          {l?.owes && <p className="text-[14px] text-[#514636] mt-1">To be even now, {l.owes.from} would pay {l.owes.to} {yen(l.owes.yen)}.</p>}
          {l && !l.items.length && <p className="text-[14px] text-[#514636] mt-1">When one couple pays for the group, add it here. Each cost is shared half and half.</p>}
        </div>
      </header>

      <main className="px-4 max-w-xl mx-auto flex flex-col gap-5">
        <input ref={keyboard} inputMode="decimal" aria-hidden tabIndex={-1} className="fixed -top-20 left-0 w-px h-px opacity-0" />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={openAdd} className="min-h-[48px] px-6 rounded-xl bg-[#514636] text-white text-[15px] font-medium">+ Add entry</button>
          {kept && <span className="text-sm text-[#4a6a3a]" role="status">✓ {kept}</span>}
        </div>
        {!l?.items.length && <p className="text-[12px] text-[#8a7d68] -mt-2">Or tell Scout: “We paid ¥8,000 for lunch.” Dollars are kept with that day's yen.</p>}

        {l && l.items.length > 0 && (
          <section aria-label="Payments kept">
            <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-2">Every entry</h2>
            <ul className="bg-white rounded-2xl border border-[#e0d8cc] divide-y divide-[#f0ebe3]">
              {l.items.map((x) => {
                const lines = (
                  <>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[15px] text-[#3a3128]"><span className="font-medium">{x.party}</span>{x.what ? ` · ${x.what}` : ""}</p>
                      <p className="text-[15px] text-[#3a3128] shrink-0">{x.currency === "USD" ? `$${x.amount}` : yen(x.amount)}</p>
                    </div>
                    {x.forParty && <p className="text-[13px] text-[#514636] mt-0.5">For {x.forParty} alone · {x.forParty === x.party ? "not shared" : `${x.forParty} owe${/&/.test(x.forParty) ? "" : "s"} it back in full`}</p>}
                    <p className="text-xs text-[#6b5d4a] mt-0.5">{shortDay(x.dayDate)} · kept by {first(x.addedByName) === first(me) ? "you" : x.addedByName}{x.currency === "USD" ? ` · ${yen(x.yen)} at ${x.rate?.toFixed(2)} yen to the dollar` : ""}</p>
                  </>
                );
                return (
                  <li key={x.id}>
                    {x.mayRemove ? (
                      <button type="button" onClick={() => setSheet({ id: x.id })} aria-label={`Change ${x.party}'s ${x.currency === "USD" ? `$${x.amount}` : yen(x.amount)}${x.what ? `, ${x.what}` : ""}`}
                        className="w-full text-left px-4 py-3 min-h-[56px] flex items-center gap-2 active:bg-[#f5f0ea]">
                        <span className="flex-1 min-w-0">{lines}</span>
                        <span aria-hidden className="text-xl leading-none text-[#a89880]">›</span>
                      </button>
                    ) : <div className="px-4 py-3 pr-8">{lines}</div>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {/* (Ken, Oct 16: "Change 'history' to 'Log' and put at bottom (it's an admin log, only for me or moments of audit)") */}
        <div className="flex justify-end">
          <button type="button" onClick={() => setHistory(true)} className="min-h-[44px] min-w-[44px] px-1 text-[13px] text-[#6b5d4a] underline underline-offset-2">Log</button>
        </div>
      </main>
      {/* (one sheet from the tap on: a "waiting" card swapped for the form when the couples came, and the swap closed it —
          each card holds the phone's Back, and the first letting go read to the second as Back) */}
      {sheet && <EntrySheet key={sheet.id || "new"} tripId={tripId} l={l} mine={mine} item={sheet.id && l ? l.items.find((x) => x.id === sheet.id) || null : null}
        onClose={(said) => { setSheet(null); if (said) setKept(said); }} />}
      {history && tripId && <HistorySheet tripId={tripId} onClose={() => setHistory(false)} />}
    </div>
  );
}

type Item = Ledger["items"][number];

/** A card near the top of the screen — above where an iPhone's keyboard comes up — over the page; back or a tap outside
 *  closes it */
function Card({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  useBackToClose(true, () => onClose());
  return (
    <div className="fixed inset-0 z-[70] bg-black/30 flex items-start justify-center px-3" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }} onClick={onClose}>
      <section role="dialog" aria-label={label} className="w-full max-w-md bg-[#faf8f5] rounded-2xl p-4 flex flex-col gap-3 max-h-[80dvh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </section>
    </div>
  );
}

/** A new entry, or one kept already: which couple paid, how much (yen unless ¥ is switched to $), what for — and, for one
 *  kept already, Remove */
function EntrySheet({ tripId, l, mine, item, onClose }: { tripId: string | null; l: Ledger | null; mine: string | null; item: Item | null; onClose: (said?: string) => void }) {
  const [paidBy, setPaidBy] = useState<string | null>(item?.party || mine);
  // (opened before the couples came: her couple, once they do)
  useEffect(() => { if (!paidBy && !item && mine) setPaidBy(mine); }, [mine, paidBy, item]);
  const [amount, setAmount] = useState(item ? String(item.amount) : "");
  const [currency, setCurrency] = useState<"JPY" | "USD">(item?.currency === "USD" ? "USD" : "JPY");
  const [what, setWhat] = useState(item?.what || "");
  // who it's for: shared half and half (the usual), or wholly one couple's (Ken, Oct 16: "Split should probably be an
  // option generally also with split as default and either as full owner of item")
  const [forParty, setForParty] = useState<string | null>(item?.forParty || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  // (a new entry: straight to the amount, the keyboard already up from the tap)
  useEffect(() => { if (!item) amountRef.current?.focus(); }, [item]);
  useEffect(() => { if (paidBy) setError((e) => (e === "Which couple paid?" ? null : e)); }, [paidBy]);
  const money = (n: number, c: string) => (c === "USD" ? `$${n}` : yen(n));

  const save = async () => {
    const n = Number(amount.replace(/[,¥$\s]/g, ""));
    if (!tripId || !l) return;
    if (!paidBy || !(n > 0)) { setError(!paidBy ? "Which couple paid?" : "How much was it?"); return; }
    setBusy(true); setError(null);
    let err: string | null;
    if (!item) err = await addPayment(tripId, { paidBy, amount: n, currency, what: what.trim() || undefined, forParty });
    else {
      const body: { paidBy?: string; amount?: number; currency?: "JPY" | "USD"; what?: string; forParty?: string | null } = {};
      if (paidBy !== item.party) body.paidBy = paidBy;
      if (n !== item.amount) body.amount = n;
      if (currency !== item.currency) body.currency = currency;
      if (what.trim() !== (item.what || "")) body.what = what.trim();
      if (forParty !== (item.forParty || null)) body.forParty = forParty;
      err = Object.keys(body).length ? await changePayment(tripId, item.id, body) : null;
      if (!err && !Object.keys(body).length) { setBusy(false); onClose(); return; }
    }
    setBusy(false);
    if (err) { setError(err); return; }
    onClose(item ? `Changed: ${paidBy}, ${money(n, currency)}` : `Kept: ${paidBy}, ${money(n, currency)}`);
  };
  const remove = async () => {
    if (!item || !tripId) return;
    setBusy(true);
    const err = await removePayment(tripId, item.id);
    setBusy(false);
    if (err) { setError(err); setRemoving(false); return; }
    onClose(`Removed: ${item.party}, ${money(item.amount, item.currency)}`);
  };

  return (
    <Card label={item ? "Change entry" : "Add entry"} onClose={() => onClose()}>
      <h2 className="text-[17px] font-medium text-[#3a3128]">{item ? "Change entry" : "Add entry"}</h2>
      {/* (opened before the ledger came: says so, and Keep it waits — user-julie3: "Which couple paid?" with no way to answer) */}
      {!l && <p className="text-[15px] text-[#6b5d4a] min-h-[48px] flex items-center" role="status">Getting the two couples…</p>}
      {/* (said, now that "Who it's for" has its own row of couples below) */}
      {l && <p className="text-[13px] text-[#6b5d4a] -mb-2">Who paid</p>}
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
        <input ref={amountRef} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" enterKeyHint="done"
          placeholder={currency === "JPY" ? "Amount in yen" : "Amount in dollars"} aria-label="Amount"
          className="flex-1 min-w-0 min-h-[48px] rounded-xl border border-[#e0d8cc] px-3 text-[17px] text-[#3a3128] focus:outline-none focus:border-[#a89880]" />
      </div>
      <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What for (if you like)" aria-label="What for"
        className="min-h-[48px] rounded-xl border border-[#e0d8cc] px-3 text-[16px] text-[#3a3128] focus:outline-none focus:border-[#a89880]" />
      {l && <div role="group" aria-label="Who it's for">
        <p className="text-[13px] text-[#6b5d4a] mb-1">Who it's for</p>
        <div className="flex flex-wrap gap-2">
          {[null, ...l.parties].map((p) => (
            <button key={p || "shared"} type="button" onClick={() => setForParty(p)} aria-pressed={forParty === p}
              className={`min-h-[44px] px-3 rounded-full border text-[14px] ${forParty === p ? "bg-[#3a3128] text-white border-[#3a3128]" : "bg-white text-[#3a3128] border-[#e0d8cc]"}`}>
              {p ? `${p} alone` : "Shared, half each"}
            </button>
          ))}
        </div>
      </div>}
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={busy || !l} className="min-h-[48px] px-6 rounded-xl bg-[#514636] text-white text-[15px] font-medium disabled:opacity-50">{busy ? (item ? "Saving…" : "Keeping…") : item ? "Save" : "Keep it"}</button>
        <button type="button" onClick={() => onClose()} className="min-h-[48px] px-2 text-[15px] text-[#514636] underline underline-offset-2">Cancel</button>
      </div>
      {error && <p className="text-sm text-[#8a3a1a]" role="alert">{error}</p>}
      {item && (removing ? (
        <div className="flex items-center gap-3 border-t border-[#ece5da] pt-2">
          <span className="text-sm text-[#3a3128]">Remove it for everyone?</span>
          <button type="button" onClick={remove} disabled={busy} className="min-h-[44px] text-sm text-[#8a3a1a] underline">Remove it</button>
          <button type="button" onClick={() => setRemoving(false)} className="min-h-[44px] text-sm text-[#514636] underline">Keep it</button>
        </div>
      ) : <button type="button" onClick={() => setRemoving(true)} className="self-start min-h-[44px] text-sm text-[#8a3a1a] underline underline-offset-2 border-t border-[#ece5da] pt-2">Remove this entry</button>)}
      {!item && <p className="text-[12px] text-[#8a7d68]">Or tell Scout: “We paid ¥8,000 for lunch.” Dollars are kept with that day's yen.</p>}
    </Card>
  );
}

/** Budget's Log: when, who, what they did — newest first (Ken, Oct 16: "date, person, action only"; "an admin log, only
 *  for me or moments of audit") */
function HistorySheet({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const [lines, setLines] = useState<{ at: string; by: string; action: string }[] | null | "none">(null);
  useEffect(() => { let live = true; loadHistory(tripId).then((h) => { if (live) setLines(h || "none"); }); return () => { live = false; }; }, [tripId]);
  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Tokyo", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <Card label="Budget log" onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-medium text-[#3a3128]">Log</h2>
        <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] text-[15px] text-[#514636] underline underline-offset-2">Done</button>
      </div>
      {lines === null ? <p className="text-sm text-[#6b5d4a]">Getting it…</p>
        : lines === "none" ? <p className="text-sm text-[#6b5d4a]">That didn't load. Try again when you have signal.</p>
        : !lines.length ? <p className="text-sm text-[#6b5d4a]">Nothing yet.</p>
        : <ul className="divide-y divide-[#f0ebe3]">
            {lines.map((h, i) => (
              <li key={i} className="py-2 text-[14px] text-[#3a3128]">
                {/* (who did it at the end of the line, by name — Ken, Oct 16: "add the individuals user who made change at end of
                    record"; a removal from before History began says it wasn't recorded) */}
                <span className="block text-xs text-[#6b5d4a]">{when(h.at)}</span>
                {h.action.replace(/^./, (c) => c.toUpperCase())}
                <span className="text-[#6b5d4a]"> · {h.by ? h.by.split(/\s+/)[0] : "who wasn't recorded"}</span>
              </li>
            ))}
          </ul>}
    </Card>
  );
}
