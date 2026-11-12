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
      blocks: [
        { type: "strength", id: "pex-1", orderIndex: 0, exerciseName: "Squat",       targets: {} },
        { type: "strength", id: "pex-2", orderIndex: 1, exerciseName: "Bench Press", targets: {} },
        { type: "strength", id: "pex-3", orderIndex: 2, exerciseName: "Deadlift",    targets: {} },
      ],
    },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function seedLocalStorage(page: Page) {
  await page.addInitScript((split) => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem("logit:splits:v1", JSON.stringify([split]));
    // Suppress the driver.js coach-mark tours — their overlay intercepts pointer events.
    localStorage.setItem(
      "logit:tours:v1",
      JSON.stringify({
        home: true, session: true, splits: true, splitDetail: true,
        splitDay: true, exercises: true, profile: true,
      }),
    );
  }, testSplit);
}

async function goToDayEditor(page: Page) {
  await seedLocalStorage(page);
  await page.goto(`/splits/${SPLIT_ID}/days/${DAY_ID}`);
  await page.waitForLoadState("networkidle");
  // Make sure the exercise list is visible before proceeding
  await expect(page.getByTestId("day-blocks")).toBeVisible();
}

function exerciseNames(page: Page) {
  return page.getByTestId("planned-name");
}

/** Opens the "add block" picker and switches to the exercise-search field. */
async function openExerciseAdd(page: Page) {
  await page.locator('[aria-label="Add block"]').click();
  await page.getByRole("button", { name: /Strength exercise/ }).click();
}

/** The split as saved in local storage. */
async function storedDay(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("logit:splits:v1") ?? "[]")[0]?.days?.[0]);
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

    const rowBox = await page.getByTestId("planned-block").first().boundingBox();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    const targetY = cy + rowBox!.height * 2.5; // past the middle of the third row

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

    await openExerciseAdd(page);
    await page.waitForTimeout(200);

    const input = page.locator('input[placeholder="Search or add exercise…"]');
    await input.fill("Landmine Press");
    await page.waitForTimeout(600);

    const shot = await page.screenshot();
    await testInfo.attach("after-typing", { body: shot, contentType: "image/png" });

    const addBtn = page.locator('button').filter({ hasText: /Add "Landmine Press"/ });
    await expect(addBtn).toBeVisible();

    const box = await addBtn.boundingBox();
    console.log("Add button box:", JSON.stringify(box));
  });

  test("clicking Add button adds the exercise (mouse click)", async ({ page }, testInfo) => {
    await goToDayEditor(page);

    await openExerciseAdd(page);
    await page.waitForTimeout(200);

    const input = page.locator('input[placeholder="Search or add exercise…"]');
    await input.fill("Landmine Press");
    await page.waitForTimeout(600);

    const beforeShot = await page.screenshot();
    await testInfo.attach("before-click", { body: beforeShot, contentType: "image/png" });

    const addBtn = page.locator('button').filter({ hasText: /Add "Landmine Press"/ });
    await expect(addBtn).toBeVisible();

    // Standard click — this is what a desktop browser user does
    await addBtn.click();
    await page.waitForTimeout(1500);

    const afterShot = await page.screenshot();
    await testInfo.attach("after-click", { body: afterShot, contentType: "image/png" });

    const names = await exerciseNames(page).allTextContents();
    console.log("Exercises after add:", names);

    await expect(exerciseNames(page).filter({ hasText: "Landmine Press" })).toBeVisible();
  });

  test("Add button works via pointerdown (simulates Android tap-before-blur)", async ({ page }, testInfo) => {
    await goToDayEditor(page);

    await openExerciseAdd(page);
    await page.waitForTimeout(200);

    const input = page.locator('input[placeholder="Search or add exercise…"]');
    await input.fill("Meadows Row");
    await page.waitForTimeout(600);

    const addBtn = page.locator('button').filter({ hasText: /Add "Meadows Row"/ });
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

    await expect(exerciseNames(page).filter({ hasText: "Meadows Row" })).toBeVisible();
  });

});

test.describe("planned targets", () => {
  test("setting sets/reps/weight shows a summary and writes to storage", async ({ page }) => {
    await goToDayEditor(page);

    // Tap the first exercise row to expand its target editor.
    await page.getByRole("button", { name: /Squat/ }).first().click();
    const sets = page.getByLabel("Sets");
    await expect(sets).toBeVisible();

    await sets.fill("3");
    await page.getByLabel("Reps").fill("5");
    await page.getByLabel(/^Weight/).fill("100");
    await page.getByLabel(/^Weight/).blur();

    await expect(page.locator("main")).toContainText("3 × 5", { timeout: 10_000 });
    await expect(page.locator("main")).toContainText("100 kg");

    // Persisted to the split store (kg canonical).
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const split = JSON.parse(localStorage.getItem("logit:splits:v1") ?? "[]")[0];
          return split?.days?.[0]?.blocks?.[0]?.targets ?? null;
        }),
      )
      .toEqual({ sets: 3, reps: 5, weight: 100 });

    // Clearing removes it.
    await page.getByText("Clear targets").click();
    await expect(page.getByTestId("planned-block").first()).toContainText("Add targets");
  });
});

// ── Supersets, circuits and drills ───────────────────────────────────────────

