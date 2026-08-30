import { describe, expect, it } from "vitest";
import {
  defaultNutritionGoal,
  type DiaryDay,
  type NutritionGoal,
  type WeightEntry,
} from "../../domain/nutrition";
import type { NutritionAlgorithm, NutritionAlgorithmRegistry } from "../../domain/nutritionAlgorithm";
import { createLocalNutritionAlgorithmRegistry } from "../../nutrition/algorithmRegistry";
import { getNutritionTargets } from "./getNutritionTargets";

const NOW = Date.parse("2026-06-15T12:00:00Z");

function goal(over: Partial<NutritionGoal> = {}): NutritionGoal {
  return {
    ...defaultNutritionGoal(),
    sex: "male",
    birthDateIso: "1994-06-15",
    heightCm: 180,
    activityLevel: "moderate",
    goalType: "lose",
    targetRateKgPerWeek: 0.5,
    proteinGPerKg: 1.8,
    fatPct: 0.3,
    ...over,
  };
}

function fakeRepo(opts: { goal?: NutritionGoal | null; weight?: WeightEntry[]; days?: DiaryDay[] }) {
  return {
    async getGoal() {
      return opts.goal ?? null;
    },
    async listWeightEntries() {
      return opts.weight ?? [];
    },
    async listDaysInRange() {
      return opts.days ?? [];
    },
  } as unknown as Parameters<typeof getNutritionTargets>[0]["nutritionRepo"];
}

const registry = createLocalNutritionAlgorithmRegistry();
const deps = (repo: ReturnType<typeof fakeRepo>, assignedPlan?: import("../../domain/CoachNutritionPlan").CoachNutritionPlan | null) => ({
  nutritionRepo: repo,
  nutritionAlgorithmRegistry: registry,
  assignedNutritionPlanRepo: {
    async getAssignedPlan() {
      return assignedPlan ?? null;
    },
    async listAssignedPlans() {
      return assignedPlan ? [assignedPlan] : [];
    },
    async upsertFromRemote() {},
    async removeFromRemote() {},
  },
});

describe("getNutritionTargets", () => {
  it("returns an empty state when there's no goal", async () => {
    const s = await getNutritionTargets(deps(fakeRepo({ goal: null })), { now: NOW });
    expect(s.goal).toBeNull();
    expect(s.targets).toBeNull();
    expect(s.algorithm).toBeNull();
  });

  it("resolves the built-in algorithm and a calculated target", async () => {
    const s = await getNutritionTargets(
      deps(fakeRepo({ goal: goal() })),
      { fallbackWeightKg: 80, now: NOW },
    );
    expect(s.algorithm?.id).toBe("standard-adaptive");
    expect(s.targets?.source).toBe("algorithm");
    expect(s.targets?.sourceLabel).toBe("Calculated");
    expect(s.targets?.kcal).toBe(2194);
  });

  it("a manual override wins over the algorithm", async () => {
    const s = await getNutritionTargets(
      deps(fakeRepo({ goal: goal({ manualCalorieTarget: 1900 }) })),
      { fallbackWeightKg: 80, now: NOW },
    );
    expect(s.targets?.source).toBe("manual");
    expect(s.targets?.kcal).toBe(1900);
    expect(s.targets?.macros.proteinG).toBe(144);
  });

  it("falls back to the default algorithm id when the goal names an uninstalled one", async () => {
    const s = await getNutritionTargets(
      deps(fakeRepo({ goal: goal({ algorithmId: "com.example.missing" }) })),
      { fallbackWeightKg: 80, now: NOW },
    );
    expect(s.algorithm).toBeNull();
    expect(s.targetsHint).toMatch(/not installed/);
    expect(s.targets).toBeNull();
  });

  it("a coach-assigned plan wins over the algorithm and the manual override", async () => {
    const plan = {
      id: "cnplan_1",
      name: "Coach targets",
      kcalTarget: 1850,
      proteinG: 180,
      archived: false,
      createdAtMs: 1,
      updatedAtMs: 2,
    };
    const s = await getNutritionTargets(
      deps(fakeRepo({ goal: goal({ manualCalorieTarget: 3000 }) }), plan),
      { fallbackWeightKg: 80, now: NOW },
    );
    expect(s.coachPlan?.id).toBe("cnplan_1");
    expect(s.targets?.source).toBe("coach");
    expect(s.targets?.sourceLabel).toBe("From your coach");
    expect(s.targets?.kcal).toBe(1850);
    expect(s.targets?.macros.proteinG).toBe(180); // coach-set
    expect(s.targets?.macros.carbsG).toBeGreaterThan(0); // filled from the goal split
  });

  it("has no coachPlan when the repo isn't provided", async () => {
    const s = await getNutritionTargets(
      { nutritionRepo: fakeRepo({ goal: goal() }), nutritionAlgorithmRegistry: registry },
      { fallbackWeightKg: 80, now: NOW },
    );
    expect(s.coachPlan).toBeNull();
    expect(s.targets?.source).toBe("algorithm");
  });

  it("derives macros from the goal when a community algorithm returns only kcal", async () => {
    const kcalOnly: NutritionAlgorithm = {
      id: "kcal-only",
      name: "Kcal only",
      description: "test",
      computeTargets: () => ({ kcal: 2000, sourceLabel: "Flat" }),
    };
    const customRegistry: NutritionAlgorithmRegistry = {
      async list() {
        return [{ id: kcalOnly.id, name: kcalOnly.name, description: kcalOnly.description }];
      },
      async get(id) {
        return id === kcalOnly.id ? kcalOnly : null;
      },
    };
    const s = await getNutritionTargets(
      {
        nutritionRepo: fakeRepo({ goal: goal({ algorithmId: "kcal-only" }) }),
        nutritionAlgorithmRegistry: customRegistry,
      },
      { fallbackWeightKg: 80, now: NOW },
    );
    expect(s.targets?.kcal).toBe(2000);
    expect(s.targets?.sourceLabel).toBe("Flat");
    expect(s.targets?.macros.proteinG).toBe(144); // 80 * 1.8
    expect(s.targets?.macros.fatG).toBe(67); // 2000 * 0.3 / 9
  });
});
