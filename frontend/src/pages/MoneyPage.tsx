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
import { loadLedger, savedLedger, addPayment, removePayment, changePayment, putBackPayment, loadHistory, keepKeyFor, letGoOfKeep, readReceiptPhoto, receiptImage, sharedOf, yen, MONEY_CHANGED, MONEY_KEPT_LATE, type Ledger, type LogLine, type ReceiptPhoto } from "../lib/expenses";
import PayNextBadge from "../components/PayNextBadge";
import useBackToClose from "../hooks/useBackToClose";

const shortDay = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "");
const first = (s: string) => s.trim().split(/\s+/)[0].toLowerCase();

export default function MoneyPage() {
  const navigate = useNavigate();
  const me = useAuth().user?.displayName || "";
  const [tripId, setTripId] = useState<string | null>(() => { try { return localStorage.getItem("wander:last-trip-id"); } catch { return null; } });
  const [l, setL] = useState<Ledger | null>(() => (tripId ? savedLedger(tripId) : null));
  // what was just done, said beside "+ Add entry" — and, just after a removal, "Put it back"
  const [kept, setKept] = useState<{ said: string; putBack?: string } | null>(null);
  const [backErr, setBackErr] = useState<string | null>(null);
  // One sheet for a new entry and for changing one (Ken, Oct 16: "add edit button to budget page to go back and add
  // reason, change total, or change payer with a pop up, or remove item, or from that page add an entry including the pop
  // up and keyboard for money with tiny pop up for dollars yen (yen default)")
  const [sheet, setSheet] = useState<{ id: string | null } | null>(null);
  const [history, setHistory] = useState(false);
  // a payment's receipt, open full screen
  const [viewing, setViewing] = useState<string | null>(null);
  // (an iPhone raises the keyboard only for a field focused in the tap itself: this one takes it on the tap, and the
  // sheet's amount takes it over when it's drawn)
  const keyboard = useRef<HTMLInputElement>(null);
  // (a removal from far down the list: what happened, and Put it back, come into view)
  const saidRow = useRef<HTMLDivElement>(null);
  useEffect(() => { if (kept?.putBack) saidRow.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [kept]);

  useEffect(() => { if (!tripId) api.get<{ id?: string } | null>("/trips/active").then((t) => setTripId(t?.id || null)).catch(() => {}); }, [tripId]);
  useEffect(() => {
    if (!tripId) return;
    let live = true;
    const get = () => loadLedger(tripId).then((x) => { if (live && x) setL(x); });
    get();
    window.addEventListener(MONEY_CHANGED, get);
    return () => { live = false; window.removeEventListener(MONEY_CHANGED, get); };
  }, [tripId]);
  // (a Keep closed before Wander answered, then answered: said, not just appearing in the list — fresh tester)
  useEffect(() => {
    const late = (e: Event) => setKept({ said: `Kept after all: ${(e as CustomEvent<string>).detail}` });
    window.addEventListener(MONEY_KEPT_LATE, late);
    return () => window.removeEventListener(MONEY_KEPT_LATE, late);
  }, []);
  // (the couple you're in, ready as "paid by")
  const mine = l?.parties.find((p) => p.split(/\s*&\s*/).some((x) => first(x) === first(me))) || null;
  // (a removal stays offered back longer — 12 seconds — than a plain "Kept", which stays 8: at 4 someone glancing away in
  // a taxi missed it; fresh tester, Oct 16)
  useEffect(() => { if (!kept) return; const t = setTimeout(() => setKept(null), kept.putBack ? 12000 : 8000); return () => clearTimeout(t); }, [kept]);
  const putBack = async (id: string, said: string) => {
    if (!tripId) return;
    setBackErr(null);
    const err = await putBackPayment(tripId, id);
    if (err) { setBackErr(err); return; }
    setKept({ said });
  };
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
          {/* (which couple — stability walk: "doesn't say which couple"; and each, when there are payments for both: "¥6,790
              paid for one couple alone" was ¥4,810 for Ken & Larisa and ¥1,980 for Julie & Andy) */}
          {l && (l.alone || 0) > 0 && (() => {
            const by = new Map<string, number>();
            for (const x of l.items) if (x.forParty) by.set(x.forParty, (by.get(x.forParty) || 0) + x.yen);
            const parts = [...by.entries()].map(([p, n]) => `${yen(n)} for ${p} alone`);
            return <p className="text-[14px] text-[#514636] mt-1">Plus {parts.length ? parts.map((s, i) => (i === 0 ? s.replace(" for ", " paid for ") : s)).join(" and ") : `${yen(l.alone!)} paid for one couple alone`}.</p>;
          })()}
          {l && <p className="text-[15px] text-[#3a3128] mt-2">Who pays next: {l.next && <PayNextBadge party={l.next} className="mr-1" />}<span className="font-medium">{l.next || (l.items.length ? "either — you're even" : "either couple")}</span></p>}
          {l?.owes && <p className="text-[14px] text-[#514636] mt-1">To be even now, {l.owes.from} would pay {l.owes.to} {yen(l.owes.yen)}.</p>}
          {l && !l.items.length && <p className="text-[14px] text-[#514636] mt-1">When one couple pays for the group, add it here. Each cost is shared half and half.</p>}
        </div>
      </header>

      <main className="px-4 max-w-xl mx-auto flex flex-col gap-5">
        <input ref={keyboard} inputMode="decimal" aria-hidden tabIndex={-1} className="fixed -top-20 left-0 w-px h-px opacity-0" />
        <div ref={saidRow} className="flex flex-wrap items-center gap-3 scroll-mt-4">
          <button type="button" onClick={openAdd} className="min-h-[48px] px-6 rounded-xl bg-[#514636] text-white text-[15px] font-medium">+ Add entry</button>
          {/* (no tick on a removal — it read as success; fresh tester) */}
          {kept && <span className={`text-sm ${/^Removed/.test(kept.said) ? "text-[#514636]" : "text-[#4a6a3a]"}`} role="status">{/^Removed/.test(kept.said) ? "" : "✓ "}{kept.said}</span>}
          {kept?.putBack && <button type="button" onClick={() => putBack(kept.putBack!, kept.said.replace(/^Removed/, "Put back"))} className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Put it back</button>}
        </div>
        {backErr && <p className="text-sm text-[#8a3a1a] -mt-3" role="alert">{backErr}</p>}
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
                    {/* (its receipt, for all four to see — the Budget is shared) */}
                    {x.hasReceipt && (
                      <button type="button" onClick={() => setViewing(x.id)} className="-mt-2 mb-1 ml-4 min-h-[44px] text-[13px] text-[#514636] underline underline-offset-2">Receipt</button>
                    )}
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
        onClose={(said, removedId) => { setSheet(null); if (said) setKept({ said, ...(removedId ? { putBack: removedId } : {}) }); }} />}
      {history && tripId && <HistorySheet tripId={tripId} onClose={() => setHistory(false)} />}
      {viewing && tripId && <ReceiptView tripId={tripId} id={viewing} onClose={() => setViewing(null)} />}
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
function EntrySheet({ tripId, l, mine, item, onClose }: { tripId: string | null; l: Ledger | null; mine: string | null; item: Item | null; onClose: (said?: string, removedId?: string) => void }) {
  const [paidBy, setPaidBy] = useState<string | null>(item?.party || mine);
  // (opened before the couples came: her couple, once they do)
  // (…unless a receipt's photo is in: then who paid waits for a tap)
  const [askWho, setAskWho] = useState(false);
  useEffect(() => { if (!paidBy && !item && mine && !askWho) setPaidBy(mine); }, [mine, paidBy, item, askWho]);
  const [amount, setAmount] = useState(item ? String(item.amount) : "");
  const [currency, setCurrency] = useState<"JPY" | "USD">(item?.currency === "USD" ? "USD" : "JPY");
  const [what, setWhat] = useState(item?.what || "");
  // A photo of the receipt (Ken, Oct 16: "take pictures of receipts and add them and simply note who paid for them and have
  // the option of adding what the item is"): Wander reads the total and what it was for; the photo goes with the payment
  const [receipt, setReceipt] = useState<{ photo: ReceiptPhoto; date: string | null } | null>(null);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const receiptInput = useRef<HTMLInputElement>(null);
  // who it's for: shared half and half (the usual), or wholly one couple's (Ken, Oct 16: "Split should probably be an
  // option generally also with split as default and either as full owner of item")
  const [forParty, setForParty] = useState<string | null>(item?.forParty || null);
  const [busy, setBusy] = useState(false);
  // (a Keep with no answer for a while — bars showing, nothing coming back — says so, and that waiting or Cancel are both
  // safe: "Keeping…" alone for 40 seconds left Julie to guess; fresh tester)
  const [slow, setSlow] = useState(false);
  useEffect(() => { if (!busy) { setSlow(false); return; } const t = setTimeout(() => setSlow(true), 6000); return () => clearTimeout(t); }, [busy]);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  // This Keep's one-time tag: Keep again after "That didn't save" sends the same one, so a payment whose reply was lost on
  // a weak signal is never kept twice. Changed words make a new one — that's a different payment to keep.
  const keepKey = useRef<{ words: string; key: string } | null>(null);
  // Closed before Wander answered (Cancel, Back, a tap outside): this pop-up never acts again — a late answer used to
  // close the next pop-up she'd opened — and its Keep, if it lands, is still that payment typed again (lib/expenses)
  const closed = useRef(false);
  const close = () => { closed.current = true; if (busy && keepKey.current) letGoOfKeep(keepKey.current.key); onClose(); };
  // (a new entry: straight to the amount, the keyboard already up from the tap)
  useEffect(() => { if (!item) amountRef.current?.focus(); }, [item]);
  useEffect(() => { if (paidBy) setError((e) => (e === "Which couple paid?" ? null : e)); }, [paidBy]);
  const money = (n: number, c: string) => (c === "USD" ? `$${n}` : yen(n));

  // What the last photo filled in — a new photo, or Remove, replaces it; words the person typed themselves stay (fresh
  // tester, Oct 16: a second photo kept the first one's ¥5,200 and "Lunch", and an unreadable one kept "Taxi")
  const filled = useRef({ amount: "", what: "" });
  const fromReceipt = async (file: File) => {
    if (!tripId) return;
    setReading(true); setReadNote(null); setError(null);
    const r = await readReceiptPhoto(tripId, file);
    if (closed.current) return;
    setReading(false);
    if (!r.photo) { setError(r.error || "That picture couldn't be read on this phone."); return; }
    setReceipt({ photo: r.photo, date: r.read?.date || null });
    const prev = filled.current;
    const amountTheirs = !!amount.trim() && amount !== prev.amount;
    const whatTheirs = !!what.trim() && what !== prev.what;
    const amt = r.read?.amount ? String(r.read.amount) : "";
    if (amt) { setAmount(amt); setCurrency(r.read!.currency); } else if (!amountTheirs) setAmount("");
    const said = r.read?.what || "";
    if (!whatTheirs) setWhat(said);
    filled.current = { amount: amt || (amountTheirs ? prev.amount : ""), what: whatTheirs ? prev.what : said };
    // (who paid is asked, not assumed, once there's a photo — the couple already picked read as something taken from it)
    setPaidBy(null); setAskWho(true);
    setReadNote(amt
      ? `From the receipt: ${r.read!.currency === "USD" ? `$${r.read!.amount}` : yen(r.read!.amount!)}${said ? `, ${said}` : ""}. Check it, then tap who paid.`
      : "Wander couldn't find a total on it. If it's a receipt, type the amount; the photo is kept with it.");
  };
  const dropReceipt = () => {
    const prev = filled.current;
    if (amount === prev.amount) setAmount("");
    if (what === prev.what) setWhat("");
    filled.current = { amount: "", what: "" };
    setReceipt(null); setReadNote(null); setAskWho(false);
    if (!paidBy) setPaidBy(mine);
  };
  const save = async () => {
    const n = Number(amount.replace(/[,¥$\s]/g, ""));
    if (!tripId || !l) return;
    if (!paidBy || !(n > 0)) { setError(!paidBy ? "Which couple paid?" : "How much was it?"); return; }
    setBusy(true); setError(null);
    let err: string | null;
    let again = false;
    if (!item) {
      const words = JSON.stringify([paidBy, n, currency, what.trim(), forParty]);
      if (keepKey.current?.words !== words) keepKey.current = { words, key: keepKeyFor(tripId, words) };
      ({ err, again } = await addPayment(tripId, { paidBy, amount: n, currency, what: what.trim() || undefined, forParty, clientKey: keepKey.current.key,
        ...(receipt ? { receipt: receipt.photo, ...(receipt.date ? { dayDate: receipt.date } : {}) } : {}) }, words));
    }
    else {
      const body: { paidBy?: string; amount?: number; currency?: "JPY" | "USD"; what?: string; forParty?: string | null } = {};
      if (paidBy !== item.party) body.paidBy = paidBy;
      if (n !== item.amount) body.amount = n;
      if (currency !== item.currency) body.currency = currency;
      if (what.trim() !== (item.what || "")) body.what = what.trim();
      if (forParty !== (item.forParty || null)) body.forParty = forParty;
      err = Object.keys(body).length ? await changePayment(tripId, item.id, body) : null;
      if (!err && !Object.keys(body).length) { if (!closed.current) { setBusy(false); onClose(); } return; }
    }
    if (closed.current) return;
    setBusy(false);
    if (err) { setError(err); return; }
    // (what for too, as Removed and Put back say — "Kept: Julie & Andy, ¥3,400" didn't say which ¥3,400; fresh tester)
    const forWords = what.trim() ? `, ${what.trim()}` : "";
    // ("Already kept" when Wander had this very payment — typed again after no answer; fresh tester: "Kept" read as new)
    onClose(item ? `Changed: ${paidBy}, ${money(n, currency)}${forWords}` : `${again ? "Already kept" : "Kept"}: ${paidBy}, ${money(n, currency)}${forWords}`);
  };
  const remove = async () => {
    if (!item || !tripId) return;
    setBusy(true);
    const err = await removePayment(tripId, item.id);
    if (closed.current) return;
    setBusy(false);
    if (err) { setError(err); setRemoving(false); return; }
    // (what it was for too — "Removed: Ken & Larisa, ¥2,000" didn't say which ¥2,000; fresh tester)
    onClose(`Removed: ${item.party}, ${money(item.amount, item.currency)}${item.what ? `, ${item.what}` : ""}`, item.id);
  };

  return (
    <Card label={item ? "Change entry" : "Add entry"} onClose={close}>
      {/* (the receipt's photo on the heading's line: a row of its own pushed Keep under the number keyboard) */}
      <div className="flex items-center gap-2 -my-1">
        <h2 className="flex-1 text-[17px] font-medium text-[#3a3128]">{item ? "Change entry" : "Add entry"}</h2>
        {!item && (
          <button type="button" onClick={() => receiptInput.current?.click()} disabled={reading || !l}
            className="min-h-[44px] px-3 rounded-xl border border-dashed border-[#c8b89c] bg-white text-[14px] text-[#514636] disabled:opacity-60">
            {reading ? "Reading the receipt…" : receipt ? "📷 Take another photo" : "📷 Photo of the receipt"}
          </button>
        )}
        {/* (an iPhone offers Take Photo, Photo Library and Choose File from this) */}
        {!item && <input ref={receiptInput} type="file" accept="image/*" className="hidden" aria-hidden tabIndex={-1}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void fromReceipt(f); }} />}
      </div>
      {!item && (receipt || readNote) && (
        <div>
          {receipt && (
            <div className="flex items-center gap-3 mt-2">
              <img src={receipt.photo.thumb} alt="The receipt" className="w-10 h-12 object-cover rounded border border-[#e0d8cc]" />
              <p className="flex-1 text-[13px] text-[#514636]" role="status">{readNote}</p>
              <button type="button" onClick={dropReceipt} className="min-h-[44px] text-sm text-[#6b5d4a] underline underline-offset-2">Remove</button>
            </div>
          )}
          {!receipt && readNote && <p className="text-[13px] text-[#514636] mt-1" role="status">{readNote}</p>}
        </div>
      )}
      {item?.hasReceipt && tripId && (
        <button type="button" onClick={() => setShowReceipt(true)} className="self-start min-h-[44px] text-sm text-[#514636] underline underline-offset-2">See the receipt</button>
      )}
      {showReceipt && item && tripId && <ReceiptView tripId={tripId} id={item.id} onClose={() => setShowReceipt(false)} />}
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
        <button type="button" onClick={close} className="min-h-[48px] px-2 text-[15px] text-[#514636] underline underline-offset-2">Cancel</button>
      </div>
      {slow && !item && <p className="text-sm text-[#514636]" role="status">Still waiting for Wander to answer. You can keep waiting, or Cancel: if it got through, it shows in the list, and typing it again won't keep it twice.</p>}
      {error && <p className="text-sm text-[#8a3a1a]" role="alert">{error}</p>}
      {item && (removing ? (
        <div className="flex items-center gap-3 border-t border-[#ece5da] pt-2">
          <span className="text-sm text-[#3a3128]">Remove it for everyone?</span>
          <button type="button" onClick={remove} disabled={busy} className="min-h-[44px] text-sm text-[#8a3a1a] underline">Remove it</button>
          <button type="button" onClick={() => setRemoving(false)} className="min-h-[44px] text-sm text-[#514636] underline">Keep it</button>
        </div>
      ) : <button type="button" onClick={() => setRemoving(true)} className="self-start min-h-[44px] text-sm text-[#8a3a1a] underline underline-offset-2 border-t border-[#ece5da] pt-2">Remove this entry</button>)}
      {/* (not with a receipt in: the pop-up is taller then, and Keep stays higher) */}
      {!item && !receipt && <p className="text-[12px] text-[#8a7d68]">Or tell Scout: “We paid ¥8,000 for lunch.”</p>}
    </Card>
  );
}

