import { describe, expect, it } from "vitest";
import { buildStarterPlan, starterPlanToSplit } from "./starterPlan";
import { planWeek, weekPlanLine } from "./weekPlan";
import { dayOfWeek } from "./dateIso";

// Upper / Lower on Mon, Tue, Thu, Fri (canvas O8). 2026-11-16 is a Monday.
const split = { ...starterPlanToSplit(buildStarterPlan({ goal: "both", experience: "under2", days: 4, equipment: "gym", minutes: 45 })), createdAtMs: 0 };
const [upA, loA, upB, loB] = split.days;
const at = (iso: string, hour = 7) => new Date(`${iso}T${String(hour).padStart(2, "0")}:00:00`).getTime();
const did = (iso: string, dayId?: string) => ({ startedAtMs: at(iso), source: dayId ? { dayId } : null });
const names = (p: ReturnType<typeof planWeek>) => p.slots.map((s) => (s.state === "rest" ? "-" : `${s.dayName ?? "?"}:${s.state}`));

describe("this week of a weekday plan", () => {
  it("on plan: done, today and the rest where they belong", () => {
    expect(dayOfWeek("2026-11-17")).toBe(2);
    const p = planWeek(split, [did("2026-11-16", upA!.id)], "2026-11-17");
    expect(names(p)).toEqual(["Upper A:done", "Lower A:today", "-", "Upper B:planned", "Lower B:planned", "-", "-"]);
    expect(p).toMatchObject({ done: 1, planned: 4, remaining: 3, daysLeft: 6, moves: [], leftOver: [] });
    expect(weekPlanLine(p, 2)).toBe("Three to go, six days left.");
  });

  it("a missed day moves the rest forward in order (Lower A is today instead)", () => {
    const p = planWeek(split, [did("2026-11-16", upA!.id)], "2026-11-18");
    expect(names(p)).toEqual(["Upper A:done", "-", "Lower A:today", "Upper B:planned", "Lower B:planned", "-", "-"]);
    expect(p.slots[2]!.movedFromWeekday).toBe(2);
    expect(p.moves).toEqual([{ dayId: loA!.id, dayName: "Lower A", fromWeekday: 2, toWeekday: 3 }]);
    expect(weekPlanLine(p, 3)).toBe("Tuesday's workout moved to today. Three to go, five days left.");
    // After "Make it 3 this week": two more for this week's three.
    expect(weekPlanLine(p, 3, 3)).toBe("Tuesday's workout moved to today. Two to go, five days left.");
  });

  it("two missed days push the last workouts into the weekend, and what can't fit is said kindly", () => {
    const p = planWeek(split, [did("2026-11-16", upA!.id)], "2026-11-19");
    expect(names(p)).toEqual(["Upper A:done", "-", "-", "Lower A:today", "Upper B:planned", "Lower B:planned", "-"]);
    const late = planWeek(split, [], "2026-11-21");
    expect(late.leftOver.map((d) => d.dayName)).toEqual(["Upper B", "Lower B"]);
    expect(weekPlanLine(late, 6)).toContain("Upper B and Lower B won't fit this week. Next week starts fresh.");
  });

  it("training on a rest day counts and today's slot moves on", () => {
    const p = planWeek(split, [did("2026-11-16", upA!.id), did("2026-11-18", loA!.id)], "2026-11-18");
    expect(names(p)).toEqual(["Upper A:done", "-", "Lower A:done", "Upper B:planned", "Lower B:planned", "-", "-"]);
    expect(p.done).toBe(2);
    void upB; void loB;
  });

  it("a plan started mid-week lays out its earlier workouts without calling them moved", () => {
    const p = planWeek(split, [], "2026-11-18", "2026-11-18");
    expect(names(p)).toEqual(["-", "-", "Upper A:today", "Lower A:planned", "Upper B:planned", "Lower B:planned", "-"]);
    expect(p.moves).toEqual([]);
    expect(weekPlanLine(p, 3)).toBe("Four to go, five days left.");
  });

  it("on a device without the saved start, the split's own date stands in (made Saturday, nothing moved)", () => {
    const madeSat = { ...split, createdAtMs: at("2026-11-21", 19) };
    const p = planWeek(madeSat, [], "2026-11-21");
    expect(p.moves).toEqual([]);
    expect(weekPlanLine(p, 6)).not.toContain("moved");
  });

  it("last week's workouts don't count", () => {
    expect(planWeek(split, [did("2026-11-13", upA!.id)], "2026-11-16").done).toBe(0);
  });

  it("all done", () => {
    const all = [did("2026-11-16", upA!.id), did("2026-11-17", loA!.id), did("2026-11-19", upB!.id), did("2026-11-20", loB!.id)];
    const p = planWeek(split, all, "2026-11-20");
    expect(p.remaining).toBe(0);
    expect(weekPlanLine(p, 5)).toBe("All done this week.");
  });
});

describe("Today's plan follows the moved week (canvas O8)", () => {
  it("a missed Tuesday puts Lower A on Wednesday's card and keeps the order after it", async () => {
    const { planSplit, splitTimeline } = await import("./splitSchedule");
    const progress = { last: null, week: { sessions: [did("2026-11-16", upA!.id)] } };
    expect(planSplit(split, progress, "2026-11-18").startNext?.name).toBe("Lower A");
    const timeline = splitTimeline(split, progress, "2026-11-18");
    expect(timeline.slice(0, 4).map((e) => [e.dateIso, e.day?.name ?? "rest"])).toEqual([
      ["2026-11-18", "Lower A"], ["2026-11-19", "Upper B"], ["2026-11-20", "Lower B"], ["2026-11-21", "rest"],
    ]);
    // Next week is back on the plan's own days.
    expect(timeline.at(-1)).toMatchObject({ dateIso: "2026-11-24" });
    expect(timeline.at(-1)!.day?.name).toBe("Lower A");
  });

  it("a workout done today counts as done even when it wasn't started from the plan screen", async () => {
    const { planSplit, splitTimeline } = await import("./splitSchedule");
    const progress = { last: null, week: { sessions: [did("2026-11-17", upA!.id)] } };
    const plan = planSplit(split, progress, "2026-11-17");
    expect(plan.doneToday.map((d) => d.name)).toEqual(["Upper A"]);
    expect(plan.laterToday).toEqual([]);
    expect(plan.startNext?.name).toBe("Lower A");
    expect(splitTimeline(split, progress, "2026-11-17")[0]).toMatchObject({ done: true });
  });

  it("without the week, each workout stays on its weekday (splits people set up themselves)", async () => {
    const { planSplit } = await import("./splitSchedule");
    expect(planSplit(split, { last: null }, "2026-11-18").startNext?.name).toBe("Upper B");
  });
});
