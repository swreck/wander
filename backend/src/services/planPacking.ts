/**
 * Scout's packing notes on a trip built from a plan (Nov 24 2026). The plan's promise: "a checked list for each country
 * of the asker's own days, each fact with its source, never what Backroads already told them."
 *
 * Every note here was kept only after its page was opened and read (Nov 23 2026; trip-data/december-plan/
 * packing-research.md holds what was read and what was left out). Each keeps its page's own strength: "may refuse" is
 * never "will", "some" is never "most", a habit residents report is never a rule. Left out on purpose: the Cambodian
 * visa (no checked source: said as "no checked note"), and everything Backroads' own notes already say (rain gear,
 * wet-weather shoes, a fleece and long pants for the north, light clothes, passport rules).
 *
 * Whose days: the trip's list of who is abroad when (services/familyExpenses rosterOf). A person not on it, or a trip
 * with no list, gets every country of the trip. A note about one town shows only when their own days have that town.
 * Her Guide's trip never comes here: its list is services/packing.ts, untouched.
 */
import prisma from "./db.js";
import { PACKING } from "./packing.js";
import { rosterOf } from "./familyExpenses.js";
import { plainName } from "./townSearch.js";
import { packingWeather, type StayWeather } from "./packingWeather.js";
import { typicalForDays, TYPICAL_ONCE, orWords } from "./planWeather.js";

export type PlanNote = { say: string; why: string; from: string; source: string; tieTo?: string; rule?: boolean };
export type PlanSection = { where: string; days?: string; towns?: string[]; notes: PlanNote[] };
export type PlanPacking = {
  about: string;
  sections: PlanSection[];
  noNote?: string[];
  weather?: { asOf?: string; stays?: StayWeather[]; pastYears?: { around: string; typical: string }[]; once?: string; how: string };
  end?: string;
};

const ABOUT = "Wander's checked packing notes for this person's own days on this trip, country by country. Each note says what to bring and why, who says so (from) and the page (source). Every source was opened and read before the note was kept. Not general travel advice.";
const ABOUT_ONE = "Wander's checked notes for this person's own days on this trip, country by country. Each says what to bring or do and why, who says so (from) and the page (source). Every source was opened and read before the note was kept. These are all the checked notes Wander has: on anything they don't cover, Wander has no checked note.";
const END = "Tell me how you like to travel (light, or with options; whether you'll do laundry) and I'll fit this to you.";

