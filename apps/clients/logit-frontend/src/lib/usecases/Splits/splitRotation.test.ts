import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
import type { WorkoutSession } from "@logit/core/domain/workout";

let sessions: WorkoutSession[] = [];
vi.mock("$lib/features/onboarding/weekSessions", () => ({
  weekSessions: () => sessions,
  movesMissed: () => false,
}));
vi.mock("$lib/features/onboarding/firstWeek", () => ({ planStartIso: () => undefined }));
vi.mock("$lib/data/accountStorage", () => ({ getAccountItem: () => null, setAccountItem: () => {} }));
let draft: WorkoutSession | null = null;
vi.mock("$lib/stores/currentSession.store", () => ({ currentSession: { subscribe: (run: (v: unknown) => void) => (run(draft), () => {}) } }));

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
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 10, 23, 18, 0) });
    draft = null;
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

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

  it("tomorrow's day started by mistake and deleted doesn't count, even with the old pointer moved", () => {
    const now = new Date(2026, 10, 23, 20, 0);
    localStorage.setItem("logit:split-rotation:ppl:v1", JSON.stringify({ lastDayId: "pull", recordedAtMs: now.getTime(), doneOnDay: ["push", "pull"] }));
    sessions = [done("push", new Date(2026, 10, 23, 7, 8))];
    const plan = getSplitPlan(split, now);
    expect(plan.doneToday.map((d) => d.id)).toEqual(["push"]);
    expect(plan.next).toMatchObject({ dateIso: "2026-11-24", days: [{ id: "pull" }] });
  });

  it("the workout running now counts as done today", () => {
    draft = { ...done("push", new Date(2026, 10, 23, 7, 8)), endedAtMs: undefined } as WorkoutSession;
    sessions = [];
    const plan = getSplitPlan(split, new Date(2026, 10, 23, 7, 30));
    expect(plan.doneToday.map((d) => d.id)).toEqual(["push"]);
  });

  it("Martin's week: Push B&B Legs B&B Push, rest, rest; started from Splits, so no pointer", () => {
    const ppl = {
      ...split,
      days: [
        { id: "push1", orderIndex: 0, name: "Push", blocks: [] },
        { id: "bb1", orderIndex: 1, name: "Back & Biceps", blocks: [] },
        { id: "legs", orderIndex: 2, name: "Legs", blocks: [] },
        { id: "bb2", orderIndex: 3, name: "Back & Biceps", blocks: [] },
        { id: "push2", orderIndex: 4, name: "Push", blocks: [] },
        { id: "r1", orderIndex: 5, name: "Rest", rest: true, blocks: [] },
        { id: "r2", orderIndex: 6, name: "Rest", rest: true, blocks: [] },
      ],
    } as unknown as WorkoutSplit;
    const week = [
      done("push2", new Date(2026, 10, 20, 7, 2)),
      done("bb2", new Date(2026, 10, 19, 7, 2)),
      done("legs", new Date(2026, 10, 18, 7, 22)),
      done("bb1", new Date(2026, 10, 17, 7, 8)),
      done("push1", new Date(2026, 10, 16, 7, 32)),
    ];
    // Monday morning: the rest days are over, Push is today.
    sessions = week;
    expect(getSplitPlan(ppl, new Date(2026, 10, 23, 6, 30)).laterToday.map((d) => d.id)).toEqual(["push1"]);
    // Monday evening, Push done: Back & Biceps tomorrow.
    sessions = [done("push1", new Date(2026, 10, 23, 7, 8)), ...week];
    const evening = getSplitPlan(ppl, new Date(2026, 10, 23, 18, 0));
    expect(evening.doneToday.map((d) => d.id)).toEqual(["push1"]);
    expect(evening.next).toMatchObject({ dateIso: "2026-11-24", days: [{ id: "bb1" }] });
  });
});
