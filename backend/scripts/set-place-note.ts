/**
 * Records Wander's own note on one of her places (placeNotes.ts) and puts the city of the same name on the map.
 * Never changes her Guide's words; the note is always said as Wander's, with its source.
 *
 *   npx tsx scripts/set-place-note.ts --trip <tripId> --name "Shirakabeso" --what "a ryokan in a forested valley on the
 *     Izu Peninsula" --address "1594 Yugashima, Izu, Shizuoka 410-3206" --lat 34.89044 --lng 138.92573
 *     --from "Backroads' description, added by Ken" [--dry]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const tripId = arg("--trip"), name = arg("--name"), what = arg("--what"), from = arg("--from");
if (!tripId || !name || !what || !from) throw new Error("Needs --trip, --name, --what and --from");
const lat = arg("--lat") ? Number(arg("--lat")) : null, lng = arg("--lng") ? Number(arg("--lng")) : null;
if ((lat === null) !== (lng === null) || (lat !== null && (!Number.isFinite(lat) || !Number.isFinite(lng!)))) throw new Error("--lat and --lng go together, as numbers");
const note = { name, what, address: arg("--address") || null, lat, lng, from, addedAt: new Date().toISOString() };

const cfg = await prisma.sheetSyncConfig.findUnique({ where: { tripId } });
if (!cfg) throw new Error("That trip has no import record yet");
const cities = await prisma.city.findMany({ where: { tripId, name: { equals: name, mode: "insensitive" } }, select: { id: true, name: true, latitude: true, longitude: true } });
console.log(`note: ${name} — ${what}${note.address ? ` · ${note.address}` : ""} (from ${from})`);
console.log(`cities named "${name}": ${cities.length}${cities.map((c) => ` · now ${c.latitude ?? "no location"}${c.longitude != null ? `, ${c.longitude}` : ""}`).join("")}`);
if (process.argv.includes("--dry")) { console.log("(dry run — nothing written)"); await prisma.$disconnect(); process.exit(0); }
const tm = (cfg.tabMappings || {}) as any;
const list = (Array.isArray(tm.placeNotes) ? tm.placeNotes : []).filter((p: any) => p?.name?.toLowerCase() !== name.toLowerCase());
await prisma.sheetSyncConfig.update({ where: { tripId }, data: { tabMappings: { ...tm, placeNotes: [...list, note] } } });
if (lat !== null) for (const c of cities) await prisma.city.update({ where: { id: c.id }, data: { latitude: lat, longitude: lng } });
console.log(`recorded${lat !== null && cities.length ? `; ${cities.length} city put on the map` : ""}.`);
await prisma.$disconnect();
