import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory fake of the sync API. Each push records the rows it received; each pull
// returns whatever has been pushed so far (last-write-wins by id).
const pushed = {
  days: [] as any[],
  weight: [] as any[],
  goal: null as any,
  customFoods: [] as any[],
};

function upsert(list: any[], row: any) {
  const i = list.findIndex((r) => r.id === row.id);
  if (i >= 0) list[i] = row;
  else list.push(row);
}

vi.mock("../../api/syncApi", () => ({
  syncApi: {
    pushNutritionDays: vi.fn(async (rows: any[]) => rows.forEach((r) => upsert(pushed.days, r))),
    pullNutritionDays: vi.fn(async () => ({ days: pushed.days })),
    pushWeightEntries: vi.fn(async (rows: any[]) => rows.forEach((r) => upsert(pushed.weight, r))),
    pullWeightEntries: vi.fn(async () => ({ entries: pushed.weight })),
    pushNutritionGoal: vi.fn(async (g: any) => (pushed.goal = g)),
    pullNutritionGoal: vi.fn(async () => ({ goal: pushed.goal })),
    pushCustomFoods: vi.fn(async (rows: any[]) => rows.forEach((r) => upsert(pushed.customFoods, r))),
    pullCustomFoods: vi.fn(async () => ({ foods: pushed.customFoods })),
    pushRecipes: vi.fn(async () => {}),
    pullRecipes: vi.fn(async () => ({ recipes: [] })),
    pushFavorites: vi.fn(async () => {}),
    pullFavorites: vi.fn(async () => ({ favorites: [] })),
    pushMealTemplates: vi.fn(async () => {}),
    pullMealTemplates: vi.fn(async () => ({ templates: [] })),
  },
}));

import { createSyncedNutritionRepo } from "./syncedNutritionRepo";
import { createDiaryDay, addDiaryItem, createWeightEntry, defaultNutritionGoal } from "../../domain/nutrition";

beforeEach(() => {
  pushed.days = [];
  pushed.weight = [];
  pushed.goal = null;
  pushed.customFoods = [];
  vi.clearAllMocks();
});

describe("createSyncedNutritionRepo", () => {
  it("saves a diary day and reads it back from cache without re-pulling", async () => {
    const repo = createSyncedNutritionRepo();
    let day = createDiaryDay("2026-08-31");
    day = addDiaryItem(day, {
      meal: "lunch",
      name: "Rice",
      grams: 150,
      computed: { kcal: 200, proteinG: 4, carbsG: 44, fatG: 0.5 },
    });

    await repo.saveDay(day);

    const got = await repo.getDay("2026-08-31");
    expect(got?.items).toHaveLength(1);
    expect(got?.items[0].name).toBe("Rice");
    // pushed once as the mobile row shape
    expect(pushed.days).toHaveLength(1);
    expect(pushed.days[0].id).toBe("nday_2026-08-31");
    expect(JSON.parse(pushed.days[0].dataJson).items[0].name).toBe("Rice");
  });

  it("hydrates from the server on first read", async () => {
    pushed.days.push({
      id: "nday_2026-08-30",
      createdAtMs: 1,
      updatedAtMs: 1,
      dataJson: JSON.stringify(createDiaryDay("2026-08-30")),
    });
    const repo = createSyncedNutritionRepo();
    const range = await repo.listDaysInRange("2026-08-01", "2026-08-31");
    expect(range).toHaveLength(1);
    expect(range[0].dateIso).toBe("2026-08-30");
  });

  it("tombstones a day on deleteDay and hides it from reads", async () => {
    const repo = createSyncedNutritionRepo();
    await repo.saveDay(createDiaryDay("2026-08-31"));
    await repo.deleteDay("2026-08-31");

    expect(await repo.getDay("2026-08-31")).toBeNull();
    const last = pushed.days.at(-1);
    expect(last.dataJson).toBeNull();
    expect(last.deletedAtMs).toBeTypeOf("number");
  });

  it("round-trips weight entries and the goal singleton", async () => {
    const repo = createSyncedNutritionRepo();
    await repo.saveWeightEntry(createWeightEntry("2026-08-30", 82.5));
    await repo.saveGoal({ ...defaultNutritionGoal(), updatedAtMs: 123 });

    expect((await repo.listWeightEntries())[0].weightKg).toBe(82.5);
    expect((await repo.getGoal())?.updatedAtMs).toBe(123);
    expect(pushed.goal.updatedAtMs).toBe(123);
  });

  it("drops server rows that are already tombstoned", async () => {
    pushed.weight.push({ id: "w1", createdAtMs: 1, updatedAtMs: 2, dataJson: null, deletedAtMs: 2 });
    const repo = createSyncedNutritionRepo();
    expect(await repo.listWeightEntries()).toHaveLength(0);
  });

  it("the sync-loop surface throws (no local loop on web)", async () => {
    const repo = createSyncedNutritionRepo();
    await expect(async () => repo.listDaysForPush()).rejects.toThrow();
  });
});