/** Budget's Log: when, who, what they did — newest first (Ken, Oct 16: "date, person, action only"; "an admin log, only
 *  for me or moments of audit") */
/** A payment's receipt photo, over everything, to read it (Done or a tap closes it) */
function ReceiptView({ tripId, id, onClose }: { tripId: string; id: string; onClose: () => void }) {
  const [src, setSrc] = useState<string | null | "none">(null);
  useEffect(() => {
    let live = true, made: string | null = null;
    receiptImage(tripId, id).then((u) => { made = u; if (live) setSrc(u || "none"); else if (u) URL.revokeObjectURL(u); });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [tripId, id]);
  return (
    <div className="fixed inset-0 z-[80] bg-black/85 flex flex-col" role="dialog" aria-label="Receipt" onClick={onClose}>
      <div className="flex justify-end p-2" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}>
        <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] px-3 text-[15px] text-white underline underline-offset-2">Done</button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-3">
        {src === null ? <p className="text-white/80 text-sm">Getting the receipt…</p>
          : src === "none" ? <p className="text-white/80 text-sm">The receipt didn't load. Try again when you have signal.</p>
          : <img src={src} alt="The receipt" className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />}
      </div>
    </div>
  );
}

function HistorySheet({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const [lines, setLines] = useState<LogLine[] | null | "none">(null);
  const [tick, setTick] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { let live = true; loadHistory(tripId).then((h) => { if (live) setLines(h || "none"); }); return () => { live = false; }; }, [tripId, tick]);
  // (a removed payment put back from its Log line — Ken, Oct 16: "brought back into the live flow")
  const back = async (id: string) => {
    setErr(null);
    const e = await putBackPayment(tripId, id);
    if (e) setErr(e); else setTick((n) => n + 1);
  };
  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Tokyo", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <Card label="Budget log" onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-medium text-[#3a3128]">Log</h2>
        <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] text-[15px] text-[#514636] underline underline-offset-2">Done</button>
      </div>
      {err && <p className="text-sm text-[#8a3a1a]" role="alert">{err}</p>}
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
                {h.putBack && <button type="button" onClick={() => back(h.putBack!)} className="block min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Put it back</button>}
                {h.putBackBy && <span className="block text-xs text-[#6b5d4a] mt-0.5">{h.putBackBy} can put it back.</span>}
              </li>
            ))}
          </ul>}
    </Card>
  );
}
