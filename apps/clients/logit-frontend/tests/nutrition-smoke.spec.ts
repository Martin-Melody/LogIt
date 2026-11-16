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
  await expect(page.getByText("Set a goal to get calorie")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/01-today-no-goal.png`, fullPage: true });

  // ── Goal wizard ──
  await page.goto("/nutrition/goal");
  await page.getByRole("button", { name: "male", exact: true }).click().catch(() => {});
  await page.getByRole("button", { name: "male", exact: true }).click();
  // birth date is a segmented DateField — focus the first segment and type M D Y
  await page.getByRole("spinbutton").first().click();
  await page.keyboard.type("06151994");
  await page.getByRole("button", { name: "lose", exact: true }).click();
  // Algorithm section: the built-in is selected and exposes preference controls.
  await expect(page.getByText("Standard adaptive")).toBeVisible();
  await expect(page.getByText("Adaptive targets")).toBeVisible();
  await expect(page.getByText("Trend window")).toBeVisible();
  await expect(page.getByText("Your target")).toBeVisible();
  await page.getByText("Your target").scrollIntoViewIfNeeded();
  await expect(page.getByText(/\d[\d,]* kcal/).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/02-goal-with-algorithm.png`, fullPage: true });
  await page.getByRole("button", { name: "Save goal" }).click();
  await page.waitForURL("**/nutrition");

  // ── Today, with an adaptive target and seeded history ──
  await expect(page.getByText("Calories left")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/03-today-with-target.png`, fullPage: true });

  // ── Log a food (quick-add) ──
  const today = new Date().toISOString().slice(0, 10);
  await page.goto(`/nutrition/log?meal=lunch&date=${today}`);
  await page.getByRole("button", { name: "Quick add" }).click();
  await page.getByLabel(/What was it/).fill("Chicken & rice bowl");
  await page.getByLabel("kcal", { exact: true }).fill("650");
  await page.getByLabel("Protein", { exact: true }).fill("55");
  await page.getByLabel("Carbs", { exact: true }).fill("70");
  await page.getByLabel("Fat", { exact: true }).fill("15");
  await page.screenshot({ path: `${SHOTS}/04-log-quick-add.png`, fullPage: true });
  await page.getByRole("button", { name: "Add to Lunch" }).click();
  await page.goto("/nutrition");
  await expect(page.getByText("Chicken & rice bowl")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/05-today-logged.png`, fullPage: true });

  // ── Fast logging: the "+" on a recent re-logs it in one tap ──
  await page.goto(`/nutrition/log?meal=dinner&date=${today}`);
  await expect(page.getByRole("tab", { name: "Recent" })).toBeVisible();
  await page.getByRole("button", { name: "Add Chicken & rice bowl" }).click();
  await expect(page.getByText("1 added to Dinner")).toBeVisible();
  await page.goto("/nutrition");
  // now logged in both lunch (original) and dinner
  await expect(page.getByText("Chicken & rice bowl")).toHaveCount(2);
  await page.screenshot({ path: `${SHOTS}/05b-recent-relog.png`, fullPage: true });

  // ── Weight trend ──
  await page.goto("/nutrition/weight");
  await expect(page.getByRole("heading", { name: "Weight" })).toBeVisible();
  await expect(page.locator("svg[aria-label='Bodyweight trend']")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/06-weight-trend.png`, fullPage: true });

  // ── Custom food ──
  await page.goto("/nutrition/foods?tab=foods");
  await page.getByRole("button", { name: "New food" }).click();
  await page.getByLabel("Name").fill("Skyr, plain");
  await page.getByLabel("kcal", { exact: true }).fill("63");
  await page.getByLabel("Protein", { exact: true }).fill("11");
  await page.getByLabel("Carbs", { exact: true }).fill("4");
  await page.getByLabel("Fat", { exact: true }).fill("0.2");
  await expect(page.getByText("Macros add up to 62 kcal")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Skyr, plain")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/07-foods.png`, fullPage: true });

  // ── Recipe editor: an ingredient from your foods, portioned by the cooked weight ──
  await page.getByRole("tab", { name: /Recipes/ }).click();
  await page.getByRole("link", { name: "New recipe" }).click();
  await page.waitForURL("**/nutrition/foods/recipe/new");
  await page.getByLabel("Recipe name").fill("Overnight oats");
  await page.waitForURL(/\/nutrition\/foods\/recipe\/rcp_/); // stored once it has a name
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByRole("tab", { name: "My foods" }).click();
  await page.getByRole("button", { name: /Skyr, plain/ }).first().click();
  await page.getByTestId("amount-input").fill("300");
  await page.getByRole("button", { name: "Add to recipe" }).click();
  await expect(page.getByText("Ingredients · 1")).toBeVisible();
  await page.getByRole("radio", { name: "By cooked weight" }).click();
  await page.getByLabel("Cooked weight in grams").fill("300");
  await expect(page.getByText("kcal per 100 g cooked")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/08-recipe-editor.png`, fullPage: true });
  await page.waitForTimeout(700); // autosave
  const saved = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("logit:recipes:v1") ?? "{}")) as { name: string; portionMode?: string; cookedWeightG?: number; ingredients: unknown[] }[]);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ name: "Overnight oats", portionMode: "weight", cookedWeightG: 300 });
  expect(saved[0].ingredients).toHaveLength(1);

  // ── Insights: Nutrition › Insights opens the "Is my eating on track?" question ──
  await page.goto("/nutrition/insights");
  await expect(page).toHaveURL(/\/insights\/eating/);
  await expect(page.getByRole("heading", { name: "Is my eating on track?" })).toBeVisible();
  await expect(page.getByText("Calories a day")).toBeVisible();
  await expect(page.getByText("Protein a day")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/09-insights.png`, fullPage: true });
});

