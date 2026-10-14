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
import { meteo } from "./meteo.js";
import { pinsOf, stayPoint, modelsAgree, hotelPoint, type ModelRain } from "./packingWeather.js";

// (inches: the day's expected rain — Ken, Oct 13: "rain percentage is important, but especially in Japan, the quantity
// of rain matters")
// (wet: the hours rain is likeliest, as [from, to) in Japan's clock between 7 AM and 10 PM — only for a day up to 3 days
// out with a real chance; hourly rain isn't worth reading further ahead. Ken's weather plan item 3, agreed Oct 13)
type Forecast = { hi: number; lo: number; rain: number | null; inches: number | null; code: number | null; models: ModelRain; outlook: "forecast" | "early outlook"; at: string; wet?: [number, number][]; showers?: [number, number][] };
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

const MODELS = ["jma_seamless", "ecmwf_ifs025", "gfs_seamless"] as const;
/** When in the day rain is likeliest: an hour counts when the main forecast gives it a 50%+ chance, or two of Japan's,
 *  Europe's and the US models put measurable rain (0.01"+) in it. They often disagree on the hour — for Mashiko on Oct
 *  14 Japan's model had showers 8–10 AM and the others rain 3–7 PM — so both are said. Spans one dry hour apart join.
 *  `h`: Open-Meteo's hourly block for one day (keys like precipitation_jma_seamless). Each figure is for the hour BEFORE
 *  its time stamp ("sum of the preceding hour"): the 9:00 figure is rain from 8 to 9 — read as 9 to 10, every hour came
 *  out an hour late (verify34). So stamps 8:00–22:00 are the hours 7 AM–10 PM. */
export function wetHours(h: Record<string, (number | null)[] | undefined>): [number, number][] {
  const spans: [number, number][] = [];
  for (let stamp = 8; stamp <= 22; stamp++) {
    const chance = h.precipitation_probability_best_match?.[stamp] ?? 0;
    const models = MODELS.filter((m) => (h[`precipitation_${m}`]?.[stamp] ?? 0) >= 0.01).length;
    if (chance < 50 && models < 2) continue;
    const hr = stamp - 1;
    const last = spans[spans.length - 1];
    if (last && hr - last[1] <= 1) last[1] = hr + 1; else spans.push([hr, hr + 1]);
  }
  return spans;
}

/** Showers possible: an hour outside the likeliest ones where one model alone puts real rain (0.02"+) and the chance is
 *  25%+. Japan's own model is the sharpest for the next few days; on Oct 14 it alone had Mashiko's 8–10 AM showers
 *  (.03–.06" an hour) once Europe's next run dried the morning, and a traveler heading there should hear it. */
export function showerHours(h: Record<string, (number | null)[] | undefined>, likely: [number, number][]): [number, number][] {
  const spans: [number, number][] = [];
  for (let stamp = 8; stamp <= 22; stamp++) {
    const hr = stamp - 1;
    if (likely.some(([s, e]) => hr >= s && hr < e)) continue;
    const chance = h.precipitation_probability_best_match?.[stamp] ?? 0;
    if (chance < 25 || !MODELS.some((m) => (h[`precipitation_${m}`]?.[stamp] ?? 0) >= 0.02)) continue;
    const last = spans[spans.length - 1];
    if (last && hr === last[1]) last[1] = hr + 1; else spans.push([hr, hr + 1]);
  }
  return spans;
}

