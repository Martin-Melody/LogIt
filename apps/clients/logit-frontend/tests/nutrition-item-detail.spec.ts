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

function makeCustomFood(id: string, patch: object = {}) {
  const now = Date.now();
  return { food: makeFoodRef(id, patch), createdAtMs: now, updatedAtMs: now };
}

function makeLoggedItem(id: string, patch: object = {}) {
  return {
    id,
    meal: "breakfast",
    name: "Greek yoghurt",
    grams: 150,
    computed: { kcal: 150, proteinG: 15, carbsG: 6, fatG: 6 },
    ...patch,
  };
}

function makeDay(dateIso: string, items: object[]) {
  const now = Date.now();
  return { id: `nday_${dateIso}`, dateIso, items, createdAtMs: now, updatedAtMs: now };
}

// ── Seed / navigate helper ──────────────────────────────────────────────────────

type SeedOpts = { customFoods?: Record<string, object>; days?: Record<string, object> };

/**
 * Onboarding/tour flags go in addInitScript (safe — it reruns on every navigation
 * including the eventual history.back(), and is idempotent). Domain data (customFoods,
 * days) is instead written with one page.evaluate AFTER the /nutrition warm-up nav and
 * BEFORE navigating to the target page — addInitScript would be wrong here: it reruns
 * on the back-navigation this suite triggers (save()/del() call back()) and would
 * silently overwrite whatever the page just saved back to the original seed.
 */
async function goToWithHistory(page: Page, seed: SeedOpts, url: string) {
  await page.addInitScript(() => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem(
      "logit:tours:v1",
      JSON.stringify({ home: true, session: true, splits: true }),
    );
  });
  await page.goto("/nutrition");
  await page.waitForLoadState("networkidle");
  await page.evaluate(
    ({ customFoods, days }) => {
      if (customFoods) localStorage.setItem("logit:customFoods:v1", JSON.stringify(customFoods));
      if (days) localStorage.setItem("logit:nutritionDays:v1", JSON.stringify(days));
    },
    { customFoods: seed.customFoods, days: seed.days },
  );
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

// ── Food detail ───────────────────────────────────────────────────────────────

test.describe("food detail", () => {
  test("loads a seeded custom food and shows its macros", async ({ page }) => {
    await goToWithHistory(page, { customFoods: { food1: makeCustomFood("food1") } }, "/nutrition/food/food1");

    await expect(page.getByRole("heading", { name: "Greek yoghurt" })).toBeVisible();
    await expect(page.getByText("100 kcal / 100 g")).toBeVisible();
  });

  test("shows 'Food not found.' for an unknown id", async ({ page }) => {
    await goToWithHistory(page, {}, "/nutrition/food/does-not-exist");

    await expect(page.getByText("Food not found.")).toBeVisible();
  });

  test("adding to a meal writes a diary item and shows 'Added.'", async ({ page }) => {
    await goToWithHistory(
      page,
      { customFoods: { food1: makeCustomFood("food1") } },
      "/nutrition/food/food1?date=2026-01-01",
    );

    await expect(page.getByRole("heading", { name: "Greek yoghurt" })).toBeVisible();
    await page.getByRole("button", { name: "Lunch" }).click();

    await expect(page.getByText("Added.")).toBeVisible();

    // addTo() writes to localStorage synchronously before the (delayed) back() fires,
    // but wait past that delay so the assertion isn't racing the navigation.
    await page.waitForTimeout(500);

    const raw = await page.evaluate(() => localStorage.getItem("logit:nutritionDays:v1"));
    const days = JSON.parse(raw ?? "{}");
    const day = days["nday_2026-01-01"];
    expect(day.items).toHaveLength(1);
    expect(day.items[0]).toMatchObject({ meal: "lunch", sourceId: "food1", name: "Greek yoghurt" });
  });

  test("toggling the favourite star persists it", async ({ page }) => {
    await goToWithHistory(page, { customFoods: { food1: makeCustomFood("food1") } }, "/nutrition/food/food1");

    await expect(page.getByRole("heading", { name: "Greek yoghurt" })).toBeVisible();
    await page.getByLabel("Toggle favourite").click();

    const raw = await page.evaluate(() => localStorage.getItem("logit:favoriteFoods:v1"));
    const favs = JSON.parse(raw ?? "{}");
    expect(favs["fav_food1"]).toBeTruthy();
  });
});

// ── Diary entry edit ──────────────────────────────────────────────────────────

test.describe("diary entry edit", () => {
  test("shows 'Entry not found.' for an unknown item", async ({ page }) => {
    await goToWithHistory(
      page,
      { days: { "nday_2026-01-01": makeDay("2026-01-01", []) } },
      "/nutrition/entry/2026-01-01/does-not-exist",
    );

    await expect(page.getByText("Entry not found.")).toBeVisible();
  });

  test("loads a source-linked item and rescales when the amount changes", async ({ page }) => {
    const item = makeLoggedItem("item1", { sourceId: "food1", sourceKind: "food", grams: 150 });
    await goToWithHistory(
      page,
      {
        customFoods: { food1: makeCustomFood("food1") },
        days: { "nday_2026-01-01": makeDay("2026-01-01", [item]) },
      },
      "/nutrition/entry/2026-01-01/item1",
    );

    await expect(page.getByRole("heading", { name: "Greek yoghurt" })).toBeVisible();
    await expect(page.getByText("Custom food")).toBeVisible();

    const amountInput = page.getByLabel("Amount");
    await amountInput.fill("200");
    await expect(amountInput).toHaveValue("200");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(/\/nutrition$/);

    const raw = await page.evaluate(() => localStorage.getItem("logit:nutritionDays:v1"));
    const day = JSON.parse(raw ?? "{}")["nday_2026-01-01"];
    expect(day.items[0].grams).toBe(200);
    // 200 g at 100 kcal/100g = 200 kcal
    expect(day.items[0].computed.kcal).toBe(200);
  });

  test("a quick-add item (no source) edits absolute macros directly", async ({ page }) => {
    const item = makeLoggedItem("item2", {
      name: "Homemade smoothie",
      grams: 0,
      computed: { kcal: 250, proteinG: 20, carbsG: 30, fatG: 5 },
    });
    await goToWithHistory(
      page,
      { days: { "nday_2026-01-01": makeDay("2026-01-01", [item]) } },
      "/nutrition/entry/2026-01-01/item2",
    );

    await expect(page.getByRole("heading", { name: "Homemade smoothie" })).toBeVisible();
    await expect(page.getByText("Quick add")).toBeVisible();
    // No source basis → raw macro inputs, not an amount/serving picker.
    await expect(page.getByLabel("Amount")).toHaveCount(0);
    await expect(page.getByPlaceholder("kcal")).toHaveValue("250");
  });

  test("deleting an entry removes it from the day", async ({ page }) => {
    const item = makeLoggedItem("item3");
    await goToWithHistory(
      page,
      { days: { "nday_2026-01-01": makeDay("2026-01-01", [item]) } },
      "/nutrition/entry/2026-01-01/item3",
    );

    await expect(page.getByRole("heading", { name: "Greek yoghurt" })).toBeVisible();
    await page.getByRole("button", { name: "Delete" }).click();
    await page.waitForURL(/\/nutrition$/);

    const raw = await page.evaluate(() => localStorage.getItem("logit:nutritionDays:v1"));
    const day = JSON.parse(raw ?? "{}")["nday_2026-01-01"];
    expect(day.items).toHaveLength(0);
  });
});
