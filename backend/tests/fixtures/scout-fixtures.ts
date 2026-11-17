/**
 * Made-up trips for Scout's context tests (S2b, Nov 17 2026): one read from a spreadsheet and set in Japan, one built
 * from a plan across Vietnam, Cambodia and Japan. Names are fixed (not tagged per run) so the text Scout is given is the
 * same on every run and a hash of it means something. Nothing here is the real plan.
 */
import type { PrismaClient } from "@prisma/client";

const at0 = (s: string) => new Date(`${s}T00:00:00Z`);
// (each trip has its own two people: test files run side by side against one database)
export const NAMES_OF = { japan: { a: "Pat Hashjp", b: "Sam Hashjp" }, plan: { a: "Pat Hashplan", b: "Sam Hashplan" } };
export const TRIP_NAMES = { japan: "Hashtest Japan Trip", plan: "Hashtest Plan Trip" };

export async function cleanFixtures(prisma: PrismaClient, which: "japan" | "plan") {
  const NAMES = NAMES_OF[which];
  const trips = await prisma.trip.findMany({ where: { name: TRIP_NAMES[which] }, select: { id: true } });
  const ids = trips.map((t) => t.id);
  await prisma.tripExpense.deleteMany({ where: { tripId: { in: ids } } });
  await prisma.dayChoice.deleteMany({ where: { tripId: { in: ids } } });
  await prisma.sampleEntry.deleteMany({ where: { tripId: { in: ids } } });
  await prisma.accommodation.deleteMany({ where: { tripId: { in: ids } } });
  await prisma.day.deleteMany({ where: { tripId: { in: ids } } });
  await prisma.guideItem.deleteMany({ where: { tripId: { in: ids } } });
  await prisma.guideSnapshot.deleteMany({ where: { tripId: { in: ids } } });
  await prisma.city.deleteMany({ where: { tripId: { in: ids } } });
  await prisma.tripMember.deleteMany({ where: { tripId: { in: ids } } });
  await prisma.trip.deleteMany({ where: { id: { in: ids } } });
  await prisma.traveler.deleteMany({ where: { displayName: { in: Object.values(NAMES) } } });
}

type Line = Record<string, unknown> & { date: string; title: string; kind: string };

async function build(prisma: PrismaClient, o: {
  which: "japan" | "plan"; name: string; start: string; end: string; zone: string; kind: string; sourceName: string;
  cities: { key: string; name: string; country: string; zone: string | null; lat?: number; lng?: number }[];
  days: { date: string; city: string; guided?: boolean }[];
  stays: { city: string; name: string; from: string; to: string; address?: string; forWhom?: string }[];
  lines: Line[];
  choices?: { date: string; text: string; time?: string }[];
}) {
  const NAMES = NAMES_OF[o.which];
  const pat = await prisma.traveler.findUnique({ where: { displayName: NAMES.a } }) ?? await prisma.traveler.create({ data: { displayName: NAMES.a } });
  const sam = await prisma.traveler.findUnique({ where: { displayName: NAMES.b } }) ?? await prisma.traveler.create({ data: { displayName: NAMES.b } });
  const trip = await prisma.trip.create({ data: { name: o.name, status: "active", startDate: at0(o.start), endDate: at0(o.end), timeZone: o.zone, datesKnown: true } });
  await prisma.tripMember.create({ data: { tripId: trip.id, travelerId: pat.id, role: "planner" } });
  await prisma.tripMember.create({ data: { tripId: trip.id, travelerId: sam.id, role: "planner" } });
  const snap = await prisma.guideSnapshot.create({ data: {
    tripId: trip.id, sourceName: o.sourceName, sourceKind: o.kind, contentHash: `hashtest-${o.kind}-${Math.random()}`, status: "current", tabs: [] as any, importedBy: "test",
    importedAt: new Date("2026-10-01T12:00:00Z"),
  } });
  const cityId = new Map<string, string>();
  for (const [n, c] of o.cities.entries()) {
    const row = await prisma.city.create({ data: { tripId: trip.id, name: c.name, country: c.country, timeZone: c.zone, sequenceOrder: n, planKey: o.kind === "wander_plan" ? c.key : null, latitude: c.lat ?? null, longitude: c.lng ?? null } });
    cityId.set(c.key, row.id);
  }
  for (const d of o.days) await prisma.day.create({ data: { tripId: trip.id, cityId: cityId.get(d.city)!, date: at0(d.date), dayType: d.guided ? "guided" : "free" } });
  for (const s of o.stays) await prisma.accommodation.create({ data: { tripId: trip.id, cityId: cityId.get(s.city)!, name: s.name, checkInDate: at0(s.from), checkOutDate: at0(s.to), address: s.address ?? null, forWhom: s.forWhom ?? "Everyone", checkInTime: "3:00 pm", checkOutTime: "12:00 pm" } });
  for (const [n, l] of o.lines.entries()) {
    const { date, ...rest } = l;
    await prisma.guideItem.create({ data: { tripId: trip.id, snapshotId: snap.id, sortOrder: n, source: o.kind === "wander_plan" ? "Larisa's notes" : "Itinerary · Notes (row 4)", sourceRef: `${o.kind === "wander_plan" ? "plan:" : "Itinerary!"}line-${n}`, ...(rest as any), date: at0(date) } });
  }
  for (const c of o.choices || []) await prisma.dayChoice.create({ data: { tripId: trip.id, date: c.date, time: c.time ?? null, text: c.text, travelerId: pat.id } });
  return { tripId: trip.id, snapshotId: snap.id, travelers: { pat: pat.id, sam: sam.id }, cities: cityId };
}