test("home screen auto-adds the nutrition widgets once a goal exists", async ({ page }) => {
  // Seed a goal directly (the beforeEach already seeds weight history + intake).
  await page.addInitScript(() => {
    if (localStorage.getItem("logit:nutritionGoal:v1") !== null) return;
    localStorage.setItem(
      "logit:nutritionGoal:v1",
      JSON.stringify({
        sex: "male",
        birthDateIso: "1994-06-15",
        heightCm: 180,
        activityLevel: "moderate",
        goalType: "lose",
        targetRateKgPerWeek: 0.4,
        targetWeightKg: 80,
        proteinGPerKg: 2,
        fatPct: 0.3,
        adaptiveEnabled: true,
        updatedAtMs: Date.now(),
      }),
    );
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 20000 });

  const nutWidget = page
    .locator("div", { has: page.getByText("Today's Nutrition", { exact: true }) })
    .first();
  await expect(page.getByText("Today's Nutrition", { exact: true })).toBeVisible();
  await expect(nutWidget.getByText(/kcal (left|over)/)).toBeVisible();
  await expect(page.getByText("Weight Trend", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/10-home-widgets.png`, fullPage: true });

  // Both are listed on the customise screen too.
  await page.goto("/home/customize");
  await expect(page.getByText("Today's Nutrition", { exact: true })).toBeVisible();
  await expect(page.getByText("Weight Trend", { exact: true })).toBeVisible();
});

test("Today's Nutrition widget rolls over to the new day when the app returns to the foreground", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-15T23:55:00"));
  await page.addInitScript(() => {
    localStorage.setItem("logit:home-config:nutrition-seeded:v1", "1");
    localStorage.setItem(
      "logit:home-config:v1",
      JSON.stringify({ slots: [{ id: "todays-nutrition", enabled: true, orderIndex: 0 }] }),
    );
    localStorage.setItem(
      "logit:nutritionGoal:v1",
      JSON.stringify({
        sex: "male", birthDateIso: "1994-06-15", heightCm: 180, activityLevel: "moderate",
        goalType: "maintain", targetRateKgPerWeek: 0, proteinGPerKg: 2, fatPct: 0.3,
        adaptiveEnabled: false, updatedAtMs: 1,
      }),
    );
    localStorage.setItem(
      "logit:nutritionDays:v1",
      JSON.stringify({
        "nday_2026-06-15": {
          id: "nday_2026-06-15", dateIso: "2026-06-15", createdAtMs: 1, updatedAtMs: 1,
          items: [{ id: "x", meal: "lunch", name: "Big Lunch", grams: 0, computed: { kcal: 1800, proteinG: 100, carbsG: 150, fatG: 60 } }],
        },
      }),
    );
  });

  await page.goto("/");
  const widget = page
    .locator("div", { has: page.getByText("Today's Nutrition", { exact: true }) })
    .first();
  await expect(widget.getByText(/kcal (left|over)/)).toBeVisible({ timeout: 20000 });
  const kcalLeft = (t: string) => Number((t.match(/([\d,]+)\s*kcal/)?.[1] ?? "").replace(/,/g, ""));
  const before = kcalLeft((await widget.getByText(/kcal (left|over)/).textContent()) ?? "");
  expect(before).toBeGreaterThan(0); // 1800 eaten against a ~2800 target

  // Midnight passes while backgrounded, then the app comes back — no navigation, no reload.
  await page.clock.setFixedTime(new Date("2026-06-16T00:10:00"));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

  // 2026-06-16 has nothing logged → the whole target is available again.
  await expect
    .poll(async () => kcalLeft((await widget.getByText(/kcal (left|over)/).textContent()) ?? ""))
    .toBeGreaterThan(before + 1000);
});

test("copy a previous day pulls yesterday's items into today", async ({ page }) => {
  // beforeEach seeds 26 days of history (each with a "Seeded day" item in Dinner),
  // so yesterday already has something to copy.
  await page.goto("/nutrition");
  await expect(page.getByRole("heading", { name: "Nutrition" })).toBeVisible();
  await expect(page.getByText("Seeded day")).toHaveCount(0);

  await page.getByRole("button", { name: "Dinner options" }).click();
  await page.getByRole("button", { name: "Copy from another day…" }).click();
  // The date field defaults to yesterday; just confirm.
  await page.getByRole("button", { name: "Copy", exact: true }).click();

  await expect(page.getByText("Seeded day")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/11-copy-day.png`, fullPage: true });

  // Persisted: reloading the page still shows it.
  await page.reload();
  await expect(page.getByText("Seeded day")).toBeVisible();
});

