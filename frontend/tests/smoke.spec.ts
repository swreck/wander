import { test, expect } from "@playwright/test";

// Smoke tests — verify pages render without crashing.
// These catch missing imports, broken hooks, and render errors
// that TypeScript and the bundler don't flag.
//
// Run: npx playwright test
// Requires: frontend dev server (npm run dev) on port 5173

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
  // Visit protected pages without logging in — should redirect to /login
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Wander" })).toBeVisible({ timeout: 5000 });

  await page.goto("/plan");
  await expect(page.getByRole("heading", { name: "Wander" })).toBeVisible({ timeout: 5000 });

  await page.goto("/now");
  await expect(page.getByRole("heading", { name: "Wander" })).toBeVisible({ timeout: 5000 });

  // None of these should crash
  await expect(page.getByText("Something went wrong")).not.toBeVisible();
});
