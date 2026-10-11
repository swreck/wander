/**
 * Records Larisa's Google map ("My Maps") on a trip and reads it once (googleMyMap.ts — read-only, its public KML
 * export). The map's id is read from a private file (trip-data), never typed into a command or printed in full: the
 * repo is public, and so is a session log.
 *
 *   npx tsx scripts/set-my-map.ts --trip <tripId> --file <file with the map's link or id> [--dry]
 */
import fs from "fs";
import prisma from "../src/services/db.js";
import { isMid, readMyMap, refreshMyMap } from "../src/services/guide/googleMyMap.js";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const tripId = arg("--trip"), file = arg("--file");
if (!tripId || !file) throw new Error("Needs --trip and --file");
const raw = fs.readFileSync(file, "utf-8");
const mid = raw.match(/[?&]mid=([\w-]+)/)?.[1] || raw.trim();
if (!isMid(mid)) throw new Error("No map id in that file");
console.log(`map id …${mid.slice(-6)}`);
const read = await readMyMap(mid);
if (!read) throw new Error("Couldn't read the map — is it shared as 'anyone with the link can view'?");
console.log(`"${read.title}": ${read.layers.map((l) => `${l.name} (${l.places.length})`).join(" · ")}`);
if (process.argv.includes("--dry")) { console.log("(dry run — nothing written)"); await prisma.$disconnect(); process.exit(0); }
const r = await refreshMyMap(tripId, mid);
console.log(`recorded on trip ${tripId.slice(0, 8)}: ${r}`);
await prisma.$disconnect();
