import { describe, expect, it } from "vitest";
import { addDays } from "./dateIso";
import type { SplitDay, WorkoutSplit } from "./WorkoutSplit";
import {
  addRestDay,
  defaultTimelineIndex,
  nextWorkoutAfter,
  splitTimeline,
  duplicateDay,
  planSplit,
  removeDay,
  rotationSlots,
  suggestWeekdays,
} from "./splitSchedule";

// 2026-11-16 is a Monday.
const MON = "2026-11-16";
const d = (n: number) => addDays(MON, n);

function day(id: string, over: Partial<SplitDay> = {}): SplitDay {
  return { id, orderIndex: 0, name: id, blocks: [], ...over };
}
function split(days: SplitDay[], schedule?: WorkoutSplit["schedule"]): WorkoutSplit {
  return {
    id: "s",
    name: "S",
    archived: false,
    createdAtMs: 0,
    updatedAtMs: 0,
    days: days.map((x, i) => ({ ...x, orderIndex: i })),
    ...(schedule ? { schedule } : {}),
  };
}
const names = (ds: SplitDay[] | undefined) => (ds ?? []).map((x) => x.id);

// Upper, Lower, Rest, Upper2, Lower2, Rest, Rest
const ul = split([
  day("U1"),
  day("L1"),
  day("R1", { rest: true }),
  day("U2"),
  day("L2"),
  day("R2", { rest: true }),
  day("R3", { rest: true }),
]);

describe("rotation", () => {
  it("starts at the first day with nothing done", () => {
    const p = planSplit(ul, { last: null }, MON);
    expect(names(p.laterToday)).toEqual(["U1"]);
    expect(p.next).toEqual({ dateIso: d(1), days: [ul.days[1]] });
    expect(p.startNext?.id).toBe("U1");
  });

  it("after today's workout, shows tomorrow's instead of today's", () => {
    const p = planSplit(ul, { last: { dayId: "U1", dateIso: MON } }, MON);
    expect(names(p.doneToday)).toEqual(["U1"]);
    expect(p.laterToday).toEqual([]);
    expect(p.next?.dateIso).toBe(d(1));
    expect(names(p.next?.days)).toEqual(["L1"]);
  });

  it("rest tomorrow: the next workout is the day after", () => {
    const p = planSplit(ul, { last: { dayId: "L1", dateIso: d(1) } }, d(1));
    expect(p.next).toMatchObject({ dateIso: d(3) });
    expect(names(p.next?.days)).toEqual(["U2"]);
  });

  it("on a rest day says so, and Start still offers the next workout", () => {
    const p = planSplit(ul, { last: { dayId: "L1", dateIso: d(1) } }, d(2));
    expect(p.restToday).toBe(true);
    expect(p.laterToday).toEqual([]);
    expect(p.next?.dateIso).toBe(d(3));
    expect(p.startNext?.id).toBe("U2");
  });

  it("a missed workout waits; it isn't skipped", () => {
    // Did U1 Monday, nothing Tuesday or Wednesday: L1 is still next, today.
    const p = planSplit(ul, { last: { dayId: "U1", dateIso: MON } }, d(2));
    expect(names(p.laterToday)).toEqual(["L1"]);
    expect(p.restToday).toBe(false);
  });

  it("rest days pass while you're away", () => {
    // L1 on Tuesday, back on Friday: the Wednesday rest is gone, U2 is today.
    const p = planSplit(ul, { last: { dayId: "L1", dateIso: d(1) } }, d(4));
    expect(names(p.laterToday)).toEqual(["U2"]);
  });

  it("wraps round to the start", () => {
    const p = planSplit(ul, { last: { dayId: "L2", dateIso: d(4) } }, d(4));
    // Sat and Sun rest, then U1 on Monday.
    expect(p.next).toMatchObject({ dateIso: d(7) });
    expect(names(p.next?.days)).toEqual(["U1"]);
  });

  describe("two workouts a day", () => {
    const two = split([day("Lift"), day("Mob", { sameDayAsPrevious: true }), day("Lift2"), day("R", { rest: true })]);

    it("groups same-day workouts into one calendar day", () => {
      expect(rotationSlots(two).map(names)).toEqual([["Lift", "Mob"], ["Lift2"], ["R"]]);
    });

    it("after the first, the second is later today", () => {
      const p = planSplit(two, { last: { dayId: "Lift", dateIso: MON } }, MON);
      expect(names(p.doneToday)).toEqual(["Lift"]);
      expect(names(p.laterToday)).toEqual(["Mob"]);
      expect(p.startNext?.id).toBe("Mob");
      expect(names(p.next?.days)).toEqual(["Lift2"]);
    });

    it("after both, tomorrow", () => {
      const p = planSplit(two, { last: { dayId: "Mob", dateIso: MON }, doneTodayIds: ["Lift"] }, MON);
      expect(p.laterToday).toEqual([]);
      expect(p.next).toMatchObject({ dateIso: d(1) });
    });

    it("a second workout left undone ends with the day", () => {
      const p = planSplit(two, { last: { dayId: "Lift", dateIso: MON } }, d(1));
      expect(names(p.laterToday)).toEqual(["Lift2"]);
    });
  });

  it("all rest days: nothing to plan", () => {
    const p = planSplit(split([day("R", { rest: true })]), { last: null }, MON);
    expect(p.startNext).toBeNull();
  });
});