const CA = "America/Los_Angeles", JP = "Asia/Tokyo", VN = "Asia/Ho_Chi_Minh", KH = "Asia/Phnom_Penh", KR = "Asia/Seoul", TH = "Asia/Bangkok";

/** A trip read from a spreadsheet, in Japan: Julie-and-Andy-style travelers flying from California on a day before they land */
export function makeJapan(prisma: PrismaClient) {
  return build(prisma, {
    which: "japan", name: TRIP_NAMES.japan, start: "2026-10-13", end: "2026-10-15", zone: JP, kind: "xlsx", sourceName: "A Guide Copy.xlsx",
    cities: [{ key: "tokyo", name: "Tokyo", country: "Japan", zone: null }, { key: "kyoto", name: "Kyoto", country: "Japan", zone: null }],
    days: [{ date: "2026-10-13", city: "tokyo", guided: true }, { date: "2026-10-14", city: "tokyo" }, { date: "2026-10-15", city: "kyoto" }],
    stays: [{ city: "tokyo", name: "Stay J Hotel", from: "2026-10-13", to: "2026-10-15", address: "1 Made Up Street" }, { city: "kyoto", name: "Stay K Inn", from: "2026-10-15", to: "2026-10-16" },
      { city: "tokyo", name: "Stay L Inn", from: "2026-10-14", to: "2026-10-15" }],
    choices: [{ date: "2026-10-14", text: "Ice cream at Place B", time: "16:00" }],
    lines: [
      { date: "2026-10-13", kind: "flight", title: "Flight 1 · San Francisco (SFO) → Tokyo (NRT)", time: "12:00", timeZone: CA, forWhom: "Julie & Andy", detail: "Lands at Narita (NRT) Wed, Oct 14, 3:00 PM Japan time" },
      { date: "2026-10-14", kind: "flight", title: "Land at NRT · Airline", time: "15:00", timeZone: JP, forWhom: "Julie & Andy", detail: "Takes off from San Francisco Tue, 12:00 PM California time" },
      { date: "2026-10-13", kind: "plan", title: "Welcome walk", time: "09:00", forWhom: "Everyone", detail: "Meet in the lobby" },
      { date: "2026-10-14", kind: "plan", title: "A call home", time: "08:00", timeZone: CA, forWhom: "Everyone" },
      { date: "2026-10-14", kind: "plan", title: "Dinner together", time: "18:00", forWhom: "Everyone", place: "Place A" },
      { date: "2026-10-13", kind: "checkin", title: "Check in · Stay J Hotel", time: "15:00", forWhom: "Everyone" },
      { date: "2026-10-15", kind: "checkout", title: "Check out · Stay J Hotel", time: "12:00", forWhom: "Everyone" },
      { date: "2026-10-15", kind: "plan", title: "A morning train", time: "09:30", forWhom: "Everyone" },
      { date: "2026-10-14", kind: "deadline", title: "Reconfirm Stay J", time: "15:00", forWhom: "Everyone", detail: "Free cancellation ends 3:00 PM" },
      { date: "2026-10-20", kind: "deadline", title: "Pay the balance", forWhom: "Everyone" },
      { date: "2026-10-16", kind: "deadline", title: "Stay K (Oct 16): free cancellation ends — 60% charge from this date", forWhom: "Everyone" },
    ],
  });
}

