/**
 * Test files that switch Wander's active trip take turns (Sep 30 2026). Files run side by side, and one file's
 * "activate" archived another's trip mid-test — dateless-trips and people-links failed in every full run, never alone.
 * A Postgres advisory lock, held on its own connection for the whole file: files that don't switch trips aren't slowed.
 */
import pg from "pg";
import { beforeAll, afterAll } from "vitest";

const KEY = 424242;
let client: pg.Client | null = null;

/** Call at the top of a test file, before its own beforeAll */
export function takeTurnsWithActiveTrip() {
  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query("SELECT pg_advisory_lock($1)", [KEY]);
  }, 1_800_000);
  afterAll(async () => {
    if (!client) return;
    await client.query("SELECT pg_advisory_unlock($1)", [KEY]).catch(() => {});
    await client.end().catch(() => {});
    client = null;
  });
}