test.describe("groups and drills", () => {
  test("groups two exercises into a superset from the row menu", async ({ page }) => {
    await goToDayEditor(page);

    await page.getByRole("button", { name: "More actions for Squat" }).click();
    await page.getByRole("menuitem", { name: "Superset / circuit with…" }).click();
    await page.getByRole("checkbox", { name: /Deadlift/ }).check();
    await page.getByRole("button", { name: "Make superset" }).click();

    const band = page.getByTestId("planned-group");
    await expect(band).toBeVisible();
    await expect(band).toContainText("Superset");
    await expect(band).toContainText("2 exercises · 3 rounds");
    // Deadlift moved up next to Squat.
    await expect(exerciseNames(page)).toHaveText(["Squat", "Deadlift", "Bench Press"]);

    await expect.poll(async () => (await storedDay(page))?.groups?.length).toBe(1);
    const day = await storedDay(page);
    expect(day.groups[0]).toMatchObject({ kind: "superset", rounds: 3 });
    const grouped = day.blocks.filter((b: { groupId?: string }) => b.groupId === day.groups[0].id);
    expect(grouped.map((b: { exerciseName: string }) => b.exerciseName).sort()).toEqual(["Deadlift", "Squat"]);
  });

  test("the group's name opens the edit sheet: name, rounds, rest", async ({ page }) => {
    await goToDayEditor(page);
    await page.getByRole("button", { name: "More actions for Squat" }).click();
    await page.getByRole("menuitem", { name: "Superset / circuit with…" }).click();
    await page.getByRole("checkbox", { name: /Bench Press/ }).check();
    await page.getByRole("button", { name: "Make superset" }).click();

    await page.getByRole("button", { name: "Edit Superset" }).click();
    const sheet = page.getByRole("dialog", { name: "Edit superset" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "One more round" }).click();
    await sheet.getByRole("button", { name: "1 min", exact: true }).click();
    await sheet.getByLabel("Name").fill("Push pair");
    await sheet.getByRole("button", { name: "Save" }).click();

    await expect
      .poll(async () => (await storedDay(page))?.groups?.[0])
      .toMatchObject({ label: "Push pair", rounds: 4, roundRestMs: 60_000 });
    await sheet.getByRole("button", { name: "Close" }).first().click();
    await expect(page.getByTestId("planned-group")).toContainText("Push pair");
    await expect(page.getByTestId("planned-group")).toContainText("4 rounds · 1 min rest");

    // In a group the sets come from the rounds: no Sets field.
    await page.getByTestId("planned-block").first().getByRole("button", { name: /^Squat/ }).click();
    await expect(page.getByLabel("Reps")).toBeVisible();
    await expect(page.getByLabel("Sets")).toHaveCount(0);
  });

  test("ungrouping keeps the rounds as each exercise's sets", async ({ page }) => {
    await goToDayEditor(page);
    await page.getByRole("button", { name: "More actions for Squat" }).click();
    await page.getByRole("menuitem", { name: "Superset / circuit with…" }).click();
    await page.getByRole("checkbox", { name: /Bench Press/ }).check();
    await page.getByRole("button", { name: "Make superset" }).click();

    await page.getByRole("button", { name: "More actions for this superset" }).click();
    await page.getByRole("menuitem", { name: "Ungroup" }).click();
    await expect(page.getByTestId("planned-group")).toHaveCount(0);
    await expect.poll(async () => (await storedDay(page))?.groups ?? []).toEqual([]);
    const day = await storedDay(page);
    expect(day.blocks.every((b: { groupId?: string }) => !b.groupId)).toBe(true);
    expect(day.blocks.find((b: { exerciseName: string }) => b.exerciseName === "Squat").targets).toEqual({ sets: 3 });
    await expect(page.getByTestId("planned-block").first()).toContainText("3 sets");
  });

  test("adds a mobility drill with a hold target and makes it a one-drill circuit", async ({ page }) => {
    await goToDayEditor(page);
    await page.locator('[aria-label="Add block"]').click();
    await page.getByRole("button", { name: /Mobility/ }).click();
    await page.getByPlaceholder("Search drills, or type a new one…").fill("Dead hang");
    await page.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
    await expect(exerciseNames(page)).toHaveText(["Squat", "Bench Press", "Deadlift", "Dead hang"]);

    await page.getByTestId("planned-block").last().getByRole("button", { name: /^Dead hang/ }).click();
    await page.getByLabel("Sets").fill("3");
    await page.getByLabel("Hold (s)").fill("30");
    await page.getByLabel("Hold (s)").blur();
    await expect(page.getByTestId("planned-block").last()).toContainText("3 × 30 s hold");

    await page.getByRole("button", { name: "More actions for Dead hang" }).click();
    await page.getByRole("menuitem", { name: "Superset / circuit with…" }).click();
    await page.getByRole("radio", { name: "Circuit" }).click();
    await page.getByRole("button", { name: "Make circuit · 1 exercise" }).click();
    await expect(page.getByTestId("planned-group")).toContainText("1 exercise · 3 rounds");

    const day = await storedDay(page);
    const drill = day.blocks.find((b: { type: string }) => b.type === "mobility");
    expect(drill).toMatchObject({ drillName: "Dead hang", metric: "hold", targets: { sets: 3, holdSec: 30 } });
    expect(day.groups[0]).toMatchObject({ kind: "circuit", rounds: 3 });
  });

  test("a member drags only within its group", async ({ page }) => {
    await goToDayEditor(page);
    await page.getByRole("button", { name: "More actions for Squat" }).click();
    await page.getByRole("menuitem", { name: "Superset / circuit with…" }).click();
    await page.getByRole("checkbox", { name: /Bench Press/ }).check();
    await page.getByRole("button", { name: "Make superset" }).click();
    await expect(exerciseNames(page)).toHaveText(["Squat", "Bench Press", "Deadlift"]);

    // Drag Squat far down, past Deadlift: it stops at the end of its group.
    const grip = page.locator('[aria-label="Drag to reorder"]').first();
    const box = (await grip.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(cx, cy + i * 30);
    await page.mouse.up();
    await expect(exerciseNames(page)).toHaveText(["Bench Press", "Squat", "Deadlift"]);
  });
});