/** Hour by hour for days 0–3 from `today`, one call: per day, its 24 hours in the shape wetHours reads */
async function hourlyDays(point: { lat: number; lng: number }, today: string, signal: AbortSignal): Promise<Map<string, Record<string, (number | null)[]>> | null> {
  const out = new Map<string, Record<string, (number | null)[]>>();
  try {
    const r = await meteo(`https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lng}&hourly=precipitation,precipitation_probability&models=best_match,${MODELS.join(",")}&precipitation_unit=inch&timezone=Asia%2FTokyo&start_date=${today}&end_date=${addDays(today, 3)}`, signal);
    const h = r.ok ? (await r.json())?.hourly : null;
    if (!Array.isArray(h?.time)) return null;
    const times: string[] = h.time;
    for (let d = 0; d * 24 + 24 <= times.length; d++) {
      const day = String(times[d * 24]).slice(0, 10);
      out.set(day, Object.fromEntries(Object.entries(h).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as (number | null)[]).slice(d * 24, d * 24 + 24)])));
    }
  } catch { return null; /* no hours: kept briefly, asked again soon */ }
  return out;
}
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Every day's forecast at one point, today through 15 days ahead, in three calls — one per kind, all days at once.
 *  Asking day by day took three calls per day, and Open-Meteo refused the burst when Scout was asked about a week: of
 *  21 calls at once, 16 came back "busy", and those days read as having no forecast (Oct 14). Kept 30 minutes (a
 *  failure, 2); asked once however many people and days want it at the same moment. */
const points = new Map<string, { at: number; days: Map<string, Forecast> | null; partial?: boolean }>();
const asking = new Map<string, Promise<Map<string, Forecast> | null>>();
async function pointForecast(point: { lat: number; lng: number }, today: string): Promise<Map<string, Forecast> | null> {
  const key = `${point.lat.toFixed(3)},${point.lng.toFixed(3)}|${today}`;
  const k = points.get(key);
  // (a failed fetch is kept only 2 minutes — one timeout left Scout with "no forecast for Sunday" for half an hour)
  // (and one whose rain hours or other-forecasts check failed, 2 too — verify47: "most likely 3–7 PM" stayed missing
  // for half an hour after Open-Meteo recovered)
  if (k && Date.now() - k.at < (k.days && !k.partial ? 30 : 2) * 60_000) return k.days;
  if (asking.has(key)) return asking.get(key)!;
  const go = (async () => {
    let days: Map<string, Forecast> | null = null;
    let partial = false;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 30_000);   // (each Open-Meteo try has its own 12 s, never counting its wait in line — services/meteo.ts)
    try {
      // (14 days on: Open-Meteo counts its 16 from the UTC date, a day behind Japan's from midnight to 9 AM, and refuses
      // the whole request for a day past its last — Oct 15 2026, no weather anywhere in Wander from midnight to 9 AM)
      const end = addDays(today, 14);
      const [r, models, hours] = await Promise.all([
        meteo(`https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=Asia%2FTokyo&start_date=${today}&end_date=${end}`, ctl.signal),
        modelsAgree(point.lat, point.lng, today, end),
        hourlyDays(point, today, ctl.signal),
      ]);
      if (!r.ok) console.warn(`[dayWeather] no forecast for ${key}: Open-Meteo ${r.status}`);
      const d = r.ok ? (await r.json())?.daily : null;
      const at = new Date().toISOString();
      // (today's other-forecasts check always has an answer when it worked — Japan's model reaches about 11 days)
      partial = hours === null || models(today) === "unknown";
      if (Array.isArray(d?.time)) {
        days = new Map();
        d.time.forEach((date: string, i: number) => {
          if (d.temperature_2m_max?.[i] == null) return;
          const away = i;
          const rain: number | null = d.precipitation_probability_max?.[i] ?? null;
          const h = away <= 3 ? hours?.get(date) : undefined;
          const wet = h && h.time?.length === 24 ? wetHours(h) : undefined;
          days!.set(date, { hi: Math.round(d.temperature_2m_max[i]), lo: Math.round(d.temperature_2m_min[i]), rain,
            inches: typeof d.precipitation_sum?.[i] === "number" ? Math.round(d.precipitation_sum[i] * 100) / 100 : null,
            code: d.weather_code?.[i] ?? null, models: models(date), outlook: away <= 7 ? "forecast" : "early outlook", at,
            ...(wet && (rain ?? 0) >= 30 ? { wet, showers: showerHours(h!, wet) } : {}) });
        });
      }
    } catch (e: any) { console.warn(`[dayWeather] no forecast for ${key}: ${e?.name === "AbortError" ? "timed out" : e?.message}`); /* the phone keeps its last copy */ }
    finally { clearTimeout(t); }
    points.set(key, { at: Date.now(), days, partial });
    return days;
  })().finally(() => asking.delete(key));
  asking.set(key, go);
  return go;
}

