import { describe, expect, it } from "vitest";
import {
  addWeek,
  createCoachProgram,
  fromDateInputValue,
  getCurrentWeek,
  getProgramProgress,
  getProgramStartMs,
  setProgramStart,
  startOfLocalDayMs,
  toDateInputValue,
  type CoachProgram,
} from "./CoachProgram";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 10, 16); // a Monday

function threeWeekProgram(patch: Partial<CoachProgram> = {}): CoachProgram {
  let p = createCoachProgram("Block");
  p = addWeek(p);
  p = addWeek(p);
  return { ...p, ...patch };
}

describe("program start", () => {
  it("a new program waits for the client to tap Start", () => {
    const p = threeWeekProgram();
    expect(p.startMode).toBe("manual");
    expect(getProgramProgress(p, START)).toEqual({ status: "not-started" });
    expect(getCurrentWeek(p, START)).toBeNull();
  });

  it("manual: runs from the client's start, week by week, then finishes", () => {
    const p = threeWeekProgram({ clientStartedAtMs: START });
    expect(getProgramProgress(p, START)).toEqual({ status: "running", weekNumber: 1 });
    expect(getProgramProgress(p, START + 6 * DAY)).toEqual({ status: "running", weekNumber: 1 });
    expect(getProgramProgress(p, START + 7 * DAY)).toEqual({ status: "running", weekNumber: 2 });
    expect(getProgramProgress(p, START + 20 * DAY)).toEqual({ status: "running", weekNumber: 3 });
    expect(getProgramProgress(p, START + 21 * DAY)).toEqual({ status: "finished" });
    expect(getCurrentWeek(p, START + 8 * DAY)?.weekNumber).toBe(2);
  });

  it("manual ignores a coach date, fixed-date ignores the client's start", () => {
    const both = { startDateMs: START, clientStartedAtMs: START + 3 * DAY };
    expect(getProgramStartMs(threeWeekProgram({ ...both, startMode: "manual" }))).toBe(START + 3 * DAY);
    expect(getProgramStartMs(threeWeekProgram({ ...both, startMode: "fixed-date" }))).toBe(START);
  });

  it("fixed-date: scheduled before the date, running from it", () => {
    const p = threeWeekProgram({ startMode: "fixed-date", startDateMs: START });
    expect(getProgramProgress(p, START - DAY)).toEqual({ status: "scheduled", startsAtMs: START });
    expect(getProgramProgress(p, START)).toEqual({ status: "running", weekNumber: 1 });
  });

  it("fixed-date without a date yet is not started", () => {
    const p = threeWeekProgram({ startMode: "fixed-date" });
    expect(getProgramProgress(p, START)).toEqual({ status: "not-started" });
  });

  it('programs saved with the old "on-accept" mode behave as manual', () => {
    const legacy = { ...threeWeekProgram(), startMode: "on-accept" } as unknown as CoachProgram;
    expect(getProgramProgress(legacy, START)).toEqual({ status: "not-started" });
    const started = { ...legacy, clientStartedAtMs: START };
    expect(getProgramProgress(started, START + DAY)).toEqual({ status: "running", weekNumber: 1 });
  });

  it("startOfLocalDayMs is local midnight of the same day", () => {
    const noon = new Date(2026, 10, 18, 12, 30).getTime();
    expect(startOfLocalDayMs(noon)).toBe(new Date(2026, 10, 18).getTime());
  });

  it("setProgramStart switches modes and drops a stale date", () => {
    const date = new Date(2026, 10, 16, 15).getTime();
    const fixed = setProgramStart(threeWeekProgram(), { mode: "fixed-date", startDateMs: date });
    expect(fixed.startMode).toBe("fixed-date");
    expect(fixed.startDateMs).toBe(new Date(2026, 10, 16).getTime());
    const manual = setProgramStart(fixed, { mode: "manual" });
    expect(manual.startMode).toBe("manual");
    expect(manual.startDateMs).toBeUndefined();
  });

  it("date input values round-trip in local time", () => {
    const ms = new Date(2026, 0, 5).getTime();
    expect(toDateInputValue(ms)).toBe("2026-01-05");
    expect(fromDateInputValue("2026-01-05")).toBe(ms);
    expect(fromDateInputValue("")).toBeNull();
  });
});
