/**
 * What Scout knows about the trip before anyone asks: Larisa's Guide, as Wander read it.
 *
 * Built fresh for each question from the current Guide reading (it's small — a few dozen items,
 * ten hotels, some ideas and the text of the Guide's other tabs), so Scout answers from the same
 * facts every Wander screen shows, and can quote where each came from.
 */

import prisma from "../db.js";

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

export async function buildGuideContext(tripId: string, opts: { phoneZone?: string; now?: Date } = {}): Promise<string> {
  const [trip, snapshot, items, stays, days, ideas, notes] = await Promise.all([
    prisma.trip.findUnique({ where: { id: tripId }, select: { name: true, startDate: true, endDate: true, timeZone: true } }),
    prisma.guideSnapshot.findFirst({ where: { tripId, status: "current" }, orderBy: { importedAt: "desc" }, select: { sourceName: true, importedAt: true } }),
    prisma.guideItem.findMany({ where: { tripId }, orderBy: [{ date: "asc" }, { time: "asc" }, { sortOrder: "asc" }] }),
    prisma.accommodation.findMany({ where: { tripId }, include: { city: { select: { name: true } } }, orderBy: { checkInDate: "asc" } }),
    prisma.day.findMany({ where: { tripId }, include: { city: { select: { name: true } } }, orderBy: { date: "asc" } }),
    prisma.experience.findMany({
      where: { tripId, sheetRowRef: { not: null } },
      include: { city: { select: { name: true } }, interests: { select: { displayName: true } }, day: { select: { date: true } } },
    }),
    prisma.sheetNote.findMany({ where: { tripId }, orderBy: [{ tabName: "asc" }, { rowIndex: "asc" }], select: { tabName: true, text: true } }),
  ]);
  if (!trip || !snapshot) return "";

  const out: string[] = [];
  out.push(`TRIP: ${trip.name}, ${ymd(trip.startDate)} to ${ymd(trip.endDate)}. Local time zone in Japan: ${trip.timeZone || "Asia/Tokyo"}.`);
  // Written out already in the phone's own time zone, as every Wander screen shows it
  let readWords = snapshot.importedAt.toISOString().slice(0, 10);
  try {
    readWords = snapshot.importedAt.toLocaleString("en-US", { timeZone: opts.phoneZone || trip.timeZone || "Asia/Tokyo", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { /* unknown zone: keep the plain date */ }
  out.push(`Wander's copy of Larisa's Guide: "${snapshot.sourceName.replace(/\.xlsx$/i, "")}", last read ${readWords} (the phone's own time; say it exactly like that). Larisa keeps the Guide; it may have changed since.`);

  // Who is on this trip in Wander (People shows the same list) — the Guide's travelers, plus anyone let in
  const [members, pending] = await Promise.all([
    prisma.tripMember.findMany({ where: { tripId }, include: { traveler: { select: { displayName: true } } } }),
    prisma.tripInvite.findMany({ where: { tripId, claimedAt: null }, select: { expectedName: true } }),
  ]);
  const memberNames = members.map((m) => m.traveler.displayName);
  const waiting = Array.from(new Set(pending.map((p) => p.expectedName).filter((n): n is string => !!n && !memberNames.includes(n))));
  out.push(`PEOPLE ON THIS TRIP IN WANDER (the People screen shows the same): ${memberNames.join(", ")}${waiting.length ? `; invited, hasn't opened their link yet: ${waiting.join(", ")}` : ""}. The Guide's traveling group may be smaller — say so when it matters.`);

  out.push("\nWHERE EVERYONE SLEEPS (from the Guide):");
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
    out.push(`- ${parts.join("; ")}`);
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
    out.push("OPEN QUESTION in the Guide: more than one place is listed for these nights — say both, and that it's still being worked out. This holds for EVERYTHING that depends on it: where they sleep, check-in, the next morning's check-out time, bags, where to leave from. Never quietly assume one (say 'whichever of the two you're in'; a check-out time or code belongs only to its own hotel):");
    for (const [night, names] of doubled) out.push(`  ${night}: ${names.join(" and ")}`);
  }

  const choices = await prisma.dayChoice.findMany({ where: { tripId }, include: { traveler: { select: { displayName: true } } }, orderBy: { createdAt: "asc" } });
  const choicesByDate = new Map<string, typeof choices>();
  for (const c of choices) choicesByDate.set(c.date, [...(choicesByDate.get(c.date) || []), c]);

  out.push("\nDAY BY DAY (from the Guide; times are local; 'For' says who it applies to; lines marked ADDED IN WANDER are the group's own same-day plans, not Larisa's):");
  const itemsByDate = new Map<string, typeof items>();
  for (const i of items) {
    const k = ymd(i.date) || "undated";
    itemsByDate.set(k, [...(itemsByDate.get(k) || []), i]);
  }
  for (const d of days) {
    const k = ymd(d.date);
    out.push(`${weekday(k)} (${k}) — ${d.city.name}${d.dayType === "guided" ? ", with Backroads" : ""}`);
    // Mornings when two places from an open night both "check out": the time and code belong to one of them only
    const leavingHere = stays.filter((s) => ymd(s.checkOutDate) === k);
    const noOwner = ownerlessInSplit(itemsByDate.get(k) || []);
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
        noOwner.has(i.id) ? "[WHOSE: NOT STATED — the group is split at this time and this line names no one. Never say or imply which group it belongs to, and never list it as part of anyone's track or plan; say her tab doesn't say whose it is]" : null,
        i.confirmation ? `Confirmation ${i.confirmation}` : null,
        openCheckout,
        i.kind === "weather" ? `[her forecast for every day ${i.windowStart || k} through ${k}]` : i.kind === "stop" ? `[Wander's screens call this "Larisa's note for the ${d.city.name} stay" — it's her heading for the whole stay, ${i.windowStart} through ${k}; it doesn't say which day. Her other notes (on hotel rows, in the Notes column) are separate notes — quote each exactly and never add to them]` : i.windowStart ? `[can be done any day from ${i.windowStart} through ${k}]` : null,
        `(source: ${i.source})`,
      ].filter(Boolean);
      out.push(`  - ${parts.join(" ")}`);
    }
    for (const c of choicesByDate.get(k) || []) {
      out.push(`  - ${c.time || "(no time given)"} ADDED IN WANDER by ${c.traveler.displayName} (not in the Guide): ${c.text}`);
    }
  }
  // Every deadline's status at this moment, worked out here — Scout once read a cancellation policy
  // itself and told Larisa free cancellation ended "tonight" when the 60% charge had already begun
  if (opts.now) {
    const zone = trip.timeZone || "Asia/Tokyo";
    const lines: string[] = [];
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
      lines.push(`  - ${i.title}${i.forWhom ? ` (For ${i.forWhom})` : ""}: ${status}`);
    }
    if (lines.length) {
      out.push("\nDEADLINES — STATUS RIGHT NOW (already worked out from the phone's clock; for anything about cancelling, charges or reconfirming, use ONLY these — never work out a policy's dates yourself):");
      out.push(...lines);
    }
  }

  // When each party is in the air, worked out here in both zones. A prompt rule alone once let Scout say
  // Julie & Andy were "still in the air" at 8 PM Oct 13 Japan time — 4 AM in California, eight hours
  // before their noon departure.
  const tripZone = trip.timeZone || "Asia/Tokyo";
  const windows: string[] = [];
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
    if (opts.now) {
      const status = opts.now < departs ? "hasn't left yet" : lands && opts.now < lands ? "IN THE AIR" : lands ? "has landed" : "has departed";
      parts.push(`at the moment of this question: ${status}`);
    }
    windows.push(parts.join("; "));
  }
  if (windows.length) {
    out.push("\nTRAVEL WINDOWS (worked out from the Guide's flights in both zones — before saying anyone is traveling, in the air, or somewhere at a given moment, compare THAT moment with these):");
    out.push(...windows);
  }

  // The leave-for-the-airport estimate Wander's screens show — one number everywhere
  const estimates: string[] = [];
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
      estimates.push(`- ${weekday(ymd(f.date))}: Larisa's Guide has its own plan for getting to the airport — use HER plan (the DAY BY DAY lines for this date, with their tabs), not an estimate. If her tabs disagree on a time (e.g. the Itinerary tab's note vs the day's tab), say both with their tabs.`);
      continue;
    }
    const [h, m] = f.time.split(":").map(Number);
    const leave = Math.floor((h * 60 + m - 150 - travel) / 5) * 5;
    estimates.push(`- ${weekday(ymd(f.date))}: ${f.title} at ${clockOf(h * 60 + m)} → leave ${cityName} for ${AIRPORT_WORDS[code!] || code} by about ${clockOf(leave)} (about ${travel} min to the airport + 2 hr 30 min there for an international flight). This is WANDER'S OWN ESTIMATE, shown on Home and Now; if asked, give this same time, say it's an estimate, and add how you'd get there if useful.`);
  }
  if (estimates.length) out.push("\nLEAVING FOR THE AIRPORT (Wander's estimate, not the Guide):", ...estimates);

  const undated = itemsByDate.get("undated") || [];
  if (undated.length) {
    out.push("Undated notes:");
    for (const i of undated) out.push(`  - ${i.title}${i.detail ? ` — ${i.detail}` : ""} (source: ${i.source})`);
  }

  if (ideas.length) {
    out.push("\nIDEAS LARISA RESEARCHED (Activities tab; 'interested' = who marked it; a day means it's placed on that day):");
    for (const e of ideas) {
      const who = e.interests.map((x) => x.displayName).join(", ");
      const removed = (e.sheetRowRef || "").startsWith("Removed from Guide|");
      out.push(`- ${e.name} (${e.city?.name || "?"})${removed ? " [NO LONGER IN LARISA'S GUIDE — kept in Wander because people wrote on it]" : ""}${e.day ? ` on ${ymd(e.day.date)}` : ""}${who ? ` — interested: ${who}` : ""}${e.description ? ` — ${e.description.slice(0, 200)}` : ""}`);
    }
  }

  if (notes.length) {
    out.push("\nTHE GUIDE'S OTHER TABS (Larisa's own text, including pasted emails and picture summaries):");
    let budget = 30000;
    let lastTab = "";
    for (const n of notes) {
      const line = `${n.tabName !== lastTab ? `\n[${n.tabName}]\n` : ""}${n.text}`;
      if (budget - line.length < 0) { out.push("\n(…more in the Guide's tabs; Larisa's sheet has the rest)"); break; }
      out.push(line);
      budget -= line.length;
      lastTab = n.tabName;
    }
  }
  return out.join("\n");
}
