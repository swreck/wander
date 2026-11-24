/**
 * Budget on a trip whose payers are families (Ken, Nov 16 2026: "dollars as the common unit, the three families as
 * payers, shared costs split per person", "plus a currency pop-up on entering and viewing an expense, at recent rates").
 * The spec is trip-data/december-plan/family-budget-spec.md. Every number comes from the server
 * (backend/src/services/familyExpenses.ts); the phone only converts what is being typed ("About …") and divides that
 * ("about $… each"). Japan's couples' Budget is MoneyPage.tsx and stays as it is; this page borrows its cards.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { addPayment, changePayment, removePayment, putBackPayment, keepKeyFor, letGoOfKeep, readReceiptPhoto, attachReceiptPhoto, MONEY_KEPT_LATE, type FamilyLedger, type FamilyItem, type ReceiptPhoto } from "../lib/expenses";
import { convert, money, typedAmount, rateWords, perDollarWords, MONEY_NAMES, MONEY_SIGNS, type Currency, type Foreign } from "../lib/rates";
import PayNextBadge, { familyColor, SHARED_BLUE, CHECK_RED } from "../components/PayNextBadge";
import { Card, ReceiptView, HistorySheet } from "./MoneyPage";

const shortDay = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "");
const first = (s: string) => s.trim().split(/\s+/)[0].toLowerCase();
const usd = (n: number) => money(n, "USD");
/** "A", "A and B", "A, B and C" */
const andJoin = (list: string[]) => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);
const openTripId = () => { try { return localStorage.getItem("wander:last-trip-id"); } catch { return null; } };
/** An answer about a trip that's no longer the open one changes nothing (spec §11.3, as the bar's badge does) */
const stillOpen = (tripId: string) => (openTripId() || tripId) === tripId;
/** The name this phone keeps, as plain words ("Ken"), for before the sign-in has answered */
const storedName = () => { try { return localStorage.getItem("wander_user") || ""; } catch { return ""; } };
/** All four monies, in the order the trip meets them, dollars last */
const FOUR: Currency[] = ["VND", "KHR", "JPY", "USD"];
const AMOUNT_IN: Record<Currency, string> = { VND: "dong", KHR: "riel", JPY: "yen", USD: "dollars" };
/** The Log's clock in words, for the trip's own zone ("Times are Vietnam time."); any other zone says nothing */
const ZONE_WORDS: Record<string, string> = { "Asia/Ho_Chi_Minh": "Vietnam time", "Asia/Phnom_Penh": "Cambodia time", "Asia/Tokyo": "Japan time" };

/** The page's frame, as Japan's: ‹ Back, the small "Budget", the heading block, then the page */
function Frame({ head, children }: { head: React.ReactNode; children?: React.ReactNode }) {
  const navigate = useNavigate();
  const back = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/"));
  return (
    <div data-family-budget className="min-h-screen bg-[#faf8f5] pb-28">
      <header className="pb-6 bg-gradient-to-b from-[#e7efe3] to-[#faf8f5]" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}>
        <div className="max-w-xl mx-auto px-4">
          <button type="button" onClick={back} className="min-h-[44px] min-w-[44px] pr-2 text-sm text-[#514636]">‹ Back</button>
          <p className="text-[12px] uppercase tracking-[.14em] text-[#5b6b52] mt-1">Budget</p>
          {head}
        </div>
      </header>
      {children}
    </div>
  );
}

const H1 = "text-[32px] font-light text-[#2f3a2a] leading-tight mt-0.5";
const UNDER = "text-[14px] text-[#514636] mt-1";

/** A trip built from a plan whose families aren't in yet: nothing can be kept */
export function BudgetNotSetUp() {
  return (
    <Frame head={
      <div data-budget-heading>
        <h1 className={H1}>Not set up yet</h1>
        <p className={UNDER}>Budget opens once this trip's families are in.</p>
      </div>
    } />
  );
}