/** A trip built from a plan: Vietnam, Cambodia, then Japan, flown from California through Seoul and Bangkok */
export function makePlan(prisma: PrismaClient) {
  return build(prisma, {
    which: "plan", name: TRIP_NAMES.plan, start: "2026-12-14", end: "2027-01-02", zone: VN, kind: "wander_plan", sourceName: "The plan",
    cities: [
      { key: "city-a", name: "City A", country: "Vietnam", zone: VN, lat: 21.0245, lng: 105.84117 },
      { key: "city-b", name: "City B", country: "Cambodia", zone: KH, lat: 13.3671, lng: 103.8448 },
      { key: "city-c", name: "City C", country: "Japan", zone: JP, lat: 35.6895, lng: 139.69171 },
    ],
    days: [
      { date: "2026-12-14", city: "city-a" }, { date: "2026-12-15", city: "city-a" }, { date: "2026-12-17", city: "city-a" }, { date: "2026-12-20", city: "city-a" },
      { date: "2026-12-25", city: "city-a", guided: true }, { date: "2027-01-01", city: "city-b", guided: true }, { date: "2027-01-02", city: "city-c" },
    ],
    stays: [
      { city: "city-a", name: "Stay A Hotel", from: "2026-12-14", to: "2026-12-26", address: "1 Made Up Street, City A" },
      { city: "city-b", name: "Stay B Resort", from: "2026-12-30", to: "2027-01-01" },
    ],
    choices: [{ date: "2026-12-20", text: "Tea at Place C", time: "16:00" }],
    lines: [
      { date: "2026-12-14", kind: "flight", title: "Flight 1 · San Francisco (SFO) → Seoul (ICN)", time: "11:45", timeZone: CA, forWhom: "Pat & Sam", detail: "Business · XY 1\nLands at Seoul Incheon (ICN) Tue, Dec 15, 5:40 PM Korea time" },
      { date: "2026-12-15", kind: "flight", title: "Land at ICN · Z Air", time: "17:40", timeZone: KR, forWhom: "Everyone", detail: "Takes off from San Francisco Mon, 11:45 AM California time" },
      { date: "2026-12-15", kind: "flight", title: "Flight 2 · Seoul (ICN) → City A (HAN)", time: "18:45", timeZone: KR, forWhom: "Everyone", detail: "Lands at City A (HAN) Tue, Dec 15, 9:45 PM Vietnam time" },
      { date: "2026-12-15", kind: "flight", title: "Land at HAN · Z Air", time: "21:45", timeZone: VN, forWhom: "Everyone", detail: "Takes off from Seoul Tue, 6:45 PM Korea time" },
      { date: "2026-12-20", kind: "deadline", title: "Pay Stay A's balance", forWhom: "Everyone" },
      { date: "2026-12-25", kind: "meeting", title: "Meet the Backroads leaders · Bar A", time: "10:30", timeZone: VN, forWhom: "Everyone", source: "Backroads' itinerary", place: "Bar A, Stay A Hotel" },
      { date: "2026-12-25", kind: "plan", title: "A welcome dinner", forWhom: "Everyone", source: "Backroads' itinerary" },
      { date: "2027-01-01", kind: "flight", title: "Flight 3 · City B (SAI) → Bangkok (BKK)", time: "19:25", timeZone: KH, forWhom: "Everyone", detail: "Lands at Bangkok (BKK) Fri, Jan 1, 9:00 PM Thailand time" },
      { date: "2027-01-01", kind: "flight", title: "Flight 4 · Bangkok (BKK) → Tokyo (HND)", time: "22:05", timeZone: TH, forWhom: "Everyone", detail: "Lands at Tokyo Haneda (HND) Sat, Jan 2, 5:40 AM Japan time" },
      { date: "2027-01-02", kind: "flight", title: "Land at HND · Y Air", time: "05:40", timeZone: JP, forWhom: "Everyone", detail: "Takes off from Bangkok Fri, 10:05 PM Thailand time" },
      { date: "2026-12-14", kind: "checkin", title: "Check in · Stay A Hotel", time: "15:00", timeZone: VN, forWhom: "Everyone" },
    ],
  });
}
