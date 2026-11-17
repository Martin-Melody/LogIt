/**
 * Fibre, sugar, sat fat, salt, vitamins and minerals: on the food sheet, the diary card and
 * the day's nutrients page. Runs on the web build (no bundled food DB), so the foods are
 * custom foods seeded with nutrients, plus a packaged-looking one without vitamins.
 */
import { test, expect, type Page } from "@playwright/test";

function seed(page: Page) {
  return page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true, step: 0 }));
    localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, nutrition: true }));
    localStorage.setItem("logit:had_account", "1");
    const food = (id: string, name: string, per100g: object, nutrients: object) => ({
      food: { id, source: "custom", name, per100g, nutrients, servings: [{ id: "g", label: "100 g", grams: 100 }] },
      createdAtMs: 1,
      updatedAtMs: 1,
    });
    localStorage.setItem(
      "logit:customFoods:v1",
      JSON.stringify({
        food_oats: food(
          "food_oats",
          "Rolled oats",
          { kcal: 375, proteinG: 13, carbsG: 66, fatG: 7 },
          { fibreG: 10, sugarG: 1, satFatG: 1.2, saltG: 0, ironMg: 4.7, thiaminMg: 0.46, magnesiumMg: 138 },
        ),
        food_yog: food(
          "food_yog",
          "Protein yoghurt",
          { kcal: 60, proteinG: 10, carbsG: 3.5, fatG: 0.2 },
          { sugarG: 3.5, satFatG: 0.1, saltG: 0.1 },
        ),
      }),
    );
  });
}

async function logFood(page: Page, name: string, grams: string) {
  await page.goto("/nutrition/log?meal=breakfast");
  await page.getByPlaceholder(/Search/).fill(name);
  await page.getByRole("button", { name: new RegExp(name) }).first().click();
  await page.getByTestId("amount-input").fill(grams);
  return page.getByRole("dialog");
}

test("the food sheet shows the label four and the vitamins for the amount", async ({ page }) => {
  await seed(page);
  const sheet = await logFood(page, "Rolled oats", "80");

  await expect(sheet.getByTestId("label-nutrients")).toContainText("8 g");
  await sheet.getByRole("button", { name: /Vitamins & minerals/ }).click();
  const micros = sheet.getByTestId("micro-nutrients");
  await expect(micros).toContainText("Iron");
  await expect(micros).toContainText("3.8 mg"); // 4.7 mg per 100 g × 0.8
  await expect(micros).toContainText("27%"); // of 14 mg
});

test("the diary card and the nutrients page add up the day", async ({ page }) => {
  await seed(page);
  let sheet = await logFood(page, "Rolled oats", "100");
  await sheet.getByRole("button", { name: "Add to Breakfast" }).click();
  await expect(page.getByText(/^1 added/)).toBeVisible();
  await page.getByPlaceholder(/Search/).fill("Protein yoghurt");
  await page.getByRole("button", { name: /Protein yoghurt/ }).first().click();
  sheet = page.getByRole("dialog");
  await page.getByTestId("amount-input").fill("200");
  await sheet.getByRole("button", { name: "Add to Breakfast" }).click();
  await expect(page.getByText(/^2 added/)).toBeVisible();
  await page.goto("/nutrition");

  const link = page.getByTestId("day-nutrients-link");
  await expect(link).toContainText("10/30"); // fibre
  await expect(link).toContainText("8"); // sugar 1 + 7
  await link.click();
  await page.waitForURL(/\/nutrition\/nutrients/);

  await expect(page.getByTestId("micro-coverage")).toContainText("1 of 2 foods");
  await expect(page.getByTestId("micro-coverage")).toContainText("Protein yoghurt has no vitamin or mineral data");
  await expect(page.getByTestId("nutrient-ironMg")).toContainText("34%");
  await page.getByTestId("nutrient-ironMg").click();
  await expect(page.getByTestId("nutrient-sources")).toContainText("Rolled oats");
  await expect(page.getByTestId("nutrient-sources")).toContainText("Not counted: 1 food");
});

test("a new food takes the whole label in its order", async ({ page }) => {
  await seed(page);
  await page.goto("/nutrition/foods?tab=foods");
  await page.getByRole("button", { name: "New food" }).click();
  await page.getByLabel("Name").fill("Protein granola");
  await page.getByLabel("Energy", { exact: true }).fill("412");
  await page.getByLabel("Fat", { exact: true }).fill("12");
  await page.getByLabel("of which saturates").fill("2.1");
  await page.getByLabel("Carbohydrate", { exact: true }).fill("48");
  await page.getByLabel("of which sugars").fill("9.5");
  await page.getByLabel("Fibre", { exact: true }).fill("8.2");
  await page.getByLabel("Protein", { exact: true }).fill("24");
  await page.getByLabel("Salt", { exact: true }).fill("0.3");
  await page.getByRole("button", { name: /Vitamins or minerals on the label/ }).click();
  await page.getByLabel("Iron", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Protein granola")).toBeVisible();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("logit:customFoods:v1") ?? "{}"));
  const granola = Object.values(stored as Record<string, { food: { name: string; nutrients?: object } }>).find(
    (f) => f.food.name === "Protein granola",
  );
  expect(granola?.food.nutrients).toEqual({ satFatG: 2.1, sugarG: 9.5, fibreG: 8.2, saltG: 0.3, ironMg: 5 });
});
