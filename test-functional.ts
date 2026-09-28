/**
 * Wander functional check — run after EVERY deploy, against production:
 *
 *   npx tsx test-functional.ts
 *
 * Real HTTP requests to the live app. Exit 0 = every check passed; anything else = the deploy is broken.
 *
 * Signed-in checks use a personal sign-in link, read from WANDER_TEST_LINK in backend/.env
 * (never commit it — the repository is public). Without it, only the public checks run.
 *
 * Read-only by design: nothing here creates, edits, or deletes trip data. It never attempts a
 * delete against production, even one that should be refused — backend/tests covers that on a
 * throwaway database copy.
 */
import fs from "fs";

/** Reads one setting from backend/.env (only that line — no other secrets are loaded). */
function setting(name: string): string {
  if (process.env[name]) return process.env[name]!;
  try {
    const env = fs.readFileSync(new URL("./backend/.env", import.meta.url), "utf-8");
    const m = env.match(new RegExp(`^${name}=["']?([^"'\\n]*)["']?$`, "m"));
    return m ? m[1].trim() : "";
  } catch {
    return "";
  }
}

const BASE = (setting("WANDER_URL") || "https://wander.up.railway.app").replace(/\/$/, "");
const LINK = setting("WANDER_TEST_LINK");

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

async function get(path: string, token?: string) {
  const r = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const text = await r.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}

async function post(path: string, body: unknown, token?: string) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
}

async function main() {
  console.log(`Checking ${BASE}\n`);

  // ── The app loads ──
  const home = await get("/");
  const bundle = home.text.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
  check("Home page loads and names its app bundle", home.status === 200 && !!bundle, bundle || `status ${home.status}`);
  if (bundle) check("App bundle downloads", (await get(bundle)).status === 200);

  // ── Sign-in is protected ──
  const methods = await get("/api/auth/login-methods");
  check("Tapping a name does not sign anyone in", methods.json?.nameLogin === false, JSON.stringify(methods.json));
  check("Face ID sign-in is offered", methods.json?.passkey === true);
  const nameLogin = await post("/api/auth/login", { code: "Ken" });
  check("Name sign-in is refused", nameLogin.status === 403 || nameLogin.status === 400, `status ${nameLogin.status}`);
  const options = await post("/api/auth/passkey/login-options", {});
  check("Face ID sign-in starts for this site", options.status === 200 && options.json?.options?.rpId === new URL(BASE).hostname,
    `status ${options.status}, rpId ${options.json?.options?.rpId}`);
  check("Trips are private without sign-in", (await get("/api/trips")).status === 401);
  check("Guide pictures refuse a link without a valid signature",
    [401, 403, 404].includes((await get("/api/guide/picture/x/y?t=forged")).status));

  if (!LINK) {
    console.log("\nSKIP  Signed-in checks — set WANDER_TEST_LINK in backend/.env to a personal sign-in link.");
  } else {
    const linkToken = LINK.split("/join/")[1] || LINK;
    const joined = await post(`/api/auth/join/${linkToken}`, {});
    const token: string | undefined = joined.json?.token;
    check("Personal link signs in", joined.status === 200 && !!token, `status ${joined.status}`);
    if (token) {
      const me = await get("/api/auth/me", token);
      check("Signed in as a real traveler", me.status === 200 && !!me.json?.displayName, me.json?.displayName);

      const active = await get("/api/trips/active", token);
      const trip = active.json;
      check("The open trip comes from Larisa's Guide", active.status === 200 && /^From Larisa's Guide/.test(trip?.tagline || ""), trip?.tagline);
      check("The trip keeps its time zone", !!trip?.timeZone, trip?.timeZone);

      if (trip?.id) {
        const status = await get(`/api/guide/status/${trip.id}`, token);
        const current = status.json?.current;
        check("A current reading of the Guide exists", status.status === 200 && !!current?.sourceName, current?.sourceName);
        check("That reading was accepted", current?.report?.accepted === true);

        const items = await get(`/api/guide/items/${trip.id}`, token);
        const list: any[] = Array.isArray(items.json) ? items.json : [];
        check("The Guide's day-by-day items are there", items.status === 200 && list.length >= 20, `${list.length} items`);
        check("Every item says where in the Guide it came from", list.length > 0 && list.every((i) => i.source && i.sourceRef));
        check("Flights carry their confirmation codes", list.some((i) => i.kind === "flight" && i.confirmation));
        check("Deadlines are there", list.some((i) => i.kind === "deadline"));
        const dates = list.filter((i) => i.date).map((i) => i.date.slice(0, 10)).sort();
        check("Items span the trip's dates", dates.length > 0 && dates[0] >= (trip.startDate || "").slice(0, 10) && dates[dates.length - 1] <= (trip.endDate || "").slice(0, 10),
          `${dates[0]} → ${dates[dates.length - 1]}`);

        const stays = await get(`/api/accommodations/trip/${trip.id}`, token);
        const hotels: any[] = Array.isArray(stays.json) ? stays.json : [];
        check("Every hotel has check-in and check-out dates", hotels.length > 0 && hotels.every((h) => h.checkInDate && h.checkOutDate), `${hotels.length} hotels`);

        const pictures = await get(`/api/guide/pictures/${trip.id}`, token);
        const first = (Array.isArray(pictures.json) ? pictures.json : []).flatMap((t: any) => t.pictures)[0];
        check("Guide pictures are listed", !!first);
        if (first) check("A picture opens from its signed link", (await get(first.url)).status === 200);
      }

      // Wander never writes to a Google Sheet
      for (const path of ["/api/sheets-sync/push", "/api/sheets-sync/pull", "/api/sheets-sync/import"]) {
        const r = await post(path, {}, token);
        check(`No sheet-writing route: ${path}`, r.status === 404, `status ${r.status}`);
      }
    }
  }

  console.log(`\n${passed}/${passed + failed} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("CHECK CRASHED:", e.message); process.exit(2); });
