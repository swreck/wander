/**
 * Vitest Setup File (runs inside each worker process)
 *
 * Reads the Neon branch URL written by globalSetup and
 * overrides DATABASE_URL before any test code imports Prisma.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const BRANCH_URL_FILE = join(import.meta.dirname, ".neon-branch-url");

if (existsSync(BRANCH_URL_FILE)) {
  const branchUrl = readFileSync(BRANCH_URL_FILE, "utf-8").trim();
  if (branchUrl) {
    process.env.DATABASE_URL = branchUrl;
  }
}
