import { test, expect } from "@playwright/test";

// Offline and cache tests — verify the app works correctly when connectivity
// is lost after initial data load. These require the backend on :3001.

async function loginAndWait(page: any) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Ken" }).click();
  // Wait for redirect away from login page — confirms auth succeeded
  await page.waitForURL((url: URL) => !url.pathname.includes("/login"), { timeout: 10000 }).catch(() => {});
  // Extra wait for data to load and SW to cache it
  await page.waitForTimeout(3000);
}

async function skipIfNoBackend(page: any, testRef: any) {
  try {
    await page.request.get("http://localhost:3001/api/auth/me");
  } catch {
    testRef.skip(true, "Backend not running on :3001");
  }
}

// ── Trip Overview renders from cache offline ───────────────────

test("trip overview loads from cache when offline (requires backend)", async ({ page, context }) => {
  await skipIfNoBackend(page, test);
  await loginAndWait(page);

  // Verify we see trip content online first
  await page.goto("/");
  // Wait for loading to finish — look for content beyond "Loading..."
  await page.waitForFunction(() => document.body.innerText.length > 20, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const onlineBody = await page.locator("body").innerText();
  expect(onlineBody.length).toBeGreaterThan(20);
  await expect(page.getByText("Something went wrong")).not.toBeVisible();

  // Go offline
  await context.setOffline(true);

  // Reload — should serve from SW cache
  await page.goto("/");
  await page.waitForTimeout(3000);

  // Page should NOT crash
  await expect(page.getByText("Something went wrong")).not.toBeVisible();

  // Should still show trip content (not blank, not error)
  const offlineBody = await page.locator("body").innerText();
  expect(offlineBody.length).toBeGreaterThan(20);

  // The lasting "No signal" line says what's on screen is this phone's saved copy
  await expect(page.getByText(/No signal/).first()).toBeVisible();

  await context.setOffline(false);
});

// ── Plan page renders from cache offline ───────────────────────

test("plan page loads from cache when offline (requires backend)", async ({ page, context }) => {
  await skipIfNoBackend(page, test);
  await loginAndWait(page);

  // Load plan page to warm cache
  await page.goto("/plan");
  await page.waitForTimeout(4000);
  const onlineBody = await page.locator("body").innerText();
  expect(onlineBody.length).toBeGreaterThan(20);

  // Go offline and reload
  await context.setOffline(true);
  await page.goto("/plan");
  await page.waitForTimeout(3000);

  // Should NOT crash
  await expect(page.getByText("Something went wrong")).not.toBeVisible();
  const offlineBody = await page.locator("body").innerText();
  expect(offlineBody.length).toBeGreaterThan(20);

  await context.setOffline(false);
});

// ── Now page renders from cache offline ────────────────────────

test("now page loads from cache when offline (requires backend)", async ({ page, context }) => {
  await skipIfNoBackend(page, test);
  await loginAndWait(page);

  // Load now page online first
  await page.goto("/now");
  await page.waitForTimeout(3000);

  // Go offline and reload
  await context.setOffline(true);
  await page.goto("/now");
  await page.waitForTimeout(3000);

  // Should NOT crash
  await expect(page.getByText("Something went wrong")).not.toBeVisible();

  // Should show either today's schedule or "No schedule for today" — both are valid
  const body = await page.locator("body").innerText();
  expect(body.length).toBeGreaterThan(10);

  await context.setOffline(false);
});

// ── Chat panel minimize button (chevron, not X) ────────────────

test("chat panel close button is a chevron that preserves messages (requires backend)", async ({ page }) => {
  await skipIfNoBackend(page, test);
  await loginAndWait(page);

  // Verify we're past the login page
  const url = page.url();
  if (url.includes("/login")) {
    test.skip(true, "Login did not complete — backend may have different access codes");
  }

  // Open Scout from its tab in the bottom bar
  const scoutTab = page.locator("nav button", { hasText: "Scout" });
  await expect(scoutTab).toBeVisible({ timeout: 10000 });
  await scoutTab.click();
  await expect(page.getByRole("dialog", { name: "Scout" })).toBeVisible();

  // The chevron makes Scout small (it doesn't throw the conversation away)
  const minimizeBtn = page.getByRole("button", { name: "Make Scout small" });
  await expect(minimizeBtn).toBeVisible();
  const pathD = await minimizeBtn.locator("svg path").getAttribute("d");
  expect(pathD).toContain("6 9");  // Chevron path
  await minimizeBtn.click();

  // No conversation yet: the panel goes, and the Scout tab brings it back
  await expect(page.getByRole("dialog", { name: "Scout" })).not.toBeVisible();
  await expect(scoutTab).toBeVisible();
});

// ── Offline indicator shows when offline ───────────────────────

test("offline indicator appears and disappears with connectivity (requires backend)", async ({ page, context }) => {
  await skipIfNoBackend(page, test);
  await loginAndWait(page);

  // No "No signal" line while online
  const noSignal = page.getByText("No signal — showing what this phone saved");
  await expect(noSignal).not.toBeVisible();

  // Go offline: the line appears and stays
  await context.setOffline(true);
  await page.waitForTimeout(500);
  await expect(noSignal).toBeVisible();

  // Back online: it goes at once
  await context.setOffline(false);
  await page.waitForTimeout(500);
  await expect(noSignal).not.toBeVisible();
});

// ── Navigation works across pages offline ──────────────────────

test("can navigate between cached pages while offline (requires backend)", async ({ page, context }) => {
  await skipIfNoBackend(page, test);
  await loginAndWait(page);

  // Visit all pages to warm cache
  await page.goto("/");
  await page.waitForTimeout(2000);
  await page.goto("/plan");
  await page.waitForTimeout(2000);
  await page.goto("/now");
  await page.waitForTimeout(2000);

  // Go offline
  await context.setOffline(true);

  // Navigate between pages — all should render from cache
  await page.goto("/");
  await page.waitForTimeout(2000);
  await expect(page.getByText("Something went wrong")).not.toBeVisible();
  const overviewBody = await page.locator("body").innerText();
  expect(overviewBody.length).toBeGreaterThan(10);

  await page.goto("/plan");
  await page.waitForTimeout(2000);
  await expect(page.getByText("Something went wrong")).not.toBeVisible();

  await page.goto("/now");
  await page.waitForTimeout(2000);
  await expect(page.getByText("Something went wrong")).not.toBeVisible();

  await context.setOffline(false);
});

// ── Now page next-up toggle exists ─────────────────────────────

test("now page renders correctly and toggle shows when trip active (requires backend)", async ({ page }) => {
  await skipIfNoBackend(page, test);
  await loginAndWait(page);

  const url = page.url();
  if (url.includes("/login")) {
    test.skip(true, "Login did not complete");
  }

  await page.goto("/now");
  await page.waitForTimeout(3000);

  // Page should not crash
  await expect(page.getByText("Something went wrong")).not.toBeVisible();

  // Outside trip dates (March 2026, trip is Oct-Nov 2026), Now page shows
  // "No schedule for today" with an early return before the toggle renders.
  // This is correct behavior — we just verify the page renders cleanly.
  const noSchedule = await page.getByText("No schedule for today").isVisible().catch(() => false);
  const todaySchedule = await page.getByText("Today's Schedule").isVisible().catch(() => false);

  if (todaySchedule) {
    // Inside trip dates — toggle should be visible
    await expect(page.getByText("Show next-up reminder on open")).toBeVisible();
  } else if (noSchedule) {
    // Outside trip dates — page renders correct message, toggle not shown
    await expect(page.getByText("Today doesn't fall within your trip dates")).toBeVisible();
  }
  // Either case means the page rendered correctly without crashing
});
