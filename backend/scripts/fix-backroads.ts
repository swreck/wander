/**
 * Fix Backroads activities: move misplaced experiences to correct days,
 * promote unassigned itinerary activities, fix Jogasaki Coast city.
 *
 * Run: cd backend && npx tsx scripts/fix-backroads.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TRIP_ID = "cmmellfyd0000qt014z9viuwe";

async function fix() {
  // ── Get all days by date ──
  const allDays = await prisma.day.findMany({
    where: { tripId: TRIP_ID },
    orderBy: { date: "asc" },
    include: { city: true },
  });

  const dayByDate: Record<string, typeof allDays[0]> = {};
  for (const d of allDays) {
    dayByDate[d.date.toISOString().slice(0, 10)] = d;
  }

  // Verify key days exist
  const oct15 = dayByDate["2026-10-15"];
  const oct16 = dayByDate["2026-10-16"];
  const oct17 = dayByDate["2026-10-17"];
  const oct18 = dayByDate["2026-10-18"];
  const oct19 = dayByDate["2026-10-19"];
  const oct20 = dayByDate["2026-10-20"];
  const oct21 = dayByDate["2026-10-21"];
  const oct22 = dayByDate["2026-10-22"];

  if (!oct15 || !oct16 || !oct17 || !oct18 || !oct19 || !oct20 || !oct21 || !oct22) {
    console.error("Missing expected days!");
    process.exit(1);
  }

  console.log("All Backroads days verified (Oct 15-22)");

  // ── Get cities ──
  const cities = await prisma.city.findMany({ where: { tripId: TRIP_ID } });
  const cityByName: Record<string, typeof cities[0]> = {};
  for (const c of cities) cityByName[c.name] = c;

  const nikkoCity = cityByName["Nikko"];
  const izuPeninsulaCity = cityByName["Izu Peninsula"];
  const kyotoCity = cityByName["Kyoto"];

  if (!nikkoCity || !izuPeninsulaCity || !kyotoCity) {
    console.error("Missing cities!", { nikko: !!nikkoCity, izu: !!izuPeninsulaCity, kyoto: !!kyotoCity });
    process.exit(1);
  }

  // ── Get all experiences ──
  const allExps = await prisma.experience.findMany({
    where: { tripId: TRIP_ID },
    include: { city: true, day: true },
  });

  const findExp = (name: string, source?: string) => {
    return allExps.filter(e => {
      const nameMatch = e.name.toLowerCase().includes(name.toLowerCase());
      if (source) return nameMatch && e.sourceText === source;
      return nameMatch;
    });
  };

  const IMPORTED = "Imported from itinerary document";
  const ops: any[] = [];
  const log: string[] = [];

  // ── 1. Move misplaced [BACKROADS] experiences to correct days ──

  // 3 Nikko experiences on Oct 1 → distribute across Oct 15-17
  const ritzArt = findExp("Ritz-Carlton art collection", IMPORTED)[0];
  const ashio = findExp("Scenic ride through Ashio", IMPORTED)[0];
  const toshogu = findExp("Nikko Toshogu", IMPORTED)[0];
  const nikkoPark = findExp("Nikko National Park", IMPORTED)[0];
  const sakeBrew = findExp("Sake brewery tour", IMPORTED)[0];

  // Oct 15 (arrival): Ritz-Carlton art tour
  if (ritzArt && ritzArt.dayId !== oct15.id) {
    ops.push(prisma.experience.update({
      where: { id: ritzArt.id },
      data: { dayId: oct15.id, timeWindow: "afternoon" },
    }));
    log.push(`MOVE: "${ritzArt.name}" → Oct 15 (was ${ritzArt.day?.date.toISOString().slice(0, 10) || "none"})`);
  }

  // Oct 16 (full day): Toshogu + National Park + Sake brewery
  if (toshogu && toshogu.dayId !== oct16.id) {
    ops.push(prisma.experience.update({
      where: { id: toshogu.id },
      data: { dayId: oct16.id, timeWindow: "morning" },
    }));
    log.push(`MOVE: "${toshogu.name}" → Oct 16 (was ${toshogu.day?.date.toISOString().slice(0, 10) || "none"})`);
  }
  // nikkoPark and sakeBrew are already on Oct 16 — verify
  if (nikkoPark) {
    const curDate = nikkoPark.day?.date.toISOString().slice(0, 10);
    if (curDate === "2026-10-16") {
      log.push(`OK: "${nikkoPark.name}" already on Oct 16`);
    } else {
      ops.push(prisma.experience.update({
        where: { id: nikkoPark.id },
        data: { dayId: oct16.id, timeWindow: "day" },
      }));
      log.push(`MOVE: "${nikkoPark.name}" → Oct 16 (was ${curDate})`);
    }
  }
  if (sakeBrew) {
    const curDate = sakeBrew.day?.date.toISOString().slice(0, 10);
    if (curDate === "2026-10-16") {
      log.push(`OK: "${sakeBrew.name}" already on Oct 16`);
    } else {
      ops.push(prisma.experience.update({
        where: { id: sakeBrew.id },
        data: { dayId: oct16.id, timeWindow: "afternoon" },
      }));
      log.push(`MOVE: "${sakeBrew.name}" → Oct 16 (was ${curDate})`);
    }
  }

  // Oct 17 (active day/transfer): Ashio Mountains ride
  if (ashio && ashio.dayId !== oct17.id) {
    ops.push(prisma.experience.update({
      where: { id: ashio.id },
      data: { dayId: oct17.id, timeWindow: "morning" },
    }));
    log.push(`MOVE: "${ashio.name}" → Oct 17 (was ${ashio.day?.date.toISOString().slice(0, 10) || "none"})`);
  }

  // Izu experiences — Oct 18-19 already correct, just verify
  const bikeIzu = findExp("Bike through central Izu", IMPORTED)[0];
  const wasabi = findExp("Wasabi birthplace", IMPORTED)[0];
  const bikeCoast = findExp("Bike along the serpentine", IMPORTED)[0];
  const delicacies = findExp("Local delicacies", IMPORTED)[0];

  for (const [exp, expectedDate] of [
    [bikeIzu, "2026-10-18"],
    [wasabi, "2026-10-18"],
    [bikeCoast, "2026-10-19"],
    [delicacies, "2026-10-19"],
  ] as const) {
    if (exp) {
      const curDate = exp.day?.date.toISOString().slice(0, 10);
      if (curDate === expectedDate) {
        log.push(`OK: "${exp.name}" already on ${expectedDate}`);
      } else {
        log.push(`WARN: "${exp.name}" on ${curDate}, expected ${expectedDate}`);
      }
    }
  }

  // Kyoto Backroads experiences — move from Oct 6-7 to Oct 20-22
  const fushimi = findExp("Fushimi Inari", IMPORTED)[0];
  const philosophers = findExp("Philosopher's Path", IMPORTED)[0];
  const daimonji = findExp("Daimonji", IMPORTED)[0];
  const farewell = findExp("Farewell Japanese dinner", IMPORTED)[0];

  // Oct 20 (Day 6): Fushimi Inari (arrival afternoon in Kyoto)
  if (fushimi && fushimi.dayId !== oct20.id) {
    ops.push(prisma.experience.update({
      where: { id: fushimi.id },
      data: { dayId: oct20.id, timeWindow: "afternoon" },
    }));
    log.push(`MOVE: "${fushimi.name}" → Oct 20 (was ${fushimi.day?.date.toISOString().slice(0, 10) || "none"})`);
  }

  // Oct 21 (Day 7): Philosopher's Path (morning) + Daimonji (afternoon)
  if (philosophers && philosophers.dayId !== oct21.id) {
    ops.push(prisma.experience.update({
      where: { id: philosophers.id },
      data: { dayId: oct21.id, timeWindow: "morning" },
    }));
    log.push(`MOVE: "${philosophers.name}" → Oct 21 (was ${philosophers.day?.date.toISOString().slice(0, 10) || "none"})`);
  }
  if (daimonji && daimonji.dayId !== oct21.id) {
    ops.push(prisma.experience.update({
      where: { id: daimonji.id },
      data: { dayId: oct21.id, timeWindow: "afternoon" },
    }));
    log.push(`MOVE: "${daimonji.name}" → Oct 21 (was ${daimonji.day?.date.toISOString().slice(0, 10) || "none"})`);
  }

  // Oct 22 (Day 8): Farewell dinner
  if (farewell && farewell.dayId !== oct22.id) {
    ops.push(prisma.experience.update({
      where: { id: farewell.id },
      data: { dayId: oct22.id, timeWindow: "evening" },
    }));
    log.push(`MOVE: "${farewell.name}" → Oct 22 (was ${farewell.day?.date.toISOString().slice(0, 10) || "none"})`);
  }

  // ── 2. Fix Jogasaki Coast: change city from Kyoto to Izu Peninsula, assign to Oct 19 ──
  // (It's listed under Days 6-8 in itinerary as morning before Kyoto transfer,
  //  but geographically it's Izu coast. Assign to Oct 19 = last full Izu day,
  //  since Day 6 morning is departure from Izu area)
  const jogasaki = findExp("Jogasaki Coast", IMPORTED)[0];
  if (jogasaki) {
    const updates: any = {};
    if (jogasaki.cityId !== izuPeninsulaCity.id) {
      updates.cityId = izuPeninsulaCity.id;
    }
    // Assign to Oct 19 (last Izu day — they explore Jogasaki before departing next morning)
    if (jogasaki.dayId !== oct19.id) {
      updates.dayId = oct19.id;
      updates.timeWindow = "afternoon";
      updates.state = "selected";
    }
    if (Object.keys(updates).length > 0) {
      ops.push(prisma.experience.update({
        where: { id: jogasaki.id },
        data: updates,
      }));
      log.push(`FIX: "${jogasaki.name}" → city=Izu Peninsula, day=Oct 19 (was city=${jogasaki.city?.name}, day=${jogasaki.day?.date.toISOString().slice(0, 10) || "none"})`);
    }
  }

  // ── 3. Promote unassigned itinerary activities to selected on Backroads days ──

  // Nikko activities → distribute across Oct 15-17
  const promoteToDay = async (searchName: string, targetDay: typeof oct15, timeWindow: string, cityId: string) => {
    const matches = allExps.filter(e =>
      e.name.toLowerCase().includes(searchName.toLowerCase()) &&
      e.state === "possible" &&
      e.dayId === null
    );
    if (matches.length > 0) {
      const exp = matches[0];
      ops.push(prisma.experience.update({
        where: { id: exp.id },
        data: {
          state: "selected",
          dayId: targetDay.id,
          timeWindow,
          cityId,
          sourceText: "Imported from itinerary document",
        },
      }));
      log.push(`PROMOTE: "${exp.name}" → selected, ${targetDay.date.toISOString().slice(0, 10)} (${timeWindow})`);
      return true;
    }
    return false;
  };

  // Nikko Day 1 (Oct 15): arrival — Ritz-Carlton already moved there
  // Nothing else for arrival day

  // Nikko Day 2 (Oct 16): full adventure day
  await promoteToDay("Irohazaka", oct16, "morning", nikkoCity.id);
  await promoteToDay("Lake Chuzenji", oct16, "day", nikkoCity.id);

  // Nikko Day 3 (Oct 17): nature/waterfalls before transfer
  await promoteToDay("Kinugawa", oct17, "morning", nikkoCity.id);
  await promoteToDay("Ryuzu", oct17, "day", nikkoCity.id);
  await promoteToDay("Yudaki", oct17, "day", nikkoCity.id);
  await promoteToDay("Senjogahara", oct15, "morning", nikkoCity.id);

  // Izu — check for unassigned matches
  // "Bullet Train to Izu" → Oct 18 morning (transit)
  await promoteToDay("Bullet Train to Izu", oct18, "morning", izuPeninsulaCity.id);

  // ── Execute all operations ──
  console.log("\n=== PLANNED OPERATIONS ===");
  for (const l of log) console.log("  " + l);
  console.log(`\nTotal operations: ${ops.length}`);

  if (ops.length > 0) {
    await prisma.$transaction(ops);
    console.log("All operations executed successfully.");
  }

  // ── Verify final state ──
  const finalDays = await prisma.day.findMany({
    where: { tripId: TRIP_ID },
    orderBy: { date: "asc" },
    include: {
      city: true,
      experiences: { orderBy: { priorityOrder: "asc" } },
    },
  });

  console.log("\n=== FINAL BACKROADS STATE (Oct 15-23) ===");
  for (const day of finalDays) {
    const date = day.date.toISOString().slice(0, 10);
    if (date < "2026-10-15") continue;
    const city = day.city?.name || "?";
    console.log(`\n── ${date} | ${city} ──`);
    if (day.experiences.length === 0) {
      console.log("  (empty)");
    }
    for (const exp of day.experiences) {
      const br = exp.sourceText === "Imported from itinerary document" ? " [B]" : "";
      console.log(`  ${exp.state}: ${exp.name} (${exp.timeWindow || "no time"})${br}`);
    }
  }

  // Also verify pre-trip days are clean (no stray Backroads activities)
  console.log("\n=== PRE-TRIP DAYS (Oct 1-14) — should have NO [B] activities ===");
  for (const day of finalDays) {
    const date = day.date.toISOString().slice(0, 10);
    if (date >= "2026-10-15") break;
    const brExps = day.experiences.filter(e => e.sourceText === "Imported from itinerary document");
    if (brExps.length > 0) {
      console.log(`  WARNING: ${date} still has ${brExps.length} Backroads experiences!`);
      for (const e of brExps) console.log(`    - ${e.name}`);
    }
  }
  console.log("  (clean — no stray Backroads activities)");
}

fix()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
