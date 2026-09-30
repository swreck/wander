/**
 * What Scout knows about the trip before anyone asks: Larisa's Guide, as Wander read it.
 *
 * Built fresh for each question from the current Guide reading (it's small — a few dozen items,
 * ten hotels, some ideas and the text of the Guide's other tabs), so Scout answers from the same
 * facts every Wander screen shows, and can quote where each came from.
 */

import prisma from "../db.js";
import { tabsOfCopy, wordsAt, cellsOfItem, ideaRef, type ContextLine, type SourceView, type SourcePart } from "./sources.js";

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const weekday = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

/** The Guide, as plain text for Scout. Returns "" when the trip has no Guide reading. */
const TO_AIRPORT: Record<string, Record<string, number>> = {
  kyoto: { KIX: 105, ITM: 75 }, osaka: { KIX: 60, ITM: 45 }, tokyo: { NRT: 90, HND: 50 }, nara: { KIX: 90 }, kobe: { KIX: 75, ITM: 45 },
};
const AIRPORT_WORDS: Record<string, string> = { KIX: "Kansai", NRT: "Narita", HND: "Haneda", ITM: "Itami" };
const clockOf = (m: number) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${m >= 720 ? "PM" : "AM"}`;

const toMin = (t: string | null | undefined) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : NaN);

/**
 * Lines of her day plan nobody's name is on while the group is split (the same rule Home and Now use,
 * lib/guideDisplay.ts ownerlessInSplit). A prompt rule alone once let Scout tell Julie "you're on the
 * other track: … then Maruni Toryo" — so the context itself says WHOSE: NOT STATED.
 */
export function ownerlessInSplit<T extends { id: string; kind: string; time: string | null; endTime: string | null; forWhom: string | null }>(dayItems: T[]): Set<string> {
  const blocks = dayItems.filter((b) => b.kind === "block");
  const labeled = blocks.filter((b) => b.time && b.forWhom && !/^everyone$/i.test(b.forWhom));
  const out = new Set<string>();
  if (!labeled.length) return out;
  const from = Math.min(...labeled.map((b) => toMin(b.time)));
  const to = Math.max(...labeled.map((b) => Math.max(toMin(b.time), toMin(b.endTime) || 0)));
  for (const b of blocks) if (!b.forWhom && b.time && toMin(b.time) >= from && toMin(b.time) < to) out.add(b.id);
  return out;
}

const ZONE_WORDS: Record<string, string> = { "Asia/Tokyo": "Japan time", "America/Los_Angeles": "California time" };
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** "Tue, Oct 13, 12:00 PM California time" */
function momentWords(at: Date, zone: string) {
  return `${at.toLocaleString("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ${ZONE_WORDS[zone] || zone}`;
}

/** The moment a local date and time happens in a time zone ("2026-10-09", 23:59, Tokyo → a Date) */
function zonedMoment(date: string, minutes: number, zone: string): Date {
  const guess = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 0, minutes));
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(guess);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
    return new Date(guess.getTime() - (asUtc - guess.getTime()));
  } catch {
    return guess;
  }
}

/** The Guide for Scout as one text (both parts) — for scripts and checks. */
export async function buildGuideContext(tripId: string, opts: { phoneZone?: string; now?: Date } = {}): Promise<string> {
  const { stable, live } = await buildGuideContextParts(tripId, opts);
  return stable && live ? `${stable}\n\n${live}` : stable;
}

/**
 * The Guide for Scout in two parts. "stable" is the plan itself — the same for everyone until her copy is
 * read again or someone adds a plan — so it's cached and costs a tenth to reuse. "live" is what depends on
 * this moment or this phone (deadline statuses now, who is in the air now, when Wander last read it in the
 * asker's own clock); it goes after the cached part. Mixed together, every question re-stored the whole
 * Guide (~64,000 tokens at 1.25x).
 */
export interface GuideContextParts {
  stable: string;
  live: string;
  // The same text, line by line, each with where it came from — what Scout's citations point at
  stableLines: ContextLine[];
  liveLines: ContextLine[];
  copy: string | null;   // which copy of her Guide these came from ("Japan Oct 2026-2")
}

