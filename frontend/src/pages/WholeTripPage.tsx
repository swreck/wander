/**
 * The whole trip on one page (round 16, Oct 2 2026). The reviewer's "sheet wins" list: the whole trip at a glance before
 * leaving, every place you sleep with its cancel-by date, every meal booked on one list, flights and trains together,
 * and every date to keep in mind (Wander showed one day at a time and deadlines only two weeks ahead). Read from her
 * Guide and Ken's rail sheet, in her words; nothing worked out beyond counting nights. Every row opens its day.
 * On a laptop the days are a table; on a phone, a list.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Trip } from "../lib/types";
import { guideData, type TripGuideData } from "../lib/guideData";
import { sourcesData, isBookedTrain, colOf, twelveHour, type OtherSource } from "../lib/sources";
import { useAuth } from "../contexts/AuthContext";
import { ymd, clock, isLanding, isFor, startsSomething, voiceFor, besideHotel, tabsDiffer, isFreeCancel, FREE_CANCEL_WORDS, confirmationWords, differWordsFor, distinctWords } from "../lib/guideDisplay";

const dayWords = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const nightsBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
// (your own lines said as yours, as Home and Actions say them — Oct 10 re-audit: Julie's and Andy's own flight and deadline
// read "For Julie & Andy" here)
const forWords = (f: string | null | undefined, me?: string | null) =>
  (f && !/^everyone$/i.test(f) ? (me && isFor({ forWhom: f }, me) ? `Yours (${f})` : `For ${f}`) : "");

export default function WholeTripPage() {
  const navigate = useNavigate();
  const me = useAuth().user?.displayName || null;
  const v = voiceFor(me);
  const [data, setData] = useState<TripGuideData | null>(null);
  const [rail, setRail] = useState<OtherSource[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "unreachable">("loading");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        let id = localStorage.getItem("wander:last-trip-id");
        if (!id) id = (await api.get<Trip | null>("/trips/active"))?.id || null;
        if (!id) throw new Error("no trip");
        const d = await guideData(id);
        if (!live) return;
        setData(d);
        setState("ready");
        sourcesData(id).then((s) => { if (live) setRail(s.sources); }).catch(() => { /* the Guide still shows */ });
      } catch { if (live) setState("unreachable"); }
    })();
    return () => { live = false; };
  }, []);

  const days = useMemo(() => (data?.days || []).map((d) => ({ date: ymd(d.date), city: d.city?.name || "", guided: d.dayType === "guided" })).sort((a, b) => a.date.localeCompare(b.date)), [data]);
  const items = data?.items || [];
  const stays = useMemo(() => (data?.stays || []).filter((s) => s.checkInDate && s.checkOutDate).sort((a, b) => ymd(a.checkInDate).localeCompare(ymd(b.checkInDate))), [data]);
  const sleepOn = (d: string) => stays.filter((s) => ymd(s.checkInDate) <= d && d < ymd(s.checkOutDate));
  // Her Itinerary's own line for the day, in her words (as Home quotes it)
  const herLine = (d: string) => items.find((i) => ymd(i.date) === d && !i.time && /^itinerary/i.test(i.source) && ["plan", "tour", "note", "stop", "meal"].includes(i.kind)
    && !besideHotel(i) && !/\binterested\?/i.test(i.title) && !/^see above\b/i.test(i.title))?.title || "";
  // Meals from her Dining Resos tab — her bookings
  const meals = items.filter((i) => i.kind === "meal" && /^Dining Resos/i.test(i.source)).sort((a, b) => ymd(a.date).localeCompare(ymd(b.date)) || (a.time || "99").localeCompare(b.time || "99"));
  const mealsOn = (d: string) => meals.filter((m) => ymd(m.date) === d);
  const flights = items.filter((i) => i.kind === "flight" && !isLanding(i)).sort((a, b) => ymd(a.date).localeCompare(ymd(b.date)));
  const trains = rail.flatMap((s) => s.rail.filter((r) => r.date && isBookedTrain(r)).map((r) => ({ s, r }))).sort((a, b) => a.r.date!.localeCompare(b.r.date!) || colOf(a.r.cols, /^depart/).padStart(5, "0").localeCompare(colOf(b.r.cols, /^depart/).padStart(5, "0")));
  const deadlines = items.filter((i) => i.kind === "deadline").sort((a, b) => ymd(a.date).localeCompare(ymd(b.date)));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: data?.trip.timeZone || "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  // A stay's cancel-by lines: her deadlines that name it ("Free cancellation ends · Imperial Hotel")
  // (by the words that name the hotel — never "Hotel" or the city: Sweep C, Oct 10: "Hotel Granvia Okayama" matched on
  // "hotel" and took the Imperial Hotel's confirmation and its cancel-by dates)
  const cityWords = new Set((data?.trip.cities || []).flatMap((c) => distinctWords(c.name)));
  const nameWords = (s: string) => distinctWords(s).filter((w) => !/^(hotel|hotels|ryokan|resort|free|cancellation|ends|check|checkin)$/.test(w) && !cityWords.has(w));
  const namesStay = (text: string, name: string) => { const have = new Set(nameWords(text)); return nameWords(name).some((w) => have.has(w)); };
  const cancelBy = (name: string) => deadlines.filter((d) => isFreeCancel(d) && namesStay(d.title, name));
  const checkinOf = (name: string) => items.find((i) => i.kind === "checkin" && i.confirmation && namesStay(i.title, name));

  const section = "mt-7";
  const h2 = "text-xs uppercase tracking-wide text-[#6b5d4a] mb-2";
  const row = "w-full text-left bg-white rounded-xl border border-[#e0d8cc] px-3 py-2.5 min-h-[44px]";

  return (
    <div className="min-h-[100dvh] bg-[#faf8f5] pb-28">
      <header className="sticky top-0 z-10 bg-[#faf8f5]/95 backdrop-blur border-b border-[#e0d8cc] px-4 top-bar pb-2 flex items-center">
        <button onClick={() => navigate("/")} className="min-h-[44px] min-w-[44px] text-sm text-[#514636]">‹ Home</button>
        <h1 className="flex-1 text-center text-base font-medium text-[#3a3128] pr-[44px]">The whole trip</h1>
      </header>
      <main className="px-4 pt-4 max-w-5xl mx-auto">
        {state === "loading" && <p className="text-sm text-[#6b5d4a] text-center mt-10">Laying out the trip…</p>}
        {state === "unreachable" && <p className="text-sm text-[#6b5d4a] text-center mt-10">Wander can't reach the trip right now, and this phone hasn't saved it yet.</p>}
        {state === "ready" && data && (
          <>
            <p className="text-[13px] text-[#6b5d4a]">Everything from {v.guide}{rail.length ? " and Ken's rail sheet" : ""}, on one page. Tap a row for its day.</p>

            {/* ── Day by day ── */}
            <section className={section} aria-labelledby="wt-days">
              <h2 id="wt-days" className={h2}>Day by day</h2>
              {/* a laptop: one table */}
              <table className="hidden md:table w-full text-sm border-separate border-spacing-0 bg-white rounded-xl border border-[#e0d8cc] overflow-hidden">
                <thead><tr className="text-left text-xs text-[#6b5d4a]">
                  <th className="px-3 py-2 font-normal">Day</th><th className="px-3 py-2 font-normal">Where</th><th className="px-3 py-2 font-normal">{v.Owners} line for the day</th>
                  <th className="px-3 py-2 font-normal">Sleeping at</th><th className="px-3 py-2 font-normal">Meals booked</th>
                </tr></thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.date} onClick={() => navigate(`/day/${d.date}`)} className={`cursor-pointer hover:bg-[#f6f2ec] ${d.date === today ? "bg-[#fff8ec]" : ""}`}>
                      <td className="px-3 py-2 border-t border-[#f0ebe3] whitespace-nowrap text-[#3a3128]"><a href={`/day/${d.date}`} onClick={(e) => e.preventDefault()} className="underline-offset-2 hover:underline">{dayWords(d.date)}</a></td>
                      <td className="px-3 py-2 border-t border-[#f0ebe3] text-[#3a3128]">{d.city}{d.guided ? <span className="ml-1 text-[11px] text-white bg-[#b3322a] rounded px-1">Backroads</span> : null}</td>
                      <td className="px-3 py-2 border-t border-[#f0ebe3] text-[#514636]">{herLine(d.date)}</td>
                      <td className="px-3 py-2 border-t border-[#f0ebe3] text-[#514636]">{sleepOn(d.date).map((s) => `${s.name}${forWords(s.forWhom) ? ` (${s.forWhom})` : ""}`).join("; ")}</td>
                      <td className="px-3 py-2 border-t border-[#f0ebe3] text-[#514636]">{mealsOn(d.date).map((m) => `${m.time ? `${clock(m.time)} ` : ""}${m.title}`).join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* a phone: one line each */}
              <ul className="md:hidden space-y-1.5">
                {days.map((d) => (
                  <li key={d.date}>
                    <button onClick={() => navigate(`/day/${d.date}`)} className={`${row} ${d.date === today ? "border-[#c8a060]" : ""}`}>
                      <span className="block text-sm text-[#3a3128]">
                        <span className="font-medium">{dayWords(d.date)}</span> · {d.city}{d.guided ? " · with Backroads" : ""}
                      </span>
                      {herLine(d.date) && <span className="block text-[13px] text-[#514636] mt-0.5">“{herLine(d.date)}”</span>}
                      {(sleepOn(d.date).length > 0 || mealsOn(d.date).length > 0) && (
                        <span className="block text-xs text-[#6b5d4a] mt-0.5">
                          {sleepOn(d.date).length > 0 && `Sleep: ${sleepOn(d.date).map((s) => s.name).join(" / ")}`}
                          {sleepOn(d.date).length > 0 && mealsOn(d.date).length > 0 && " · "}
                          {mealsOn(d.date).length > 0 && `Booked: ${mealsOn(d.date).map((m) => `${m.time ? `${clock(m.time)} ` : ""}${m.title}`).join(", ")}`}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {/* ── Where you sleep ── */}
            <section className={section} aria-labelledby="wt-stays">
              <h2 id="wt-stays" className={h2}>Where you sleep</h2>
              <ul className="grid md:grid-cols-2 gap-2">
                {stays.map((s) => {
                  const inD = ymd(s.checkInDate), outD = ymd(s.checkOutDate);
                  const n = nightsBetween(inD, outD);
                  const conf = s.confirmationNumber || checkinOf(s.name)?.confirmation || null;
                  return (
                    <li key={s.id}>
                      <button onClick={() => navigate(`/day/${inD}`)} className={row}>
                        <span className="block text-sm text-[#3a3128] font-medium">{s.name}</span>
                        <span className="block text-[13px] text-[#514636]">{shortDate(inD)} → {shortDate(outD)} · {n} night{n === 1 ? "" : "s"}{forWords(s.forWhom) ? ` · ${forWords(s.forWhom, me)}` : ""}</span>
                        {(s.checkInTime || s.checkOutTime) && <span className="block text-xs text-[#6b5d4a]">{[s.checkInTime && `Check-in ${clock(s.checkInTime)}`, s.checkOutTime && `check-out ${clock(s.checkOutTime)}`].filter(Boolean).join(" · ")}</span>}
                        {conf && <span className="block text-xs text-[#6b5d4a] [overflow-wrap:anywhere]">Confirmation {confirmationWords(conf)}</span>}
                        {cancelBy(s.name).map((c) => (
                          <span key={c.id} className={`block text-xs mt-0.5 ${ymd(c.date) < today ? "text-[#6b5d4a]" : "text-[#8a5a1a]"}`}>
                            Free to cancel until {dayWords(ymd(c.date))}{forWords(c.forWhom) ? ` (${c.forWhom})` : ""}{ymd(c.date) < today ? " — that's passed" : ""}
                          </span>
                        ))}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* ── Meals booked ── */}
            <section className={section} aria-labelledby="wt-meals">
              <h2 id="wt-meals" className={h2}>Meals in {v.her} Dining Resos tab</h2>
              <ul className="grid md:grid-cols-2 gap-2">
                {meals.map((m) => (
                  <li key={m.id}>
                    <button onClick={() => navigate(`/day/${ymd(m.date)}#item-${m.id}`)} className={row}>
                      <span className="block text-sm text-[#3a3128]"><span className="font-medium">{dayWords(ymd(m.date))}{m.time ? ` · ${clock(m.time)}` : ""}</span> · {m.title}</span>
                      {forWords(m.forWhom) && <span className="block text-xs text-[#514636]">{forWords(m.forWhom, me)}</span>}
                      {!m.time && <span className="block text-xs text-[#6b5d4a]">No time in {v.guide}</span>}
                      {m.confirmation && <span className="block text-xs text-[#6b5d4a] [overflow-wrap:anywhere]">Confirmation {confirmationWords(m.confirmation)}</span>}
                      {tabsDiffer(m).map((d) => <span key={d} className="block text-xs text-[#8a5a1a] mt-0.5">{differWordsFor(d, v)}</span>)}
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {/* ── Flights and trains ── */}
            <section className={section} aria-labelledby="wt-travel">
              <h2 id="wt-travel" className={h2}>Flights and booked trains</h2>
              <ul className="grid md:grid-cols-2 gap-2">
                {[...flights.map((f) => ({ key: f.id, date: ymd(f.date), time: f.time || "", el: (
                    <>
                      <span className="block text-sm text-[#3a3128]"><span className="font-medium">{dayWords(ymd(f.date))}{f.time ? ` · ${clock(f.time)}` : ""}</span> · {f.title}</span>
                      {forWords(f.forWhom) && <span className="block text-xs text-[#514636]">{forWords(f.forWhom, me)}</span>}
                      {(f.detail || "").match(/^Lands at [^\n]+/m)?.[0] && <span className="block text-xs text-[#6b5d4a]">{(f.detail || "").match(/^Lands at [^\n]+/m)![0]}</span>}
                    </>) })),
                  ...trains.map(({ s, r }) => ({ key: `${s.id}-${r.row}`, date: r.date!, time: colOf(r.cols, /^depart/).padStart(5, "0"), el: (
                    <>
                      <span className="block text-sm text-[#3a3128]"><span className="font-medium">{dayWords(r.date!)} · {twelveHour(colOf(r.cols, /^depart/))}</span> · {colOf(r.cols, /^train$/)} · {colOf(r.cols, /^route$/)}</span>
                      <span className="block text-xs text-[#6b5d4a]">{[colOf(r.cols, /^arrive/) && `arrives ${twelveHour(colOf(r.cols, /^arrive/))}`, colOf(r.cols, /^car/)].filter(Boolean).join(" · ")} · from Ken's rail sheet</span>
                    </>) }))]
                  .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
                  .map((x) => <li key={x.key}><button onClick={() => navigate(`/day/${x.date}`)} className={row}>{x.el}</button></li>)}
              </ul>
            </section>

            {/* ── Dates to keep in mind ── */}
            <section className={section} aria-labelledby="wt-dates">
              <h2 id="wt-dates" className={h2}>Dates to keep in mind</h2>
              <ul className="space-y-1.5">
                {deadlines.map((d) => {
                  const past = ymd(d.date) < today;
                  return (
                    <li key={d.id}>
                      <button onClick={() => navigate(`/day/${ymd(d.date)}#item-${d.id}`)} className={row}>
                        <span className={`block text-sm ${past ? "text-[#6b5d4a]" : "text-[#3a3128]"}`}><span className="font-medium">{dayWords(ymd(d.date))}</span> · {d.title}</span>
                        {forWords(d.forWhom) && <span className="block text-xs text-[#514636]">{forWords(d.forWhom, me)}</span>}
                        <span className="block text-xs text-[#6b5d4a]">{past ? (isFreeCancel(d) ? "That's passed — nothing to do; it stays booked." : startsSomething(d) ? "These charges apply now — nothing to do; it stays booked." : "That date has passed.") : isFreeCancel(d) ? FREE_CANCEL_WORDS : ""}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