async function forecastAt(point: { lat: number; lng: number }, date: string, away: number): Promise<Forecast | null> {
  return (await pointForecast(point, addDays(date, -away)))?.get(date) ?? null;
}

type Stay = { name: string; forWhom: string | null; checkInDate: Date | null; checkOutDate: Date | null; latitude: number | null; longitude: number | null; city: { name: string; latitude: number | null; longitude: number | null } };
/** The stay for this person on the night of `date`: in by that date, out after it — hers for them, or for everyone */
function nightOf(stays: Stay[], me: string, date: string): Stay | undefined {
  return stays.find((s) => s.checkInDate && s.checkOutDate && ymd(s.checkInDate) <= date && ymd(s.checkOutDate) > date
    && (!s.forWhom || /everyone/i.test(s.forWhom) || s.forWhom.toLowerCase().includes(me)));
}
const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const forThem = (forWhom: string | null, me: string) => !forWhom || /everyone/i.test(forWhom) || forWhom.toLowerCase().includes(me);

/** A day trip in her plan for this person that day: "Day trip from Tokyo to Mashiko", "Mashiko day trip" — its town.
 *  Her initials before it say whose it is: "day 1 - JA Arrive (evening), KL day trip to Mashiko" is Ken and Larisa's,
 *  not Julie's or Andy's (`me`: the person's first name). */
