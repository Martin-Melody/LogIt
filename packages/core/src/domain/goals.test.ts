import { describe, expect, it } from "vitest";
import {
  countGoalSeries,
  estimateWeightForReps,
  liftGoalSeries,
  mergeGoals,
  projectGoal,
  repsGoalSeries,
  robustTrend,
  type Goal,
  type GoalPoint,
} from "./goals";
import type { ExerciseHistoryEntry } from "./progression";
import type { SetEntry } from "./workout";

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const T0 = Date.UTC(2026, 0, 5); // a Monday

let seq = 0;
function set(weight: number, reps: number, over: Partial<SetEntry> = {}): SetEntry {
  seq += 1;
  return { id: `s${seq}`, setType: "normal", reps, weight, orderIndex: seq, completed: true, ...over };
}
function entry(day: number, sets: SetEntry[]): ExerciseHistoryEntry {
  return { sessionId: `x${day}`, performedAtMs: T0 + day * DAY, sets };
}

describe("estimateWeightForReps", () => {
  it("returns the weight itself at the same rep count", () => {
    expect(estimateWeightForReps(100, 5, 5)).toBe(100);
  });
  it("converts through Epley", () => {
    // 100 × 5 → 1RM 116.7; at 3 reps: 116.7 / 1.1 = 106.1
    expect(estimateWeightForReps(100, 5, 1)).toBeCloseTo(116.67, 1);
    expect(estimateWeightForReps(100, 5, 3)).toBeCloseTo(106.06, 1);
  });
});

describe("liftGoalSeries", () => {
  it("takes each session's best estimate and ignores warm-ups and long sets", () => {
    const s = liftGoalSeries(
      [
        entry(0, [set(60, 10, { setType: "warmup" }), set(90, 5), set(80, 8)]),
        entry(7, [set(50, 20), set(92.5, 5)]),
      ],
      { weightKg: 100, reps: 5 },
    );
    expect(s.points.map((p) => p.value)).toEqual([90, 92.5]);
    expect(s.achievedAtMs).toBeNull();
  });

  it("is achieved only by a real set, not an estimate", () => {
    const s = liftGoalSeries(
      [entry(0, [set(95, 8)]), entry(3, [set(100, 1)]), entry(6, [set(100, 2)])],
      { weightKg: 100, reps: 2 },
    );
    expect(s.points[0]!.value).toBeGreaterThan(100); // 95 × 8 estimates past 100 × 2
    expect(s.achievedAtMs).toBe(T0 + 6 * DAY);
  });

  it("skips sets not ticked off", () => {
    const s = liftGoalSeries([entry(0, [set(120, 1, { completed: false })])], { weightKg: 100, reps: 1 });
    expect(s.points).toEqual([]);
    expect(s.achievedAtMs).toBeNull();
  });
});

describe("repsGoalSeries", () => {
  it("tracks the best set and when the target was hit", () => {
    const s = repsGoalSeries([entry(0, [set(0, 8), set(0, 10)]), entry(2, [set(0, 12)])], { reps: 12 });
    expect(s.points.map((p) => p.value)).toEqual([10, 12]);
    expect(s.achievedAtMs).toBe(T0 + 2 * DAY);
  });
});

describe("countGoalSeries", () => {
  it("adds up from the start date only", () => {
    const sessions = [
      { tMs: T0 - DAY, volumeKg: 1000 },
      { tMs: T0 + DAY, volumeKg: 5000 },
      { tMs: T0 + 2 * DAY, volumeKg: 6000 },
    ];
    const vol = countGoalSeries(sessions, { metric: "volume", target: 10000, startMs: T0 });
    expect(vol.points.map((p) => p.value)).toEqual([0, 5000, 11000]);
    expect(vol.achievedAtMs).toBe(T0 + 2 * DAY);
    const n = countGoalSeries(sessions, { metric: "sessions", target: 5, startMs: T0 });
    expect(n.points.at(-1)!.value).toBe(2);
    expect(n.achievedAtMs).toBeNull();
  });
});

function weekly(values: number[]): GoalPoint[] {
  return values.map((value, i) => ({ tMs: T0 + i * WEEK, value }));
}

describe("robustTrend", () => {
  it("shrugs off one bad day", () => {
    const pts = weekly([80, 81, 82, 70, 84, 85]);
    const t = robustTrend(pts)!;
    expect(t.slopePerMs * WEEK).toBeCloseTo(1, 1);
  });
});

