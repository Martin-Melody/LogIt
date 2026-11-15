import { describe, expect, it } from "vitest";
import { checkinPeriodLabel, checkinRows, createCheckinSchedule, missedCheckin, periodDueMs, type CheckinSubmission } from "./Checkin";

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

describe("the client's check-ins list", () => {
  const rows = (subs: CheckinSubmission[], at: number, reviews = new Map(), s = schedule()) =>
    checkinRows([s], subs.map((x) => ({ ...x, scheduleId: s.id })), reviews, at, 8);
  const brief = (r: { periodIndex: number; state: string }[]) => r.map((x) => `${x.periodIndex}:${x.state}`);

  it("this week first, then earlier weeks newest first with sent, reviewed and not sent", () => {
    // Now in week 4: week 3 sent, week 2 sent + reviewed, week 1 not sent, week 0 sent.
    const subs = [sub("x", 3, true), sub("x", 2, true), sub("x", 0, true)];
    const r = rows(subs, ANCHOR + 4 * 7 * DAY + DAY, new Map([["s2", { reviewedAtMs: 5, reply: "Solid week." }]]));
    expect(brief(r.current)).toEqual(["4:due"]);
    expect(brief(r.earlier)).toEqual(["3:sent", "2:reviewed", "1:not-sent", "0:sent"]);
    expect(r.earlier[1]!.review?.reply).toBe("Solid week.");
  });

  it("a missed week sits with this week, ahead of it", () => {
    const r = rows([sub("x", 2, false)], ANCHOR + 3 * 7 * DAY + DAY);
    expect(brief(r.current)).toEqual(["2:late", "3:due"]);
    expect(r.current[0]!.submission).toBeDefined(); // its draft
    expect(brief(r.earlier)).toEqual(["1:not-sent", "0:not-sent"]);
  });

  it("this week's draft and sent states", () => {
    expect(brief(rows([sub("x", 1, false)], ANCHOR + 8 * DAY).current)).toEqual(["0:late", "1:draft"]);
    expect(brief(rows([sub("x", 0, true), sub("x", 1, true)], ANCHOR + 8 * DAY).current)).toEqual(["1:sent"]);
  });

  it("goes back a limited number of empty weeks, but keeps every sent one", () => {
    const r = rows([sub("x", 0, true)], ANCHOR + 20 * 7 * DAY + DAY);
    expect(r.earlier.at(0)!.periodIndex).toBe(18); // week 19 is "late", so earlier starts at 18
    expect(r.earlier.filter((x) => x.state === "not-sent").length).toBe(7);
    expect(brief(r.earlier).at(-1)).toBe("0:sent");
  });

  it("archived forms only show what was sent", () => {
    const r = rows([sub("x", 1, true)], ANCHOR + 5 * 7 * DAY, new Map(), schedule({ archived: true }));
    expect(r.current).toEqual([]);
    expect(brief(r.earlier)).toEqual(["1:sent"]);
  });

  it("labels the period", () => {
    const s = schedule();
    expect(checkinPeriodLabel({ schedule: s, periodStartMs: ANCHOR }, () => "Nov 2")).toBe("Week of Nov 2");
    expect(checkinPeriodLabel({ schedule: { ...s, cadence: "manual" }, periodStartMs: ANCHOR }, () => "x")).toBe(s.name);
  });
});
