import { describe, expect, it } from "vitest";
import {
  adherence,
  computeStreak,
  createHabit,
  dueOn,
  isSatisfied,
  weekProgress,
  type Habit,
  type HabitEntry,
} from "./habit";

let seq = 0;
function entry(habitId: string, dateIso: string, over: Partial<HabitEntry> = {}): HabitEntry {
  seq += 1;
  return {
    id: `hen_${seq}`,
    habitId,
    dateIso,
    done: true,
    createdAtMs: seq,
    updatedAtMs: seq,
    ...over,
  };
}

const daily = createHabit("Meditate", { id: "h1", cadence: { kind: "daily" } });
const mwf = createHabit("Gym", { id: "h2", cadence: { kind: "days", days: [1, 3, 5] } }); // Mon/Wed/Fri
const water = createHabit("Water", {
  id: "h3",
  cadence: { kind: "daily" },
  target: { value: 3, unit: "L" },
});
const weekly = createHabit("Runs", { id: "h4", cadence: { kind: "weekly", timesPerWeek: 3 } });

describe("dueOn", () => {
  it("daily is always due", () => {
    expect(dueOn(daily, "2026-06-15")).toBe(true);
  });
  it("specific-days checks the weekday", () => {
    expect(dueOn(mwf, "2026-06-15")).toBe(true); // Monday
    expect(dueOn(mwf, "2026-06-16")).toBe(false); // Tuesday
  });
});

describe("isSatisfied", () => {
  it("yes/no habit uses done", () => {
    expect(isSatisfied(daily, entry("h1", "x", { done: true }))).toBe(true);
    expect(isSatisfied(daily, entry("h1", "x", { done: false }))).toBe(false);
    expect(isSatisfied(daily, undefined)).toBe(false);
  });
  it("numeric habit needs value >= target", () => {
    expect(isSatisfied(water, entry("h3", "x", { value: 3 }))).toBe(true);
    expect(isSatisfied(water, entry("h3", "x", { value: 2.5 }))).toBe(false);
  });
});

describe("computeStreak — daily", () => {
  it("counts consecutive satisfied days ending today", () => {
    const es = ["2026-06-13", "2026-06-14", "2026-06-15"].map((d) => entry("h1", d));
    expect(computeStreak(daily, es, "2026-06-15")).toBe(3);
  });
  it("gives today a grace day — streak survives on yesterday if today isn't done", () => {
    const es = ["2026-06-13", "2026-06-14"].map((d) => entry("h1", d));
    expect(computeStreak(daily, es, "2026-06-15")).toBe(2);
  });
  it("breaks on a missed day", () => {
    const es = ["2026-06-12", "2026-06-14", "2026-06-15"].map((d) => entry("h1", d));
    expect(computeStreak(daily, es, "2026-06-15")).toBe(2); // 13th missing
  });
});

describe("computeStreak — specific days", () => {
  it("skips non-due days", () => {
    // Mon 15, Wed 17, Fri 19 done; Tue/Thu don't matter
    const es = ["2026-06-15", "2026-06-17", "2026-06-19"].map((d) => entry("h2", d));
    expect(computeStreak(mwf, es, "2026-06-19")).toBe(3);
  });
});

describe("weekProgress + weekly streak", () => {
  it("counts this week's check-offs", () => {
    // week of Mon 2026-06-15: 3 runs
    const es = ["2026-06-15", "2026-06-17", "2026-06-19"].map((d) => entry("h4", d));
    expect(weekProgress(weekly, es, "2026-06-20")).toEqual({ done: 3, target: 3 });
  });
  it("streak counts completed weeks", () => {
    const es = [
      "2026-06-08", "2026-06-09", "2026-06-10", // week 1: 3
      "2026-06-15", "2026-06-16", "2026-06-17", // week 2: 3
    ].map((d) => entry("h4", d));
    expect(computeStreak(weekly, es, "2026-06-18")).toBe(2);
  });
});

describe("adherence", () => {
  it("daily: satisfied / due over the range", () => {
    const es = ["2026-06-10", "2026-06-12", "2026-06-13"].map((d) => entry("h1", d));
    expect(adherence(daily, es, "2026-06-10", "2026-06-14")).toEqual({
      satisfied: 3,
      due: 5,
      pct: 0.6,
    });
  });
  it("specific-days: only counts due weekdays", () => {
    // 2026-06-15 Mon .. 2026-06-21 Sun → due Mon/Wed/Fri = 3
    const es = [entry("h2", "2026-06-15"), entry("h2", "2026-06-17")];
    const a = adherence(mwf, es, "2026-06-15", "2026-06-21");
    expect(a).toMatchObject({ satisfied: 2, due: 3 });
  });
});
