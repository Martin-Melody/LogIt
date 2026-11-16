import { describe, expect, it } from "vitest";
import {
  attachmentSummary,
  copyTarget,
  habitFromShared,
  libraryItemFromShared,
  prText,
  sharedBlockTarget,
  sharedLibraryItem,
  sharedSplit,
  splitFromShared,
  type SharedSplit,
} from "./sharedContent";
import { appendUnique, caughtUpIndex } from "./socialFeed";
import type { WorkoutSplit } from "./WorkoutSplit";

describe("shared content", () => {
  it("copies a split with fresh ids and resolves exercises once per name", async () => {
    const payload: SharedSplit = {
      name: "Upper / Lower",
      schedule: "weekdays",
      days: [
        {
          name: "Upper", orderIndex: 0, weekday: 1,
          blocks: [
            { type: "strength", orderIndex: 0, exerciseName: "Bench press", exerciseId: "core_bench_press", targets: { sets: 4, reps: 8 } },
            { type: "strength", orderIndex: 1, exerciseName: "Landmine twist", exerciseId: "ex_theirs" },
            { type: "mobility", orderIndex: 2, drillName: "Hip flow", metric: "hold", perSide: false },
          ],
        },
        { name: "Lower", orderIndex: 1, weekday: 9, blocks: [{ type: "strength", orderIndex: 0, exerciseName: "Landmine twist" }] },
        { orderIndex: 2, rest: true, blocks: [] },
      ],
      customExercises: [{ name: "Landmine twist", primaryMuscles: ["core"] }],
    };
    const calls: string[] = [];
    const split = await splitFromShared(payload, async (name, id, custom) => {
      calls.push(`${name}:${id ?? ""}:${custom ? "custom" : ""}`);
      return name === "Bench press" ? "core_bench_press" : "ex_mine";
    });
    expect(calls).toEqual(["Bench press:core_bench_press:", "Landmine twist:ex_theirs:custom"]);
    expect(split.name).toBe("Upper / Lower");
    expect(split.schedule).toBe("weekdays");
    expect(split.id).not.toBe("");
    const [upper, lower, rest] = split.days;
    expect(upper.blocks.map((b) => (b.type === "strength" ? b.exerciseId : b.type))).toEqual(["core_bench_press", "ex_mine", "mobility"]);
    expect(upper.weekday).toBe(1);
    expect(lower.weekday).toBeUndefined(); // out of range
    expect(rest.rest).toBe(true);
  });

  it("round-trips a split through a post", async () => {
    const split: WorkoutSplit = {
      id: "s1", name: "Full body", archived: false, createdAtMs: 1, updatedAtMs: 1,
      days: [{ id: "d1", orderIndex: 0, name: "A", blocks: [{ type: "cardio", id: "b1", orderIndex: 0, activityName: "Row" }] }],
    };
    const copy = await splitFromShared(sharedSplit(split, []), async () => undefined);
    expect(copy.id).not.toBe("s1");
    expect(copy.days[0].blocks[0]).toMatchObject({ type: "cardio", activityName: "Row" });
  });

  it("copies library items of every kind as the reader's own", () => {
    const strength = libraryItemFromShared({ name: "Seal row", primaryMuscles: ["back"] });
    expect(strength.kind).toBe("strength");
    expect(strength.item.isCore).toBe(false);

    const cardio = libraryItemFromShared(sharedLibraryItem({
      kind: "cardio",
      item: { id: "theirs", name: "Sled push", measures: "time", cues: ["Low hips"], notes: null, isCore: false },
    }));
    expect(cardio).toMatchObject({ kind: "cardio", item: { name: "Sled push", measures: "time", cues: ["Low hips"] } });
    expect(cardio.item.id).not.toBe("theirs");

    const drill = libraryItemFromShared({ kind: "mobility", name: "90/90", perSide: true });
    expect(drill).toMatchObject({ kind: "mobility", item: { name: "90/90", perSide: true, area: "full-body", defaultMetric: "hold" } });
  });

  it("copies a habit", () => {
    const h = habitFromShared({ name: "Hip mobility", cadence: { kind: "daily" } });
    expect(h).toMatchObject({ name: "Hip mobility", archived: false });
  });

  it("summarises attachments for cards", () => {
    expect(attachmentSummary("PersonalRecord", JSON.stringify({ exerciseName: "Deadlift", weight: 105, unit: "kg", reps: 5 })))
      .toEqual({ label: "Personal record", title: "Deadlift", detail: "105 kg × 5 reps" });
    expect(attachmentSummary("WorkoutSession", JSON.stringify({ duration: 48 * 60000, exercises: [{ name: "Squat", sets: 3 }] })))
      .toEqual({ label: "Workout", title: "48 min · 1 exercise", detail: "Squat (3)" });
    expect(attachmentSummary("Exercise", JSON.stringify({ kind: "mobility", name: "90/90" }))?.label).toBe("Mobility");
    expect(attachmentSummary("Habit", JSON.stringify({ name: "Walk", cadence: { kind: "weekly", timesPerWeek: 3 } }))?.detail).toBe("3× a week");
    expect(attachmentSummary("Text", "{}")).toBeNull();
    expect(attachmentSummary("Split", "not json")).toBeNull();
    expect(prText(undefined, undefined, 12)).toBe("12 reps");
    expect(sharedBlockTarget({ type: "strength", orderIndex: 0, exerciseName: "Squat", targets: { sets: 4, reps: 5, weight: 100 } })).toBe("4 × 5 @ 100 kg");
    expect(sharedBlockTarget({ type: "mobility", orderIndex: 0, drillName: "Couch", metric: "hold", perSide: true, targets: { sets: 2, holdSec: 30 } })).toBe("2 × 30 s");
    expect(sharedBlockTarget({ type: "strength", orderIndex: 0, exerciseName: "Squat" })).toBe("");
    expect(copyTarget("Widget")).toBe("phone");
    expect(copyTarget("WorkoutSession")).toBeNull();
  });
});

describe("social feed", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  const at = (daysAgo: number) => ({ createdAt: new Date(now - daysAgo * 86_400_000).toISOString() });

  it("puts 'caught up' before the first old post, or waits for more", () => {
    expect(caughtUpIndex([at(0), at(1), at(5)], true, now)).toBe(2);
    expect(caughtUpIndex([at(4)], true, now)).toBe(0);
    expect(caughtUpIndex([at(0), at(1)], true, now)).toBeNull();
    expect(caughtUpIndex([at(0), at(1)], false, now)).toBe(2);
    expect(caughtUpIndex([], false, now)).toBe(0);
  });

  it("appends a page without repeats", () => {
    expect(appendUnique([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});
