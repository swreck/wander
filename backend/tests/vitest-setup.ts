/**
 * Vitest Setup File (runs inside each worker process)
 *
 * Reads the Neon branch URL written by globalSetup and
 * overrides DATABASE_URL before any test code imports Prisma.
 * Also verifies connectivity from this worker process.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { Client } from "pg";

const BRANCH_URL_FILE = join(import.meta.dirname, ".neon-branch-url");

if (existsSync(BRANCH_URL_FILE)) {
  const branchUrl = readFileSync(BRANCH_URL_FILE, "utf-8").trim();
  if (branchUrl) {
    process.env.DATABASE_URL = branchUrl;

    // Verify connectivity with retries — Neon endpoints can be slow to accept connections
    // from new processes, even after verification from the parent process.
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const client = new Client({ connectionString: branchUrl, ssl: { rejectUnauthorized: false } });
        await client.connect();
        await client.query("SELECT 1");
        await client.end();
        break;
      } catch {
        if (attempt < 9) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
  }
}
