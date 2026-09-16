import { test, expect, type Page } from "@playwright/test";

// These pages read real built-in algorithm definitions from the plugin registries
// (not seedable data) — so tests target actual registered algorithm ids rather than
// fixtures: "linear-progression" (strength), "linear-mobility" (mobility), and
// "learned-muscle-group-insight" (has no configurable preferences at all, a useful
// contrast case).

async function seedBase(page: Page, prefs?: Record<string, Record<string, unknown>>) {
  await page.addInitScript(
    (prefs) => {
      localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
      localStorage.setItem(
        "logit:tours:v1",
        JSON.stringify({ home: true, session: true, splits: true }),
      );
      if (prefs) localStorage.setItem("logit:progression:prefs:v1", JSON.stringify(prefs));
    },
    prefs,
  );
}

test.describe("progression algorithm preferences", () => {
  test("loads linear-progression and shows its default rep-range fields", async ({ page }) => {
    await seedBase(page);
    await page.goto("/settings/progression/linear-progression");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Linear Progression Settings" })).toBeVisible();
    await expect(page.getByText("Rep range — lower bound")).toBeVisible();

    const first = page.locator('input[type="number"]').first();
    await expect(first).toHaveValue("5");
  });

  test("shows 'Algorithm not found.' for an unregistered id", async ({ page }) => {
    await seedBase(page);
    await page.goto("/settings/progression/does-not-exist");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Algorithm not found.")).toBeVisible();
  });
});

test.describe("mobility progression algorithm preferences", () => {
  test("loads linear-mobility with its default starting-hold field", async ({ page }) => {
    await seedBase(page);
    await page.goto("/settings/mobility-progression/linear-mobility");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Linear mobility Settings" })).toBeVisible();
    await expect(page.getByText("Starting hold")).toBeVisible();
  });

  test("changing a numeric preference persists it under the algorithm's own id", async ({ page }) => {
    await seedBase(page);
    await page.goto("/settings/mobility-progression/linear-mobility");
    await page.waitForLoadState("networkidle");

    const startHold = page.locator('input[type="number"]').first();
    await expect(startHold).toHaveValue("20");
    await startHold.fill("30");
    await startHold.blur();

    await page.waitForFunction(() => {
      const raw = localStorage.getItem("logit:progression:prefs:v1");
      if (!raw) return false;
      return JSON.parse(raw)["linear-mobility"]?.startHoldSec === 30;
    });
  });

  test("'Reset to defaults' restores the field to its schema default", async ({ page }) => {
    await seedBase(page, { "linear-mobility": { startHoldSec: 45 } });
    await page.goto("/settings/mobility-progression/linear-mobility");
    await page.waitForLoadState("networkidle");

    const startHold = page.locator('input[type="number"]').first();
    await expect(startHold).toHaveValue("45");

    await page.getByRole("button", { name: "Reset to defaults" }).click();
    await expect(startHold).toHaveValue("20");
  });
});

test.describe("muscle-group insight algorithm preferences", () => {
  test("shows the no-preferences message for an algorithm with no schema", async ({ page }) => {
    await seedBase(page);
    await page.goto("/settings/muscle-group-insight/learned-muscle-group-insight");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText("This algorithm has no configurable preferences."),
    ).toBeVisible();
  });
});
