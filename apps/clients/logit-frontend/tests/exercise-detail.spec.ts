import { test, expect, type Page } from "@playwright/test";

async function bypassOnboarding(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem(
      "logit:tours:v1",
      JSON.stringify({ home: true, session: true, splits: true }),
    );
  });
}

test.describe("exercise detail", () => {
  test("route renders the shared detail body for a core exercise", async ({ page }) => {
    await bypassOnboarding(page);
    await page.goto("/exercises/ex_core_bench");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Bench Press" }).or(page.getByText("Bench Press").first())).toBeVisible();
    await expect(page.getByText("Machines")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset progression" })).toBeVisible();
    // Core exercises can't be deleted.
    await expect(page.getByRole("button", { name: "Delete exercise" })).toHaveCount(0);
  });

  test("tapping an exercise name in a session opens the detail sheet", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
      localStorage.setItem(
        "logit:tours:v1",
        JSON.stringify({ home: true, session: true, splits: true }),
      );
      localStorage.setItem("logit:profile:v1", JSON.stringify({ blocksCollapsedByDefault: false }));
      localStorage.setItem(
        "logit:draft:v1",
        JSON.stringify({
          id: "sess-test",
          startedAtMs: Date.now() - 60_000,
          blocks: [
            {
              id: "b1",
              type: "strength",
              orderIndex: 0,
              data: { exerciseName: "Bench Press", exerciseId: "ex_core_bench", sets: [] },
            },
          ],
        }),
      );
    });

    await page.goto("/session/current");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Bench Press — open details" }).click();

    // Sheet content (shared ExerciseDetailBody).
    await expect(page.getByRole("button", { name: "Reset progression" })).toBeVisible();
    await expect(page.getByText("Machines")).toBeVisible();

    // Close returns to the session.
    await page.getByRole("button", { name: "Close details" }).click();
    await expect(page.getByRole("button", { name: "Reset progression" })).toHaveCount(0);
    await expect(page.getByText("Finish workout")).toBeVisible();
  });
});