const VN_VISA: PlanNote = {
  say: "A printed copy of your Vietnam e-visa.",
  why: "Vietnam's tourism site says of the e-visa: \"You will receive your code by email to print your visa.\" Wander has no checked source saying a copy on a phone is accepted, so bring it on paper.",
  from: "Vietnam's tourism site",
  source: "https://vietnam.travel/index.php/plan-your-trip/visa-requirements",
};
const VN_MEDICINES: PlanNote = {
  say: "The doctor's prescription for the medicines you carry into Vietnam.",
  why: "The Vietnamese embassy in Australia's page says personal medicine needs no import license when it is no more than 7 days' supply of a narcotic medicine or 10 days' of a psychotropic one, and that these \"must be declared to customs and must not exceed the quantity stated in the enclosed doctor's prescription\". It describes narcotic medicines as opioids, cannabis and similar products, and psychotropic ones as any drug affecting the mind, emotions and behaviors; it links to lists and says to consult your doctor. The page names no law. If you carry more than that, ask the embassy or the doctor who prescribed it before you fly.",
  from: "the Vietnamese embassy in Australia's page (Nov 2025)",
  source: "https://vietnamembassy.org.au/en/bring-medication-viet-nam",
};
const VN_HUE: PlanNote = {
  say: "For Hué, clothes that cover your shoulders and knees.",
  why: "Tuoi Tre News reported in August 2026 that at Hué's royal tombs, temples, shrines and pagodas, site staff may refuse entry to visitors in skirts above the knee, very short shorts, off-the-shoulder tops, tank tops or spaghetti-strap tops. It is a news report: Wander hasn't found the sites' own text.",
  tieTo: "Tie it to a day only when the plan shows a royal tomb, temple, shrine or pagoda in Hué that day.",
  from: "Tuoi Tre News, Aug 2026",
  source: "https://news.tuoitre.vn/planning-to-visit-vietnams-heritage-sites-mind-the-dress-code-103260806231626629.htm",
};
const KH_ARRIVAL: PlanNote = {
  say: "Cambodia's free e-Arrival card, filled in during the 7 days before you arrive.",
  why: "Tourism of Cambodia's site: \"All travelers\" \"are required to submit the Cambodia e-Arrival Card within 7 days before their arrival\", by a phone app or at https://arrival.gov.kh, which it calls \"the only official website\". It says the card is \"completely free\" and is needed \"even if they have been granted VISA\".",
  from: "Tourism of Cambodia's site",
  source: "https://tourismcambodia.com/tripplanner/essential-information/cambodia-e-arrival-card.htm",
};
const KH_ANGKOR: PlanNote = {
  say: "For Angkor's temples, clothes that cover your shoulders and knees.",
  why: "Angkor's own code of conduct: \"Revealing clothes such as shorts and skirts above the knees and showing bare shoulders are prohibited in sacred places.\" It also says backpacks, umbrellas with sharp tips, tripods and high heels are discouraged inside the temples.",
  tieTo: "Tie it to a day only when the plan shows an Angkor temple that day.",
  from: "Angkor's own code of conduct",
  source: "https://angkorenterprise.gov.kh/en/visitor-code-of-conduct",
};
const KH_BILLS: PlanNote = {
  say: "Crisp, untorn, newer US bills for Cambodia.",
  why: "People living in Cambodia report that US dollars \"that are not in pristine condition are often rejected\", that older bills with the small portraits are not accepted, and that change under a dollar comes in riel. It is a long-standing habit, not an official rule, and the accounts are some years old.",
  from: "residents' accounts (Move to Cambodia, 2016; Canby Publications)",
  source: "https://movetocambodia.com/expat-life/cambodia-scams-us-dollar-and-currency-scams/ · https://canbypublications.com/cambodia/money.htm",
};
const JP_CASH: PlanNote = {
  say: "Yen in cash before you go up to Shiga Kogen.",
  why: "Shiga Kogen's own FAQ says some activities, restaurants and shops accept only cash, and asks visitors to bring enough for the weekends. The ATM it names, at the post office near the Yamanoeki bus terminal in Hasuike, is open weekdays 9:00–17:30 and Saturday mornings 9:00–12:30.",
  from: "Shiga Kogen's own FAQ",
  source: "https://shigakogen.gr.jp/english/faq/index.html",
};
const JP_GEAR: PlanNote = {
  say: "Your own gloves, goggles and warm hat for Shiga Kogen.",
  why: "Shiga Kogen's rental page (Oct 30, 2026) says gloves, goggles and beanies \"are not available at some shops\", that some sizes are limited, and that reserving online ahead is recommended. Its FAQ puts the daytime temperature around 0°C (32°F) with lows down to -15°C (5°F), calls gloves and a beanie essential, and doesn't recommend jeans.",
  from: "Shiga Kogen's own rental page and FAQ",
  source: "https://shigakogen.gr.jp/english/topics/rental-shops-information.html · https://shigakogen.gr.jp/english/faq/index.html",
};
/** Japan's medicines note is Japan's own list's, word for word (services/packing.ts), with who says so */
const jpMedicines = (): PlanNote | null => {
  const item = PACKING.items.find((i) => (i.source || "").includes("jp.usembassy.gov"));
  return item?.source ? { ...item, source: item.source, from: "the US Embassy in Japan and Japan's health ministry" } : null;
};