export async function buildGuideContextParts(tripId: string, opts: { phoneZone?: string; now?: Date } = {}): Promise<GuideContextParts> {
  const [trip, snapshot, items, stays, days, ideas, notes] = await Promise.all([
    prisma.trip.findUnique({ where: { id: tripId }, select: { name: true, startDate: true, endDate: true, timeZone: true } }),
    prisma.guideSnapshot.findFirst({ where: { tripId, status: "current" }, orderBy: { importedAt: "desc" }, select: { id: true, sourceName: true, importedAt: true } }),
    prisma.guideItem.findMany({ where: { tripId }, orderBy: [{ date: "asc" }, { time: "asc" }, { sortOrder: "asc" }] }),
    prisma.accommodation.findMany({ where: { tripId }, include: { city: { select: { name: true } } }, orderBy: { checkInDate: "asc" } }),
    prisma.day.findMany({ where: { tripId }, include: { city: { select: { name: true } } }, orderBy: { date: "asc" } }),
    prisma.experience.findMany({
      where: { tripId, sheetRowRef: { not: null } },
      include: { city: { select: { name: true } }, interests: { select: { displayName: true } }, day: { select: { date: true } } },
    }),
    prisma.sheetNote.findMany({ where: { tripId }, orderBy: [{ tabName: "asc" }, { rowIndex: "asc" }], select: { tabName: true, text: true, rowIndex: true } }),
  ]);
  if (!trip || !snapshot) return { stable: "", live: "", stableLines: [], liveLines: [], copy: null };

  // Every line carries its source (sources.ts). A heading or an instruction to Scout has none.
  const out: ContextLine[] = [];
  const live: ContextLine[] = [];
  const say = (to: ContextLine[], text: string, src: SourceView | null = null) => { to.push({ text, src }); };
  const tabs = await tabsOfCopy(snapshot.id);
  const partOf = (i: (typeof items)[number]): SourcePart => ({ label: i.source, cells: cellsOfItem(i, tabs) });
  const worked = (what: string, from: SourcePart[]): SourceView => ({ type: "wander", what, from });
  // Wander's own notes in a line's detail — listed apart from her words
  const WANDER_DETAIL = /^(Tabs differ:|Time from the |The .+ tab lists |Wander matched |Still open in the Guide|Worked out from:)/;
  say(out, `TRIP: ${trip.name}, ${ymd(trip.startDate)} to ${ymd(trip.endDate)}. Local time zone in Japan: ${trip.timeZone || "Asia/Tokyo"}.`,
    worked("The trip's dates, from the first and last days in her Guide", []));
  // Written out already in the phone's own time zone, as every Wander screen shows it
  let readWords = snapshot.importedAt.toISOString().slice(0, 10);
  try {
    readWords = snapshot.importedAt.toLocaleString("en-US", { timeZone: opts.phoneZone || trip.timeZone || "Asia/Tokyo", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { /* unknown zone: keep the plain date */ }
  const copyNote = worked(`Which copy of her Guide Wander read ("${snapshot.sourceName.replace(/\.xlsx$/i, "")}") and when`, []);
  say(out, `Wander's copy of Larisa's Guide: "${snapshot.sourceName.replace(/\.xlsx$/i, "")}" (when Wander last read it is under RIGHT NOW, with their latest message). Larisa keeps the Guide; it may have changed since.`, copyNote);
  // What depends on the moment or the asker's phone goes in "live", after the cached part — so the Guide
  // itself stays byte-for-byte the same across people and hours, and is read from cache (a tenth of the price)
  say(live, `Wander last read Larisa's Guide ${readWords} (the phone's own time; say it exactly like that).`, copyNote);

  // Who is on this trip in Wander (People shows the same list) — the Guide's travelers, plus anyone let in
  const [members, pending] = await Promise.all([
    prisma.tripMember.findMany({ where: { tripId }, include: { traveler: { select: { displayName: true } } } }),
    prisma.tripInvite.findMany({ where: { tripId, claimedAt: null }, select: { expectedName: true } }),
  ]);
  const memberNames = members.map((m) => m.traveler.displayName);
  const waiting = Array.from(new Set(pending.map((p) => p.expectedName).filter((n): n is string => !!n && !memberNames.includes(n))));
  say(out, `PEOPLE ON THIS TRIP IN WANDER (the People screen shows the same): ${memberNames.join(", ")}${waiting.length ? `; invited, hasn't opened their link yet: ${waiting.join(", ")}` : ""}. The Guide's traveling group may be smaller — say so when it matters.`,
    worked("Who is on this trip in Wander (the People screen)", []));

  // A hotel's line: her hotel cell, and the check-in and check-out lines for that hotel (her rows, her
  // pasted confirmations, the booking screenshots) — each already pinned to its cell at import
  const stayParts = (s: (typeof stays)[number]): SourcePart[] => {
    const first = s.name.toLowerCase().split(" ")[0];
    const own = items.filter((i) => ["checkin", "checkout"].includes(i.kind) && (i.sourceRef === s.sheetRowRef
      || (i.title.toLowerCase().includes(first) && i.date && s.checkInDate && s.checkOutDate && i.date >= s.checkInDate && i.date <= s.checkOutDate)));
    return [
      ...(s.sheetRowRef ? [{ label: `${s.name} — her hotel row`, cells: wordsAt([s.sheetRowRef], tabs) }] : []),
      ...own.map(partOf),
    ];
  };
  const stayCells = (s: (typeof stays)[number]) => stayParts(s).flatMap((p) => p.cells);

  say(out, "\nWHERE EVERYONE SLEEPS (from the Guide):");
  for (const s of stays) {
    // Spell out the nights: "Oct 18–21" is easy to misread as including the 21st
    const nightList: string[] = [];
    if (s.checkInDate && s.checkOutDate) {
      for (let d = new Date(s.checkInDate); d < s.checkOutDate; d.setUTCDate(d.getUTCDate() + 1)) nightList.push(ymd(d));
    }
    // Each couple's own booking at this hotel, when they differ ("Ken & Larisa from Oct 13, Julie & Andy from Oct 14")
    const own = items.filter((i) => i.kind === "checkin" && i.forWhom && !/^everyone$/i.test(i.forWhom) && i.date && s.checkInDate && s.checkOutDate
      && i.date >= s.checkInDate && i.date < s.checkOutDate && i.title.toLowerCase().includes(s.name.toLowerCase().split(" ")[0]));
    const parts = [
      `${s.name} (${s.city.name})`,
      nightList.length ? `sleeping there the nights of ${nightList.join(", ")}; check out the morning of ${ymd(s.checkOutDate)}` : `dates not given`,
      own.length > 1 ? `SEPARATE BOOKINGS — ${own.map((i) => `${i.forWhom}: first night ${ymd(i.date)}${i.confirmation ? ` (confirmation ${i.confirmation})` : ""}`).join("; ")}. Never give one couple the other's dates` : null,
      s.checkInTime ? `check-in ${s.checkInTime}` : null,
      s.checkOutTime ? `check-out ${s.checkOutTime}` : null,
      s.forWhom ? `for ${s.forWhom}` : null,
      s.confirmationNumber ? `confirmation ${s.confirmationNumber}` : null,
      s.address ? `address ${s.address}` : null,
      s.notes ? `notes: ${s.notes}` : null,
    ].filter(Boolean);
    const sepNote = own.length > 1 ? ["Each couple's first night comes from their own booking"] : [];
    say(out, `- ${parts.join("; ")}`, { type: "guide", label: s.name, cells: dedupeCells(stayCells(s)), ...(sepNote.length ? { wanderNotes: sepNote } : {}) });
  }
  // Nights where the Guide lists more than one place — an open question, not an error
  const byNight = new Map<string, string[]>();
  for (const s of stays) {
    if (!s.checkInDate || !s.checkOutDate) continue;
    for (let d = new Date(s.checkInDate); d < s.checkOutDate; d.setUTCDate(d.getUTCDate() + 1)) {
      const k = ymd(d);
      byNight.set(k, [...(byNight.get(k) || []), s.name]);
    }
  }
  const doubled = Array.from(byNight.entries()).filter(([, v]) => v.length > 1);
  if (doubled.length) {
    say(out, "OPEN QUESTION in the Guide: more than one place is listed for these nights — say both, and that it's still being worked out. This holds for EVERYTHING that depends on it: where they sleep, check-in, the next morning's check-out time, bags, where to leave from. Never quietly assume one (say 'whichever of the two you're in'; a check-out time or code belongs only to its own hotel):");
    for (const [night, names] of doubled) {
      say(out, `  ${night}: ${names.join(" and ")}`, worked(`Her Guide lists more than one place for the night of ${night}`,
        stays.filter((s) => names.includes(s.name)).map((s) => ({ label: s.name, cells: dedupeCells(stayCells(s)) }))));
    }
  }

  const choices = await prisma.dayChoice.findMany({ where: { tripId }, include: { traveler: { select: { displayName: true } } }, orderBy: { createdAt: "asc" } });
  const choicesByDate = new Map<string, typeof choices>();
  for (const c of choices) choicesByDate.set(c.date, [...(choicesByDate.get(c.date) || []), c]);

  say(out, "\nDAY BY DAY (from the Guide; times are local; 'For' says who it applies to; lines marked ADDED IN WANDER are the group's own same-day plans, not Larisa's):");
  const itemsByDate = new Map<string, typeof items>();
  for (const i of items) {
    const k = ymd(i.date) || "undated";
    itemsByDate.set(k, [...(itemsByDate.get(k) || []), i]);
  }
  // Who hasn't reached Japan yet on each Japan date, said on that date itself — Scout told Julie "the 13th is
  // the day you and Andy are in the air" (Japan's Oct 13 is before they leave home; they fly on California's)
  const tripZoneForDays = trip.timeZone || "Asia/Tokyo";
  const arrivals = items
    .filter((f) => f.kind === "flight" && !/^Land at/i.test(f.title) && f.time && f.date && f.forWhom && !/^everyone$/i.test(f.forWhom)
      && (f.timeZone || tripZoneForDays) !== tripZoneForDays)
    .map((f) => {
      const departs = zonedMoment(ymd(f.date), toMin(f.time), f.timeZone || tripZoneForDays);
      return { who: f.forWhom!, departs, departJapanDay: departs.toLocaleDateString("en-CA", { timeZone: tripZoneForDays }), flight: f };
    });
  for (const d of days) {
    const k = ymd(d.date);
    // The day's heading: the city is where her Itinerary puts that night
    const nightHere = stays.find((s) => s.checkInDate && s.checkOutDate && ymd(s.checkInDate) <= k && k < ymd(s.checkOutDate));
    say(out, `${weekday(k)} (${k}) — ${d.city.name}${d.dayType === "guided" ? ", with Backroads" : ""}`,
      worked("Which city Wander files this day under, from her Itinerary", nightHere ? [{ label: nightHere.name, cells: dedupeCells(stayCells(nightHere)) }] : []));
    for (const a of arrivals) {
      if (k < a.departJapanDay) {
        // This Japan date on their own clock, spelled out: with only "still at home" Scout still told Julie
        // "Oct 13 is the day you're still flying" (Japan's Oct 13 ends at 8 AM on California's Oct 13, before she leaves)
        const homeZone = a.flight.timeZone || tripZoneForDays;
        const dayStarts = zonedMoment(k, 0, tripZoneForDays);
        const dayEnds = new Date(dayStarts.getTime() + 24 * 3600_000);
        say(out, `  - [WHERE: on this Japan date ${a.who} are NOT in Japan and NOT traveling — still at home the whole day. On their own clock this Japan date runs ${momentWords(dayStarts, homeZone)} to ${momentWords(dayEnds, homeZone)}, all before their flight takes off (${momentWords(a.departs, homeZone)} = ${momentWords(a.departs, tripZoneForDays)}). Nothing in Japan on this date can include them, and never call this date a day they fly or are flying]`,
          worked(`${a.who} are still at home on this Japan date — worked out from their flight's departure, ${momentWords(a.departs, tripZoneForDays)}`, [partOf(a.flight)]));
      }
    }
    // Mornings when two places from an open night both "check out": the time and code belong to one of them only
    const leavingHere = stays.filter((s) => ymd(s.checkOutDate) === k);
    const noOwner = ownerlessInSplit(itemsByDate.get(k) || []);
    // A check-out time is the latest they can leave, not when they will: "8:30 AM meet Backroads,
    // noon check out" once read as a timeline. Say so where anything the same day comes before it
    // (Home and Now show "Morning" for the same case — lib/guideDisplay.ts checkoutBeforeFirst).
    const earliestOther = (itemsByDate.get(k) || [])
      .filter((x) => x.time && !["checkout", "checkin", "deadline", "weather", "stop"].includes(x.kind) && !(x.kind === "flight" && /^Land at/i.test(x.title)))
      .map((x) => x.time!).sort()[0];
    for (const i of itemsByDate.get(k) || []) {
      const openCheckout = i.kind === "checkout" && leavingHere.length > 1
        ? `[OPEN QUESTION: the night before, the Guide lists ${leavingHere.map((s) => s.name).join(" and ")}. This time/code is ${i.title.replace(/^Check out · /, "")}'s only; say "check out of whichever you're in" and give each hotel's own details]`
        : null;
      const parts = [
        i.time ? `${i.time}${i.endTime ? `–${i.endTime}` : ""}` : "(no time given)",
        i.timeText ? `[as she wrote the time: "${i.timeText}"]` : null,
        i.kind === "block" ? "[a block of Larisa's DETAILED PLAN for this day — from the tab named in its source]" : null,
        i.timeZone && i.timeZone !== (trip.timeZone || "Asia/Tokyo") ? `[${i.timeZone} time]` : null,
        `${i.kind}: ${i.title}`,
        i.detail ? `— ${i.detail}` : null,
        i.place ? `at ${i.place}` : null,
        i.forWhom ? `For ${i.forWhom}` : null,
        i.kind === "checkout" && i.time && earliestOther && earliestOther < i.time
          ? `[${clockOf(toMin(i.time))} is the hotel's LATEST check-out, not when they check out: this day's plan already has a line at ${clockOf(toMin(earliestOther))}. Never list check-out as a ${clockOf(toMin(i.time))} step after that line; say "the hotel's check-out is by ${clockOf(toMin(i.time))}", and if a plan line says when she has them checking out, give that line's time as hers]`
          : null,
        noOwner.has(i.id) ? "[WHOSE: NOT STATED — the group is split at this time and this line names no one. Never say or imply which group it belongs to, and never list it as part of anyone's track or plan; say her tab doesn't say whose it is]" : null,
        i.confirmation ? `Confirmation ${i.confirmation}` : null,
        openCheckout,
        i.kind === "weather" ? `[her forecast for every day ${i.windowStart || k} through ${k}]` : i.kind === "stop" ? `[Wander's screens call this "Larisa's note for the ${d.city.name} stay" — it's her heading for the whole stay, ${i.windowStart} through ${k}; it doesn't say which day. Her other notes (on hotel rows, in the Notes column) are separate notes — quote each exactly and never add to them]` : i.windowStart ? `[can be done any day from ${i.windowStart} through ${k}]` : null,
        `(source: ${i.source})`,
      ].filter(Boolean);
      // Wander's own notes on this line, in plain words — shown apart from her words, never as hers
      const notesOnLine = [
        ...(i.detail || "").split("\n").filter((l) => WANDER_DETAIL.test(l)),
        i.kind === "checkout" && i.time && earliestOther && earliestOther < i.time
          ? `${clockOf(toMin(i.time))} is the hotel's latest check-out; her plan for the day already has something at ${clockOf(toMin(earliestOther))}` : null,
        noOwner.has(i.id) ? "The group is split at this time, and her line names no one" : null,
        openCheckout ? `The night before, her Guide lists two places (${leavingHere.map((s) => s.name).join(" and ")}); this is ${i.title.replace(/^Check out · /, "")}'s own` : null,
        i.kind === "weather" ? `Her forecast is for every day ${i.windowStart || k} through ${k}` : null,
        i.kind !== "weather" && i.kind !== "stop" && i.windowStart ? `Can be done any day from ${i.windowStart} through ${k}` : null,
      ].filter((n): n is string => !!n);
      say(out, `  - ${parts.join(" ")}`, { type: "guide", label: i.source, cells: cellsOfItem(i, tabs), ...(notesOnLine.length ? { wanderNotes: notesOnLine } : {}) });
    }
    for (const c of choicesByDate.get(k) || []) {
      say(out, `  - ${c.time || "(no time given)"} ADDED IN WANDER by ${c.traveler.displayName} (not in the Guide): ${c.text}`,
        { type: "added", by: c.traveler.displayName, text: c.text });
    }
  }
  // Every deadline's status at this moment, worked out here — Scout once read a cancellation policy
  // itself and told Larisa free cancellation ended "tonight" when the 60% charge had already begun
  if (opts.now) {
    const zone = trip.timeZone || "Asia/Tokyo";
    const lines: ContextLine[] = [];
    // The same moment on the asker's own clock, when their phone isn't on Japan's (say both)
    const phoneWords = (at: Date) => {
      const pz = opts.phoneZone;
      if (!pz || pz === zone) return "";
      try {
        const mine = at.toLocaleString("en-US", { timeZone: pz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        const theirs = at.toLocaleString("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" });
        if (mine.endsWith(theirs)) return "";
        return ` = ${mine} on the asker's own clock (${pz}) — say both`;
      } catch { return ""; }
    };
    for (const i of items.filter((x) => x.kind === "deadline" && x.date)) {
      const last = ymd(i.date);
      // Its own time: the time field, else a time in its words ("…free cancellation ends 3:00 PM Kyoto
      // time"), as the screens read it — else the end of the day. (A bare end-of-day once told Scout
      // the Four Seasons cutoff was 11:59 PM when her booking says 3:00 PM.)
      const said = `${i.title} ${i.detail || ""}`.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)\b/i) || `${i.title} ${i.detail || ""}`.match(/\b(\d{1,2})()\s*(am|pm)\b/i);
      const saidMin = said ? ((Number(said[1]) % 12) + (/pm/i.test(said[3]) ? 12 : 0)) * 60 + Number(said[2] || 0) : null;
      const timeMin = i.time ? Number(i.time.slice(0, 2)) * 60 + Number(i.time.slice(3, 5)) : saidMin;
      const end = zonedMoment(last, timeMin ?? 23 * 60 + 59, zone);
      const start = i.windowStart ? zonedMoment(i.windowStart, 0, zone) : null;
      const status = opts.now > end
        ? "PASSED — it's over; say so gently"
        : start && opts.now < start
        ? `NOT OPEN YET — it can be done from ${i.windowStart} through ${last}`
        : timeMin !== null
        ? `OPEN NOW — last chance ${last} at ${clockOf(timeMin)} ${zone === "Asia/Tokyo" ? "Japan time" : zone}${phoneWords(end)}`
        : `OPEN NOW — last chance ${last}, by the end of that day ${zone === "Asia/Tokyo" ? "in Japan" : `(${zone})`} — NO TIME IS GIVEN, so never state one${phoneWords(end)}`;
      say(lines, `  - ${i.title}${i.forWhom ? ` (For ${i.forWhom})` : ""}: ${status}`,
        worked(`Whether "${i.title}" is still open, worked out from its date${timeMin !== null ? " and time" : ""} and the time on the phone`, [partOf(i)]));
    }
    if (lines.length) {
      say(live, "DEADLINES — STATUS RIGHT NOW (already worked out from the phone's clock; for anything about cancelling, charges or reconfirming, use ONLY these — never work out a policy's dates yourself):");
      live.push(...lines);
    }
  }

  // When each party is in the air, worked out here in both zones. A prompt rule alone once let Scout say
  // Julie & Andy were "still in the air" at 8 PM Oct 13 Japan time — 4 AM in California, eight hours
  // before their noon departure.
  const tripZone = trip.timeZone || "Asia/Tokyo";
  const windows: ContextLine[] = [];
  const travelNow: ContextLine[] = [];
  for (const f of items) {
    if (f.kind !== "flight" || /^Land at/i.test(f.title) || !f.time || !f.date) continue;
    const departZone = f.timeZone || tripZone;
    const departs = zonedMoment(ymd(f.date), toMin(f.time), departZone);
    const land = (f.detail || "").match(/Lands at ([^\n]+?) \w{3}, (\w{3}) (\d{1,2}), (\d{1,2}):(\d{2}) (AM|PM) (California|Japan) time/i);
    let lands: Date | null = null, landZone = tripZone, landPlace = "";
    if (land) {
      landZone = /california/i.test(land[7]) ? "America/Los_Angeles" : "Asia/Tokyo";
      const mins = ((Number(land[4]) % 12) + (/pm/i.test(land[6]) ? 12 : 0)) * 60 + Number(land[5]);
      const month = MONTHS[land[2].toLowerCase().slice(0, 3)];
      lands = month ? zonedMoment(`${ymd(f.date).slice(0, 4)}-${String(month).padStart(2, "0")}-${land[3].padStart(2, "0")}`, mins, landZone) : null;
      landPlace = land[1];
    }
    const other = departZone === "Asia/Tokyo" ? "America/Los_Angeles" : "Asia/Tokyo";
    const who = f.forWhom || "(the Guide doesn't say who)";
    const parts = [`- ${who} — ${f.title}: departs ${momentWords(departs, departZone)} (= ${momentWords(departs, other)})`];
    if (lands) parts.push(`lands at ${landPlace} ${momentWords(lands, landZone)} (= ${momentWords(lands, landZone === "Asia/Tokyo" ? "America/Los_Angeles" : "Asia/Tokyo")})`);
    parts.push(`IN THE AIR only between those two moments; before departure they are NOT traveling yet${lands ? "; after landing they are at the destination" : ""}`);
    // The whole Japan calendar day before a Japan-bound departure, said outright: Scout once told Julie
    // "on the 13th you and Andy are still flying" — on Japan's Oct 13 they hadn't left home
    if (lands && landZone === tripZone && departZone !== tripZone) {
      const departJapanDay = departs.toLocaleDateString("en-CA", { timeZone: tripZone });
      const dayBefore = new Date(`${departJapanDay}T00:00:00Z`);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      const dayBeforeWords = dayBefore.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
      parts.push(`on Japan's ${dayBeforeWords} and every Japan day before it, ${who} are NOT traveling — they are still at home; the flight takes off ${momentWords(departs, tripZone)}`);
    }
    if (opts.now) {
      // Worked out from the timetable only — Wander has no live flight status, so after take-off time the
      // words say what the schedule says, never that it happened ("Yes — their flight has landed" was said
      // to Larisa at 5:30 PM on a flight due at 3:00 PM; a delay would have made it false)
      const landWords = lands ? `${landPlace} ${momentWords(lands, landZone)}` : "";
      const status = opts.now < departs
        ? `hasn't left yet — scheduled to take off ${momentWords(departs, departZone)}`
        : lands && opts.now < lands
        ? `should be in the air by its schedule (took off ${momentWords(departs, departZone)} if on time; due to land at ${landWords}). Wander can't see the real flight, so say "should be in the air" and "due to land", never that it certainly took off`
        : lands && opts.now.getTime() < lands.getTime() + 12 * 3600_000
        ? `was due to land at ${landWords} by its schedule. Wander can't see whether it landed or was late, so say "was due to land at …" (or "should have landed by now"), never "has landed"`
        : lands
        ? `landed — it was due at ${landWords}, more than 12 hours ago`
        : `was due to take off ${momentWords(departs, departZone)} by its schedule; Wander can't see the real flight`;
      say(travelNow, `- ${who} — ${f.title}: ${status}`, worked(`Where ${f.title} should be right now by its schedule, from its times and the time on the phone (Wander can't see the real flight)`, [partOf(f)]));
    }
    say(windows, parts.join("; "), worked(`${f.title}'s departure and landing in both Japan and California time, worked out from her flight details`, [partOf(f)]));
  }
  if (windows.length) {
    say(out, "\nTRAVEL WINDOWS (worked out from the Guide's flights in both zones — before saying anyone is traveling, in the air, or somewhere at a given moment, compare THAT moment with these; where each flight stands right now is under RIGHT NOW, with their latest message):");
    out.push(...windows);
  }

  // The leave-for-the-airport estimate Wander's screens show — one number everywhere
  const estimates: ContextLine[] = [];
  for (const f of items) {
    if (f.kind !== "flight" || /^Land at/i.test(f.title) || !f.time || !f.date) continue;
    const code = (f.title.match(/\b([A-Z]{3})\b/) || [])[1];
    const cityName = days.find((d) => ymd(d.date) === ymd(f.date))?.city.name || "";
    const cityKey = Object.keys(TO_AIRPORT).find((c) => cityName.toLowerCase().includes(c));
    const travel = code && cityKey ? TO_AIRPORT[cityKey][code] : undefined;
    if (travel === undefined) continue;
    // Her own plan for getting to the airport that day (the Haruka, a transfer) replaces Wander's estimate
    const herPlan = items.filter((b) => ymd(b.date) === ymd(f.date) && (b.kind === "block" || /haruka|transfer/i.test(b.detail || ""))
      && /haruka|airport|\bKIX\b|transfer|station/i.test(`${b.title} ${b.detail || ""}`));
    if (herPlan.length) {
      say(estimates, `- ${weekday(ymd(f.date))}: Larisa's Guide has its own plan for getting to the airport — use HER plan (the DAY BY DAY lines for this date, with their tabs), not an estimate. If her tabs disagree on a time (e.g. the Itinerary tab's note vs the day's tab), say both with their tabs.`,
        worked(`Her own plan for getting to the airport on ${weekday(ymd(f.date))}`, herPlan.map(partOf)));
      continue;
    }
    const [h, m] = f.time.split(":").map(Number);
    const leave = Math.floor((h * 60 + m - 150 - travel) / 5) * 5;
    say(estimates, `- ${weekday(ymd(f.date))}: ${f.title} at ${clockOf(h * 60 + m)} → leave ${cityName} for ${AIRPORT_WORDS[code!] || code} by about ${clockOf(leave)} (about ${travel} min to the airport + 2 hr 30 min there for an international flight). This is WANDER'S OWN ESTIMATE, shown on Home and Now; if asked, give this same time, say it's an estimate, and add how you'd get there if useful.`,
      worked(`Wander's estimate of when to leave for the airport: the flight's time, less about ${travel} minutes to ${AIRPORT_WORDS[code!] || code} and 2½ hours there. Not in her Guide`, [partOf(f)]));
  }
  if (estimates.length) { say(out, "\nLEAVING FOR THE AIRPORT (Wander's estimate, not the Guide):"); out.push(...estimates); }

  const undated = itemsByDate.get("undated") || [];
  if (undated.length) {
    say(out, "Undated notes:");
    for (const i of undated) say(out, `  - ${i.title}${i.detail ? ` — ${i.detail}` : ""} (source: ${i.source})`, { type: "guide", label: i.source, cells: cellsOfItem(i, tabs) });
  }

  if (ideas.length) {
    say(out, "\nIDEAS LARISA RESEARCHED (Activities tab; 'interested' = who marked it; a day means it's placed on that day):");
    for (const e of ideas) {
      const who = e.interests.map((x) => x.displayName).join(", ");
      const removed = (e.sheetRowRef || "").startsWith("Removed from Guide|");
      say(out, `- ${e.name} (${e.city?.name || "?"})${removed ? " [NO LONGER IN LARISA'S GUIDE — kept in Wander because people wrote on it]" : ""}${e.day ? ` on ${ymd(e.day.date)}` : ""}${who ? ` — interested: ${who}` : ""}${e.description ? ` — ${e.description.slice(0, 200)}` : ""}`,
        removed
          ? worked(`${e.name} is no longer in her Guide; Wander kept it because people wrote on it`, [])
          : { type: "guide", label: `${e.name} — her Activities tab`, cells: wordsAt([ideaRef(e.sheetRowRef || "", tabs)].filter((r): r is string => !!r), tabs),
              ...(who ? { wanderNotes: [`Marked in Wander as interesting to ${who}`] } : {}) });
    }
  }

  if (notes.length) {
    say(out, "\nTHE GUIDE'S OTHER TABS (Larisa's own text, including pasted emails and picture summaries):");
    let budget = 30000;
    let lastTab = "";
    for (const n of notes) {
      const line = `${n.tabName !== lastTab ? `\n[${n.tabName}]\n` : ""}${n.text}`;
      if (budget - line.length < 0) { say(out, "\n(…more in the Guide's tabs; Larisa's sheet has the rest)"); break; }
      // A text row is her row in that tab; a picture summary is Wander's reading of her picture
      const tab = tabs.find((t) => t.name === n.tabName);
      const picture = n.rowIndex >= 100000 ? tab?.images[n.rowIndex - 100000] : undefined;
      say(out, line, picture
        ? worked(`Wander's reading of a picture in her ${n.tabName} tab`, [{ label: `A picture in her ${n.tabName} tab`, cells: [{ kind: "picture", tab: n.tabName, anchor: picture.anchor, sha256: picture.sha256 }] }])
        : { type: "guide", label: `Her ${n.tabName} tab`, cells: wordsAt([`${n.tabName}!${n.rowIndex}`], tabs) });
      budget -= line.length;
      lastTab = n.tabName;
    }
  }
  if (travelNow.length) { say(live, "FLIGHTS — WHERE EACH STANDS RIGHT NOW BY ITS SCHEDULE (worked out from the time on the phone; there is no live flight tracking):"); live.push(...travelNow); }
  const text = (lines: ContextLine[]) => lines.map((l) => l.text).join("\n");
  return { stable: text(out), live: text(live), stableLines: out, liveLines: live, copy: snapshot.sourceName.replace(/\.xlsx$/i, "") };
}

/** The same cell listed once */
function dedupeCells<T extends { kind: string }>(cells: T[]): T[] {
  const seen = new Set<string>();
  return cells.filter((c) => {
    const x = c as any;
    const key = `${x.kind}|${x.tab}|${x.a1 || ""}|${x.sha256 || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
