/**
 * Workout undo/redo (design canvas 3c): removing an exercise shows an Undo toast that
 * points at ⋯ the first times, Undo flips it to Redo, and ⋯ always has both, naming the step.
 */
import { test, expect, type Page } from "@playwright/test";

async function seed(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, session: true, splits: true }));
    localStorage.setItem("logit:profile:v1", JSON.stringify({ blocksCollapsedByDefault: false }));
    const sets = [0, 1].map((i) => ({ id: `s${i}`, setType: "normal", orderIndex: i, reps: 0, weight: 20 }));
    localStorage.setItem(
      "logit:draft:v1",
      JSON.stringify({
        id: "current-sess",
        startedAtMs: Date.now() - 600_000,
        blocks: [
          { id: "b1", type: "strength", orderIndex: 0, data: { exerciseName: "Bench Press", sets } },
          { id: "b2", type: "strength", orderIndex: 1, data: { exerciseName: "Lateral Raise", sets } },
        ],
      }),
    );
  });
}

test("remove an exercise, undo from the toast, redo, and undo again from ⋯", async ({ page }) => {
  await seed(page);
  await page.goto("/session/current");
  await page.waitForLoadState("networkidle");
  const name = page.getByRole("button", { name: "Lateral Raise — open details" });
  await expect(name).toBeVisible();

  await page.getByRole("button", { name: "More actions for Lateral Raise" }).click();
  await page.getByRole("button", { name: "Remove from this workout" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(name).toHaveCount(0);
  await expect(page.getByText("Lateral Raise removed.")).toBeVisible();
  await expect(page.getByText("Undo and redo are also in the ⋯ menu.")).toBeVisible();
  await page.waitForTimeout(800); // let the toast finish sliding in
  await page.screenshot({ path: "test-results/workout-undo-toast.png" });

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(name).toBeVisible();
  await expect(page.getByText("Lateral Raise is back.")).toBeVisible();

  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(name).toHaveCount(0);

  await page.getByRole("button", { name: "Workout options" }).click();
  await expect(page.getByTestId("workout-undo")).toContainText("Remove Lateral Raise");
  await page.screenshot({ path: "test-results/workout-undo-menu.png" });
  await page.getByTestId("workout-undo").click();
  await expect(name).toBeVisible();
});
