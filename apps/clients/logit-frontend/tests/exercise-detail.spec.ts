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
  test("the page has the three tabs; a built-in exercise can be copied, not deleted", async ({ page }) => {
    await bypassOnboarding(page);
    await page.goto("/exercises/ex_core_bench");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Bench Press" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Progress" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "How to" }).click();
    await expect(page.getByText("How to do it")).toBeVisible();
    // Machines live in places now: no machine list on the exercise.
    await expect(page.getByText("Add a machine…")).toHaveCount(0);

    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(page.getByRole("button", { name: /Start progression over/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Make my own copy/ })).toBeVisible();
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

    // The name opens the exercise over the workout (design canvas E1–E3). Never done before,
    // so it opens on How to.
    const sheet = page.getByRole("dialog", { name: "Bench Press" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("tab", { name: "How to" })).toHaveAttribute("aria-selected", "true");
    await sheet.getByRole("tab", { name: "Settings" }).click();
    await expect(sheet.getByRole("button", { name: /Start progression over/ })).toBeVisible();

    // Close returns to the session.
    await page.getByRole("button", { name: "Close details" }).click();
    await expect(page.getByRole("button", { name: /Start progression over/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Finish workout" })).toBeVisible();
  });

  test("a machine can be added from the exercise sheet mid-workout, even with no gym yet", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
      localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, session: true, splits: true }));
      localStorage.setItem("logit:profile:v1", JSON.stringify({ blocksCollapsedByDefault: false }));
      localStorage.setItem(
        "logit:draft:v1",
        JSON.stringify({
          id: "sess-machine",
          startedAtMs: Date.now() - 60_000,
          blocks: [{ id: "b1", type: "strength", orderIndex: 0, data: { exerciseName: "Pec Deck", exerciseId: "ex_core_pec_deck", sets: [] } }],
        }),
      );
    });

    await page.goto("/session/current");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Pec Deck — open details" }).click();

    const sheet = page.getByRole("dialog", { name: "Pec Deck" });
    await sheet.getByRole("tab", { name: "How to" }).click();
    await sheet.getByRole("button", { name: "Add the machine you use" }).click();
    await expect(page.getByRole("dialog", { name: "Add a machine" })).toBeVisible();
  });
});
