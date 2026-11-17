import type { WidgetDataNeed, WidgetInput, WidgetWorkout } from "./widgetView";

/**
 * Made-up data for the builder's preview ("Sample") and the checks, plus the same shapes with
 * nothing logged ("Empty"). Times are relative to `now` so "this week" always has something.
 */

const DAY = 24 * 60 * 60 * 1000;

function sampleWorkouts(now: number): WidgetWorkout[] {
  const session = (daysAgo: number, id: string, exercises: WidgetWorkout["exercises"]): WidgetWorkout => {
    const start = now - daysAgo * DAY - 60 * 60 * 1000;
    return { id, startedAtMs: start, endedAtMs: start + 55 * 60 * 1000, exercises };
  };
  return [
    session(1, "s3", [
      { exerciseId: "squat", name: "Back squat", sets: [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }, { weight: 100, reps: 5 }] },
      { exerciseId: "kb-swing", name: "Kettlebell swing", sets: [{ weight: 24, reps: 20 }, { weight: 24, reps: 20 }] },
    ]),
    session(3, "s2", [
      { exerciseId: "bench", name: "Bench press", sets: [{ weight: 80, reps: 6 }, { weight: 80, reps: 6 }, { weight: 80, reps: 5 }] },
      { exerciseId: "row", name: "Barbell row", sets: [{ weight: 70, reps: 8 }, { weight: 70, reps: 8 }] },
    ]),
    session(5, "s1", [
      { exerciseId: "deadlift", name: "Deadlift", sets: [{ weight: 140, reps: 5 }] },
      { exerciseId: "kb-swing", name: "Kettlebell swing", sets: [{ weight: 24, reps: 25 }, { weight: 24, reps: 25 }] },
    ]),
    session(9, "s0", [
      { exerciseId: "squat", name: "Back squat", sets: [{ weight: 97.5, reps: 5 }, { weight: 97.5, reps: 5 }, { weight: 97.5, reps: 5 }] },
    ]),
  ];
}

