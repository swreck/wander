/**
 * Home's small line under "Today": the day's weather and a way into the day (Ken, Oct 13: "Home should have small type
 * saying something like 'Today's weather: xxxx     Go to today [active button]'"). The same forecast as the day page —
 * where you sleep tonight, from Wander's server (lib/forecast dayForecastFor), kept on the phone so it draws at once and
 * still shows with no signal. The button is always there, so the line never jumps in when the forecast arrives.
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
  // (named where it's measured — Julie and Andy read Home in San Francisco on the day they fly, and "Today's weather"
  // over Tokyo's forecast would read as theirs)
  const where = f?.place ? (f.atHotel ? ` at ${theHotel(f.place)}` : ` in ${f.place}`) : "";
  return (
    <div className="flex items-center justify-between gap-2 mt-0.5">
      <p className="text-[13px] text-[#6b5d4a] leading-snug min-w-0">
        {f && <>Weather{where} today: {f.lo}‑{f.hi}°F{f.rain !== null ? `, ${f.rain}% chance of rain` : ""}{disputed === "drier" ? ", though other forecasts show little rain" : disputed === "split" ? ", but the forecasts disagree" : ""}</>}
      </p>
      <button onClick={onGo} className="shrink-0 min-h-[44px] px-1 text-[13px] font-medium text-[#514636] underline underline-offset-2">
        Go to today ›
      </button>
    </div>
  );
}
