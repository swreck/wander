/**
 * The day's weather, one quiet line in the city band: the real forecast for where you are that day (lib/forecast.ts —
 * Ken, Oct 10: "It should be your best internet forecast available at run time"), with when it was fetched. Her sheet's
 * pre-trip line is said only when there's no live forecast (more than 16 days ahead, or never fetched with no signal),
 * and labelled as hers, written before the trip.
 *
 * Drawn from this phone's copy at once; the line keeps its height while a first fetch is out, so nothing moves.
 */
import { useEffect, useState } from "react";
import { forecastFor, savedForecast, dayForecastFor, savedDayForecast, rainDisputed, rainLikely, clearSky, type DayForecast as F } from "../lib/forecast";

/** "the Ritz-Carlton, Nikko", "the Imperial Hotel" — and "Shirakabeso", "Shiraume" as they are */
const theHotel = (s: string) => (/^the /i.test(s) || !/hotel|ritz|four seasons|six senses|marriott|hyatt|hilton|westin|peninsula|mandarin|conrad|andaz|intercontinental|\baman\b/i.test(s) ? s : `the ${s}`);

export default function DayForecast({ tripId, lat, lon, date, zone, place, herLine, her }: {
  /** with the trip: the forecast where this person sleeps that night, from Wander's server (lib/forecast dayForecastFor) */
  tripId?: string | null;
  lat: number | null | undefined; lon: number | null | undefined; date: string; zone: string; place: string;
  /** her sheet's line for the stay ("Larisa's forecast: lows 57-63, highs 72-76, rain 0-.1 in"), if any */
  herLine: string | null; her: string;
}) {
  // (a day that's over has no forecast — Oct 7, viewed Oct 11, said "Forecast for Okayama"; verify8)
  const past = date < new Date().toLocaleDateString("en-CA", { timeZone: zone });
  // (first drawn from this phone's copy — the hotel's, else the town's from before, so the line is there at once)
  const savedNow = () => (tripId && savedDayForecast(tripId, date)) || savedForecast(lat, lon, date);
  const [f, setF] = useState<F | null>(() => (past ? null : savedNow()));
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (past) return;
    let live = true;
    setF(savedNow());
    // (the hotel's forecast from Wander; if Wander can't give one, the town's straight from Open-Meteo as before)
    (tripId ? dayForecastFor(tripId, date).then((x) => x || forecastFor(lat, lon, date, zone)) : forecastFor(lat, lon, date, zone))
      .then((x) => { if (live) { if (x) setF(x); setTried(true); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, lat, lon, date, zone, past]);

  // (when it was fetched — with its day when that wasn't today, so a copy kept from yesterday never reads as this
  // morning's; best-information audit, Oct 10). On a phone that isn't on the trip's clock (Julie and Andy at home), on
  // the phone's own clock and said so — "12:45 PM" was Japan's, unlabelled (verify8, Oct 11)
  const phoneZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const otherClock = !!phoneZone && phoneZone !== zone;
  const shownZone = otherClock ? phoneZone : zone;
  const dayOf = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: shownZone });
  const fetched = f ? `${new Date(f.at).toLocaleString("en-US", { timeZone: shownZone, hour: "numeric", minute: "2-digit",
    ...(dayOf(new Date(f.at)) !== dayOf(new Date()) ? { weekday: "short" } : {}) })}${otherClock ? " your time" : ""}` : "";

  if (past) return null;
  const icon = (kind: "rain" | "sun" | "part") => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px" aria-hidden>
      {kind === "rain" ? (
        <>
          <path d="M7 15a4 4 0 0 1 .4-8A5 5 0 0 1 17 8a3.5 3.5 0 0 1 0 7H7z" stroke="#7a8aa0" fill="#e8eef5" />
          <path d="M9 18l-1 2M13 18l-1 2M17 18l-1 2" stroke="#7a8aa0" />
        </>
      ) : kind === "sun" ? (
        <>
          <circle cx="12" cy="12" r="4.5" stroke="#c9a14a" fill="#f6e7bf" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" stroke="#c9a14a" />
        </>
      ) : (
        <>
          <circle cx="9" cy="9" r="3.5" stroke="#c9a14a" fill="#f6e7bf" />
          <path d="M9 2.5v1.5M9 14v1.5M2.5 9H4M14 9h1.5M4.4 4.4l1 1M12.6 12.6l1 1M4.4 13.6l1-1M12.6 5.4l1-1" stroke="#c9a14a" />
          <path d="M11 19a3.5 3.5 0 0 1 .3-7 4.5 4.5 0 0 1 8.4 1.6A3 3 0 0 1 19.5 19H11z" stroke="#9aa3ad" fill="#f4f6f8" />
        </>
      )}
    </svg>
  );

  if (f) {
    // (where: that night's hotel when Wander knows it, else the town; how sure: past a week it's an early outlook, and a
    // rain chance the other forecasts don't share is said so — Ken's weather plan, Oct 13)
    const disputed = rainDisputed(f);
    const lead = f.outlook === "early outlook" ? "Early outlook" : "Forecast";
    const where = f.place ? (f.atHotel ? `at ${theHotel(f.place)}` : `for ${f.place}`) : `for ${place}`;
    return (
      <p className="flex items-start gap-1.5 text-sm text-[#514636] mt-1 min-h-[20px]">
        {icon(disputed ? "part" : rainLikely(f) ? "rain" : clearSky(f) ? "sun" : "part")}
        <span>
          {lead} {where}: {f.lo}‑{f.hi}°F{f.rain !== null ? `, ${f.rain}% chance of rain` : ""}{disputed === "drier" ? ", though other forecasts show little rain" : disputed === "split" ? ", but the forecasts disagree" : ""}
          <span className="text-xs text-[#6b5d4a]"> · Open-Meteo, {fetched}</span>
        </span>
      </p>
    );
  }
  // (no live forecast: her pre-trip line, said as hers — or the line's place kept while a first fetch is out)
  if (herLine) {
    const t = herLine;
    const dry = /\brain\s*0(\.0+)?\s*(in|mm)?\s*(,|$)/i.test(t);
    const rainy = /\brain\b/i.test(t) && !dry;
    return (
      <p className="flex items-start gap-1.5 text-sm text-[#514636] mt-1 min-h-[20px]">
        {icon(rainy ? "rain" : dry ? "sun" : "part")}
        <span>
          {t.replace(/^Larisa's forecast:\s*/, `${her} pre-trip estimate: `)
            .replace(/\blows (low\b)/i, "$1").replace(/\bhighs (high\b)/i, "$1").replace(/\brain ((?:little|light|some|no|heavy) rain\b)/i, "$1")
            .replace(/\brain\s*0(\.0+)?\s*(in|mm)?\s*(?=,|$)/i, "no rain").replace(/(\d)-(\.?\d)/g, "$1‑$2")}
          {tried && <span className="text-xs text-[#6b5d4a]"> · no live forecast yet for this day</span>}
        </span>
      </p>
    );
  }
  return lat != null && lon != null && !tried ? <p className="min-h-[20px] mt-1" aria-hidden /> : null;
}