test("a coach-assigned plan supersedes the target and shows a meal plan", async ({ page }) => {
  const f = (name: string, kcal: number, grams = 100) => ({
    id: `pf_${name}`,
    name,
    grams,
    computed: { kcal, proteinG: 20, carbsG: 30, fatG: 10 },
  });
  await page.addInitScript(
    (meal) => {
      localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true, step: 0 }));
      localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true }));
      localStorage.setItem("logit:had_account", "1");
      localStorage.setItem(
        "logit:coachNutritionPlans:v1",
        JSON.stringify({
          cnplan_x: {
            id: "cnplan_x",
            name: "Coach targets",
            kcalTarget: 1900,
            proteinG: 175,
            note: "Two weeks at a deficit, then we reassess.",
            meals: [meal],
            archived: false,
            createdAtMs: 1,
            updatedAtMs: 2,
          },
        }),
      );
    },
    {
      id: "pmeal_b",
      name: "Breakfast",
      foods: [
        { ...f("Oats", 350), swaps: [f("Granola", 420)] },
        f("Skyr", 120, 170),
      ],
    },
  );

  await page.goto("/nutrition");
  await expect(page.getByText("From your coach")).toBeVisible();
  await expect(page.getByText("Two weeks at a deficit")).toBeVisible();
  await page.getByRole("link", { name: /coach's meal plan/ }).click();
  await page.waitForURL("**/nutrition/plan");
  await expect(page.getByRole("heading", { name: "Meal plan" })).toBeVisible();
  await expect(page.getByText("Breakfast")).toBeVisible();
  await expect(page.getByText(/Oats · 100 g/)).toBeVisible();
  await expect(page.getByText("Grocery list")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/11-coach-meal-plan.png`, fullPage: true });

  // log a food from the plan → it lands in today's diary
  await page.getByRole("button", { name: "Log", exact: true }).first().click();
  await page.goto("/nutrition");
  await expect(page.getByText(/Oats/).first()).toBeVisible();
});

test("a coach comment on a diary day shows inline on that day", async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  await page.addInitScript(
    (dateIso) => {
      localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true, step: 0 }));
      localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true }));
      localStorage.setItem("logit:had_account", "1");
      localStorage.setItem(
        "logit:coachMessages:v1",
        JSON.stringify({
          msg_c1: {
            id: "msg_c1",
            relationshipId: "rel_1",
            body: "Great protein hit today — keep the carbs up around training.",
            createdAtMs: Date.now(),
            readAtMs: null,
            mine: false,
            synced: true,
            contextDateIso: dateIso,
          },
        }),
      );
    },
    today,
  );

  await page.goto("/nutrition");
  await expect(page.getByText(/Coach comments/)).toBeVisible();
  await expect(page.getByText("Great protein hit today")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/12-coach-comment.png`, fullPage: true });
});

