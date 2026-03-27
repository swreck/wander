/**
 * Neon Branch Manager for Test Isolation
 *
 * Creates a temporary Neon database branch before tests run,
 * swaps DATABASE_URL to point at it, and deletes it after.
 * This ensures tests never touch production data.
 */

const NEON_API = "https://console.neon.tech/api/v2";

let branchId: string | null = null;
let apiKey: string | null = null;

async function neonFetch(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${NEON_API}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  return res.json();
}

async function cleanupStaleBranches(projectId: string, orgId: string): Promise<void> {
  console.log("[neon-branch] Checking for stale test branches...");
  const result = await neonFetch(`/projects/${projectId}/branches?org_id=${orgId}`);
  const branches = result.branches || [];
  const stale = branches.filter((b: any) => b.name.startsWith("test-"));
  if (stale.length === 0) {
    console.log("[neon-branch] No stale branches found.");
    return;
  }
  console.log(`[neon-branch] Found ${stale.length} stale test branch(es), cleaning up...`);
  for (const b of stale) {
    console.log(`[neon-branch] Deleting stale branch "${b.name}" (${b.id})...`);
    await neonFetch(`/projects/${projectId}/branches/${b.id}?org_id=${orgId}`, {
      method: "DELETE",
    });
  }
  console.log(`[neon-branch] Cleanup complete.`);
}

export async function createTestBranch(): Promise<string> {
  // Read env vars at call time (after dotenv has loaded)
  apiKey = process.env.NEON_API_KEY || null;
  const projectId = process.env.NEON_PROJECT_ID || "polished-field-51914169";
  const originalDbUrl = process.env.DATABASE_URL || "";
  const parsed = new URL(originalDbUrl);
  const dbPassword = decodeURIComponent(parsed.password);

  if (!apiKey) {
    throw new Error(
      "[neon-branch] NEON_API_KEY is not set. Refusing to run tests against production DB. " +
      "Set NEON_API_KEY in .env to enable test branch isolation."
    );
  }

  const orgId = process.env.NEON_ORG_ID || "org-little-glitter-64029838";
  await cleanupStaleBranches(projectId, orgId);

  const branchName = `test-${Date.now()}`;
  console.log(`[neon-branch] Creating branch "${branchName}"...`);

  const result = await neonFetch(`/projects/${projectId}/branches?org_id=${orgId}`, {
    method: "POST",
    body: JSON.stringify({
      branch: { name: branchName },
      endpoints: [{ type: "read_write" }],
    }),
  });

  branchId = result.branch?.id;
  const host = result.endpoints?.[0]?.host;

  if (!branchId || !host) {
    throw new Error(
      "[neon-branch] Failed to create branch: " + JSON.stringify(result) +
      "\nRefusing to run tests against production DB."
    );
  }

  // Build connection string for the branch
  const branchUrl = `postgresql://neondb_owner:${dbPassword}@${host}/neondb?sslmode=require`;

  // Poll endpoint until it's actually ready (Neon compute nodes need warmup)
  const endpointId = result.endpoints?.[0]?.id;
  console.log(`[neon-branch] Branch ${branchId} created, waiting for endpoint ${endpointId}...`);

  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const epResult = await neonFetch(`/projects/${projectId}/endpoints/${endpointId}?org_id=${orgId}`);
    const state = epResult.endpoint?.current_state;
    console.log(`[neon-branch] Endpoint state: ${state} (attempt ${i + 1})`);
    if (state === "active") break;
  }

  // Verify actual Postgres connectivity with pg — Neon endpoint can report "active"
  // and DNS can resolve before the Postgres process accepts TCP connections.
  const { Client } = await import("pg");
  console.log(`[neon-branch] Verifying Postgres connectivity...`);
  for (let i = 0; i < 30; i++) {
    try {
      const client = new Client({ connectionString: branchUrl, ssl: { rejectUnauthorized: false } });
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      console.log(`[neon-branch] Postgres connection verified (attempt ${i + 1}).`);
      break;
    } catch (err: any) {
      if (i === 29) {
        console.error(`[neon-branch] Failed to connect after 30 attempts: ${err.message}`);
        throw new Error(`[neon-branch] Cannot connect to branch database at ${host}`);
      }
      console.log(`[neon-branch] Not ready: ${(err.message || "").slice(0, 80)} (attempt ${i + 1})`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.log(`[neon-branch] Ready. Tests will run against branch.`);
  return branchUrl;
}

export async function deleteTestBranch(): Promise<void> {
  if (!branchId || !apiKey) return;

  const projectId = process.env.NEON_PROJECT_ID || "polished-field-51914169";
  const orgId = process.env.NEON_ORG_ID || "org-little-glitter-64029838";
  console.log(`[neon-branch] Deleting branch ${branchId}...`);
  await neonFetch(`/projects/${projectId}/branches/${branchId}?org_id=${orgId}`, {
    method: "DELETE",
  });
  console.log(`[neon-branch] Branch deleted. Production data untouched.`);
  branchId = null;
}
