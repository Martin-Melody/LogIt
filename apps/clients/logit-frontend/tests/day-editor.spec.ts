import { test, expect, type Page } from "@playwright/test";

// ── Test data ────────────────────────────────────────────────────────────────

const SPLIT_ID = "split-test-pw";
const DAY_ID   = "day-test-pw";

const testSplit = {
  id: SPLIT_ID,
  name: "PW Test Split",
  archived: false,
  createdAtMs: Date.now(),
  updatedAtMs: Date.now(),
  days: [
    {
      id: DAY_ID,
      orderIndex: 0,
      name: "Test Day",
      exercises: [
        { id: "pex-1", orderIndex: 0, exerciseName: "Squat",       targets: {} },
        { id: "pex-2", orderIndex: 1, exerciseName: "Bench Press", targets: {} },
        { id: "pex-3", orderIndex: 2, exerciseName: "Deadlift",    targets: {} },
      ],
    },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function seedLocalStorage(page: Page) {
  await page.addInitScript((split) => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem("logit:splits:v1", JSON.stringify([split]));
  }, testSplit);
}

async function goToDayEditor(page: Page) {
  await seedLocalStorage(page);
  await page.goto(`/splits/${SPLIT_ID}/days/${DAY_ID}`);
  await page.waitForLoadState("networkidle");
  // Make sure the exercise list is visible before proceeding
  await expect(page.locator("main ul")).toBeVisible();
}

function exerciseNames(page: Page) {
  return page.locator("main ul li span.truncate");
}

// ── Drag to reorder ──────────────────────────────────────────────────────────

test.describe("drag to reorder", () => {

  test("grip handles are visible and colored", async ({ page }, testInfo) => {
    await goToDayEditor(page);
    const shot = await page.screenshot();
    await testInfo.attach("page-initial", { body: shot, contentType: "image/png" });

    const grips = page.locator('[aria-label="Drag to reorder"]');
    await expect(grips).toHaveCount(3);

    // Log bounding boxes so we know exactly where to interact
    const boxes = await grips.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, left: r.left, width: r.width, height: r.height };
      }),
    );
    console.log("Grip button boxes:", JSON.stringify(boxes, null, 2));
  });

  test("mouse drag on grip moves exercise (browser test)", async ({ page }, testInfo) => {
    await goToDayEditor(page);

    const before = await exerciseNames(page).allTextContents();
    console.log("Order before drag:", before);

    // Get the first grip handle and drag it down
    const firstGrip = page.locator('[aria-label="Drag to reorder"]').first();
    const box = await firstGrip.boundingBox();
    expect(box).not.toBeNull();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    const targetY = cy + box!.height * 2.2; // drag ~2 rows down

    console.log(`Mouse drag: from (${cx}, ${cy}) to (${cx}, ${targetY})`);

    // Real mouse drag — this is what the user does in the browser
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    const mid = await page.screenshot();
    await testInfo.attach("during-drag-mousedown", { body: mid, contentType: "image/png" });

    // Move gradually so the dragToIdx updates step by step
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(cx, cy + ((targetY - cy) * i) / steps);
    }
    const dragging = await page.screenshot();
    await testInfo.attach("during-drag-moved", { body: dragging, contentType: "image/png" });

    await page.mouse.up();
    await page.waitForTimeout(1500); // wait for persist

    const after = await page.screenshot();
    await testInfo.attach("after-drag", { body: after, contentType: "image/png" });

    const afterOrder = await exerciseNames(page).allTextContents();
    console.log("Order after drag:", afterOrder);

    // Squat (was #1) should now be at #3
    expect(afterOrder[2]).toBe("Squat");
  });

});

// ── Add new exercise ─────────────────────────────────────────────────────────

test.describe("add new exercise", () => {

  test("Add button appears for unknown exercise name", async ({ page }, testInfo) => {
    await goToDayEditor(page);

    await page.locator('[aria-label="Add exercise"]').click();
    await page.waitForTimeout(200);

    const input = page.locator('input[placeholder="Search or add exercise…"]');
    await input.fill("Lat Pulldown");
    await page.waitForTimeout(600);

    const shot = await page.screenshot();
    await testInfo.attach("after-typing", { body: shot, contentType: "image/png" });

    const addBtn = page.locator('button').filter({ hasText: /Add "Lat Pulldown"/ });
    await expect(addBtn).toBeVisible();

    const box = await addBtn.boundingBox();
    console.log("Add button box:", JSON.stringify(box));
  });

  test("clicking Add button adds the exercise (mouse click)", async ({ page }, testInfo) => {
    await goToDayEditor(page);

    await page.locator('[aria-label="Add exercise"]').click();
    await page.waitForTimeout(200);

    const input = page.locator('input[placeholder="Search or add exercise…"]');
    await input.fill("Lat Pulldown");
    await page.waitForTimeout(600);

    const beforeShot = await page.screenshot();
    await testInfo.attach("before-click", { body: beforeShot, contentType: "image/png" });

    const addBtn = page.locator('button').filter({ hasText: /Add "Lat Pulldown"/ });
    await expect(addBtn).toBeVisible();

    // Standard click — this is what a desktop browser user does
    await addBtn.click();
    await page.waitForTimeout(1500);

    const afterShot = await page.screenshot();
    await testInfo.attach("after-click", { body: afterShot, contentType: "image/png" });

    const names = await exerciseNames(page).allTextContents();
    console.log("Exercises after add:", names);

    await expect(exerciseNames(page).filter({ hasText: "Lat Pulldown" })).toBeVisible();
  });

  test("Add button works via pointerdown (simulates Android tap-before-blur)", async ({ page }, testInfo) => {
    await goToDayEditor(page);

    await page.locator('[aria-label="Add exercise"]').click();
    await page.waitForTimeout(200);

    const input = page.locator('input[placeholder="Search or add exercise…"]');
    await input.fill("Overhead Press");
    await page.waitForTimeout(600);

    const addBtn = page.locator('button').filter({ hasText: /Add "Overhead Press"/ });
    await expect(addBtn).toBeVisible();

    // Simulate Android: fire pointerdown, then blur the input, then pointerup
    // This mirrors what happens on device when the keyboard dismisses mid-tap
    await page.evaluate(() => {
      const btn = document.querySelector('button[onpointerdown]') ??
        [...document.querySelectorAll("button")].find((b) => b.textContent?.includes('Add "'));
      const input = document.querySelector('input[placeholder="Search or add exercise…"]') as HTMLInputElement | null;
      if (!btn || !input) { console.error("elements not found"); return; }

      // Fire pointerdown on button — our handler calls confirmNew() here
      btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      // Now blur the input (simulating keyboard dismiss)
      input.blur();
    });

    await page.waitForTimeout(1500);

    const afterShot = await page.screenshot();
    await testInfo.attach("after-pointerdown", { body: afterShot, contentType: "image/png" });

    const names = await exerciseNames(page).allTextContents();
    console.log("Exercises after pointerdown add:", names);

    await expect(exerciseNames(page).filter({ hasText: "Overhead Press" })).toBeVisible();
  });

});
