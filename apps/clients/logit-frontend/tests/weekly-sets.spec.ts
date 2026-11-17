/**
 * Sets this week: hard sets per muscle against a target, and the active split scored
 * against the same targets with a fix for what it leaves short.
 */
import { test, expect } from "@playwright/test";

test("shows this week's sets per muscle and scores the split", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, session: true, splits: true }));
    // Two bench workouts this week, 4 sets each: 8 chest sets.
    const sets = (p: string) =>
      [0, 1, 2, 3].map((i) => ({ id: `${p}${i}`, setType: "normal", reps: 8, weight: 80, orderIndex: i, completed: true }));
    const now = Date.now();
    const benchSession = (id: string, ago: number) => ({
      id,
      startedAtMs: now - ago,
      endedAtMs: now - ago + 3_600_000,
      blocks: [{ id: `b-${id}`, type: "strength", orderIndex: 0, data: { exerciseName: "Bench Press", exerciseId: "core_bench_press", sets: sets(id) } }],
    });
    localStorage.setItem("logit:sessions:v1", JSON.stringify([benchSession("s1", 60_000), benchSession("s2", 120_000)]));
    // A weekday split: bench Mondays (3 sets), squat Thursdays (3 sets). Nothing for back.
    localStorage.setItem(
      "logit:splits:v1",
      JSON.stringify([
        {
          id: "split-ws",
          name: "Upper / Lower",
          archived: false,
          createdAtMs: now,
          updatedAtMs: now,
          schedule: "weekdays",
          days: [
            { id: "d1", orderIndex: 0, name: "Upper", weekday: 1, blocks: [{ type: "strength", id: "p1", orderIndex: 0, exerciseName: "Bench Press", exerciseId: "core_bench_press", targets: { sets: 3 } }] },
            { id: "d2", orderIndex: 1, name: "Lower", weekday: 4, blocks: [{ type: "strength", id: "p2", orderIndex: 0, exerciseName: "Squat", targets: { sets: 3 } }] },
          ],
        },
      ]),
    );
    localStorage.setItem("logit:activeSplitId:v1", JSON.stringify("split-ws"));
  });

  await page.goto("/progress");
  await page.getByRole("link", { name: /Sets this week/ }).click();
  await page.waitForURL(/\/progress\/weekly-sets/);

  const rows = page.getByTestId("weekly-sets");
  await expect(rows.getByRole("listitem").filter({ hasText: "Chest" })).toContainText("8 of 10–16");

  const score = page.getByTestId("split-score");
  await expect(score).toContainText("Upper / Lower plans, per week");
  await expect(score).toContainText("Chest: Add 7 sets of Bench Press on Upper.");
  await expect(score).toContainText("Back: Nothing in this split works back directly");
  await expect(score.getByRole("link", { name: "Open the split" })).toHaveAttribute("href", "/splits/split-ws");
});

test("you can set a muscle's weekly target, and go back to the default", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, session: true, splits: true }));
  });
  await page.goto("/progress/weekly-sets");
  const chest = page.getByTestId("weekly-sets").getByRole("listitem").filter({ hasText: "Chest" });
  await expect(chest).toContainText("0 of 10–16");

  await chest.getByRole("button").click();
  const editor = page.getByTestId("target-editor");
  await editor.getByRole("button", { name: "At least: more" }).click();
  await editor.getByRole("button", { name: "At least: more" }).click();
  await editor.getByRole("button", { name: "At most: more" }).click();
  await expect(page.getByTestId("target-lo")).toHaveText("12");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(chest).toContainText("0 of 12–17");
  await expect(chest).toContainText("Yours");

  // Kept after a reload, then reset.
  await page.reload();
  await expect(chest).toContainText("0 of 12–17");
  await chest.getByRole("button").click();
  await page.getByRole("button", { name: "Back to default" }).click();
  await expect(chest).toContainText("0 of 10–16");
  await expect(chest).not.toContainText("Yours");
});