test("a meal's items move to another meal from its menu, and the move persists", async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  await page.addInitScript(
    (dateIso) => {
      localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true, step: 0 }));
      localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, nutrition: true }));
      localStorage.setItem("logit:had_account", "1");
      // Only seed once, so the reload below sees what the move saved.
      if (localStorage.getItem("logit:nutritionDays:v1")?.includes("Movable Oats")) return;
      localStorage.setItem(
        "logit:nutritionDays:v1",
        JSON.stringify({
          [`nday_${dateIso}`]: {
            id: `nday_${dateIso}`,
            dateIso,
            createdAtMs: 1,
            updatedAtMs: 2,
            items: [
              { id: "it_a", meal: "breakfast", name: "Movable Oats", grams: 50, computed: { kcal: 190, proteinG: 6, carbsG: 30, fatG: 4 } },
              { id: "it_b", meal: "lunch", name: "Chicken wrap", grams: 250, computed: { kcal: 480, proteinG: 35, carbsG: 45, fatG: 16 } },
            ],
          },
        }),
      );
    },
    today,
  );

  await page.goto("/nutrition");
  await expect(page.getByText("Movable Oats")).toBeVisible();
  await expect(page.getByText("Chicken wrap")).toBeVisible();
  await page.getByRole("button", { name: "Breakfast options" }).click();
  await page.getByRole("button", { name: "Move to another meal…" }).click();
  await page.getByRole("button", { name: "Snacks", exact: true }).click();
  await expect(page.getByTestId("meal-snack")).toContainText("Movable Oats");
  await page.reload();
  await expect(page.getByTestId("meal-snack")).toContainText("Movable Oats");
  await expect(page.getByTestId("meal-breakfast")).toContainText("Nothing yet");
  await page.screenshot({ path: `${SHOTS}/14-diary-move.png`, fullPage: true });
});

