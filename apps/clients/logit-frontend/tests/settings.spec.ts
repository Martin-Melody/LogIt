import { test, expect, type Page } from "@playwright/test";

async function bypass(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, session: true, splits: true, profile: true }));
  });
}

test.describe("settings", () => {
  test("a row opens its page, which switches the weight unit and keeps it", async ({ page }) => {
    await bypass(page);
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: /^Units & equipment/ })).toContainText("kg · cm");

    await page.getByRole("link", { name: /^Units & equipment/ }).click();
    await expect(page).toHaveURL(/\/settings\/units$/);
    const units = page.locator("#units");
    await units.getByRole("button", { name: "lb", exact: true }).click();

    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("logit:profile:v1") ?? "{}").weightUnit))
      .toBe("lbs");
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("link", { name: /^Units & equipment/ })).toContainText("lb · cm");
  });

  test("search finds a setting and opens its page at it", async ({ page }) => {
    await bypass(page);
    await page.goto("/settings");
    await page.getByPlaceholder("Search settings").fill("plate");
    await expect(page.getByRole("link", { name: /^Plates/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Your places/ })).toBeVisible();

    await page.getByRole("link", { name: /^Plates/ }).click();
    await expect(page).toHaveURL(/\/settings\/units#bar-plates$/);
    await expect(page.locator("#bar-plates")).toBeInViewport();

    await page.goto("/settings");
    await page.getByPlaceholder("Search settings").fill("zzz");
    await expect(page.getByText("No settings match")).toBeVisible();
  });

  test("an old link to a section lands on its page", async ({ page }) => {
    await bypass(page);
    await page.goto("/settings#sec-session");
    await expect(page).toHaveURL(/\/settings\/workout$/);
    await expect(page.getByText("Collapse blocks by default")).toBeVisible();
  });

  test("on a wide screen the list stays beside the open page", async ({ page }) => {
    await bypass(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings\/account$/);

    await page.getByRole("link", { name: "Workout", exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/workout$/);
    await expect(page.getByRole("link", { name: "Workout", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("Collapse blocks by default")).toBeVisible();
  });
});