const CDC = { Vietnam: "https://wwwnc.cdc.gov/travel/destinations/traveler/none/vietnam", Cambodia: "https://wwwnc.cdc.gov/travel/destinations/traveler/none/cambodia" } as const;
type Bug = keyof typeof CDC;
const andWords = (xs: string[]) => (xs.length < 2 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The repellent note, once, for the mosquito countries of the asker's own days. Malaria is said only as CDC's lists
 *  have it: a town they name is named, a town they don't is said as not named, and the rest is a doctor's question.
 *  (CDC's "main temple complex at Angkor Wat" is its own phrase: Wander never stretches it to the other temples.) */
function repellent(countries: Bug[], townsOf: (c: string) => string[]): PlanNote {
  const is = (key: string) => (t: string) => plainName(t) === key;
  const parts: string[] = [];
  const unnamed: string[] = [];
  if (countries.includes("Vietnam")) {
    const towns = townsOf("Vietnam");
    parts.push(`Of Vietnam it says "Rural areas only; rare cases in the Mekong and Red River Deltas"${towns.some(is("hanoi")) ? ", and none in the city of Hanoi" : ""}.`);
    unnamed.push(...towns.filter((t) => !is("hanoi")(t)));
  }
  if (countries.includes("Cambodia")) {
    const towns = townsOf("Cambodia");
    parts.push(`Of Cambodia it says "Primarily isolated to pockets in rural and forested areas"${towns.some(is("siemreap")) ? ", and no (or negligible) transmission in the city of Siem Reap and at the main temple complex at Angkor Wat" : ""}.`);
    unnamed.push(...towns.filter((t) => !is("siemreap")(t)));
  }
  const doctor = "talk to your doctor or a travel clinic about malaria for your own days.";
  return {
    say: `An insect repellent with 20% or more DEET, for ${andWords(countries)}.`,
    why: [
      "CDC: \"Use a repellent that contains 20% or more DEET for protection that lasts up to several hours.\"",
      `CDC lists dengue, spread by mosquito bites, for ${andWords(countries)}.`,
      "On malaria, CDC names where it is found.",
      ...parts,
      unnamed.length ? `Its lists don't name ${orWords(unnamed)}: ${doctor}` : `Even so, ${doctor}`,
    ].join(" "),
    from: `CDC (${countries.length > 1 ? "pages" : "page"} reviewed Nov 10, 2026)`,
    source: countries.map((c) => CDC[c]).join(" · "),
  };
}

const HOW = "Before the notes, at most three weather items in all, each ONE sentence, only from what is given here. Fewer is better than an obvious one, and none is fine. Backroads' own notes already tell them to bring rain gear, wet-weather shoes, a fleece and long pants for the north, and light clothes: never mention any of those, even in passing, and nothing as obvious as 'check the forecast'. Name a town and its days by date as given here, never by a day number. Temperatures in °F as given, never a difference you work out. Nothing of your own about the hotels or about what dries overnight.";
const HOW_STAYS = " From \"stays\" (the live forecast for their own nights), worth an item, and only these: the coldest stop against the warmest, in ONE item with both ranges; the days rain shows when the plan has them outside (a walk, a bike ride, a boat); one very wet stretch. Never an item that only says a stop is mild or warm. A rain day may be called likely, with its chance, only when it's marked 'forecast' AND its models 'agree'; when its models 'disagree' (the three forecasts Wander compares don't all show rain) it only may rain, and say the forecasts disagree; one marked 'early outlook' is more than a week away and only may rain. Say once whether the numbers are the hotel's own or the town's, as 'at' says.";
const HOW_PAST = " From \"pastYears\" (no forecast reaches those days yet): say once that there is no forecast yet for those days, then at most two items: the coldest town against the warmest, with the years and the ranges as given; and the town where it rained on the most days, with its counts as given. These are what past years were like there. Never as a forecast, a chance or what to expect (\"it will\", \"likely\", \"expect\"), and never a percentage worked out from the counts. They can ask again closer to the trip.";

const first = (s: string) => s.trim().split(/\s+/)[0] ?? "";
const short = (s: string) => s.split(/\s+-\s+|\s*\(|,/)[0].trim();
const sayDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const awayOf = (date: string, today: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
/** A country as the notes know it ("Viet Nam" is Vietnam); any other, as the plan spells it */
const countryOf = (c?: string | null) => {
  const k = String(c ?? "").trim();
  const known = ["Vietnam", "Cambodia", "Japan"].find((n) => n.toLowerCase() === k.toLowerCase().replace(/\s+/g, ""));
  return known ?? k;
};

/** packing_tips on a plan trip. `person`: the asker's name as signed in; `today`: the trip's own today. `notesOnly`:
 *  a question about one thing (a visa, malaria: Scout's rule 55), so the notes alone, with no weather and no closing line. */
export async function planPacking(tripId: string, person: string, today: string, opts: { notesOnly?: boolean } = {}): Promise<PlanPacking> {
  const roster = await rosterOf(tripId).catch(() => null);
  const me = (first(person) && roster?.people.find((p) => first(p.name).toLowerCase() === first(person).toLowerCase())) || null;
  const rows = (await prisma.day.findMany({ where: { tripId }, select: { date: true, city: { select: { name: true, country: true, hidden: true } } }, orderBy: { date: "asc" } }))
    .filter((d) => d.city && !d.city.hidden && countryOf(d.city.country))
    .map((d) => ({ date: d.date.toISOString().slice(0, 10), town: short(d.city!.name), country: countryOf(d.city!.country) }));
  const mine = me ? rows.filter((d) => d.date >= me.abroadFrom && d.date <= me.abroadTo) : [];
  // (someone on the list whose days hold none of the plan's days is answered as someone not on it: every country)
  const days = mine.length ? mine : rows;
  const own = me && mine.length ? { from: me.abroadFrom, to: me.abroadTo } : undefined;

  // The countries in the order their days come, each with its days and its towns
  const places = new Map<string, { dates: string[]; towns: string[] }>();
  for (const d of days) {
    const p = places.get(d.country) ?? { dates: [], towns: [] };
    p.dates.push(d.date);
    if (!p.towns.includes(d.town)) p.towns.push(d.town);
    places.set(d.country, p);
  }
  const townsOf = (c: string) => places.get(c)?.towns ?? [];
  const inTown = (c: string, key: string) => townsOf(c).some((t) => plainName(t) === key);
  const jp = jpMedicines();
  const notesOf: Record<string, PlanNote[]> = {
    Vietnam: [VN_VISA, VN_MEDICINES, ...(inTown("Vietnam", "hue") ? [VN_HUE] : [])],
    Cambodia: [KH_ARRIVAL, ...(inTown("Cambodia", "siemreap") ? [KH_ANGKOR] : []), KH_BILLS],
    Japan: [...(jp ? [jp] : []), ...(inTown("Japan", "shigakogen") ? [JP_CASH, JP_GEAR] : [])],
  };
  const order = [...places.keys()];
  const bugs = order.filter((c): c is Bug => c === "Vietnam" || c === "Cambodia");
  const rep = bugs.length ? repellent(bugs, townsOf) : null;
  const lastBug = bugs[bugs.length - 1];
  const span = (dates: string[]) => (dates[0] === dates[dates.length - 1] ? sayDay(dates[0]) : `${sayDay(dates[0])} – ${sayDay(dates[dates.length - 1])}`);

  const sections: PlanSection[] = [];
  const noNote: string[] = [];
  for (const c of order) {
    const p = places.get(c)!;
    const notes = [...(notesOf[c] ?? [])];
    // (one mosquito country: the repellent is one of its notes. Two: said once, in a section of its own after both.)
    if (rep && bugs.length === 1 && c === lastBug) notes.push(rep);
    if (notes.length) sections.push({ where: c, days: span(p.dates), towns: p.towns, notes });
    else noNote.push(`${c}: Wander has no checked packing notes for it.`);
    if (rep && bugs.length > 1 && c === lastBug) sections.push({ where: andWords(bugs), notes: [rep] });
  }
  if (places.has("Cambodia")) noNote.push("The Cambodian visa: Wander has no checked note on it.");
  if (opts.notesOnly) return { about: ABOUT_ONE, sections, ...(noNote.length ? { noNote } : {}) };

  // The weather where they sleep: the forecast for the nights in its reach, past years for the days beyond it
  const stays = await packingWeather(tripId, first(person), today, own).catch((e: any) => { console.warn("[packing] forecast unavailable:", e?.message); return [] as StayWeather[]; });
  const far = [...new Set(days.map((d) => d.date))].filter((d) => awayOf(d, today) > 15);
  let past: Awaited<ReturnType<typeof typicalForDays>> | null = null;
  if (far.length) {
    // (the notes never wait long on the archive: each town's reading is five requests)
    let timer: ReturnType<typeof setTimeout> | undefined;
    past = await Promise.race([
      typicalForDays(tripId, person, far).catch(() => null),
      new Promise<null>((done) => { timer = setTimeout(() => done(null), 20_000); }),
    ]);
    clearTimeout(timer);
  }
  const pastYears = past ? [...past.byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, typical]) => ({ around: sayDay(date), typical })) : [];
  const weather: PlanPacking["weather"] = stays.length || pastYears.length ? {
    ...(stays.length ? { asOf: `the live forecast (Open-Meteo), read ${today}`, stays } : {}),
    ...(pastYears.length ? { pastYears, ...(past!.once ? { once: TYPICAL_ONCE } : {}) } : {}),
    how: `${HOW}${stays.length ? HOW_STAYS : ""}${pastYears.length ? HOW_PAST : ""}`,
  } : undefined;

  return { about: ABOUT, sections, ...(noNote.length ? { noNote } : {}), ...(weather ? { weather } : {}), end: END };
}
