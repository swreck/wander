/**
 * Home's one line just under the trip's dates: the day's weather and a way into the day. Ken (Oct 13): "Home should
 * have small type saying something like 'Today's weather: xxxx     Go to today [active button]'", then, of the spot
 * under the dates: "Can it be one line of: 63‑74°F, rain 6%      Go to today ›". The same forecast as the day page —
 * where you sleep tonight, from Wander's server (lib/forecast dayForecastFor), kept on the phone so it draws at once and
 * still shows with no signal. Shown only on the days the Today card is (your days in Japan), so the numbers are always
 * where you are and need no place name; the day page says where it's measured. The button is always there, so the line
 * never jumps in when the forecast arrives.
 */
import { useEffect, useState } from "react";
import { dayForecastFor, savedDayForecast, rainDisputed, type DayForecast } from "../lib/forecast";
import { theHotel } from "./DayForecast";

export default function TodayWeather({ tripId, date, japanToday, onGo }: { tripId: string; date: string; japanToday: string; onGo: () => void }) {
  // (a day already over where the trip is has no weather — the day page's own rule. Julie and Andy, flying on Oct 13 by
  // their own clock while Tokyo was on Oct 14, would have read Tokyo's finished Oct 13; verify28)
  const over = date < japanToday;
  const [f, setF] = useState<DayForecast | null>(() => (over ? null : savedDayForecast(tripId, date)));
  useEffect(() => {
    if (over) { setF(null); return; }
    let live = true;
    setF(savedDayForecast(tripId, date));
    dayForecastFor(tripId, date).then((x) => { if (live && x) setF(x); });
    return () => { live = false; };
  }, [tripId, date, over]);

  const disputed = f ? rainDisputed(f) : null;
  // (said in full to a screen reader: where it's measured and that it's today's)
  const where = f?.place ? (f.atHotel ? ` at ${theHotel(f.place)}` : ` in ${f.place}`) : "";
  return (
    // (as close under the dates as the dates are under "From Larisa's Guide" — Ken, Oct 13: "reduce the space … to what
    // is the standard between 'from Larisa's…' and dates". The line is one text line tall; "Go to today ›" keeps a
    // fingertip's 44 pt by reaching up over the dates, which can't be tapped, never down over History and ⚙)
    <div className="flex items-end justify-between gap-3 -mt-11 h-11">
      <p className="text-sm leading-5 text-[#514636] min-w-0">
        {f && <>
          <span className="sr-only">Today's weather{where}: </span>
          {f.lo}‑{f.hi}°F{f.rain !== null ? `, rain ${f.rain}%` : ""}
          {disputed === "drier" ? <span className="text-[#6b5d4a]"> (other forecasts drier)</span> : disputed === "split" ? <span className="text-[#6b5d4a]"> (forecasts differ)</span> : null}
        </>}
      </p>
      <button onClick={onGo} className="shrink-0 h-11 pt-6 px-1 text-sm leading-5 text-[#514636] underline underline-offset-2">
        Go to today ›
      </button>
    </div>
  );
}