describe("projectGoal", () => {
  const now = T0 + 9 * WEEK;

  it("projects a steady climb to the target", () => {
    // +1 kg a week from 80, now at ~89 → 100 in ~11 weeks.
    const pts = weekly([80, 81, 82, 83, 84, 85, 86, 87, 88, 89]);
    const p = projectGoal(pts, { target: 100, nowMs: now });
    expect(p.status).toBe("on_track");
    expect(p.ratePerWeek).toBeCloseTo(1, 5);
    expect((p.eta!.likelyMs - now) / WEEK).toBeCloseTo(11, 1);
    expect(p.eta!.earlyMs).toBeLessThanOrEqual(p.eta!.likelyMs);
    expect(p.line.at(-1)!.value).toBe(100);
  });

  it("gives a range when progress is uneven", () => {
    const pts = weekly([80, 82, 82, 85, 85, 85, 88, 88, 89, 91]);
    const p = projectGoal(pts, { target: 100, nowMs: now });
    expect(p.status).toBe("on_track");
    expect(p.eta!.earlyMs).toBeLessThan(p.eta!.likelyMs);
    expect(p.eta!.lateMs ?? Infinity).toBeGreaterThan(p.eta!.likelyMs);
    expect(p.band.length).toBeGreaterThan(2);
    expect(p.band[0]!.low).toBeCloseTo(p.band[0]!.high, 5);
  });

  it("says stalled when flat or going backwards", () => {
    expect(projectGoal(weekly([90, 90, 90, 90, 90, 90]), { target: 100, nowMs: T0 + 5 * WEEK }).status).toBe("stalled");
    expect(projectGoal(weekly([95, 94, 93, 92, 91]), { target: 100, nowMs: T0 + 4 * WEEK }).status).toBe("stalled");
  });

  it("works for goals going down (a weight cut)", () => {
    const pts = weekly([70, 69.5, 69, 68.5, 68, 67.5]);
    const p = projectGoal(pts, { target: 65, nowMs: T0 + 5 * WEEK, direction: -1 });
    expect(p.status).toBe("on_track");
    expect(p.ratePerWeek).toBeCloseTo(-0.5, 5);
    expect((p.eta!.likelyMs - (T0 + 5 * WEEK)) / WEEK).toBeCloseTo(5, 1);
  });

  it("needs a few sessions first", () => {
    expect(projectGoal(weekly([80, 85]), { target: 100, nowMs: T0 + WEEK }).status).toBe("not_enough_data");
  });

  it("is ready when the estimate already passes the target", () => {
    expect(projectGoal(weekly([98, 99, 100, 101]), { target: 100, nowMs: T0 + 3 * WEEK }).status).toBe("ready");
  });

  it("is achieved when the series says so, whatever the trend", () => {
    expect(projectGoal(weekly([90, 89, 88, 87]), { target: 95, nowMs: T0 + 3 * WEEK, achieved: true }).status).toBe("achieved");
  });

  it("doesn't promise dates past the horizon", () => {
    const pts = weekly([80, 80.01, 80.02, 80.03, 80.04]);
    expect(projectGoal(pts, { target: 200, nowMs: T0 + 4 * WEEK }).status).toBe("stalled");
  });

  it("reports where the trend lands on a deadline", () => {
    const pts = weekly([80, 81, 82, 83, 84, 85, 86, 87, 88, 89]);
    const p = projectGoal(pts, { target: 100, nowMs: now, deadlineMs: now + 4 * WEEK });
    expect(p.atDeadline).toBeCloseTo(93, 5);
  });

  it("fits only the recent window when there's enough in it", () => {
    // Fast newbie gains a year ago, slow lately: the recent pace is what counts.
    const old = Array.from({ length: 10 }, (_, i) => ({ tMs: T0 - 60 * WEEK + i * WEEK, value: 40 + i * 4 }));
    const recent = weekly([80, 80.5, 81, 81.5, 82, 82.5, 83, 83.5, 84, 84.5]);
    const p = projectGoal([...old, ...recent], { target: 100, nowMs: now });
    expect(p.ratePerWeek).toBeCloseTo(0.5, 5);
  });
});

describe("mergeGoals", () => {
  const g = (id: string, updatedAtMs: number, over: Partial<Goal> = {}): Goal => ({
    id,
    target: { type: "reps", exerciseName: "Pull-up", reps: 20 },
    createdAtMs: 1,
    updatedAtMs,
    ...over,
  });
  it("keeps the newer copy of each goal, deletions included", () => {
    const merged = mergeGoals([g("a", 5), g("b", 2)], [g("a", 3), g("b", 4, { deletedAtMs: 4 }), g("c", 1)]);
    expect(merged.map((x) => [x.id, x.updatedAtMs, x.deletedAtMs ?? null])).toEqual([
      ["a", 5, null],
      ["b", 4, 4],
      ["c", 1, null],
    ]);
  });
});
