/**
 * The backend suite's database on this Mac (Oct 21 2026). Each run had its own Neon branch, scaled up to 8 compute units
 * by ~70 files at once for half an hour — most of Wander's Neon bill (Ken: "This is high for neon. Can architectural
 * change reduce it?"). Now: a local Postgres 17 (Homebrew, the version Neon runs) keeps a copy of production's data,
 * refreshed from production at most every 12 hours (read-only there: pg_dump), and each run gets its own fresh database
 * made from that copy, dropped at the end. Production's data is never written. WANDER_TEST_DB=neon uses a Neon branch
 * as before; so does a Mac without the local Postgres running.
 */
import { execFileSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const BIN = "/opt/homebrew/opt/postgresql@17/bin";
const SEED = "wander_seed";
const SEED_AT = join(import.meta.dirname, ".local-seed-at");
const REFRESH_MS = 12 * 3600_000;
const user = process.env.USER || "postgres";
const local = (db: string) => `postgresql://${user}@localhost:5432/${db}`;
// (-t -A: the answer's values alone, no header — "count" was read as the number of tables)
const psql = (db: string, sql: string) => execFileSync(`${BIN}/psql`, ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-d", local(db), "-c", sql], { encoding: "utf-8" });

let runDb: string | null = null;

/** The local Postgres is installed and answering */
export function localAvailable(): boolean {
  if (process.env.WANDER_TEST_DB === "neon" || !existsSync(`${BIN}/psql`)) return false;
  try { psql("postgres", "select 1"); return true; } catch { return false; }
}

/** Production's direct (not pooled) address, for pg_dump */
function productionDirect(): string {
  const u = new URL(process.env.DATABASE_URL || "");
  if (!/neon\.tech$/.test(u.hostname)) throw new Error("[local-db] DATABASE_URL isn't Neon's production address");
  u.hostname = u.hostname.replace("-pooler", "");
  return u.toString();
}

/** The local copy of production's data, refreshed when it's over 12 hours old (or WANDER_SEED_REFRESH=1) */
function ensureSeed() {
  const at = existsSync(SEED_AT) ? Number(readFileSync(SEED_AT, "utf-8")) : 0;
  const has = psql("postgres", `select 1 from pg_database where datname='${SEED}'`).trim() !== "";
  if (has && Date.now() - at < REFRESH_MS && process.env.WANDER_SEED_REFRESH !== "1") return;
  console.log(`[local-db] Copying production's data to the local "${SEED}" (read-only there)...`);
  const dump = execFileSync(`${BIN}/pg_dump`, ["--no-owner", "--no-privileges", "--no-publications", "--no-subscriptions", productionDirect()], { maxBuffer: 1 << 30 });
  psql("postgres", `drop database if exists ${SEED}`);
  psql("postgres", `create database ${SEED}`);
  // (Neon-only extensions and settings fail here harmlessly; the tables, rows and indexes are what the tests need)
  execFileSync(`${BIN}/psql`, ["-X", "-q", "-d", local(SEED)], { input: dump, stdio: ["pipe", "ignore", "ignore"], maxBuffer: 1 << 30 });
  const n = psql(SEED, "select count(*) from information_schema.tables where table_schema='public'").trim();
  if (Number(n) < 20) throw new Error(`[local-db] The copy has only ${n} tables — not using it`);
  writeFileSync(SEED_AT, String(Date.now()));
  console.log(`[local-db] Copied: ${n} tables.`);
}

/** A fresh database for this run, made from the copy; returns its address */
export function createLocalTestDb(): string {
  ensureSeed();
  // (any left from an interrupted run over 2 hours ago — never one a run may still be using)
  for (const d of psql("postgres", "select datname from pg_database where datname like 'wander_test_%'").split("\n").map((x) => x.trim()).filter(Boolean)) {
    if (Date.now() - Number(d.replace("wander_test_", "")) < 2 * 3600_000) continue;
    try { psql("postgres", `drop database if exists ${d} with (force)`); } catch { /* in use: left */ }
  }
  runDb = `wander_test_${Date.now()}`;
  psql("postgres", `create database ${runDb} template ${SEED}`);
  console.log(`[local-db] Tests run against the local "${runDb}" — production untouched.`);
  return local(runDb);
}

export function dropLocalTestDb() {
  if (!runDb) return;
  try { psql("postgres", `drop database if exists ${runDb} with (force)`); console.log(`[local-db] Dropped "${runDb}".`); } catch (e: any) { console.warn(`[local-db] Couldn't drop ${runDb}: ${e.message}`); }
}