test("save a meal as a template, then log it into another meal in one tap", async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  await page.addInitScript(
    (dateIso) => {
      const seed = (k: string, v: string) => {
        if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
      };
      seed("logit:onboarding:v1", JSON.stringify({ completed: true, step: 0 }));
      seed("logit:tours:v1", JSON.stringify({ home: true, nutrition: true }));
      seed("logit:had_account", "1");
      // add today's breakfast once; leave it alone on later navigations (so the meal we
      // later log via the template isn't clobbered)
      const days = JSON.parse(localStorage.getItem("logit:nutritionDays:v1") ?? "{}");
      if (!days[`nday_${dateIso}`]) {
        days[`nday_${dateIso}`] = {
          id: `nday_${dateIso}`,
          dateIso,
          createdAtMs: 1,
          updatedAtMs: 2,
          items: [
            { id: "b1", meal: "breakfast", name: "Oats", grams: 60, computed: { kcal: 220, proteinG: 8, carbsG: 38, fatG: 4 } },
            { id: "b2", meal: "breakfast", name: "Blueberries", grams: 80, computed: { kcal: 46, proteinG: 0.6, carbsG: 11, fatG: 0.3 } },
          ],
        };
        localStorage.setItem("logit:nutritionDays:v1", JSON.stringify(days));
      }
    },
    today,
  );

  await page.goto("/nutrition");
  await expect(page.getByText("Oats")).toBeVisible();
  await page.getByRole("button", { name: "Breakfast options" }).click();
  await page.getByRole("button", { name: /Save as a meal/ }).click();
  await page.getByLabel("Name").fill("Usual breakfast");
  await page.getByRole("button", { name: "Save meal" }).click();
  await page.waitForTimeout(200);

  await page.goto(`/nutrition/log?meal=dinner&date=${today}`);
  await page.getByRole("tab", { name: "Meals" }).click();
  await expect(page.getByText("Usual breakfast")).toBeVisible();
  await page.getByRole("button", { name: "Add Usual breakfast" }).click();
  await expect(page.getByText("2 added to Dinner")).toBeVisible();

  const day = await page.evaluate((dateIso) => {
    const d = JSON.parse(localStorage.getItem("logit:nutritionDays:v1")!);
    return d[`nday_${dateIso}`] as { items: { name: string; meal: string }[] };
  }, today);
  const dinnerItems = day.items.filter((i) => i.meal === "dinner").map((i) => i.name).sort();
  expect(dinnerItems).toEqual(["Blueberries", "Oats"]);
  await page.screenshot({ path: `${SHOTS}/15-meal-template.png`, fullPage: true });
});

