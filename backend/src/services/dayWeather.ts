/**
 * One day's forecast where this person sleeps that night (Ken's weather plan, Oct 12–13 2026: "planning for weather
 * becomes critical through October… tell me if you can add more value in the weather reporting"; "You always decide
 * sequencing!"). The day pages showed the town's forecast: for Nikko that's ~2,000 ft below the Ritz-Carlton on Lake
 * Chuzenji, where the highs run 5–10°F colder. Now: the night's hotel (the same point packing uses), the town only when
 * there's no stay that night; how sure it is — more than a week out is an early outlook, and rain is checked against
 * Europe's, Japan's and the US models. Free (Open-Meteo); kept 30 minutes per point and day.
 *
 * And where the day's plan takes them, when that's somewhere else (Ken, Oct 13: "Tomorrow is a good example where we
 * are staying at the Imperial Hotel, but the day plan is to go to Mashiko, so both weathers should be there… That
 * should always be true if you can identify a different location from the plan"): a day trip in her plan for them
 * ("Day trip from Tokyo to Mashiko"), or a travel day's morning (last night in one town, tonight in another).
 */
import prisma from "./db.js";
import { pinsOf, stayPoint, modelsAgree, hotelPoint, type ModelRain } from "./packingWeather.js";

type Forecast = { hi: number; lo: number; rain: number | null; code: number | null; models: ModelRain; outlook: "forecast" | "early outlook"; at: string };
export interface DayWeather extends Forecast {
  /** the stay's name, or the town's when there's no stay that night */
  place: string; atHotel: boolean;
  /** the town of that night's stay ("Tokyo"), for naming the line when there are two */
  town: string;
  /** the day's other place, when the plan names one: a day trip ("day") or where a travel day starts ("morning") */
  also?: Forecast & { place: string; when: "day" | "morning" };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const short = (s: string) => s.split(/\s+-\s+|\s*\(|,/)[0].trim();
const kept = new Map<string, { at: number; w: Forecast | null }>();

async function forecastAt(point: { lat: number; lng: number }, date: string, away: number): Promise<Forecast | null> {
  const key = `${point.lat.toFixed(3)},${point.lng.toFixed(3)}|${date}`;
  const k = kept.get(key);
  if (k && Date.now() - k.at < 30 * 60_000) return k.w;
  let w: Forecast | null = null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const [r, models] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&temperature_unit=fahrenheit&timezone=Asia%2FTokyo&start_date=${date}&end_date=${date}`, { signal: ctl.signal }),
      modelsAgree(point.lat, point.lng, date, date),
    ]);
    clearTimeout(t);
    const d = r.ok ? (await r.json())?.daily : null;
    if (d?.temperature_2m_max?.[0] != null) {
      w = { hi: Math.round(d.temperature_2m_max[0]), lo: Math.round(d.temperature_2m_min[0]), rain: d.precipitation_probability_max?.[0] ?? null,
        code: d.weather_code?.[0] ?? null, models: models(date), outlook: away <= 7 ? "forecast" : "early outlook", at: new Date().toISOString() };
    }
  } catch { /* no forecast now — the phone keeps its last copy */ }
  kept.set(key, { at: Date.now(), w });
  return w;
}

type Stay = { name: string; forWhom: string | null; checkInDate: Date | null; checkOutDate: Date | null; latitude: number | null; longitude: number | null; city: { name: string; latitude: number | null; longitude: number | null } };
/** The stay for this person on the night of `date`: in by that date, out after it — hers for them, or for everyone */
function nightOf(stays: Stay[], me: string, date: string): Stay | undefined {
  return stays.find((s) => s.checkInDate && s.checkOutDate && ymd(s.checkInDate) <= date && ymd(s.checkOutDate) > date
    && (!s.forWhom || /everyone/i.test(s.forWhom) || s.forWhom.toLowerCase().includes(me)));
}
const forThem = (forWhom: string | null, me: string) => !forWhom || /everyone/i.test(forWhom) || forWhom.toLowerCase().includes(me);

/** A day trip in her plan for this person that day: "Day trip from Tokyo to Mashiko", "Mashiko day trip" — its town.
 *  Her initials before it say whose it is: "day 1 - JA Arrive (evening), KL day trip to Mashiko" is Ken and Larisa's,
 *  not Julie's or Andy's (`me`: the person's first name). */
export function dayTripTown(titles: string[], me = ""): string | null {
  const initial = me.trim().charAt(0).toUpperCase();
  for (const t of titles) {
    const m = t.match(/\b[Dd]ay[ -]trip\b(?:\s+from\s+[\p{L}'’ .-]+?)?\s+to\s+([\p{Lu}][\p{L}'’-]+(?:\s[\p{Lu}][\p{L}'’-]+)?)/u)
      || t.match(/\b([\p{Lu}][\p{L}'’-]+)\s+[Dd]ay[ -]trip\b/u);
    if (!m) continue;
    const who = t.slice(0, m.index).match(/\b([A-Z]{2,4})\s*$/)?.[1];
    if (who && initial && !who.includes(initial)) continue;
    if (/^(The|A|An|Our|Your|Day)$/.test(m[1])) continue;
    return m[1];
  }
  return null;
}

export async function dayWeather(tripId: string, person: string, date: string, today: string): Promise<DayWeather | null> {
  const away = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (away < 0 || away > 15) return null;   // (past, or beyond Open-Meteo's 16 days)
  const me = person.split(" ")[0].toLowerCase();
  // (not before their own first night: Andy and Julie's Imperial is "Everyone, Oct 13→18", but they sleep on the plane
  // on the 13th and check in on the 14th — verify25. The town's forecast for a day they aren't there yet.)
  const ownIn = (await prisma.guideItem.findMany({ where: { tripId, kind: "checkin", forWhom: { contains: person.split(" ")[0], mode: "insensitive" } }, select: { date: true }, orderBy: { date: "asc" }, take: 1 }))[0]?.date;
  const here = !ownIn || ymd(ownIn) <= date;
  const stays = await prisma.accommodation.findMany({ where: { tripId }, select: { name: true, forWhom: true, checkInDate: true, checkOutDate: true, latitude: true, longitude: true, city: { select: { name: true, latitude: true, longitude: true } } }, orderBy: { checkInDate: "asc" } });
  const stay = here ? nightOf(stays, me, date) : undefined;
  const pins = await pinsOf(tripId);
  let point: { lat: number; lng: number; atHotel: boolean } | null = null;
  let place = "", town = "";
  if (stay) {
    point = await stayPoint(stay, pins);
    place = point?.atHotel ? stay.name : stay.city.name;
    town = stay.city.name;
  }
  if (!point) {
    const day = await prisma.day.findFirst({ where: { tripId, date: new Date(`${date}T00:00:00Z`) }, select: { city: { select: { name: true, latitude: true, longitude: true } } } });
    if (day?.city?.latitude == null || day.city.longitude == null) return null;
    point = { lat: day.city.latitude, lng: day.city.longitude, atHotel: false };
    place = day.city.name;
    town = day.city.name;
  }
  place = short(place); town = short(town);
  const w = await forecastAt(point, date, away);
  if (!w) return null;
  const out: DayWeather = { place, atHotel: point.atHotel, town, ...w };

  // The day's other place. A day trip in her plan for them:
  const plans = await prisma.guideItem.findMany({ where: { tripId, date: new Date(`${date}T00:00:00Z`), kind: { in: ["plan", "block", "tour"] } }, select: { title: true, forWhom: true } });
  const tripTown = dayTripTown(plans.filter((p) => forThem(p.forWhom, me)).map((p) => p.title), me);
  if (tripTown && tripTown.toLowerCase() !== town.toLowerCase()) {
    const city = await prisma.city.findFirst({ where: { tripId, name: { equals: tripTown, mode: "insensitive" } }, select: { latitude: true, longitude: true } });
    const p = city?.latitude != null && city.longitude != null ? { lat: city.latitude, lng: city.longitude } : await hotelPoint(`${tripTown} Japan`);
    const f = p ? await forecastAt(p, date, away) : null;
    if (f) out.also = { place: tripTown, when: "day", ...f };
    return out;
  }
  // …or a travel day: last night in another town (the morning there, tonight here)
  const last = here ? nightOf(stays, me, ymd(new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000))) : undefined;
  if (last && stay && short(last.city.name).toLowerCase() !== town.toLowerCase()) {
    const p = await stayPoint(last, pins);
    const f = p ? await forecastAt(p, date, away) : null;
    if (f) out.also = { place: short(last.city.name), when: "morning", ...f };
  }
  return out;
}
