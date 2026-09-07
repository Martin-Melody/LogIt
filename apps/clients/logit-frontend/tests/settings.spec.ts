import { test, expect, type Page } from "@playwright/test";

async function bypass(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, session: true, splits: true, profile: true }));
  });
}

test.describe("settings", () => {
  test("Units section switches weight unit and persists it", async ({ page }) => {
    await bypass(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const units = page.locator("#sec-units");
    await expect(units).toContainText("Weight");
    await expect(units).toContainText("Height");

    // Default is kg; switch to lb.
    await units.getByRole("button", { name: "lb", exact: true }).click();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const p = JSON.parse(localStorage.getItem("logit:profile:v1") ?? "{}");
          return p.weightUnit;
        }),
      )
      .toBe("lbs");
  });

  test("quick-nav jumps to a section", async ({ page }) => {
    await bypass(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Danger", exact: true }).click();
    // The Danger zone card is the scroll target.
    await expect(page.locator("#sec-danger")).toBeInViewport({ timeout: 5000 });
  });
});