export default function FamilyBudget({ tripId, family }: { tripId: string; family: FamilyLedger }) {
  const me = useAuth().user?.displayName || storedName();
  // (the page's copy: a newer answer is taken only while this trip is still the open one)
  const [f, setF] = useState(family);
  useEffect(() => { if (stillOpen(tripId)) setF(family); }, [tripId, family]);
  // what was just done, said beside "+ Add entry" — and, just after a removal, "Put it back"
  const [kept, setKept] = useState<{ said: string; putBack?: string } | null>(null);
  const [backErr, setBackErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ id: string | null } | null>(null);
  // the payment whose money pop-up is open
  const [popup, setPopup] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  // the row someone else kept whose "who can change it" line is showing
  const [notYours, setNotYours] = useState<string | null>(null);
  const saidRow = useRef<HTMLDivElement>(null);
  useEffect(() => { if (kept?.putBack) saidRow.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [kept]);
  useEffect(() => {
    const late = (e: Event) => setKept({ said: `Kept after all: ${(e as CustomEvent<string>).detail}` });
    window.addEventListener(MONEY_KEPT_LATE, late);
    return () => window.removeEventListener(MONEY_KEPT_LATE, late);
  }, []);
  useEffect(() => { if (!kept) return; const t = setTimeout(() => setKept(null), kept.putBack ? 12000 : 8000); return () => clearTimeout(t); }, [kept]);
  const putBack = async (id: string, said: string) => {
    setBackErr(null);
    const err = await putBackPayment(tripId, id);
    if (!stillOpen(tripId)) return;
    if (err) { setBackErr(err); return; }
    setKept({ said });
  };

  const colorOf = (party: string) => familyColor(f.parties.indexOf(party));
  const nothing = !f.items.length;
  const nobody = f.items.filter((x) => x.forNobody);
  const popupItem = popup ? f.items.find((x) => x.id === popup) || null : null;
  // What would make the families even, one sentence for each family that would pay (to one family, or to two: "A would
  // pay B $21.36 and C $16.24.")
  const evenLines = [...new Set(f.even.map((e) => e.from))].map((from) =>
    `${from} would pay ${f.even.filter((e) => e.from === from).map((e) => `${e.to} ${usd(e.usd)}`).join(" and ")}.`);
  // Why no one is named to pay next: the first later day on which people of two families are abroad (the count only
  // grows on someone's first day abroad, so that day is always one of those), or the one family here now
  const familiesOn = (d: string) => new Set(f.people.filter((p) => p.abroadFrom.slice(0, 10) <= d && d <= p.abroadTo.slice(0, 10)).map((p) => p.party)).size;
  const together = f.here.length < 2
    ? [...new Set(f.people.map((p) => p.abroadFrom.slice(0, 10)))].filter((d) => d > f.today).sort().find((d) => familiesOn(d) >= 2) ?? null
    : null;
  const fromLine = together ? `Wander names who pays next from ${shortDay(together)}, when the families are traveling together.` : null;
  const whyNoNext = fromLine ?? (f.here.length === 1 ? `Only ${f.here[0]}'s family is on the trip now, so no one pays next.` : null);
  // Every entry by its day, newest day first; on one day, the last kept first
  const byDay = [...f.items].sort((a, b) => (b.dayDate || "").localeCompare(a.dayDate || "") || b.createdAt.localeCompare(a.createdAt));

  // Who pays next leads, and what makes the families even (Ken, Oct 16: "people do not want to be reminded how much
  // they've paid")
  const head = (
    <div data-budget-heading>
      {nothing ? (
        <>
          <h1 className={H1}>Nothing kept yet</h1>
          <p className={UNDER}>When someone pays for the group, add it here. Each cost is split per person among everyone on the trip that day. Budget counts in US dollars.</p>
          {fromLine && <p data-why-no-next className={UNDER}>{fromLine}</p>}
        </>
      ) : f.next ? (
        <>
          <p className="text-[15px] text-[#514636] mt-1">Who pays next</p>
          <h1 className="text-[32px] font-light text-[#2f3a2a] leading-tight flex items-center gap-2">
            <PayNextBadge party={f.next} color={colorOf(f.next)} />
            <span className="min-w-0">{f.next}</span>
          </h1>
          {evenLines.map((l) => <p key={l} className={UNDER}>To be even now, {l}</p>)}
        </>
      ) : f.settled ? (
        <h1 className={H1}>You're even</h1>
      ) : (
        <>
          <h1 className={H1}>To be even</h1>
          {evenLines.map((l) => <p key={l} className={UNDER}>{l}</p>)}
          {whyNoNext && <p data-why-no-next className={UNDER}>{whyNoNext}</p>}
        </>
      )}
    </div>
  );

  return (
    <Frame head={<>
      {head}
      {/* A payment nobody was on the trip for counts for the family that paid it alone: probably a wrong day */}
      {nobody.length > 0 && (
        <section data-nobody-box className="mt-3 rounded-xl border px-3 py-1.5" style={{ borderColor: CHECK_RED, background: "#fbefeb" }} aria-label="Payments no one was on the trip for">
          <ul className="divide-y divide-[#f0d8cf]">
            {nobody.map((x) => {
              const words = `${x.what || "A payment"} · ${money(x.amount, x.currency as Currency)}: no one was on the trip that day, so it counts for ${x.party} alone.`;
              return (
                <li key={x.id}>
                  {x.mayRemove
                    ? <button type="button" onClick={() => setSheet({ id: x.id })} className="w-full text-left min-h-[44px] py-1.5 text-[14px] text-[#3a3128]">{words} <span className="font-medium underline underline-offset-2" style={{ color: CHECK_RED }}>Tap to say who it was for.</span></button>
                    : <p className="py-1.5 text-[14px] text-[#3a3128]">{words}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>}>
      <main className="px-4 max-w-xl mx-auto flex flex-col gap-5">
        {/* (what was just done wraps in the room beside the button, so the list below doesn't jump as it comes and goes:
            a row reached for just then would be missed) */}
        <div ref={saidRow} className="flex items-center gap-3 scroll-mt-4">
          <button type="button" onClick={() => setSheet({ id: null })} className="shrink-0 min-h-[48px] px-6 rounded-xl bg-[#514636] text-white text-[15px] font-medium">+ Add entry</button>
          {kept && <span className={`min-w-0 flex-1 text-[13px] leading-[1.3] ${/^Removed/.test(kept.said) ? "text-[#514636]" : "text-[#4a6a3a]"}`} role="status">{/^Removed/.test(kept.said) ? "" : "✓ "}{kept.said}</span>}
          {kept?.putBack && <button type="button" onClick={() => putBack(kept.putBack!, kept.said.replace(/^Removed/, "Put back"))} className="shrink-0 min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Put it back</button>}
        </div>
        {backErr && <p className="text-sm text-[#8a3a1a] -mt-3" role="alert">{backErr}</p>}
        {nothing && <p className="text-[12px] text-[#8a7d68] -mt-2">Or tell Scout: “We paid 400,000 dong for lunch.”</p>}

        {!nothing && (
          <section aria-label="Payments kept">
            <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-2">Every entry</h2>
            <ul className="bg-white rounded-2xl border border-[#e0d8cc] divide-y divide-[#f0ebe3]">
              {byDay.map((x) => {
                const paid = money(x.amount, x.currency as Currency);
                const red = x.forNobody || !!x.notCounted;
                const allPeople = x.forNames.length === f.people.length && f.people.every((p) => x.forNames.includes(p.name));
                const whoFor = x.notCounted ? "Not counted: Wander can't tell which family paid."
                  : x.forNobody ? "No one was on the trip that day."
                  : x.everyone ? `everyone on the trip that day (${x.forNames.length})`
                  : allPeople ? `everyone on the trip (${x.forNames.length})`
                  : `for ${x.forNames.join(", ")}`;
                return (
                  <li key={x.id} data-entry-row={x.id} className="relative" style={red ? { background: "#fbefeb", boxShadow: `inset 3px 0 0 ${CHECK_RED}` } : undefined}>
                    {/* The whole row opens it to change; the amount is its own button above the row's, never inside it */}
                    {x.mayRemove ? (
                      <button type="button" onClick={() => setSheet({ id: x.id })} aria-label={`Change ${x.party}'s ${paid}${x.what ? `, ${x.what}` : ""}`}
                        className="absolute inset-0 w-full flex items-center justify-end pr-3 active:bg-[#f5f0ea]">
                        <span aria-hidden className="text-xl leading-none text-[#a89880]">›</span>
                      </button>
                    ) : (
                      // (one someone else kept: a tap says who can change it, with no "›")
                      <button type="button" onClick={() => setNotYours((o) => (o === x.id ? null : x.id))} aria-expanded={notYours === x.id}
                        aria-label={`${x.party}'s ${paid}${x.what ? `, ${x.what}` : ""}, kept by ${x.addedByName}`}
                        className="absolute inset-0 w-full active:bg-[#f5f0ea]" />
                    )}
                    <div className="relative pointer-events-none pl-4 pr-8 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-[15px] text-[#3a3128]"><PayNextBadge party={x.party} color={colorOf(x.party)} className="mr-1.5 -mt-0.5" /><span className="font-medium" style={{ color: colorOf(x.party) }}>{x.party}</span>{x.what ? ` · ${x.what}` : ""}</p>
                        <button type="button" data-entry-amount={x.id} onClick={() => setPopup(x.id)} aria-label={`${paid}, in dollars and the trip's other money`}
                          className="pointer-events-auto shrink-0 -my-[11px] min-h-[44px] min-w-[44px] text-right text-[15px] text-[#3a3128] whitespace-nowrap underline decoration-dotted underline-offset-4">{paid}</button>
                      </div>
                      <p className="text-[13px] mt-0.5 text-[#514636]">
                        {/* (its dollars, unless it was paid in dollars: the amount beside it says that already) */}
                        {x.usd !== null && x.currency !== "USD" && `${usd(x.usd)} · `}
                        <span className={red ? "font-medium" : ""} style={{ color: red ? CHECK_RED : x.everyone || allPeople ? SHARED_BLUE : undefined }}>{whoFor}</span>
                      </p>
                      <p className="text-xs text-[#6b5d4a] mt-0.5">{shortDay(x.dayDate)} · {x.paidByName ? `paid by ${x.paidByName} · ` : ""}kept by {first(x.addedByName) === first(me) ? "you" : x.addedByName}</p>
                      {/* (its receipt, for everyone to see — the Budget is shared) */}
                      {x.hasReceipt && (
                        <button type="button" onClick={() => setViewing(x.id)} className="pointer-events-auto -mb-2 min-h-[44px] text-[13px] text-[#514636] underline underline-offset-2">Receipt</button>
                      )}
                      {!x.mayRemove && notYours === x.id && (
                        <p data-not-yours className="text-[13px] text-[#6b5d4a] mt-1">{x.addedByName} kept this one. Ask {x.addedByName} if it needs changing.</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <div className="flex justify-end">
          <button type="button" onClick={() => setHistory(true)} className="min-h-[44px] min-w-[44px] px-1 text-[13px] text-[#6b5d4a] underline underline-offset-2">Log</button>
        </div>
      </main>
      {sheet && <EntrySheet key={sheet.id || "new"} tripId={tripId} f={f} item={sheet.id ? f.items.find((x) => x.id === sheet.id) || null : null}
        onClose={(said, removedId) => { setSheet(null); if (said) setKept({ said, ...(removedId ? { putBack: removedId } : {}) }); }} />}
      {popupItem && <MoneyPopup f={f} x={popupItem} onClose={() => setPopup(null)} />}
      {history && <HistorySheet tripId={tripId} zone={f.zone} zoneWords={ZONE_WORDS[f.zone]} onClose={() => setHistory(false)} />}
      {viewing && <ReceiptView tripId={tripId} id={viewing} onClose={() => setViewing(null)} />}
    </Frame>
  );
}

/** A tap on an amount: what it is in dollars at the rate it was kept with, about what in the trip's other money, and
 *  each family's part (spec §6) */
function MoneyPopup({ f, x, onClose }: { f: FamilyLedger; x: FamilyItem; onClose: () => void }) {
  const c = x.currency as Currency;
  // (the rate printed is the row's own kept rate, the way the rate line prints any rate)
  const rate = c === "USD" || !x.rate ? ""
    : x.rateDate ? ` (${rateWords(c, { ...f.rates, [c]: { rate: x.rate, asOf: x.rateDate, approx: false } })})`
    : ` (${perDollarWords(c, x.rate)}, the rate when it was kept)`;
  // its dollars in each of the trip's other monies, never back into the one it was paid in
  const others = [...new Set(f.days.map((d) => d.money).filter((m): m is Foreign => !!m && m !== c))];
  const about = x.usd === null ? [] : others.flatMap((m) => { const n = convert(x.usd!, "USD", m, f.rates); return n === null ? [] : [money(n, m)]; });
  const parts = Object.entries(x.shares).filter(([, v]) => v > 0);
  return (
    <Card label="What it comes to" onClose={onClose} mark="data-money-popup">
      <p className="text-[14px] text-[#6b5d4a]">{x.what || "A payment"} · {x.party}</p>
      <p className="text-[30px] font-light text-[#2f3a2a] leading-tight -mt-2">{money(x.amount, c)}</p>
      {x.notCounted || x.usd === null
        ? <p className="text-[14px] font-medium" style={{ color: CHECK_RED }}>Not counted: Wander can't tell which family paid.</p>
        : (
          <>
            <p className="text-[15px] text-[#3a3128]">Budget counts it as {usd(x.usd)}{rate}</p>
            {about.length > 0 && <p className="text-[14px] text-[#514636]">That's about {andJoin(about)} at a recent rate.</p>}
            {parts.length > 0 && <p className="text-[14px] text-[#514636]">Each family's part: {parts.map(([p, v]) => `${p} ${usd(v)}`).join(" · ")}</p>}
          </>
        )}
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] px-3 text-[15px] text-[#514636] underline underline-offset-2">Done</button>
      </div>
    </Card>
  );
}

/** A new entry, or one kept already: who paid, how much in which money, what for, who it's for, which day — and, for
 *  one kept already, Remove (spec §5) */
function EntrySheet({ tripId, f, item, onClose }: { tripId: string; f: FamilyLedger; item: FamilyItem | null; onClose: (said?: string, removedId?: string) => void }) {
  const [paidBy, setPaidBy] = useState<string | null>(item ? item.party : f.mine);
  const [amount, setAmount] = useState(item ? String(item.amount) : "");
  // The money: null follows the day's (a new entry until the switch is tapped); a kept entry keeps its own
  const [chosen, setChosen] = useState<Currency | null>(item ? (item.currency as Currency) : null);
  const [allMoney, setAllMoney] = useState(false);
  const [what, setWhat] = useState(item?.what || "");
  const startDay = item?.dayDate || f.today;
  const [day, setDay] = useState(startDay);
  const [dayOpen, setDayOpen] = useState(false);
  // Who it's for: null is everyone on the trip that day (the usual); else the people chosen
  const [forSome, setForSome] = useState<string[] | null>(item && !item.everyone ? item.forNames : null);
  // A photo of the receipt: Wander reads the total and what it was for; the photo goes with the payment
  const [receipt, setReceipt] = useState<{ photo: ReceiptPhoto; date: string | null } | null>(null);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const receiptInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // (a Keep with no answer for a while says so, and that waiting or Cancel are both safe, as Japan's)
  const [slow, setSlow] = useState(false);
  useEffect(() => { if (!busy) { setSlow(false); return; } const t = setTimeout(() => setSlow(true), 6000); return () => clearTimeout(t); }, [busy]);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  // (a message after Keep it: the sheet scrolls so the message and Keep it are both in view; the message sits above it)
  const keepRow = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) keepRow.current?.scrollIntoView({ block: "nearest" }); }, [error]);
  const amountRef = useRef<HTMLInputElement>(null);
  // This Keep's one-time tag, as Japan's: Keep again after no answer sends the same one, so a payment is never kept twice
  const keepKey = useRef<{ words: string; key: string } | null>(null);
  // Closed before Wander answered: this sheet never acts again
  const closed = useRef(false);
  const close = () => { closed.current = true; if (busy && keepKey.current) letGoOfKeep(keepKey.current.key); onClose(); };
  useEffect(() => { if (!item) amountRef.current?.focus(); }, [item]);
  useEffect(() => { if (paidBy) setError((e) => (e === "Which family paid?" ? null : e)); }, [paidBy]);
  // (who it's for, or the day, changed: what was said about the last Keep no longer applies)
  useEffect(() => { setError((e) => (e === "Which family paid?" || e === "How much was it?" ? e : null)); }, [forSome, day]);
  // What the last photo filled in: a new photo, or Remove, replaces it; words the person typed themselves stay
  const filled = useRef({ amount: "", what: "" });

  // The day's money, and the one the switch opens on: the day's (dollars in Cambodia, where they're used most)
  const moneyOn = (d: string) => f.days.find((x) => x.date === d)?.money ?? null;
  const openingOn = (d: string): Currency => { const m = moneyOn(d); return m && m !== "KHR" ? m : "USD"; };
  const dayMoney = moneyOn(day);
  const tripMoney = f.days.find((x) => x.money)?.money ?? null;
  // The switch: the day's money and dollars; before the trip, dollars and the trip's first money
  const pair: Currency[] = dayMoney ? (dayMoney === "KHR" ? ["USD", "KHR"] : [dayMoney, "USD"]) : tripMoney ? ["USD", tripMoney] : FOUR;
  const currency: Currency = chosen ?? openingOn(day);
  const offered = allMoney || !pair.includes(currency) ? FOUR : pair;

  // ("125.000" typed as a menu in Vietnam prints it is 125,000 dong)
  const n = typedAmount(amount, currency);
  const valid = Number.isFinite(n) && n > 0;
  // As they type: dollars, or the day's money for dollars typed, from the trip's rates (the rate shown is the rate used)
  const dollars = !valid ? null : currency === "USD" ? n : convert(n, currency, "USD", f.rates);
  const local = valid && currency === "USD" && dayMoney ? convert(n, "USD", dayMoney, f.rates) : null;
  // (another money says what was typed, with its commas, so a missing zero shows: "2,500,000 ₫ is about $96.98")
  const about = currency !== "USD" && dollars !== null ? { big: `${money(n, currency)} is about ${usd(dollars)}`, rate: rateWords(currency as Foreign, f.rates) }
    : local !== null && dayMoney ? { big: `About ${money(local, dayMoney)}`, rate: rateWords(dayMoney, f.rates) }
    : null;

  // Who's on the trip that day (both ends included, as the server counts), and who it's for
  const there = f.people.filter((p) => p.abroadFrom.slice(0, 10) <= day && day <= p.abroadTo.slice(0, 10));
  // A new entry on a day no one is travelling yet (a deposit before the trip): everyone on the trip shares it, said as
  // such and sent as the list of everyone. It follows the day: a day with people on the trip goes back to "that day"
  const noneYet = !item && forSome === null && !there.length;
  const everyoneNames = f.people.map((p) => p.name);
  const forList = forSome ?? (noneYet ? everyoneNames : there.map((p) => p.name));
  const partyOf = (name: string) => f.people.find((p) => p.name === name)?.party;
  const ownOnly = !!paidBy && forList.length > 0 && forList.every((name) => partyOf(name) === paidBy);
  // "about $… each" is the dollar figure shown above, divided (spec §11.2)
  const each = dollars !== null && forList.length ? usd(dollars / forList.length) : null;
  const split = (k: number, everyone: boolean) => (k === 1 ? `For 1 person, about ${each}.` : everyone ? `Split ${k} ways, about ${each} each.` : `For ${k} people, about ${each} each.`);
  const forLine: { words: string; red?: boolean } | null = noneYet
    ? { words: `No one is traveling yet that day, so everyone on the trip shares it.${each ? ` ${split(everyoneNames.length, false)}` : ""}` }
    : forSome === null
    ? (!there.length ? { words: "No one is on the trip that day. Change the day, or choose who it's for.", red: true }
      : ownOnly ? { words: `Only ${paidBy}'s family is on the trip that day, so this changes nothing between families.` }
      : each ? { words: split(there.length, true) } : null)
    : (ownOnly ? { words: `That's all ${paidBy}'s own, so there's nothing to share.` }
      : each && forSome.length ? { words: split(forSome.length, false) } : null);
  const sameNames = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const forChanged = !item || (forSome === null) !== item.everyone || (forSome !== null && !sameNames(forSome, item.forNames));

  const today = f.today;
  const lo = [f.days[0]?.date || today, today].sort()[0];
  const hi = [f.days[f.days.length - 1]?.date || today, today].sort()[1];

  const fromReceipt = async (file: File) => {
    setReading(true); setReadNote(null); setError(null);
    const r = await readReceiptPhoto<Currency | null>(tripId, file);
    if (closed.current || !stillOpen(tripId)) return;
    setReading(false);
    if (!r.photo) { setError(r.error || "That picture couldn't be read on this phone."); return; }
    setReceipt({ photo: r.photo, date: r.read?.date || null });
    // (the receipt's own day replaces the day, as Japan's)
    const readDay = r.read?.date && /^\d{4}-\d{2}-\d{2}$/.test(r.read.date) ? r.read.date : day;
    setDay(readDay);
    const prev = filled.current;
    const amountTheirs = !!amount.trim() && amount !== prev.amount;
    const whatTheirs = !!what.trim() && what !== prev.what;
    const amt = r.read?.amount ? String(r.read.amount) : "";
    // (the receipt's own money when the reader could tell it; when it couldn't, the money already chosen stays, else the
    // day's, and the note says to check it: never a silent guess)
    const told = r.read?.currency && FOUR.includes(r.read.currency) ? r.read.currency : null;
    const c: Currency = told ?? chosen ?? openingOn(readDay);
    if (amt) { setAmount(amt); setChosen(c); } else if (!amountTheirs) setAmount("");
    const said = r.read?.what || "";
    if (!whatTheirs) setWhat(said);
    filled.current = { amount: amt || (amountTheirs ? prev.amount : ""), what: whatTheirs ? prev.what : said };
    // (who paid is asked, not assumed, once there's a photo)
    setPaidBy(null);
    setReadNote(amt
      ? told ? `From the receipt: ${money(r.read!.amount!, c)}${said ? `, ${said}` : ""}. Check it, then tap who paid.`
        : `From the receipt: ${money(r.read!.amount!, c)}${said ? `, ${said}` : ""}. It doesn't say which money, so check that too, then tap who paid.`
      : "Wander couldn't find a total on it. If it's a receipt, type the amount; the photo is kept with it.");
  };
  const dropReceipt = () => {
    const prev = filled.current;
    if (amount === prev.amount) setAmount("");
    if (what === prev.what) setWhat("");
    filled.current = { amount: "", what: "" };
    setReceipt(null); setReadNote(null);
    if (!paidBy) setPaidBy(f.mine);
  };

  const save = async () => {
    if (!paidBy) { setError("Which family paid?"); return; }
    if (!valid) { setError("How much was it?"); return; }
    if (forChanged && !forList.length) { setError("Who is it for?"); return; }
    // (people chosen who are all the paying family's own: the server would refuse it, so the phone says so at once, in
    // the server's words, and sends nothing)
    if (forSome !== null && ownOnly && (!item || forChanged || paidBy !== item.party)) { setError(`That's all ${paidBy}'s own, so there's nothing to share. Who else was it for?`); return; }
    let err: string | null;
    let again = false;
    if (!item) {
      setBusy(true); setError(null);
      // (no list: everyone on the trip that day; before anyone is travelling, the list of everyone on the trip)
      const forPeople = forSome ?? (noneYet ? everyoneNames : null);
      const words = JSON.stringify([paidBy, n, currency, what.trim(), day, forPeople && [...forPeople].sort()]);
      if (keepKey.current?.words !== words) keepKey.current = { words, key: keepKeyFor(tripId, words) };
      ({ err, again } = await addPayment(tripId, { paidBy, amount: n, currency, what: what.trim() || undefined, dayDate: day, ...(forPeople ? { forPeople } : {}),
        clientKey: keepKey.current.key, ...(receipt ? { receipt: receipt.photo } : {}) }, words));
    } else {
      // Only what changed; a changed money always goes with its amount
      const body: Parameters<typeof changePayment>[2] = {};
      if (paidBy !== item.party) body.paidBy = paidBy;
      if (n !== item.amount || currency !== item.currency) { body.amount = n; if (currency !== item.currency) body.currency = currency; }
      if (what.trim() !== (item.what || "")) body.what = what.trim();
      if (forChanged) body.forPeople = forSome; // (null: back to everyone on the trip that day)
      if (day !== startDay) body.dayDate = day;
      if (!Object.keys(body).length) { onClose(); return; }
      setBusy(true); setError(null);
      err = await changePayment(tripId, item.id, body);
    }
    if (closed.current || !stillOpen(tripId)) return;
    setBusy(false);
    if (err) { setError(err); return; }
    const forWords = what.trim() ? `, ${what.trim()}` : "";
    onClose(item ? `Changed: ${paidBy}, ${money(n, currency)}${forWords}` : `${again ? "Already kept" : "Kept"}: ${paidBy}, ${money(n, currency)}${forWords}`);
  };
  const remove = async () => {
    if (!item) return;
    setBusy(true);
    const err = await removePayment(tripId, item.id);
    if (closed.current || !stillOpen(tripId)) return;
    setBusy(false);
    if (err) { setError(err); setRemoving(false); return; }
    onClose(`Removed: ${item.party}, ${money(item.amount, item.currency as Currency)}${item.what ? `, ${item.what}` : ""}`, item.id);
  };

  const link = "min-h-[44px] text-[13px] text-[#6b5d4a] underline underline-offset-2";
  return (
    <Card label={item ? "Change entry" : "Add entry"} onClose={close} mark="data-entry-sheet">
      {/* (the receipt's photo on the heading's line, as Japan's) */}
      <div className="flex items-center gap-2 -my-1">
        <h2 className="flex-1 text-[17px] font-medium text-[#3a3128]">{item ? "Change entry" : "Add entry"}</h2>
        {!item && (
          <button type="button" onClick={() => receiptInput.current?.click()} disabled={reading}
            className="min-h-[44px] px-3 rounded-xl border border-dashed border-[#c8b89c] bg-white text-[14px] text-[#514636] disabled:opacity-60">
            {reading ? "Reading the receipt…" : receipt ? "📷 Take another photo" : "📷 Photo of the receipt"}
          </button>
        )}
        {!item && <input ref={receiptInput} type="file" accept="image/*" className="hidden" aria-hidden tabIndex={-1}
          onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void fromReceipt(file); }} />}
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
      {item && (
        <div className="flex flex-wrap items-center gap-x-5 -my-1">
          {item.hasReceipt && (
            <button type="button" onClick={() => setShowReceipt(true)} className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">See the receipt</button>
          )}
          <button type="button" disabled={reading} onClick={() => receiptInput.current?.click()} className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2 disabled:opacity-60">
            {reading ? "Keeping the receipt…" : item.hasReceipt ? "📷 Replace the receipt's photo" : "📷 Add the receipt's photo"}
          </button>
        </div>
      )}
      {item && <input ref={receiptInput} type="file" accept="image/*" className="hidden" aria-hidden tabIndex={-1}
        onChange={async (e) => {
          const file = e.target.files?.[0]; e.target.value = "";
          if (!file) return;
          setReading(true); setError(null);
          const err = await attachReceiptPhoto(tripId, item.id, file);
          if (closed.current || !stillOpen(tripId)) return;
          setReading(false);
          if (err) { setError(err); return; }
          onClose(`${item.hasReceipt ? "Receipt replaced" : "Receipt kept with it"}: ${item.party}, ${money(item.amount, item.currency as Currency)}${item.what ? `, ${item.what}` : ""}`);
        }} />}
      {showReceipt && item && <ReceiptView tripId={tripId} id={item.id} onClose={() => setShowReceipt(false)} />}

      {/* Who paid: the families side by side, each in its colour (a long name wraps, never cut) */}
      <p className="text-[13px] text-[#6b5d4a] -mb-2">Who paid</p>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(f.parties.length, 3)}, minmax(0, 1fr))` }} role="group" aria-label="Who paid">
        {f.parties.map((p, i) => {
          const c = familyColor(i);
          return (
            <button key={p} type="button" data-family-pay={i} onClick={() => setPaidBy(p)} aria-pressed={paidBy === p}
              className="min-h-[48px] px-1.5 py-1 rounded-xl border-2 text-[15px] leading-tight [overflow-wrap:anywhere]"
              style={paidBy === p ? { background: c, borderColor: c, color: "#fff" } : { background: "#fff", borderColor: "#e0d8cc", color: c }}>{p}</button>
          );
        })}
      </div>

      {/* How much: the day's money and dollars, or all four */}
      <div>
        <div className="flex gap-2">
          <div className="flex rounded-xl border border-[#e0d8cc] overflow-hidden shrink-0" role="group" aria-label="Which money">
            {offered.map((c) => (
              <button key={c} type="button" data-money-switch={c} onClick={() => setChosen(c)} aria-pressed={currency === c} aria-label={MONEY_NAMES[c]}
                className={`min-w-[48px] min-h-[48px] ${c === "KHR" ? "text-[22px]" : "text-[17px]"} ${currency === c ? "bg-[#3a3128] text-white" : "bg-white text-[#514636]"}`}>{MONEY_SIGNS[c]}</button>
            ))}
          </div>
          <input ref={amountRef} data-amount value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" enterKeyHint="done"
            placeholder={offered.length === FOUR.length ? "Amount" : `Amount in ${AMOUNT_IN[currency]}`} aria-label="Amount"
            className="flex-1 min-w-0 min-h-[48px] rounded-xl border border-[#e0d8cc] px-3 text-[17px] text-[#3a3128] focus:outline-none focus:border-[#a89880]" />
        </div>
        {offered.length < FOUR.length && <button type="button" data-another-money onClick={() => setAllMoney(true)} className={link}>Paid in {FOUR.filter((c) => !offered.includes(c)).map((c) => AMOUNT_IN[c]).join(" or ")}?</button>}
        {about && (
          <p data-about className="mt-1 text-[15px] text-[#3a3128]">{about.big}<span className="block text-[12px] text-[#6b5d4a]">{about.rate}</span></p>
        )}
      </div>

      <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What for (if you like)" aria-label="What for"
        className="min-h-[48px] rounded-xl border border-[#e0d8cc] px-3 text-[16px] text-[#3a3128] focus:outline-none focus:border-[#a89880]" />

      {/* Who it's for: everyone on the trip that day, in blue, unless someone means otherwise */}
      <div role="group" aria-label="Who it's for">
        {forSome === null ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span data-for-everyone className="min-h-[44px] px-3 rounded-full text-[14px] text-white inline-flex items-center" style={{ background: SHARED_BLUE }}>
              {noneYet ? `✓ Everyone on the trip (${everyoneNames.length})` : `✓ Everyone on the trip that day (${there.length})`}
            </span>
            <button type="button" data-not-everyone onClick={() => setForSome(noneYet ? everyoneNames : there.map((p) => p.name))} className={link}>Not everyone?</button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <button type="button" onClick={() => setForSome(null)} aria-pressed={false}
              className="self-start min-h-[44px] px-3 rounded-full border-2 text-[14px] bg-white" style={{ borderColor: SHARED_BLUE, color: SHARED_BLUE }}>Everyone on the trip that day</button>
            {f.parties.map((p, i) => {
              const c = familyColor(i);
              const names = f.people.filter((x) => x.party === p).map((x) => x.name);
              const allOn = names.every((name) => forSome.includes(name));
              return (
                <div key={p} className="flex flex-wrap items-center gap-1.5">
                  {/* (the family's name turns its whole family on or off) */}
                  <button type="button" data-family-toggle={i} aria-pressed={allOn}
                    onClick={() => setForSome(allOn ? forSome.filter((name) => !names.includes(name)) : [...forSome, ...names.filter((name) => !forSome.includes(name))])}
                    className="min-h-[44px] min-w-[44px] pr-1 text-left text-[13px] font-semibold underline underline-offset-2" style={{ color: c }}>{p}</button>
                  {names.map((name) => {
                    const on = forSome.includes(name);
                    return (
                      <button key={name} type="button" data-person={name} aria-pressed={on} onClick={() => setForSome(on ? forSome.filter((x) => x !== name) : [...forSome, name])}
                        className="min-h-[44px] min-w-[44px] px-3 rounded-full border-2 text-[14px]"
                        style={on ? { background: c, borderColor: c, color: "#fff" } : { background: "#fff", borderColor: "#e0d8cc", color: c }}>{name.trim().split(/\s+/)[0]}</button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
        {/* (said once: while the red message above Keep it says the same, this line waits) */}
        {forLine && !error?.startsWith(forLine.words) && <p data-for-line className={`text-[13px] mt-1.5 ${forLine.red ? "font-medium" : "text-[#514636]"}`} style={forLine.red ? { color: CHECK_RED } : undefined}>{forLine.words}</p>}
        {forSome === null && !there.length && !noneYet && (
          <div className="flex flex-wrap gap-x-4">
            <button type="button" data-everyone-on-trip onClick={() => setForSome(f.people.map((p) => p.name))} className={link}>Everyone on the trip ({f.people.length})</button>
            <button type="button" onClick={() => setForSome([])} className={link}>Choose people</button>
          </div>
        )}
      </div>

      {/* The day: today's, or the receipt's, unless changed */}
      <div className="flex flex-wrap items-center gap-x-3">
        <p data-day-line className="text-[14px] text-[#3a3128]">Day: {day === today ? `Today, ${shortDay(day).replace(",", "")}` : shortDay(day)}</p>
        {dayOpen
          ? <input type="date" data-day-input value={day} min={lo} max={hi} aria-label="Which day"
              onChange={(e) => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setDay(e.target.value); }}
              className="min-h-[44px] rounded-xl border border-[#e0d8cc] bg-white px-2 text-[16px] text-[#3a3128]" />
          : <button type="button" data-day-change onClick={() => setDayOpen(true)} className="min-h-[44px] min-w-[44px] text-[14px] text-[#514636] underline underline-offset-2">Change</button>}
      </div>

      <div ref={keepRow} className="flex flex-col gap-3">
        {error && <p className="text-sm text-[#8a3a1a]" role="alert">{error}</p>}
        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={busy} className="min-h-[48px] px-6 rounded-xl bg-[#514636] text-white text-[15px] font-medium disabled:opacity-50">{busy ? (item ? "Saving…" : "Keeping…") : item ? "Save" : "Keep it"}</button>
          <button type="button" onClick={close} className="min-h-[48px] px-2 text-[15px] text-[#514636] underline underline-offset-2">Cancel</button>
        </div>
      </div>
      {slow && !item && <p className="text-sm text-[#514636]" role="status">Still waiting for Wander to answer. You can keep waiting, or Cancel: if it got through, it shows in the list, and typing it again won't keep it twice.</p>}
      {item && (removing ? (
        <div className="flex items-center gap-3 border-t border-[#ece5da] pt-2">
          <span className="text-sm text-[#3a3128]">Remove it for everyone?</span>
          <button type="button" onClick={remove} disabled={busy} className="min-h-[44px] text-sm text-[#8a3a1a] underline">Remove it</button>
          <button type="button" onClick={() => setRemoving(false)} className="min-h-[44px] text-sm text-[#514636] underline">Leave it</button>
        </div>
      ) : <button type="button" onClick={() => setRemoving(true)} className="self-start min-h-[44px] text-sm text-[#8a3a1a] underline underline-offset-2 border-t border-[#ece5da] pt-2">Remove this entry</button>)}
    </Card>
  );
}
