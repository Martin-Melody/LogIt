import { describe, expect, it } from "vitest";
import { dueIn, monthWins, pageCards, recordsIn, worthALook } from "./coachMonth";
import type { WorkoutSession } from "./workout";

const DAY = 86_400_000;
const session = (atMs: number, lifts: [string, number, number][] = [["Squat", 60, 5]]): WorkoutSession => ({
  id: `s${atMs}`, startedAtMs: atMs, endedAtMs: atMs + 3_600_000,
  blocks: lifts.map(([name, weight, reps], i) => ({ id: `b${i}`, type: "strength", orderIndex: i, data: { exerciseId: name.toLowerCase(), exerciseName: name, sets: [{ id: "x", setType: "normal", reps, weight, orderIndex: 0, completed: true }] } })),
}) as unknown as WorkoutSession;

describe("Today and Your month cards (canvas W13)", () => {
  it("keeps Needs you first on Today and drops cards a page can't show", () => {
    expect(pageCards(null, "today")).toEqual(["needs", "ahead", "week"]);
    expect(pageCards(["paid", "week", "nope"], "today")).toEqual(["needs", "paid", "week"]);
    expect(pageCards(["needs", "week", "wins"], "month")).toEqual(["wins"]);
  });
});

describe("Your month (canvas W5)", () => {
  const from = 1000 * DAY, to = from + 30 * DAY;
  it("counts records as bests that beat everything before", () => {
    const s = [session(from - 5 * DAY, [["Squat", 77.5, 6], ["Bench", 50, 5]]), session(from + 2 * DAY, [["Squat", 80, 6], ["Bench", 45, 5]]), session(from + 3 * DAY, [["Row", 60, 8]])];
    expect(recordsIn(s, from, to).map((r) => r.name)).toEqual(["Squat"]);
  });
  it("adds up wins across clients, with the biggest as highlights", () => {
    const w = monthWins([
      { id: "a", name: "Aoife Byrne", sessions: [session(from - 5 * DAY, [["Squat", 70, 5]]), session(from + DAY, [["Squat", 80, 5]])], daysPerWeek: 4, checkinsSent: 4, checkinsReviewed: 4, checkinsDue: 4, finishedBlock: false },
      { id: "e", name: "Emma O'Neill", sessions: null, daysPerWeek: 3, checkinsSent: 3, checkinsReviewed: 3, checkinsDue: 4, finishedBlock: true },
    ], from, to);
    expect(w.records).toBe(1);
    expect(w.sessions).toEqual({ done: 1, planned: 17 });
    expect(w.checkins).toEqual({ sent: 7, due: 8, reviewedAll: true });
    expect(w.highlights).toEqual(["Emma finished a block.", "Aoife: 1 record (squat 80 × 5)."]);
  });
  it("counts a weekly form's due dates in a month", () => {
    const s = { cadence: "weekly", anchorMs: from - 3 * DAY, archived: false } as never;
    expect(dueIn(s, from, to)).toBe(4);
  });
  it("flags clients whose training dropped off, with anything else going on", () => {
    const now = 2000 * DAY;
    const regular = Array.from({ length: 24 }, (_, i) => session(now - 56 * DAY + i * 2.33 * DAY)); // 3 a week, up to 2 days ago
    const w = worthALook([
      { id: "d", relationshipId: "rd", name: "Dara Kelly", sessions: regular.filter((s) => s.startedAtMs < now - 9 * DAY), lateDays: 2, paymentProblem: null },
      { id: "a", relationshipId: "ra", name: "Aoife", sessions: regular, lateDays: null, paymentProblem: null },
    ], now);
    expect(w).toHaveLength(1);
    expect(w[0]!.reasons[0]).toMatch(/^no workouts for \d+ days \(was 3 a week\)$/);
    expect(w[0]!.reasons[1]).toBe("check-in 2 days late");
  });
});
