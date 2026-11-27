import { describe, expect, it } from "vitest";
import { cardPeriod, cardsFor, coachCard, healthYeses, type CoachCardInput } from "./coachCards";
import type { WorkoutSession } from "./workout";
import type { WidgetStatGridNode, WidgetListNode } from "../plugins/widgetView";

const DAY = 86_400_000;
const now = new Date(2026, 10, 27, 12).getTime(); // Fri 27 Nov
const share = { workouts: true, nutrition: true, bodyweight: true, habits: true, checkins: true };
const session = (atMs: number, lifts: [string, number, number][]): WorkoutSession => ({
  id: `s${atMs}`, startedAtMs: atMs, endedAtMs: atMs + 3_600_000,
  blocks: lifts.map(([name, weight, reps], i) => ({ id: `b${i}`, type: "strength", orderIndex: i, data: { exerciseId: name.toLowerCase(), exerciseName: name, sets: [{ id: "x", setType: "normal", reps, weight, orderIndex: 0, completed: true }] } })),
}) as unknown as WorkoutSession;
const input = (over: Partial<CoachCardInput> = {}): CoachCardInput => ({ now, period: cardPeriod("week", now), firstName: "Aoife", sharing: share, ...over });
const stats = (v: { body: unknown[] }) => (v.body[0] as WidgetStatGridNode).stats.map((s) => [s.label, s.value]);

describe("Overview cards (canvas K3, W4, W11)", () => {
  it("picks the client's list, then their package's, then everyone's", () => {
    const layout = { all: ["food"], packages: { p1: ["training"] }, clients: { c1: ["body"] } };
    expect(cardsFor(layout, "c1", "p1").cards).toEqual(["body"]);
    expect(cardsFor(layout, "c2", "p1").cards).toEqual(["training"]);
    expect(cardsFor(layout, "c2", null)).toEqual({ cards: ["food"], from: "all" });
    expect(cardsFor(null, "c2").from).toBe("default");
  });
  it("makes periods: this week from Monday, a calendar month, a block", () => {
    const w = cardPeriod("week", now);
    expect(new Date(w.fromMs).getDay()).toBe(1);
    expect(w.days).toBe(5);
    expect(cardPeriod("month", now).label).toBe("November");
    expect(cardPeriod("month", now, { monthsBack: 1 }).days).toBe(31);
  });
  it("training: sessions against plan, estimates and records against before", () => {
    const monday = cardPeriod("week", now).fromMs;
    const v = coachCard("training", input({
      daysPerWeek: 4,
      sessions: [session(monday - 3 * DAY, [["Squat", 77.5, 6]]), session(monday + DAY, [["Squat", 80, 6]]), session(monday + 2 * DAY, [["Bench", 45, 5]])],
    }));
    const s = stats(v);
    expect(s[0]).toEqual(["Sessions", "2 of 3"]);
    expect(s[1]![0]).toBe("Squat estimate");
    expect(s.at(-1)).toEqual(["Records", "1"]);
  });
  it("food: days logged, averages against targets, days within 10%", () => {
    const day = (kcal: number, proteinG: number) => ({ dateIso: "x", items: [{ computed: { kcal, proteinG, carbsG: 0, fatG: 0 } }] }) as never;
    const v = coachCard("food", input({ diaryDays: [day(2000, 120), day(2100, 116), day(2600, 100)], target: { kcal: 2100, proteinG: 140 } }));
    expect(stats(v)).toEqual([["Days logged", "3 of 5"], ["Calories, average", "2,233 of 2,100"], ["Protein, average", "112 of 140 g"], ["Days within 10% of calories", "2 of 3"]]);
  });
  it("a card for something they don't share says so", () => {
    const v = coachCard("food", input({ sharing: { ...share, nutrition: false } }));
    expect(v.empty?.text).toBe("Aoife doesn't share this with you.");
  });
  it("habits count done days in the period", () => {
    const v = coachCard("habits", input({ sharing: { ...share, checkins: false }, habits: [{ id: "h", name: "8,000 steps", cadence: { kind: "daily" } } as never], habitEntries: [{ habitId: "h", dateIso: "2026-11-23", done: true }, { habitId: "h", dateIso: "2026-11-24", done: true }] as never }));
    expect((v.body[0] as WidgetListNode).items[0]).toEqual({ label: "8,000 steps", trailing: "2 of 5 days" });
  });
  it("flags a Yes to a health question", () => {
    const c = { id: "x", clientId: "c", reviewed: false, schedule: null, submission: { id: "x", scheduleId: "s", periodIndex: 0, periodStartMs: 0, createdAtMs: 0, updatedAtMs: 0, submittedAtMs: 1,
      asked: [{ id: "q1", prompt: "Has a doctor ever said you have a heart condition?", type: "boolean" }, { id: "q2", prompt: "Chest pain or dizziness when you exercise?", type: "boolean" }],
      answers: [{ questionId: "q1", bool: false }, { questionId: "q2", bool: true }] } } as never;
    expect(healthYeses(c)).toEqual(["Chest pain or dizziness when you exercise?"]);
  });
});
