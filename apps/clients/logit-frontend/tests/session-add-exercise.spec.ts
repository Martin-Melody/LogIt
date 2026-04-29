import { test, expect, type Page } from "@playwright/test";

// ── Test data ────────────────────────────────────────────────────────────────

const testSession = {
  id: "sess-test-pw",
  startedAtMs: Date.now(),
  exercises: [],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function seedLocalStorage(page: Page) {
  await page.addInitScript((session) => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem("logit:draft:v1", JSON.stringify(session));
    // Mark all tours as seen so the driver.js overlay doesn't block clicks
    localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, session: true, splits: true }));
  }, testSession);
}

async function goToSessionPage(page: Page) {
  await seedLocalStorage(page);
  await page.goto("/session/current");
  await page.waitForLoadState("networkidle");
  // Wait for the Add exercise button to be visible (floating FAB)
  await expect(page.locator('[aria-label="Add exercise"]')).toBeVisible({ timeout: 8000 });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("session page — add exercise", () => {

  test("Add exercise dialog opens on FAB click", async ({ page }, testInfo) => {
    await goToSessionPage(page);

    await page.locator('[aria-label="Add exercise"]').click();
    await page.waitForTimeout(300);

    const shot = await page.screenshot();
    await testInfo.attach("dialog-open", { body: shot, contentType: "image/png" });

    const input = page.locator('input[placeholder="e.g. Bench Press"]');
    await expect(input).toBeVisible();
  });

  test("Add button appears for an unknown exercise name", async ({ page }, testInfo) => {
    await goToSessionPage(page);

    await page.locator('[aria-label="Add exercise"]').click();
    await page.waitForTimeout(300);

    const input = page.locator('input[placeholder="e.g. Bench Press"]');
    await input.fill("Lat Pulldown");
    await page.waitForTimeout(600);

    const shot = await page.screenshot();
    await testInfo.attach("after-typing", { body: shot, contentType: "image/png" });

    const addBtn = page.locator('button').filter({ hasText: /Add "Lat Pulldown"/ });
    await expect(addBtn).toBeVisible();
  });

  test("clicking Add button adds a new exercise to the session", async ({ page }, testInfo) => {
    // Capture any console errors
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await goToSessionPage(page);

    await page.locator('[aria-label="Add exercise"]').click();
    await page.waitForTimeout(300);

    const input = page.locator('input[placeholder="e.g. Bench Press"]');
    await input.fill("Lat Pulldown");
    await page.waitForTimeout(600);

    const beforeShot = await page.screenshot();
    await testInfo.attach("before-add-click", { body: beforeShot, contentType: "image/png" });

    const addBtn = page.locator('button').filter({ hasText: /Add "Lat Pulldown"/ });
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Wait for the dialog to close and exercise to appear
    await page.waitForTimeout(1500);

    const afterShot = await page.screenshot();
    await testInfo.attach("after-add", { body: afterShot, contentType: "image/png" });

    if (errors.length) {
      console.log("Console errors:", errors);
    }

    // The dialog should be gone
    await expect(page.locator('input[placeholder="e.g. Bench Press"]')).not.toBeVisible();

    // The exercise should appear in the session
    await expect(page.locator("text=Lat Pulldown")).toBeVisible();
  });

  test("Add button works via pointerdown (Android-style tap)", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await goToSessionPage(page);

    await page.locator('[aria-label="Add exercise"]').click();
    await page.waitForTimeout(300);

    const input = page.locator('input[placeholder="e.g. Bench Press"]');
    await input.fill("Overhead Press");
    await page.waitForTimeout(600);

    const addBtn = page.locator('button').filter({ hasText: /Add "Overhead Press"/ });
    await expect(addBtn).toBeVisible();

    // Simulate Android: fire pointerdown on the button before blur
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.includes('Add "'),
      );
      if (!btn) { console.error("Add button not found"); return; }
      btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    });

    await page.waitForTimeout(1500);

    const afterShot = await page.screenshot();
    await testInfo.attach("after-pointerdown", { body: afterShot, contentType: "image/png" });

    if (errors.length) {
      console.log("Console errors:", errors);
    }

    await expect(page.locator("text=Overhead Press")).toBeVisible();
  });

  test("adding an existing exercise from search results works", async ({ page }, testInfo) => {
    await goToSessionPage(page);

    await page.locator('[aria-label="Add exercise"]').click();
    await page.waitForTimeout(300);

    const input = page.locator('input[placeholder="e.g. Bench Press"]');
    await input.fill("Squat");
    await page.waitForTimeout(600);

    const shot = await page.screenshot();
    await testInfo.attach("search-results", { body: shot, contentType: "image/png" });

    // Click the first result
    const firstResult = page.locator('ul li button').first();
    if (await firstResult.isVisible()) {
      await firstResult.click();
    } else {
      // No results — fall back to Add button
      const addBtn = page.locator('button').filter({ hasText: /Add "Squat"/ });
      await expect(addBtn).toBeVisible();
      await addBtn.click();
    }

    await page.waitForTimeout(1500);

    const afterShot = await page.screenshot();
    await testInfo.attach("after-add-existing", { body: afterShot, contentType: "image/png" });

    await expect(page.locator("text=Squat")).toBeVisible();
  });

});
