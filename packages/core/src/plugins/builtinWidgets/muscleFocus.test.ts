import { describe, expect, it } from "vitest";
import { muscleFocusWidget } from "./muscleFocus";
import type { WidgetInput } from "../widgetView";

const NOW = Date.UTC(2026, 0, 15);
const DAY = 24 * 60 * 60 * 1000;

function input(over: Partial<WidgetInput>): WidgetInput {
  return {
    now: NOW,
    prefs: { weightUnit: "kg" },
    exercises: [
      { id: "ex1", name: "Bench Press", primaryMuscles: ["chest"], secondaryMuscles: ["triceps"] },
      { id: "ex2", name: "Squat", primaryMuscles: ["quads"], secondaryMuscles: ["glutes"] },
    ],
    workouts: [],
    ...over,
  };
}

describe("muscleFocusWidget", () => {
  it("counts sets per muscle over the last week (secondary = 0.5×)", () => {
    const view = muscleFocusWidget.compute(
      input({
        workouts: [
          {
            id: "w1",
            startedAtMs: NOW - 2 * DAY,
            endedAtMs: NOW - 2 * DAY,
            exercises: [
              { exerciseId: "ex1", name: "Bench Press", sets: [{ weight: 60, reps: 5 }, { weight: 60, reps: 5 }] },
            ],
          },
        ],
      }),
    );
    const node = view.body[0];
    expect(node.kind).toBe("muscle-map");
    if (node.kind === "muscle-map") {
      expect(node.values.chest).toBe(2);
      expect(node.values.triceps).toBe(1); // 2 sets × 0.5
    }
    expect(view.action).toEqual({ navigate: "/progress" });
  });

  it("ignores workouts older than a week and unfinished ones", () => {
    const view = muscleFocusWidget.compute(
      input({
        workouts: [
          { id: "old", startedAtMs: NOW - 10 * DAY, endedAtMs: NOW - 10 * DAY, exercises: [{ exerciseId: "ex1", name: "Bench Press", sets: [{ weight: 60, reps: 5 }] }] },
          { id: "live", startedAtMs: NOW - DAY, exercises: [{ exerciseId: "ex2", name: "Squat", sets: [{ weight: 100, reps: 5 }] }] },
        ],
      }),
    );
    expect(view.empty).toBeTruthy();
    expect(view.body).toEqual([]);
  });

  it("matches by name when the exercise has no id", () => {
    const view = muscleFocusWidget.compute(
      input({
        workouts: [
          { id: "w", startedAtMs: NOW - DAY, endedAtMs: NOW - DAY, exercises: [{ name: "squat", sets: [{ weight: 100, reps: 5 }] }] },
        ],
      }),
    );
    const node = view.body[0];
    if (node.kind === "muscle-map") expect(node.values.quads).toBe(1);
  });

  it("falls back to name when the exercise has an id that doesn't resolve", () => {
    // Reproduces a real bug: core exercises used to get a fresh random id every time a
    // device's local exercise table was seeded from empty (a new install/device), so a
    // session logged elsewhere and synced in routinely carries an exerciseId the current
    // install never generated — "stale-id_not_in_current_table" stands in for that. Only
    // the name ("Squat") is actually stable across devices; this must still count it.
    const view = muscleFocusWidget.compute(
      input({
        workouts: [
          {
            id: "w",
            startedAtMs: NOW - DAY,
            endedAtMs: NOW - DAY,
            exercises: [{ exerciseId: "stale-id_not_in_current_table", name: "Squat", sets: [{ weight: 100, reps: 5 }] }],
          },
        ],
      }),
    );
    const node = view.body[0];
    expect(node?.kind).toBe("muscle-map");
    if (node?.kind === "muscle-map") expect(node.values.quads).toBe(1);
  });
});
