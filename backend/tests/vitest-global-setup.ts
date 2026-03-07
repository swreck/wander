/**
 * Vitest Global Setup
 *
 * Runs once before all test files. Creates a Neon database branch
 * so tests run against an isolated copy of production data.
 * Deletes the branch after all tests complete.
 */

import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { config } from "dotenv";
import { createTestBranch, deleteTestBranch } from "./neon-branch.js";

const BRANCH_URL_FILE = join(import.meta.dirname, ".neon-branch-url");

export async function setup() {
  // Load .env so we have NEON_API_KEY and DATABASE_URL
  config();

  const branchUrl = await createTestBranch();

  // Write branch URL to a temp file so worker processes can read it
  // (globalSetup runs in a separate process; env vars don't propagate to forks in Vitest 4)
  writeFileSync(BRANCH_URL_FILE, branchUrl, "utf-8");
  process.env.DATABASE_URL = branchUrl;
}

export async function teardown() {
  await deleteTestBranch();
  try { unlinkSync(BRANCH_URL_FILE); } catch {}
}
