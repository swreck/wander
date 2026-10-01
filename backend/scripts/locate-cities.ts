/**
 * Locate a trip's cities that have no map position (for Home's map): asks Google where each is, prints what it found
 * (address and position) and saves nothing unless --apply. A city already located is left alone.
 *   npx tsx scripts/locate-cities.ts --trip <tripId> [--apply] [--query "Shirakabeso=Shirakabeso Kanazawa, Japan"]
 * --query overrides what's asked for one city when its name alone is ambiguous (a ryokan, not a town).
 */
import "dotenv/config";
import prisma from "../src/services/db.js";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const tripId = arg("trip");
const apply = process.argv.includes("--apply");
// --skip "Shirakabeso": a city whose place isn't confirmed stays off the map (a wrong pin is a wrong "where")
const skip = new Set<string>();
for (let i = 0; i < process.argv.length; i++) if (process.argv[i] === "--skip") skip.add(process.argv[i + 1]);
const overrides = new Map<string, string>();
for (let i = 0; i < process.argv.length; i++) if (process.argv[i] === "--query") { const [k, v] = process.argv[i + 1].split("="); overrides.set(k, v); }
const KEY = process.env.GOOGLE_MAPS_API_KEY;

async function main() {
  if (!tripId) throw new Error("Pass --trip <tripId>");
  if (!KEY) throw new Error("No Google Maps key here");
  const cities = await prisma.city.findMany({ where: { tripId, hidden: false }, orderBy: { sequenceOrder: "asc" } });
  for (const c of cities) {
    if (c.latitude != null && c.longitude != null) { console.log(`${c.name.padEnd(14)} already located (${c.latitude.toFixed(3)}, ${c.longitude.toFixed(3)})`); continue; }
    if (skip.has(c.name)) { console.log(`${c.name.padEnd(14)} skipped — its place isn't confirmed`); continue; }
    const q = overrides.get(c.name) || `${c.name}${c.country ? `, ${c.country}` : ""}`;
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${KEY}`);
    const j: any = await r.json();
    if (j.status !== "OK" || !j.results?.length) { console.log(`${c.name.padEnd(14)} NOT FOUND (${j.status}) for "${q}"`); continue; }
    const top = j.results[0];
    const { lat, lng } = top.geometry.location;
    console.log(`${c.name.padEnd(14)} ${lat.toFixed(4)}, ${lng.toFixed(4)}  — ${top.formatted_address}  [${(top.types || []).slice(0, 2).join(", ")}]${j.results.length > 1 ? ` (+${j.results.length - 1} other matches)` : ""}`);
    if (apply) await prisma.city.update({ where: { id: c.id }, data: { latitude: lat, longitude: lng } });
  }
  console.log(apply ? "saved" : "(nothing saved — add --apply)");
}
main().finally(() => prisma.$disconnect());