describe("weekdays", () => {
  // Mon Upper, Tue Lower, Thu Upper 2 + Mobility, Fri Lower 2
  const wk = split(
    [
      day("U1", { weekday: 1 }),
      day("L1", { weekday: 2 }),
      day("U2", { weekday: 4 }),
      day("Mob", { weekday: 4 }),
      day("L2", { weekday: 5 }),
      day("Spare"),
    ],
    "weekdays",
  );

  it("today's workout comes from the calendar", () => {
    const p = planSplit(wk, { last: null }, MON);
    expect(names(p.laterToday)).toEqual(["U1"]);
    expect(names(p.next?.days)).toEqual(["L1"]);
  });

  it("after today's, tomorrow's", () => {
    const p = planSplit(wk, { last: { dayId: "U1", dateIso: MON } }, MON);
    expect(p.laterToday).toEqual([]);
    expect(p.next).toMatchObject({ dateIso: d(1) });
  });

  it("a day with nothing on it is a rest day; next is the following workout", () => {
    const p = planSplit(wk, { last: { dayId: "L1", dateIso: d(1) } }, d(2));
    expect(p.restToday).toBe(true);
    expect(p.next).toMatchObject({ dateIso: d(3) });
    expect(names(p.next?.days)).toEqual(["U2", "Mob"]);
    expect(p.startNext?.id).toBe("U2");
  });

  it("two on one day: the second is later today", () => {
    const p = planSplit(wk, { last: { dayId: "U2", dateIso: d(3) } }, d(3));
    expect(names(p.laterToday)).toEqual(["Mob"]);
  });

  it("another weekday's workout done today counts as today's", () => {
    // Friday is L2; doing U1 (Monday's) on Friday instead covers it.
    const p = planSplit(wk, { last: { dayId: "U1", dateIso: d(4) } }, d(4));
    expect(p.laterToday).toEqual([]);
    expect(names(p.doneToday)).toEqual(["U1"]);
    expect(p.next).toMatchObject({ dateIso: d(7) });
    // On a two-workout day, a swap covers one of them and the other is still to do.
    const thu = planSplit(wk, { last: { dayId: "L1", dateIso: d(3) } }, d(3));
    expect(names(thu.laterToday)).toEqual(["Mob"]);
  });

  it("the weekend rolls on to Monday", () => {
    const p = planSplit(wk, { last: { dayId: "L2", dateIso: d(4) } }, d(5));
    expect(p.restToday).toBe(true);
    expect(p.next).toMatchObject({ dateIso: d(7) });
  });

  it("with no weekdays set yet, Start still has a day", () => {
    const p = planSplit(split([day("A"), day("B")], "weekdays"), { last: null }, MON);
    expect(p.startNext?.id).toBe("A");
    expect(p.restToday).toBe(false);
  });
});

