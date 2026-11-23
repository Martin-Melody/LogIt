import { describe, expect, it, vi } from "vitest";
import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
import type { WorkoutSession } from "@logit/core/domain/workout";

let sessions: WorkoutSession[] = [];
vi.mock("$lib/features/onboarding/weekSessions", () => ({
  weekSessions: () => sessions,
  movesMissed: () => false,
}));
vi.mock("$lib/features/onboarding/firstWeek", () => ({ planStartIso: () => undefined }));
vi.mock("$lib/data/accountStorage", () => ({ getAccountItem: () => null, setAccountItem: () => {} }));

const { getSplitPlan } = await import("./splitRotation");

const split: WorkoutSplit = {
  id: "ppl",
  name: "PPL",
  archived: false,
  createdAtMs: 0,
  updatedAtMs: 0,
  days: [
    { id: "push", orderIndex: 0, name: "Push", blocks: [] },
    { id: "pull", orderIndex: 1, name: "Pull", blocks: [] },
    { id: "legs", orderIndex: 2, name: "Legs", blocks: [] },
  ],
} as unknown as WorkoutSplit;

const done = (dayId: string, at: Date): WorkoutSession => ({
  id: `s-${dayId}`,
  startedAtMs: at.getTime(),
  endedAtMs: at.getTime() + 3_600_000,
  blocks: [],
  source: { kind: "split", parentId: "ppl", parentName: "PPL", dayId, dayName: dayId },
});

describe("getSplitPlan, from the workouts themselves", () => {
  it("a split day finished today is done today, and the next day is tomorrow (no rotation pointer)", () => {
    const now = new Date(2026, 10, 23, 18, 0);
    sessions = [done("push", new Date(2026, 10, 23, 7, 8))];
    const plan = getSplitPlan(split, now);
    expect(plan.doneToday.map((d) => d.id)).toEqual(["push"]);
    expect(plan.laterToday).toEqual([]);
    expect(plan.next?.days[0]?.id).toBe("pull");
    expect(plan.next?.dateIso).toBe("2026-11-24");
  });

  it("yesterday's workout makes the next day today", () => {
    const now = new Date(2026, 10, 24, 9, 0);
    sessions = [done("push", new Date(2026, 10, 23, 7, 8))];
    const plan = getSplitPlan(split, now);
    expect(plan.doneToday).toEqual([]);
    expect(plan.laterToday.map((d) => d.id)).toEqual(["pull"]);
  });
});