export function dayTripTown(titles: string[], me = ""): string | null {
  const initial = me.trim().charAt(0).toUpperCase();
  for (const t of titles) {
    const m = t.match(/\b[Dd]ay[ -]trip\b(?:\s+from\s+[\p{L}'’ .-]+?)?\s+to\s+([\p{Lu}][\p{L}'’-]+(?:\s[\p{Lu}][\p{L}'’-]+)?)/u)
      || t.match(/\b([\p{Lu}][\p{L}'’-]+)\s+[Dd]ay[ -]trip\b/u);
    // (or her day plan's headline naming the place alone: "Kyoto day 4 - Shigaraki" — verify31; a headline that goes on,
    // "day 2 - Ginza shopping day (…)", isn't a place)
    const head = !m ? t.match(/\bday\s*\d+\s*[-–—]\s*([\p{Lu}][\p{L}'’-]+(?:\s[\p{Lu}][\p{L}'’-]+)?)\s*$/u) : null;
    // (a headline word that isn't a place — "Kyoto day 2 - Rest", "Departure" — never; verify32. Nor a two-word one
    // with such a word in it: "Rest Day", "Free Day", "Fly Home", "Arrival Day"; verify33)
    const planWord = /^(Rest|Relax|Free|Departure|Depart|Arrival|Arrive|Travel|Packing|Pack|Shopping|Leisure|Explore|Recovery|Return|Home|Spa|Onsen|Hiking|Hike|Walk|Museums?|Temples?|Shrines?|Day|Fly|Flight|Sightseeing|Laundry|Lazy|Easy|Open|Flex|Fun|Downtime|Checkout|Check)$/i;
    // (hyphened too: "Free-day", "Day-trip" — verify36)
    if (head && !head[1].split(/[\s-]+/).some((w) => planWord.test(w))) return head[1];
    if (!m) continue;
    const who = t.slice(0, m.index).match(/\b([A-Z]{2,4})\s*$/)?.[1];
    if (who && initial && !who.includes(initial)) continue;
    if (/^(The|A|An|Our|Your|Day)$/.test(m[1])) continue;
    return m[1];
  }
  return null;
}

const inJapan = (q: { lat: number; lng: number }) => q.lat > 24 && q.lat < 46 && q.lng > 122 && q.lng < 146;

/** A town in Japan that isn't where the plan has them, for Scout ("What's the weather in Kanazawa on Friday?") — the
 *  same forecast and words as a day page, never a weather site's (Ken, Oct 13: "One unified and correct source"). Null
 *  when the town can't be found in Japan, or there's no forecast for that day. */
export async function townWeather(tripId: string, name: string, date: string, today: string): Promise<DayWeather | null> {
  const away = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (away < 0 || away > 15 || !name.trim()) return null;
  const city = await prisma.city.findFirst({ where: { tripId, name: { equals: name.trim(), mode: "insensitive" } }, select: { name: true, latitude: true, longitude: true } });
  const p = city?.latitude != null && city.longitude != null ? { lat: city.latitude, lng: city.longitude } : await hotelPoint(`${name.trim()} Japan`);
  if (!p || !inJapan(p)) return null;
  const w = await forecastAt(p, date, away);
  const town = short(city?.name || name.trim());
  return w ? { place: town, atHotel: false, town, ...w } : null;
}

type Pt = { lat: number; lng: number };
/** Where this person is on a day, as the day page's forecast sees it: where they sleep (the hotel, else the town), and
 *  where her plan takes them when that's somewhere else — a day trip, or where a travel day starts. The storm watch
 *  reads the same places (services/stormWatch), so the two never disagree about where someone is. */
export async function dayPlaces(tripId: string, person: string, date: string): Promise<{
  night: Pt & { atHotel: boolean; place: string; town: string };
  dayTrip?: Pt & { place: string };
  morning?: Pt & { place: string };
} | null> {
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
  const out: Awaited<ReturnType<typeof dayPlaces>> = { night: { ...point, place, town } };

  // The day's other place. A day trip in her plan for them:
  const plans = await prisma.guideItem.findMany({ where: { tripId, date: new Date(`${date}T00:00:00Z`), kind: { in: ["plan", "block", "tour"] } }, select: { title: true, forWhom: true } });
  const tripTown = dayTripTown(plans.filter((p) => forThem(p.forWhom, me)).map((p) => p.title), me);
  if (tripTown && tripTown.toLowerCase() !== town.toLowerCase()) {
    const city = await prisma.city.findFirst({ where: { tripId, name: { equals: tripTown, mode: "insensitive" } }, select: { latitude: true, longitude: true } });
    const p = city?.latitude != null && city.longitude != null ? { lat: city.latitude, lng: city.longitude } : await hotelPoint(`${tripTown} Japan`);
    // (truly elsewhere — over ~15 miles from where they sleep — so a neighborhood never counts as another place)
    // (and inside Japan — "Rest Japan" found a point near Palo Alto; verify32)
    if (p && inJapan(p) && kmBetween(p, point) > 25) out.dayTrip = { ...p, place: tripTown };
  }
  // …or a travel day: last night in another town (the morning there, tonight here)
  const last = here ? nightOf(stays, me, ymd(new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000))) : undefined;
  if (last && stay && short(last.city.name).toLowerCase() !== town.toLowerCase()) {
    const p = await stayPoint(last, pins);
    if (p) out.morning = { lat: p.lat, lng: p.lng, place: short(last.city.name) };
  }
  return out;
}

/** The forecast at a point that isn't where they sleep — an airport on a flight day — named as given */
export async function weatherAt(p: { lat: number; lng: number }, name: string, date: string, today: string): Promise<DayWeather | null> {
  const away = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (away < 0 || away > 15 || !inJapan(p)) return null;
  const w = await forecastAt(p, date, away);
  return w ? { place: name, atHotel: false, town: name, ...w } : null;
}

export async function dayWeather(tripId: string, person: string, date: string, today: string): Promise<DayWeather | null> {
  const away = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (away < 0 || away > 15) return null;   // (past, or beyond Open-Meteo's 16 days)
  const at = await dayPlaces(tripId, person, date);
  if (!at) return null;
  const { night } = at;
  const w = await forecastAt(night, date, away);
  if (!w) return null;
  const out: DayWeather = { place: night.place, atHotel: night.atHotel, town: night.town, ...w };
  // (a day trip first; when it has no forecast, a travel day's morning, as before)
  const f = at.dayTrip ? await forecastAt(at.dayTrip, date, away) : null;
  if (f) { out.also = { place: at.dayTrip!.place, when: "day", ...f }; return out; }
  const m = at.morning ? await forecastAt(at.morning, date, away) : null;
  if (m) out.also = { place: at.morning!.place, when: "morning", ...m };
  return out;
}