test("favourites tab lists pinned foods and logs one in a tap", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true, step: 0 }));
    localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true }));
    localStorage.setItem("logit:had_account", "1");
    localStorage.setItem(
      "logit:favoriteFoods:v1",
      JSON.stringify({
        fav_off_x: {
          food: {
            id: "off:x",
            source: "off",
            name: "Oatly Barista",
            brand: "Oatly",
            per100g: { kcal: 59, proteinG: 1.1, carbsG: 6.6, fatG: 3 },
            servings: [{ id: "g", label: "100 g", grams: 100 }],
          },
          createdAtMs: 1,
          updatedAtMs: 2,
        },
      }),
    );
  });

  const today = new Date().toISOString().slice(0, 10);
  await page.goto("/nutrition"); // establish history so back() after logging works
  await page.goto(`/nutrition/log?meal=breakfast&date=${today}`);
  await page.getByRole("tab", { name: "Favourites" }).click();
  await expect(page.getByText("Oatly Barista")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/13-favourites.png`, fullPage: true });

  await page.getByRole("button", { name: "Add Oatly Barista" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.waitForURL(/\/nutrition$/);
  await expect(page.getByText("Oatly Barista")).toBeVisible();
});

test("tapping a diary item opens its amount sheet and editing the amount rescales it", async ({
  page,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  await page.addInitScript(
    ({ iso }) => {
      localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true, step: 0 }));
      localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, nutrition: true }));
      localStorage.setItem("logit:had_account", "1");
      localStorage.setItem(
        "logit:nutritionDays:v1",
        JSON.stringify({
          [`nday_${iso}`]: {
            id: `nday_${iso}`,
            dateIso: iso,
            createdAtMs: 1,
            updatedAtMs: 2,
            items: [
              {
                id: "nitem_rice",
                meal: "lunch",
                name: "Rice, cooked",
                grams: 200,
                servingLabel: "200 g",
                computed: { kcal: 260, proteinG: 5.4, carbsG: 57, fatG: 0.6 },
              },
            ],
          },
        }),
      );
    },
    { iso: today },
  );

  await page.goto("/nutrition");
  await page.getByRole("button", { name: /Rice, cooked/ }).click();
  await expect(page.getByRole("heading", { name: "Rice, cooked" })).toBeVisible();
  await expect(page.getByTestId("adds-kcal")).toHaveText("260");

  await page.getByTestId("amount-input").fill("250");
  await expect(page.getByTestId("adds-kcal")).toHaveText("325");
  await page.screenshot({ path: `${SHOTS}/16-edit-entry.png`, fullPage: true });
  await page.getByRole("button", { name: "Save" }).click();

  // 200 g → 250 g rescales 260 kcal → 325
  const row = page.getByRole("listitem").filter({ hasText: "Rice, cooked" });
  await expect(row).toContainText("250 g");
  await expect(row).toContainText("325");
});

test("the My foods button lists your foods, and one logs from the add screen", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true, step: 0 }));
    localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, nutrition: true }));
    localStorage.setItem("logit:had_account", "1");
    localStorage.setItem(
      "logit:customFoods:v1",
      JSON.stringify({
        food_skyr: {
          food: {
            id: "food_skyr",
            source: "custom",
            name: "Skyr, plain",
            per100g: { kcal: 63, proteinG: 11, carbsG: 4, fatG: 0.2 },
            servings: [{ id: "g", label: "100 g", grams: 100 }],
          },
          createdAtMs: 1,
          updatedAtMs: 2,
        },
      }),
    );
  });

  await page.goto("/nutrition");
  await page.getByRole("link", { name: "My foods and recipes" }).click();
  await page.waitForURL(/\/nutrition\/foods/);
  await page.getByRole("tab", { name: /Foods/ }).click();
  await expect(page.getByText("Skyr, plain")).toBeVisible();

  // The floating button logs to the meal for this time of day; the search finds the food
  // whatever the word order.
  await page.goto("/nutrition");
  await page.getByRole("link", { name: "Log food" }).click();
  await page.waitForURL(/\/nutrition\/log/);
  await page.getByLabel("Search foods").fill("plain skyr");
  await page.getByRole("button", { name: /Skyr, plain/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /^Add to (Breakfast|Lunch|Dinner|Snacks)$/ }).click();
  await expect(page.getByText(/^1 added/)).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await page.waitForURL(/\/nutrition$/);
  await expect(page.locator("[data-testid^=meal-]").getByText("Skyr, plain")).toBeVisible();
});

test("a custom food can be edited in place, keeping its id", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true, step: 0 }));
    localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, nutrition: true }));
    localStorage.setItem("logit:had_account", "1");
    localStorage.setItem(
      "logit:customFoods:v1",
      JSON.stringify({
        food_shake: {
          food: {
            id: "food_shake",
            source: "custom",
            name: "Protein shake",
            per100g: { kcal: 100, proteinG: 20, carbsG: 3, fatG: 1 },
            servings: [{ id: "g", label: "100 g", grams: 100 }],
          },
          createdAtMs: 1,
          updatedAtMs: 2,
        },
      }),
    );
  });

  await page.goto("/nutrition/foods?tab=foods");
  await page.getByRole("button", { name: /Protein shake/ }).click();
  await expect(page.getByRole("heading", { name: "Edit food" })).toBeVisible();
  await page.getByLabel("Name").fill("Protein shake v2");
  await page.getByLabel("kcal", { exact: true }).fill("110");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Protein shake v2")).toBeVisible();
  await expect(page.getByText(/100 g · 110 kcal/)).toBeVisible();

  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("logit:customFoods:v1") ?? "{}"),
  );
  expect(Object.keys(stored)).toEqual(["food_shake"]);
  expect(stored.food_shake.food.name).toBe("Protein shake v2");
});
