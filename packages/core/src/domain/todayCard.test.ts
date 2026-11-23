import { describe, expect, it } from "vitest";
import { addDays } from "./dateIso";
import { planSplit } from "./splitSchedule";
import { todayCard } from "./todayCard";
import type { SplitDay, WorkoutSplit } from "./WorkoutSplit";

// 2026-11-16 is a Monday.
const MON = "2026-11-16";
const d = (n: number) => addDays(MON, n);
const day = (id: string, over: Partial<SplitDay> = {}): SplitDay => ({ id, orderIndex: 0, name: id, blocks: [], ...over });
const split = (days: SplitDay[], schedule?: WorkoutSplit["schedule"]): WorkoutSplit => ({
  id: "s", name: "S", archived: false, createdAtMs: 0, updatedAtMs: 0,
  days: days.map((x, i) => ({ ...x, orderIndex: i })),
  ...(schedule ? { schedule } : {}),
});

// Full Body A / B / C on Monday, Wednesday, Friday.
const fb = split([day("A", { weekday: 1 }), day("B", { weekday: 3 }), day("C", { weekday: 5 })], "weekdays");

describe("Home's Today card (decision D1)", () => {
  it("offers today's workout, once", () => {
    expect(todayCard(planSplit(fb, { last: null }, MON), { inProgress: false })).toMatchObject({ kind: "start", day: { id: "A" } });
  });

  it("after today's workout: done, and the next one on its day — never the same day again (bug hunt 3.14)", () => {
    const card = todayCard(planSplit(fb, { last: { dayId: "A", dateIso: MON } }, MON), { inProgress: false });
    expect(card).toMatchObject({ kind: "done", done: [{ id: "A" }], next: { dateIso: d(2), day: { id: "B" } } });
  });

  it("a rest day says so, with the next workout", () => {
    const card = todayCard(planSplit(fb, { last: { dayId: "A", dateIso: MON } }, d(1)), { inProgress: false });
    expect(card).toMatchObject({ kind: "rest", next: { dateIso: d(2), day: { id: "B" } } });
  });

  it("a running workout is Continue, whatever the plan says", () => {
    expect(todayCard(planSplit(fb, { last: null }, MON), { inProgress: true })).toEqual({ kind: "continue" });
  });

  it("a rotation offers the next day in it", () => {
    const rot = split([day("U"), day("L")]);
    expect(todayCard(planSplit(rot, { last: { dayId: "U", dateIso: d(-1) } }, MON), { inProgress: false })).toMatchObject({ kind: "start", day: { id: "L" } });
  });

  it("no plan: nothing to offer but an empty workout", () => {
    expect(todayCard(null, { inProgress: false })).toEqual({ kind: "none" });
  });
});
