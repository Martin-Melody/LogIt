/**
 * Nutrition UI smoke test — drives the personal nutrition flows end to end on the web
 * (localStorage repos, no backend). Seeds a weight history + intake so the trend and the
 * adaptive target render, then walks goal → diary → weight → foods, capturing a screenshot
 * at each step.
 *
 * Screenshots land in screenshots/nutrition/ (gitignored). Run:
 *   npx playwright test nutrition-smoke   (dev server auto-starts)
 */
import { test, expect } from "@playwright/test";

const SHOTS = "screenshots/nutrition";
const DAY = 86_400_000;

/** ~26 days of a steady cut: 84 kg trending down ~0.4 kg/week + daily noise, 2400 kcal/day. */
function seedData() {
  const now = Date.now();
  const weight: Record<string, unknown> = {};
  const days: Record<string, unknown> = {};
  for (let i = 26; i >= 1; i--) {
    const iso = new Date(now - i * DAY).toISOString().slice(0, 10);
    const kg = 84 - (26 - i) * (0.4 / 7) + (i % 2 ? 0.3 : -0.3);
    weight[`wt_${i}`] = {
      id: `wt_${i}`,
      dateIso: iso,
      weightKg: Math.round(kg * 100) / 100,
      createdAtMs: now - i * DAY,
      updatedAtMs: now - i * DAY,
    };
    days[`nday_${iso}`] = {
      id: `nday_${iso}`,
      dateIso: iso,
      createdAtMs: now - i * DAY,
      updatedAtMs: now - i * DAY,
      items: [
        {
          id: `seed_${i}`,
          meal: "dinner",
          name: "Seeded day",
          grams: 0,
          computed: { kcal: 2400, proteinG: 170, carbsG: 250, fatG: 70 },
        },
      ],
    };
  }
  return { weight: JSON.stringify(weight), days: JSON.stringify(days) };
}

test.beforeEach(async ({ page }) => {
  const seeded = seedData();
  await page.addInitScript(
    ({ weight, days }) => {
      // Guard every seed so navigations after the first don't clobber changes the test made.
      const seed = (k: string, v: string) => {
        if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
      };
      seed("logit:onboarding:v1", JSON.stringify({ completed: true, step: 0 }));
      seed("logit:tours:v1", JSON.stringify({ home: true, session: true, splits: true, nutrition: true }));
      seed("logit:had_account", "1");
      seed(
        "logit:profile:v1",
        JSON.stringify({ name: "Smoke", weight: 84, weightUnit: "kg", height: 180, heightUnit: "cm" }),
      );
      seed("logit:weightEntries:v1", weight);
      seed("logit:nutritionDays:v1", days);
    },
    seeded,
  );
});

test("nutrition personal flow", async ({ page }) => {
  // ── Today, before a goal is set ──
  await page.goto("/nutrition");
  await expect(page.getByRole("heading", { name: "Nutrition" })).toBeVisible();
  await expect(page.getByText("Set a goal for calorie")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/01-today-no-goal.png`, fullPage: true });

  // ── Goal wizard ──
  await page.goto("/nutrition/goal");
  await page.getByRole("button", { name: "male", exact: true }).click().catch(() => {});
  await page.getByRole("button", { name: "male", exact: true }).click();
  await page.locator('input[type="date"]').fill("1994-06-15");
  await page.getByRole("button", { name: "lose", exact: true }).click();
  await expect(page.getByText("Your target")).toBeVisible();
  await page.getByText("Your target").scrollIntoViewIfNeeded();
  await expect(page.getByText(/\d[\d,]* kcal/).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/02-goal-with-preview.png`, fullPage: true });
  await page.getByRole("button", { name: "Save goal" }).click();
  await page.waitForURL("**/nutrition");

  // ── Today, with an adaptive target and seeded history ──
  await expect(page.getByText("Daily target")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/03-today-with-target.png`, fullPage: true });

  // ── Log a food (quick-add) ──
  const today = new Date().toISOString().slice(0, 10);
  await page.goto(`/nutrition/log?meal=lunch&date=${today}`);
  await page.getByRole("button", { name: "Quick add" }).click();
  await page.getByPlaceholder("Name").fill("Chicken & rice bowl");
  await page.getByPlaceholder("kcal").fill("650");
  await page.getByPlaceholder("P", { exact: true }).fill("55");
  await page.getByPlaceholder("C", { exact: true }).fill("70");
  await page.getByPlaceholder("F", { exact: true }).fill("15");
  await page.screenshot({ path: `${SHOTS}/04-log-quick-add.png`, fullPage: true });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForURL(/\/nutrition$/);
  await expect(page.getByText("Chicken & rice bowl")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/05-today-logged.png`, fullPage: true });

  // ── Weight trend ──
  await page.goto("/nutrition/weight");
  await expect(page.getByRole("heading", { name: "Weight" })).toBeVisible();
  await expect(page.locator("svg[aria-label='Bodyweight trend']")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/06-weight-trend.png`, fullPage: true });

  // ── Custom food ──
  await page.goto("/nutrition/foods");
  await page.getByRole("button", { name: "New" }).nth(1).click();
  await page.getByPlaceholder("Name").fill("Skyr, plain");
  await page.getByPlaceholder("kcal").fill("63");
  await page.getByPlaceholder("P", { exact: true }).fill("11");
  await page.getByPlaceholder("C", { exact: true }).fill("4");
  await page.getByPlaceholder("F", { exact: true }).fill("0.2");
  await page.getByRole("button", { name: "Save food" }).click();
  await expect(page.getByText("Skyr, plain")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/07-foods.png`, fullPage: true });

  // ── Recipe editor ──
  await page.getByRole("button", { name: "New" }).first().click();
  await page.waitForURL("**/nutrition/foods/recipe/**");
  await expect(page.getByRole("heading", { name: "Recipe" })).toBeVisible();
  await page.getByRole("textbox").first().fill("Overnight oats");
  await page.screenshot({ path: `${SHOTS}/08-recipe-editor.png`, fullPage: true });
});
