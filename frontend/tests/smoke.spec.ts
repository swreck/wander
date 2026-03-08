import { test, expect } from "@playwright/test";

// Smoke tests — verify pages render without crashing.
// These catch missing imports, broken hooks, and render errors
// that TypeScript and the bundler don't flag.
//
// Run: npx playwright test
// Requires: frontend dev server (npm run dev) on port 5173
// Tests marked (requires backend) need backend on :3001

// ── No-backend tests ─────────────────────────────────────────────

test("login page renders name buttons", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Wander" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ken" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Larisa" })).toBeVisible();
});

test("login click does not crash the page", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Ken" })).toBeVisible();

  // Click Ken — login may fail if backend codes differ, but page should not crash
  await page.getByRole("button", { name: "Ken" }).click();
  await page.waitForTimeout(2000);

  // The page should NOT show an unhandled render crash
  await expect(page.getByText("Something went wrong")).not.toBeVisible();
});

test("unauthenticated routes redirect to login without crash", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Wander" })).toBeVisible({ timeout: 5000 });

  await page.goto("/plan");
  await expect(page.getByRole("heading", { name: "Wander" })).toBeVisible({ timeout: 5000 });

  await page.goto("/now");
  await expect(page.getByRole("heading", { name: "Wander" })).toBeVisible({ timeout: 5000 });

  await expect(page.getByText("Something went wrong")).not.toBeVisible();
});

// ── Backend-required tests ───────────────────────────────────────
// These test the loading→loaded transition that can trigger hooks-order bugs.

test("overview page renders after login (requires backend)", async ({ page }) => {
  // Check if backend is reachable
  try {
    await page.request.get("http://localhost:3001/api/auth/me");
  } catch {
    test.skip(true, "Backend not running on :3001");
  }

  // Login
  await page.goto("/login");
  await page.getByRole("button", { name: "Ken" }).click();

  // Wait for loading→loaded transition (this is where hooks-order bugs crash)
  await page.waitForTimeout(3000);

  // Should NOT show a crash
  await expect(page.getByText("Something went wrong")).not.toBeVisible();

  // Should show some trip content (not still loading, not blank)
  const body = await page.locator("body").innerText();
  expect(body.length).toBeGreaterThan(20);
});

test("plan page renders after login (requires backend)", async ({ page }) => {
  try {
    await page.request.get("http://localhost:3001/api/auth/me");
  } catch {
    test.skip(true, "Backend not running on :3001");
  }

  // Login
  await page.goto("/login");
  await page.getByRole("button", { name: "Ken" }).click();
  await page.waitForTimeout(3000);
  await expect(page.getByText("Something went wrong")).not.toBeVisible();

  // Navigate to plan
  await page.goto("/plan");
  await page.waitForTimeout(3000);

  // Should NOT crash
  await expect(page.getByText("Something went wrong")).not.toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body.length).toBeGreaterThan(20);
});
