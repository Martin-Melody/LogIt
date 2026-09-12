import { describe, expect, it } from "vitest";
import { getNutritionTrainingCorrelation } from "./nutritionTrainingCorrelation";
import { createSession, addExercise, addSet, finishSession } from "../domain/workout";
import type { WorkoutSession } from "../domain/workout";
import { createDiaryDay, localDateIso } from "../domain/nutrition";
import type { DiaryDay, LoggedItem } from "../domain/nutrition";
import type { WorkoutRepo } from "../data/workoutRepo";
import type { NutritionRepo } from "../data/nutritionRepo";

const DAY = 86_400_000;

function sessionAt(dayIndex: number, volumeWeight: number): WorkoutSession {
  const startedAtMs = dayIndex * DAY;
  let s = createSession(startedAtMs);
  s = addExercise(s, { exerciseName: "Bench" });
  const blockId = s.blocks[0]!.id;
  s = addSet(s, blockId, { weight: volumeWeight, reps: 5, setType: "normal" });
  return finishSession(s, startedAtMs + 3_600_000);
}

function item(overrides: Partial<LoggedItem> & { computed: LoggedItem["computed"] }): LoggedItem {
  return {
    id: `item_${Math.random()}`,
    meal: "lunch",
    name: "Food",
    grams: 100,
    ...overrides,
  };
}

function deps(sessions: WorkoutSession[], days: DiaryDay[]): { workoutRepo: WorkoutRepo; nutritionRepo: NutritionRepo } {
  return {
    workoutRepo: { listAllSessions: async () => sessions } as unknown as WorkoutRepo,
    nutritionRepo: {
      listDaysInRange: async () => days,
    } as unknown as NutritionRepo,
  };
}

