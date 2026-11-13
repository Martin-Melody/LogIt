import { describe, expect, it } from "vitest";
import { addDays } from "./dateIso";
import { clampWeeklyTarget, computeWeeklyStreak, targetForWeek } from "./weeklyStreak";

// 2026-11-02 is a Monday.
const MON = "2026-11-02";
const days = (weekStart: string, offsets: number[]) => offsets.map((o) => addDays(weekStart, o));
const week = (n: number) => addDays(MON, n * 7);

describe("computeWeeklyStreak", () => {
  it("counts weeks that hit the target; rest days don't break it", () => {
    const trained = [
      ...days(week(0), [0, 1, 3, 4, 5]),
      ...days(week(1), [0, 2, 3, 4, 6]),
      ...days(week(2), [1, 2, 3, 4, 5]),
    ];
    const s = computeWeeklyStreak({ trainedDaysIso: trained, weeklyTarget: 5, todayIso: addDays(week(2), 6) });
    expect(s.currentWeeks).toBe(3);
    expect(s.bestWeeks).toBe(3);
  });

  it("a short week resets it, and best remembers the longer run", () => {
    const trained = [
      ...days(week(0), [0, 1, 2]),
      ...days(week(1), [0, 1, 2]),
      ...days(week(2), [0, 1]), // missed
      ...days(week(3), [0, 1, 2]),
    ];
    const s = computeWeeklyStreak({ trainedDaysIso: trained, weeklyTarget: 3, todayIso: addDays(week(3), 6) });
    expect(s.currentWeeks).toBe(1);
    expect(s.bestWeeks).toBe(2);
  });

  it("the week in progress can add but never break", () => {
    const trained = [...days(week(0), [0, 1, 2]), ...days(week(1), [0])];
    const midweek = computeWeeklyStreak({ trainedDaysIso: trained, weeklyTarget: 3, todayIso: addDays(week(1), 2) });
    expect(midweek.currentWeeks).toBe(1);
    expect(midweek.thisWeek).toMatchObject({ done: 1, needed: 3, outcome: "in_progress" });

    const done = computeWeeklyStreak({
      trainedDaysIso: [...trained, ...days(week(1), [1, 2])],
      weeklyTarget: 3,
      todayIso: addDays(week(1), 2),
    });
    expect(done.currentWeeks).toBe(2);
    expect(done.thisWeek.outcome).toBe("met");
  });

  it("two workouts on one day count once", () => {
    const trained = [week(0), week(0), addDays(week(0), 1)];
    const s = computeWeeklyStreak({ trainedDaysIso: trained, weeklyTarget: 3, todayIso: addDays(week(1), 1) });
    expect(s.currentWeeks).toBe(0);
  });

  it("a fully paused week is skipped, not broken", () => {
    const trained = [...days(week(0), [0, 1, 2, 3, 4]), ...days(week(2), [0, 1, 2, 3, 4])];
    const pauses = [{ id: "p", startIso: week(1), endIso: addDays(week(1), 6) }];
    const s = computeWeeklyStreak({ trainedDaysIso: trained, weeklyTarget: 5, pauses, todayIso: addDays(week(2), 6) });
    expect(s.currentWeeks).toBe(2);
  });

  it("a part-paused week needs fewer days", () => {
    // Paused Thu–Sun (4 days): 5 × 3/7 → 3 days needed.
    const trained = [...days(week(0), [0, 1, 2])];
    const pauses = [{ id: "p", startIso: addDays(week(0), 3), endIso: addDays(week(0), 6) }];
    const s = computeWeeklyStreak({ trainedDaysIso: trained, weeklyTarget: 5, pauses, todayIso: addDays(week(1), 0) });
    expect(s.currentWeeks).toBe(1);
  });

  it("an open pause covers up to today and says so", () => {
    const trained = days(week(0), [0, 1, 2, 3]);
    const pauses = [{ id: "p", startIso: week(1), endIso: null }];
    const s = computeWeeklyStreak({ trainedDaysIso: trained, weeklyTarget: 4, pauses, todayIso: addDays(week(3), 2) });
    expect(s.pausedNow).toBe(true);
    expect(s.currentWeeks).toBe(1);
  });

  it("nothing logged is zero", () => {
    const s = computeWeeklyStreak({ trainedDaysIso: [], weeklyTarget: 3, todayIso: MON });
    expect(s).toMatchObject({ currentWeeks: 0, bestWeeks: 0 });
  });

  it("ignores days after today", () => {
    const s = computeWeeklyStreak({ trainedDaysIso: [addDays(MON, 10)], weeklyTarget: 1, todayIso: MON });
    expect(s.currentWeeks).toBe(0);
  });
});

describe("target changes", () => {
  it("raising the target doesn't rewrite past weeks", () => {
    const trained = [
      ...days(week(0), [0, 1, 2]),
      ...days(week(1), [0, 1, 2]),
      ...days(week(2), [0, 1, 2, 3, 4]),
    ];
    const targetHistory = [
      { fromIso: "0000-01-01", target: 3 },
      { fromIso: week(2), target: 5 },
    ];
    const s = computeWeeklyStreak({ trainedDaysIso: trained, weeklyTarget: 5, targetHistory, todayIso: addDays(week(2), 6) });
    expect(s.currentWeeks).toBe(3);
    expect(s.weeklyTarget).toBe(5);
  });

  it("targetForWeek uses the latest change on or before the week", () => {
    const h = [{ fromIso: week(1), target: 4 }, { fromIso: week(3), target: 6 }];
    expect(targetForWeek(week(0), h, 3)).toBe(4); // before any change: the earliest
    expect(targetForWeek(week(2), h, 3)).toBe(4);
    expect(targetForWeek(week(3), h, 3)).toBe(6);
    expect(targetForWeek(week(3), [], 3)).toBe(3);
  });
});

describe("clampWeeklyTarget", () => {
  it("keeps it between 1 and 7", () => {
    expect(clampWeeklyTarget(0)).toBe(1);
    expect(clampWeeklyTarget(9)).toBe(7);
    expect(clampWeeklyTarget(4.4)).toBe(4);
  });
});
