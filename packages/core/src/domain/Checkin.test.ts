import { describe, expect, it } from "vitest";
import { createCheckinSchedule, missedCheckin, periodDueMs, type CheckinSubmission } from "./Checkin";

const DAY = 24 * 60 * 60 * 1000;
const ANCHOR = Date.UTC(2026, 10, 2); // Monday 2 Nov

function schedule(patch = {}) {
  return { ...createCheckinSchedule(), anchorMs: ANCHOR, ...patch };
}

function sub(scheduleId: string, periodIndex: number, submitted: boolean): CheckinSubmission {
  return {
    id: `s${periodIndex}`,
    scheduleId,
    periodIndex,
    periodStartMs: ANCHOR + periodIndex * 7 * DAY,
    answers: [],
    submittedAtMs: submitted ? ANCHOR + periodIndex * 7 * DAY + DAY : undefined,
    createdAtMs: 0,
    updatedAtMs: 0,
  };
}

describe("missed check-ins", () => {
  it("nothing is missed during the first period", () => {
    const s = schedule();
    expect(missedCheckin(s, [], ANCHOR + 3 * DAY)).toBeNull();
  });

  it("last week's check-in is missed when nothing was sent", () => {
    const s = schedule();
    expect(missedCheckin(s, [], ANCHOR + 10 * DAY)).toEqual({ periodIndex: 0, dueMs: ANCHOR + 7 * DAY });
    expect(periodDueMs(s, 0)).toBe(ANCHOR + 7 * DAY);
  });

  it("a draft doesn't count, a sent one does", () => {
    const s = schedule();
    expect(missedCheckin(s, [sub(s.id, 0, false)], ANCHOR + 10 * DAY)).not.toBeNull();
    expect(missedCheckin(s, [sub(s.id, 0, true)], ANCHOR + 10 * DAY)).toBeNull();
  });

  it("only the period just gone counts", () => {
    const s = schedule();
    // Week 0 never sent, week 1 sent, now in week 2.
    expect(missedCheckin(s, [sub(s.id, 1, true)], ANCHOR + 16 * DAY)).toBeNull();
  });

  it("another form's answers don't count", () => {
    const s = schedule();
    expect(missedCheckin(s, [sub("other", 0, true)], ANCHOR + 10 * DAY)).not.toBeNull();
  });

  it("manual and archived forms are never missed", () => {
    expect(missedCheckin(schedule({ cadence: "manual" }), [], ANCHOR + 40 * DAY)).toBeNull();
    expect(missedCheckin(schedule({ archived: true }), [], ANCHOR + 40 * DAY)).toBeNull();
  });
});