describe("getNutritionTrainingCorrelation", () => {
  it("stays silent (low confidence) with too few sessions", async () => {
    const sessions = Array.from({ length: 5 }, (_, i) => sessionAt(i, 100 + i));
    const result = await getNutritionTrainingCorrelation(deps(sessions, []));
    expect(result.dayLevelProtein).toBeUndefined();
    expect(result.mealTimingCarbs).toBeUndefined();
    expect(result.dayLevelReasoning.confidence).toBe("low");
    expect(result.mealTimingReasoning.confidence).toBe("low");
  });

  it("stays silent on day-level with enough sessions but no diary data at all", async () => {
    const sessions = Array.from({ length: 24 }, (_, i) => sessionAt(i, 100 + i * 5));
    const result = await getNutritionTrainingCorrelation(deps(sessions, []));
    expect(result.dayLevelProtein).toBeUndefined();
    expect(result.dayLevelReasoning.verdict).toMatch(/not enough logged-nutrition days/);
  });

  it("surfaces a day-level protein hypothesis when high-protein days cleanly correlate with improvement", async () => {
    // 24 sessions, one per day. Even days: high protein (200g) + volume jumps up
    // from the previous session. Odd days: low protein (50g) + volume drops.
    // 25 sessions -> 24 samples (i=1..24), an even split of 12 high-protein/12
    // low-protein samples so the median lands strictly between the two values
    // (same shape as learnedMuscleGroupInsight.test.ts's equivalent case).
    let weight = 100;
    const sessions: WorkoutSession[] = [];
    const days: DiaryDay[] = [];
    for (let i = 0; i < 25; i++) {
      const highProtein = i % 2 === 0;
      weight = highProtein ? weight + 50 : Math.max(1, weight - 10);
      sessions.push(sessionAt(i, weight));
      const dateIso = localDateIso(new Date(i * DAY));
      days.push({
        ...createDiaryDay(dateIso),
        items: [item({ computed: { kcal: 500, proteinG: highProtein ? 200 : 50, carbsG: 0, fatG: 0 } })],
      });
    }

    const result = await getNutritionTrainingCorrelation(deps(sessions, days));
    expect(result.dayLevelProtein).toBeDefined();
    expect(result.dayLevelProtein!.direction).toBe("higher");
    // §9's extra-caution rule: never reports "high" confidence, unlike §5.
    expect(result.dayLevelReasoning.confidence).not.toBe("high");
  });

  it("does not offer a day-level insight when protein doesn't distinguish outcomes", async () => {
    // Same protein every day -- no variance to split on.
    let weight = 100;
    const sessions: WorkoutSession[] = [];
    const days: DiaryDay[] = [];
    for (let i = 0; i < 24; i++) {
      weight += i % 2 === 0 ? 5 : -3; // some volume noise, unrelated to protein
      sessions.push(sessionAt(i, weight));
      const dateIso = localDateIso(new Date(i * DAY));
      days.push({
        ...createDiaryDay(dateIso),
        items: [item({ computed: { kcal: 500, proteinG: 150, carbsG: 0, fatG: 0 } })],
      });
    }

    const result = await getNutritionTrainingCorrelation(deps(sessions, days));
    // Every day has identical protein (150g) so median split can't separate anything.
    expect(result.dayLevelProtein).toBeUndefined();
  });

  it("surfaces a meal-timing hypothesis when qualifying carbs cleanly correlate with improvement", async () => {
    let weight = 100;
    const sessions: WorkoutSession[] = [];
    const days: DiaryDay[] = [];
    for (let i = 0; i < 24; i++) {
      const hadCarbs = i % 2 === 0;
      weight = hadCarbs ? weight + 50 : Math.max(1, weight - 10);
      const session = sessionAt(i, weight);
      sessions.push(session);
      const dateIso = localDateIso(new Date(i * DAY));
      const loggedAtMs = session.startedAtMs - 45 * 60_000; // 45 min before -- inside the 30-60min window
      days.push({
        ...createDiaryDay(dateIso),
        items: [
          item({
            loggedAtMs,
            computed: { kcal: 300, proteinG: 5, carbsG: hadCarbs ? 60 : 2, fatG: 2 },
          }),
        ],
      });
    }

    const result = await getNutritionTrainingCorrelation(deps(sessions, days));
    expect(result.mealTimingCarbs).toBeDefined();
    expect(result.mealTimingCarbs!.withCarbs.improveRate).toBeGreaterThan(result.mealTimingCarbs!.withoutCarbs.improveRate);
    expect(result.mealTimingReasoning.confidence).not.toBe("high");
  });

  it("ignores items outside the 30-60 minute window or below the carb threshold", async () => {
    let weight = 100;
    const sessions: WorkoutSession[] = [];
    const days: DiaryDay[] = [];
    for (let i = 0; i < 24; i++) {
      weight += i % 2 === 0 ? 20 : -5;
      const session = sessionAt(i, weight);
      sessions.push(session);
      const dateIso = localDateIso(new Date(i * DAY));
      days.push({
        ...createDiaryDay(dateIso),
        items: [
          // Way too early (3 hours before) and too small a carb hit -- neither qualifies.
          item({ loggedAtMs: session.startedAtMs - 3 * 60 * 60_000, computed: { kcal: 300, proteinG: 5, carbsG: 60, fatG: 2 } }),
          item({ loggedAtMs: session.startedAtMs - 45 * 60_000, computed: { kcal: 50, proteinG: 1, carbsG: 5, fatG: 0 } }),
        ],
      });
    }

    const result = await getNutritionTrainingCorrelation(deps(sessions, days));
    // Every sample falls in "withoutCarbs" since nothing qualifies -- no bucket to compare against.
    expect(result.mealTimingCarbs).toBeUndefined();
  });

  it("stays silent on meal-timing when no items carry a loggedAtMs (pre-§9 historical data)", async () => {
    const sessions = Array.from({ length: 24 }, (_, i) => sessionAt(i, 100 + i * 5));
    const days = sessions.map((s) => ({
      ...createDiaryDay(localDateIso(new Date(s.startedAtMs))),
      items: [item({ computed: { kcal: 300, proteinG: 20, carbsG: 60, fatG: 2 } })], // no loggedAtMs
    }));

    const result = await getNutritionTrainingCorrelation(deps(sessions, days));
    expect(result.mealTimingCarbs).toBeUndefined();
    expect(result.mealTimingReasoning.verdict).toMatch(/not enough precisely-timed logging/);
  });
});