describe("editing", () => {
  it("duplicates a day right after it with new ids", () => {
    const s = split([
      day("A", {
        name: "Upper",
        blocks: [{ type: "strength", id: "b1", orderIndex: 0, exerciseName: "Bench", groupId: "g1" }],
        groups: [{ id: "g1", rounds: 3 }],
      }),
      day("B"),
    ]);
    const { split: out, copy } = duplicateDay(s, "A");
    expect(out.days.map((x) => x.name)).toEqual(["Upper", "Upper (copy)", "B"]);
    expect(out.days.map((x) => x.orderIndex)).toEqual([0, 1, 2]);
    expect(copy!.id).not.toBe("A");
    expect(copy!.blocks[0]!.id).not.toBe("b1");
    expect(copy!.groups![0]!.id).not.toBe("g1");
    expect(copy!.blocks[0]!.groupId).toBe(copy!.groups![0]!.id);
    // The original is untouched.
    expect(out.days[0]!.blocks[0]!.id).toBe("b1");
  });

  it("adds and removes rest days", () => {
    const s = addRestDay(split([day("A")]));
    expect(s.days.map((x) => [x.orderIndex, !!x.rest])).toEqual([[0, false], [1, true]]);
    const r = removeDay(split([day("A"), day("B", { sameDayAsPrevious: true })]), "A");
    expect(r.days[0]).toMatchObject({ id: "B", orderIndex: 0, sameDayAsPrevious: undefined });
  });

  it("suggests weekdays from Monday, skipping a weekday per rest day", () => {
    const s = suggestWeekdays(ul);
    expect(s.days.filter((x) => !x.rest).map((x) => x.weekday)).toEqual([1, 2, 4, 5]);
  });
});

describe("timeline", () => {
  const show = (t: ReturnType<typeof splitTimeline>) => t.map((e) => `${e.dateIso.slice(8)} ${e.day ? e.day.id : "rest"}${e.done ? "✓" : ""}`);

  it("in order: today done, then one lap with rest days", () => {
    const t = splitTimeline(ul, { last: { dayId: "U1", dateIso: MON } }, MON);
    expect(show(t)).toEqual(["16 U1✓", "17 L1", "18 rest", "19 U2", "20 L2", "21 rest", "22 rest"]);
    // Opens on today, done; the next workout is tomorrow's.
    expect(defaultTimelineIndex(t)).toBe(0);
    expect(nextWorkoutAfter(t, 0)?.day?.id).toBe("L1");
  });

  it("in order: a rest day today is the page the card opens on", () => {
    const t = splitTimeline(ul, { last: { dayId: "L1", dateIso: d(1) } }, d(2));
    expect(show(t).slice(0, 3)).toEqual(["18 rest", "19 U2", "20 L2"]);
    expect(defaultTimelineIndex(t)).toBe(0);
    expect(nextWorkoutAfter(t, 0)?.dateIso).toBe(d(3));
  });

  it("in order: rest days that passed while away are skipped", () => {
    const t = splitTimeline(ul, { last: { dayId: "L1", dateIso: d(1) } }, d(4));
    expect(show(t)[0]).toBe("20 U2");
  });

  it("in order: two workouts on one day are two pages with the same date", () => {
    const two = split([day("Lift"), day("Mob", { sameDayAsPrevious: true }), day("Lift2")]);
    const t = splitTimeline(two, { last: { dayId: "Lift", dateIso: MON } }, MON);
    expect(show(t)).toEqual(["16 Lift✓", "16 Mob", "17 Lift2"]);
    // Still a workout to do today: open on it.
    expect(defaultTimelineIndex(t)).toBe(1);
  });

  it("in order, nothing done yet: starts at the first day today", () => {
    const t = splitTimeline(ul, { last: null }, MON);
    expect(show(t)[0]).toBe("16 U1");
    expect(t).toHaveLength(7);
  });

  it("by weekday: the next 7 days with rest days", () => {
    const wk = split([day("U1", { weekday: 1 }), day("L1", { weekday: 2 }), day("Mob", { weekday: 2 })], "weekdays");
    const t = splitTimeline(wk, { last: { dayId: "U1", dateIso: MON } }, MON);
    expect(show(t)).toEqual(["16 U1✓", "17 L1", "17 Mob", "18 rest", "19 rest", "20 rest", "21 rest", "22 rest"]);
  });

  it("by weekday: a swapped-in workout replaces today's page", () => {
    const wk = split([day("Push1", { weekday: 1 }), day("Push2", { weekday: 5 })], "weekdays");
    const t = splitTimeline(wk, { last: { dayId: "Push1", dateIso: d(4) } }, d(4));
    expect(show(t).slice(0, 2)).toEqual(["20 Push1✓", "21 rest"]);
  });

  it("by weekday with no weekdays set: nothing to place", () => {
    expect(splitTimeline(split([day("A")], "weekdays"), { last: null }, MON)).toEqual([]);
  });
});