export function sampleWidgetInput(needs: readonly string[], now: number, empty = false): WidgetInput {
  const want = new Set(needs as WidgetDataNeed[]);
  const input: WidgetInput = { now, timeZone: "Europe/Dublin", prefs: { weightUnit: "kg" } };
  if (want.has("workouts")) input.workouts = empty ? [] : sampleWorkouts(now);
  if (want.has("exercises")) {
    input.exercises = empty
      ? []
      : [
          { id: "squat", name: "Back squat", primaryMuscles: ["quads", "glutes"], secondaryMuscles: ["hamstrings", "core"] },
          { id: "bench", name: "Bench press", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"] },
          { id: "kb-swing", name: "Kettlebell swing", primaryMuscles: ["glutes", "hamstrings"], secondaryMuscles: ["core"] },
        ];
  }
  if (want.has("session")) input.session = empty ? { active: false, hasPlan: false } : { active: false, hasPlan: true, plannedDayLabel: "Upper" };
  if (want.has("todaysPlan")) {
    input.todaysPlan = empty
      ? { scheduled: false, exercises: [] }
      : { splitId: "split", dayLabel: "Upper", scheduled: true, dayIndex: 0, dayCount: 4, exercises: ["Bench press", "Barbell row", "Overhead press"], when: "today" };
  }
  if (want.has("progressionTargets")) {
    input.progressionTargets = empty ? [] : [
      { exerciseName: "Back squat", target: "3×5 @ 102.5kg" },
      { exerciseName: "Bench press", target: "3×6 @ 80kg" },
    ];
  }
  if (want.has("nutrition")) {
    input.nutrition = empty
      ? { hasGoal: false }
      : {
          hasGoal: true,
          targetKcal: 2600,
          consumedKcal: 1840,
          targetMacros: { proteinG: 180, carbsG: 280, fatG: 80 },
          consumedMacros: { proteinG: 132, carbsG: 190, fatG: 58 },
        };
  }
  if (want.has("bodyweight")) {
    input.bodyweight = empty
      ? { trendPoints: [] }
      : {
          currentKg: 82.4,
          weeklyRateKg: -0.3,
          targetKg: 80,
          trendPoints: [0, 1, 2, 3, 4, 5, 6].map((i) => ({
            dateIso: new Date(now - (6 - i) * 7 * DAY).toISOString().slice(0, 10),
            kg: Math.round((84.2 - i * 0.3) * 10) / 10,
          })),
        };
  }
  if (want.has("habits")) {
    input.habits = empty ? [] : [
      { id: "h1", name: "Walk 8k steps", dueToday: true, doneToday: false, streak: 4 },
      { id: "h2", name: "Creatine", dueToday: true, doneToday: true, streak: 21 },
      { id: "h3", name: "Mobility", dueToday: false, doneToday: false, streak: 2, weekProgress: { done: 2, target: 3 } },
    ];
  }
  if (want.has("mobility")) {
    input.mobility = empty
      ? { streakDays: 0, drillsThisWeek: 0, drills: [] }
      : {
          streakDays: 3,
          drillsThisWeek: 5,
          drills: [
            { name: "Couch stretch", metric: "hold", perSide: true, lastPerformedAtMs: now - DAY, sessionsLogged: 12, bestHoldSec: 75 },
            { name: "Cossack squat", metric: "reps", perSide: true, lastPerformedAtMs: now - 2 * DAY, sessionsLogged: 6, bestReps: 10 },
          ],
        };
  }
  return input;
}

/** Input for the other code families' one method, as the app would pass it. */
export function sampleFamilyInput(family: string, now: number, empty = false): unknown {
  const set = (weight: number, reps: number, i: number) => ({ id: `set${i}`, setType: "working", weight, reps, orderIndex: i, completed: true });
  const history = empty ? [] : [0, 1, 2].map((i) => ({
    sessionId: `s${i}`,
    performedAtMs: now - (i * 3 + 1) * DAY,
    sets: [set(100 - i * 2.5, 8, 0), set(100 - i * 2.5, 8, 1), set(100 - i * 2.5, 7, 2)],
  }));
  switch (family) {
    case "progression-algorithm":
      return {
        exercise: { id: "squat", name: "Back squat", primaryMuscles: ["quads", "glutes"], exerciseType: "normal" },
        history,
        state: {},
        userPreferences: {},
        ...(empty
          ? {}
          : {
              repRange: [5, 8],
              strengthEstimate: { kg: 126.7, fromWeightKg: 100, fromReps: 8, performedAtMs: now - DAY },
              goal: { weightKg: 140, reps: 1, deadlineIso: null, pace: "unknown", currentKg: 126.7, neededPerWeekKg: null, ratePerWeekKg: 1.2, behindPace: "show" },
              muscleWeek: { muscle: "quads", done: 6, lo: 10, hi: 16 },
              food: { avgKcal: 2950, maintenanceKcal: 2900, daysLogged: 6 },
            }),
      };
    case "analytics":
      return { exercise: { id: "squat", name: "Back squat", exerciseType: "normal" }, history: [...history].reverse() };
    case "mobility-progression":
      return {
        drill: { id: "couch", name: "Couch stretch", metric: "hold", perSide: true, area: "hips" },
        history: empty ? [] : [{ sessionId: "m1", performedAtMs: now - DAY, sets: [{ side: "left", durationSec: 60 }, { side: "right", durationSec: 55 }] }],
        state: {},
        userPreferences: {},
      };
    case "nutrition-algorithm":
      return {
        goal: { sex: "male", heightCm: 180, activityLevel: "moderate", goalType: "lose", targetRateKgPerWeek: 0.4, proteinGPerKg: 2, fatPct: 0.25, adaptiveEnabled: false },
        currentWeightKg: empty ? undefined : 82.4,
        weightEntries: empty ? [] : [{ dateIso: new Date(now - 7 * DAY).toISOString().slice(0, 10), kg: 82.8 }, { dateIso: new Date(now).toISOString().slice(0, 10), kg: 82.4 }],
        dailyIntakeKcal: empty ? [] : [{ dateIso: new Date(now - DAY).toISOString().slice(0, 10), kcal: 2450 }],
        userPreferences: {},
        now,
      };
    case "nutrition-analytics": {
      const iso = (d: number) => new Date(now - d * DAY).toISOString().slice(0, 10);
      const food = (id: string, meal: string, name: string, grams: number, computed: Record<string, number>) => ({ id, meal, name, grams, computed });
      return {
        days: empty ? [] : [2, 1, 0].map((d) => ({
          id: `day${d}`,
          dateIso: iso(d),
          createdAtMs: now - d * DAY,
          updatedAtMs: now - d * DAY,
          items: [
            food(`a${d}`, "breakfast", "Oats", 80, { kcal: 450, proteinG: 25, carbsG: 60, fatG: 12 }),
            food(`b${d}`, "lunch", "Chicken and rice", 450, { kcal: 720, proteinG: 55, carbsG: 85, fatG: 14 }),
            food(`c${d}`, "snack", "Protein shake", 40, { kcal: 260, proteinG: 40, carbsG: 8, fatG: 6 }),
          ],
        })),
        weightEntries: [],
        goal: null,
        targets: null,
        range: { startIso: iso(6), endIso: iso(0) },
      };
    }
    default:
      return {};
  }
}
