import { test, expect, type Page } from "@playwright/test";

// ── Test data factories ───────────────────────────────────────────────────────

function makeHabit(id: string, patch: object = {}) {
  const now = Date.now();
  return {
    id,
    name: "Drink water",
    cadence: { kind: "daily" },
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
    ...patch,
  };
}

function makeEntry(id: string, habitId: string, dateIso: string, done = true) {
  const now = Date.now();
  return { id, habitId, dateIso, done, createdAtMs: now, updatedAtMs: now };
}

// ── Seed helper ────────────────────────────────────────────────────────────────

type SeedOpts = { habits?: Record<string, object>; entries?: Record<string, object> };

async function seedHabits(page: Page, opts: SeedOpts = {}) {
  await page.addInitScript(
    ({ habits, entries }) => {
      localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
      localStorage.setItem(
        "logit:tours:v1",
        JSON.stringify({ home: true, session: true, splits: true }),
      );
      if (habits) localStorage.setItem("logit:habits:v1", JSON.stringify(habits));
      if (entries) localStorage.setItem("logit:habitEntries:v1", JSON.stringify(entries));
    },
    { habits: opts.habits, entries: opts.entries },
  );
}

async function goToHabit(page: Page, id: string) {
  await page.goto(`/habits/${id}`);
  await page.waitForLoadState("networkidle");
}

// ── Habit detail ─────────────────────────────────────────────────────────────

test.describe("habit detail", () => {
  test("shows the habit name and a zero streak with no entries", async ({ page }) => {
    const habit = makeHabit("hab-1", { name: "Drink water" });
    await seedHabits(page, { habits: { "hab-1": habit } });
    await goToHabit(page, "hab-1");

    await expect(page.getByText("Loading…")).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Drink water" })).toBeVisible();
    await expect(page.getByText("day streak")).toBeVisible();
    await expect(page.getByText("0", { exact: true })).toBeVisible();
  });

  test("shows 'Habit not found' for an unknown id", async ({ page }) => {
    await seedHabits(page, { habits: {} });
    await goToHabit(page, "does-not-exist");

    await expect(page.getByText("Habit not found")).toBeVisible();
  });

  test("streak reflects consecutive daily entries up to today", async ({ page }) => {
    const habit = makeHabit("hab-2", { name: "Stretch" });
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    await seedHabits(page, {
      habits: { "hab-2": habit },
      entries: {
        e1: makeEntry("e1", "hab-2", today),
        e2: makeEntry("e2", "hab-2", yesterday),
      },
    });
    await goToHabit(page, "hab-2");

    await expect(page.getByText("Loading…")).not.toBeVisible();
    // 2-day streak (today + yesterday, both done, daily cadence)
    const streakValue = page.locator("span.text-lg.font-semibold").first();
    await expect(streakValue).toHaveText("2");
  });

  test("archiving a habit navigates back to the habits list", async ({ page }) => {
    const habit = makeHabit("hab-3", { name: "Meditate" });
    await seedHabits(page, { habits: { "hab-3": habit } });
    await goToHabit(page, "hab-3");

    await expect(page.getByRole("heading", { name: "Meditate" })).toBeVisible();
    await page.getByRole("button", { name: "Archive habit" }).click();

    await page.waitForURL(/\/habits$/);

    const raw = await page.evaluate(() => localStorage.getItem("logit:habits:v1"));
    const stored = JSON.parse(raw ?? "{}");
    expect(stored["hab-3"].archived).toBe(true);
  });

  test("deleting a habit asks for confirmation, then removes it and its entries", async ({ page }) => {
    const habit = makeHabit("hab-4", { name: "Read" });
    await seedHabits(page, {
      habits: { "hab-4": habit },
      entries: { e1: makeEntry("e1", "hab-4", "2026-01-01") },
    });
    await goToHabit(page, "hab-4");

    await expect(page.getByRole("heading", { name: "Read" })).toBeVisible();
    await page.getByRole("button", { name: "Delete habit" }).click();

    await expect(page.getByText('Delete "Read"?')).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    await page.waitForURL(/\/habits$/);

    const habitsRaw = await page.evaluate(() => localStorage.getItem("logit:habits:v1"));
    const habits = JSON.parse(habitsRaw ?? "{}");
    expect(habits["hab-4"].deletedAtMs).toBeTruthy();

    const entriesRaw = await page.evaluate(() => localStorage.getItem("logit:habitEntries:v1"));
    const entries = JSON.parse(entriesRaw ?? "{}");
    expect(entries.e1.deletedAtMs).toBeTruthy();
  });
});
