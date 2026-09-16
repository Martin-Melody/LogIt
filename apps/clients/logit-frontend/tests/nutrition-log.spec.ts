import { test, expect, type Page } from "@playwright/test";

// ── Test data factories ───────────────────────────────────────────────────────

function makeFoodRef(id: string, patch: object = {}) {
  return {
    id,
    source: "custom",
    name: "Greek yoghurt",
    per100g: { kcal: 100, proteinG: 10, carbsG: 4, fatG: 4 },
    servings: [{ id: "g", label: "100 g", grams: 100 }],
    ...patch,
  };
}

function makeFavorite(id: string, patch: object = {}) {
  const now = Date.now();
  const food = makeFoodRef(id, patch);
  return { food, createdAtMs: now, updatedAtMs: now };
}

function makeCustomFood(id: string, patch: object = {}) {
  const now = Date.now();
  const food = makeFoodRef(id, patch);
  return { food, createdAtMs: now, updatedAtMs: now };
}

// ── Seed helper ────────────────────────────────────────────────────────────────

type SeedOpts = {
  favorites?: Record<string, object>;
  customFoods?: Record<string, object>;
  days?: Record<string, object>;
};

async function seedNutrition(page: Page, opts: SeedOpts = {}) {
  await page.addInitScript(
    ({ favorites, customFoods, days }) => {
      localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
      localStorage.setItem(
        "logit:tours:v1",
        JSON.stringify({ home: true, session: true, splits: true }),
      );
      if (favorites) localStorage.setItem("logit:favoriteFoods:v1", JSON.stringify(favorites));
      if (customFoods) localStorage.setItem("logit:customFoods:v1", JSON.stringify(customFoods));
      if (days) localStorage.setItem("logit:nutritionDays:v1", JSON.stringify(days));
    },
    { favorites: opts.favorites, customFoods: opts.customFoods, days: opts.days },
  );
}

async function goToLog(page: Page, qs = "?meal=breakfast&date=2026-01-01") {
  await page.goto(`/nutrition/log${qs}`);
  await page.waitForLoadState("networkidle");
}

/** Navigate in-app (via /nutrition's Breakfast "Add" link) rather than a direct goto, so
 * back()'s history.back() has a real previous page to return to — matching how afterAdd()
 * is actually reached, and avoiding a jump to about:blank. Returns today's dateIso, since
 * /nutrition always opens on today with no ?date= override. */
async function goToLogViaNutritionPage(page: Page): Promise<string> {
  await page.goto("/nutrition");
  await page.waitForLoadState("networkidle");
  await page
    .locator("div.border-b.border-border")
    .filter({ hasText: "Breakfast" })
    .getByRole("link", { name: "Add" })
    .click();
  await page.waitForURL(/\/nutrition\/log\?meal=breakfast&date=(.+)/);
  await page.waitForLoadState("networkidle");
  return new URL(page.url()).searchParams.get("date")!;
}

// ── Add to meal ───────────────────────────────────────────────────────────────

test.describe("nutrition log — add to meal", () => {
  test("shows 'Nothing logged yet.' on Recent with no diary history", async ({ page }) => {
    await seedNutrition(page);
    await goToLog(page);

    await expect(page.getByText("Nothing logged yet.")).toBeVisible();
  });

  test("header shows 'Add to' the given meal, not the Foods browse title", async ({ page }) => {
    await seedNutrition(page);
    await goToLog(page, "?meal=lunch&date=2026-01-01");

    await expect(page.getByText("Add to")).toBeVisible();
    await expect(page.getByText("lunch")).toBeVisible();
  });

  test("Quick add logs an item and returns to the diary", async ({ page }) => {
    await seedNutrition(page);
    const dateIso = await goToLogViaNutritionPage(page);

    await page.getByRole("button", { name: "Quick add" }).click();
    await page.getByPlaceholder("Name").fill("Protein shake");
    await page.getByPlaceholder("kcal").fill("200");
    await page.getByPlaceholder("P", { exact: true }).fill("30");
    await page.getByPlaceholder("C", { exact: true }).fill("10");
    await page.getByPlaceholder("F", { exact: true }).fill("2");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    await page.waitForURL(/\/nutrition$/);

    const raw = await page.evaluate(() => localStorage.getItem("logit:nutritionDays:v1"));
    const days = JSON.parse(raw ?? "{}");
    const day = days[`nday_${dateIso}`];
    expect(day).toBeTruthy();
    expect(day.items).toHaveLength(1);
    expect(day.items[0]).toMatchObject({
      name: "Protein shake",
      meal: "breakfast",
      computed: { kcal: 200, proteinG: 30, carbsG: 10, fatG: 2 },
    });
  });
});

// ── Favourites ────────────────────────────────────────────────────────────────

test.describe("nutrition log — favourites", () => {
  test("shows the empty-favourites hint with none saved", async ({ page }) => {
    await seedNutrition(page);
    await goToLog(page);

    await page.getByRole("tab", { name: "Favourites" }).click();
    await expect(page.getByText("Star a food while logging to pin it here.")).toBeVisible();
  });

  test("selecting a favourite shows the macro preview scaled to the portion", async ({ page }) => {
    await seedNutrition(page, {
      favorites: { fav_food1: makeFavorite("food1", { name: "Greek yoghurt" }) },
    });
    await goToLog(page);

    await page.getByRole("tab", { name: "Favourites" }).click();
    await page.getByText("Greek yoghurt").click();

    await expect(page.getByText(/100 kcal/)).toBeVisible();
  });

  test("adding a selected favourite logs it to the diary", async ({ page }) => {
    await seedNutrition(page, {
      favorites: { fav_food1: makeFavorite("food1", { name: "Greek yoghurt" }) },
    });
    const dateIso = await goToLogViaNutritionPage(page);

    await page.getByRole("tab", { name: "Favourites" }).click();
    await page.getByText("Greek yoghurt").click();
    await page.getByRole("button", { name: "Add", exact: true }).click();

    await page.waitForURL(/\/nutrition$/);

    const raw = await page.evaluate(() => localStorage.getItem("logit:nutritionDays:v1"));
    const days = JSON.parse(raw ?? "{}");
    const day = days[`nday_${dateIso}`];
    expect(day.items[0]).toMatchObject({ name: "Greek yoghurt", sourceId: "food1" });
  });
});

// ── Custom foods ──────────────────────────────────────────────────────────────

test.describe("nutrition log — custom foods", () => {
  test("lists a seeded custom food", async ({ page }) => {
    await seedNutrition(page, {
      customFoods: { food2: makeCustomFood("food2", { name: "Homemade granola" }) },
    });
    await goToLog(page);

    await page.getByRole("tab", { name: "Custom" }).click();
    await expect(page.getByText("Homemade granola")).toBeVisible();
  });
});
