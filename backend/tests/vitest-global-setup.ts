/**
 * Vitest Global Setup
 *
 * Runs once before all test files. Creates a Neon database branch
 * so tests run against an isolated copy of production data.
 * Deletes the branch after all tests complete.
 */

import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import { config } from "dotenv";
import { createTestBranch, deleteTestBranch } from "./neon-branch.js";
import { localAvailable, createLocalTestDb, dropLocalTestDb } from "./local-db.js";

const BRANCH_URL_FILE = join(import.meta.dirname, ".neon-branch-url");
let usedLocal = false;

export async function setup() {
  // Load .env so we have NEON_API_KEY and DATABASE_URL
  config();

  // (this Mac's Postgres when it's running — tests/local-db.ts; a Neon branch otherwise)
  usedLocal = localAvailable();
  const branchUrl = usedLocal ? createLocalTestDb() : await createTestBranch();

  // The branch copies production's schema. Apply this code's schema to the copy so tests
  // check the code as written (db push refuses anything that would lose data).
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], {
    cwd: join(import.meta.dirname, ".."),
    env: { ...process.env, DATABASE_URL: branchUrl },
    stdio: "inherit",
  });

  // Write branch URL to a temp file so worker processes can read it
  // (globalSetup runs in a separate process; env vars don't propagate to forks in Vitest 4)
  writeFileSync(BRANCH_URL_FILE, branchUrl, "utf-8");
  process.env.DATABASE_URL = branchUrl;
}

export async function teardown() {
  if (usedLocal) dropLocalTestDb(); else await deleteTestBranch();
  try { unlinkSync(BRANCH_URL_FILE); } catch {}
}
