/**
 * One day's forecast where this person sleeps that night (Ken's weather plan, Oct 12–13 2026: "planning for weather
 * becomes critical through October… tell me if you can add more value in the weather reporting"; "You always decide
 * sequencing!"). The day pages showed the town's forecast: for Nikko that's ~2,000 ft below the Ritz-Carlton on Lake
 * Chuzenji, where the highs run 5–10°F colder. Now: the night's hotel (the same point packing uses), the town only when
 * there's no stay that night; how sure it is — more than a week out is an early outlook, and rain is checked against
 * Europe's, Japan's and the US models. Free (Open-Meteo); kept 30 minutes per point and day.
 */
import prisma from "./db.js";
import { pinsOf, stayPoint, modelsAgree, type ModelRain } from "./packingWeather.js";

export interface DayWeather {
  /** the stay's name, or the town's when there's no stay that night */
  place: string; atHotel: boolean;
  hi: number; lo: number; rain: number | null; code: number | null;
  /** Europe's, Japan's and the US models: all show rain, none do, some do, or not known (Japan's reaches ~11 days) */
  models: ModelRain; outlook: "forecast" | "early outlook";
  at: string;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const kept = new Map<string, { at: number; w: Omit<DayWeather, "place" | "atHotel"> | null }>();

export async function dayWeather(tripId: string, person: string, date: string, today: string): Promise<DayWeather | null> {
  const away = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (away < 0 || away > 15) return null;   // (past, or beyond Open-Meteo's 16 days)
  const me = person.split(" ")[0].toLowerCase();
  // (not before their own first night: Andy and Julie's Imperial is "Everyone, Oct 13→18", but they sleep on the plane
  // on the 13th and check in on the 14th — verify25. The town's forecast for a day they aren't there yet.)
  const ownIn = (await prisma.guideItem.findMany({ where: { tripId, kind: "checkin", forWhom: { contains: person.split(" ")[0], mode: "insensitive" } }, select: { date: true }, orderBy: { date: "asc" }, take: 1 }))[0]?.date;
  const here = !ownIn || ymd(ownIn) <= date;
  // (the night of this date: in by this date, out after it — hers for this person, or for everyone)
  const stay = !here ? undefined : (await prisma.accommodation.findMany({ where: { tripId }, select: { name: true, forWhom: true, checkInDate: true, checkOutDate: true, latitude: true, longitude: true, city: { select: { name: true, latitude: true, longitude: true } } }, orderBy: { checkInDate: "asc" } }))
    .find((s) => s.checkInDate && s.checkOutDate && ymd(s.checkInDate) <= date && ymd(s.checkOutDate) > date
      && (!s.forWhom || /everyone/i.test(s.forWhom) || s.forWhom.toLowerCase().includes(me)));
  let point: { lat: number; lng: number; atHotel: boolean } | null = null;
  let place = "";
  if (stay) {
    point = await stayPoint(stay, await pinsOf(tripId));
    place = point?.atHotel ? stay.name : stay.city.name;
  }
  if (!point) {
    const day = await prisma.day.findFirst({ where: { tripId, date: new Date(`${date}T00:00:00Z`) }, select: { city: { select: { name: true, latitude: true, longitude: true } } } });
    if (day?.city?.latitude == null || day.city.longitude == null) return null;
    point = { lat: day.city.latitude, lng: day.city.longitude, atHotel: false };
    place = day.city.name;
  }
  place = place.split(/\s+-\s+|\s*\(/)[0].trim();
  const key = `${point.lat.toFixed(3)},${point.lng.toFixed(3)}|${date}`;
  const k = kept.get(key);
  if (k && Date.now() - k.at < 30 * 60_000) return k.w ? { place, atHotel: point.atHotel, ...k.w } : null;
  let w: Omit<DayWeather, "place" | "atHotel"> | null = null;
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
  return w ? { place, atHotel: point.atHotel, ...w } : null;
}
