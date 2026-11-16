import { describe, expect, it } from "vitest";
import {
  aroundDate,
  balanceAnswer,
  eatingAnswer,
  eatingSummary,
  foodVsLiftsAnswer,
  goalsAnswer,
  liftsAnswer,
  muscleBalance,
  rangeStartMs,
  showingUpAnswer,
  type LiftStory,
  type MuscleWeeks,
} from "./insights";
import type { WeekResult, WeeklyStreak } from "./weeklyStreak";
import type { GoalView } from "./goalView";
import type { DiaryDay } from "./nutrition";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 16, 12);

function story(name: string, status: LiftStory["status"], daysAgo = 2, detail = "≈ +1.0% / session"): LiftStory {
  return { exerciseName: name, status, statusDetail: detail, lastTrainedMs: NOW - daysAgo * DAY };
}

describe("liftsAnswer", () => {
  const start = rangeStartMs("12w", NOW);

  it("counts moving, stuck and slipping lifts trained in the range", () => {
    const a = liftsAnswer(
      [
        story("Squat", "progressing"),
        story("Row", "progressing"),
        story("Bench press", "plateaued", 3, "No PR in 5 sessions"),
        story("RDL", "regressing", 4, "≈ −1.2% / session"),
        story("Curl", "progressing", 200),
        story("Dip", "new"),
      ],
      { startMs: start },
    );
    expect(a.state).toBe("ready");
    expect(a.answer).toBe("2 moving, 1 stuck, 1 slipping");
    expect(a.detail).toBe("RDL: ≈ −1.2% / session. Bench press: no PR in 5 sessions.");
    expect(a.mini).toEqual({
      kind: "chips",
      chips: [
        { label: "Squat", tone: "up" },
        { label: "Row", tone: "up" },
        { label: "Bench press", tone: "flat" },
        { label: "RDL", tone: "down" },
      ],
    });
  });

  it("says so when everything is moving", () => {
    const a = liftsAnswer([story("Squat", "progressing"), story("Row", "progressing")], { startMs: start });
    expect(a.answer).toBe("All 2 lifts moving");
    expect(a.detail).toBe("Everything you trained in this range is going up.");
  });

  it("is empty without trends in range", () => {
    expect(liftsAnswer([story("Dip", "new")], { startMs: start }).state).toBe("empty");
  });
});

describe("muscleBalance + balanceAnswer", () => {
  const weeks = (sets: number[], first = 100) => sets.map((s, i) => ({ weekBucket: first + i, weightedSets: s, sessionCount: s > 0 ? 2 : 0 }));
  const g = (muscle: string, sets: number[]): MuscleWeeks => ({
    muscleGroup: muscle,
    status: "progressing",
    contributingExercises: [{ exerciseName: `${muscle} lift`, status: "progressing" }],
    weeks: weeks(sets),
  });

  it("averages over every whole week in the range, untrained weeks as 0", () => {
    // Range buckets 100..103 (current week 104 is left out).
    const rows = muscleBalance([g("chest", [12, 12, 0, 12, 99])], { startBucket: 100, currentBucket: 104 });
    expect(rows[0]!.setsPerWeek).toBe(9);
    expect(rows[0]!.daysPerWeek).toBe(1.5);
  });

  it("flags muscles far under the rest and names them", () => {
    const rows = muscleBalance(
      [g("back", [18, 18]), g("quads", [16, 16]), g("chest", [14, 14]), g("biceps", [4, 4]), g("triceps", [3, 3])],
      { startBucket: 100, currentBucket: 102 },
    );
    expect(rows.filter((r) => r.low).map((r) => r.muscleGroup)).toEqual(["biceps", "triceps"]);
    const a = balanceAnswer(rows, { anyTagged: true });
    expect(a.answer).toBe("Biceps and triceps get far less than the rest");
    expect(a.detail).toBe("Biceps 4 and triceps 3 working sets a week. Everything else is 14 to 18.");
  });

  it("says nobody is behind when it's even", () => {
    const rows = muscleBalance([g("back", [12]), g("quads", [10]), g("chest", [14])], { startBucket: 100, currentBucket: 101 });
    const a = balanceAnswer(rows, { anyTagged: true });
    expect(a.answer).toBe("No muscle is far behind");
    expect(a.detail).toBe("Between 10 and 14 working sets a week per muscle.");
  });

  it("says when every muscle is under the usual range", () => {
    const rows = muscleBalance([g("back", [7]), g("quads", [6]), g("chest", [5])], { startBucket: 100, currentBucket: 101 });
    expect(balanceAnswer(rows, { anyTagged: true }).answer).toBe("Every muscle gets under 10 sets a week");
  });

  it("asks for muscle tags when nothing is tagged", () => {
    expect(balanceAnswer([], { anyTagged: false }).answer).toBe("Tag your exercises' muscles");
  });
});

describe("showingUpAnswer", () => {
  const streak = (current: number): WeeklyStreak => ({
    currentWeeks: current,
    bestWeeks: current,
    thisWeek: { startIso: "2026-11-16", done: 1, needed: 4, outcome: "in_progress" },
    pausedNow: false,
    weeklyTarget: 4,
  });
  const w = (done: number, outcome: WeekResult["outcome"]): WeekResult => ({ startIso: "x", done, needed: 4, outcome });

  it("averages judged weeks and counts weeks on target", () => {
    const a = showingUpAnswer([w(4, "met"), w(3, "missed"), w(5, "met"), w(1, "in_progress")], streak(2));
    expect(a.answer).toBe("4 training days a week, target 4");
    expect(a.detail).toBe("2 of 3 weeks on target. 2 in a row now.");
    expect(a.mini).toEqual({ kind: "weeks", weeks: ["met", "missed", "met", "in_progress"] });
  });

  it("is empty with no workouts", () => {
    expect(showingUpAnswer([w(0, "missed")], streak(0)).state).toBe("empty");
  });
});

describe("eating", () => {
  const day = (dateIso: string, kcal: number, proteinG: number): DiaryDay =>
    ({
      id: dateIso,
      dateIso,
      createdAtMs: 0,
      updatedAtMs: 0,
      items: [{ id: "i", meal: "lunch", name: "Food", grams: 100, computed: { kcal, proteinG, carbsG: 0, fatG: 0 } }],
    }) as unknown as DiaryDay;

  it("summarises the range and the weight trend", () => {
    const trend = {
      points: [
        { dateIso: "2026-09-01", actualKg: 82, smoothedKg: 82 },
        { dateIso: "2026-10-01", actualKg: 83, smoothedKg: 83 },
      ],
      currentKg: 83,
      currentActualKg: 83,
      weeklyRateKg: 0.2,
    };
    const s = eatingSummary({
      days: [day("2026-09-10", 2600, 160), day("2026-09-11", 2800, 180), day("2025-01-01", 9999, 1)],
      trend,
      targetKcal: 2700,
      goalType: "gain",
      targetRateKg: 0.25,
      startIso: "2026-08-24",
      endIso: "2026-11-16",
    });
    expect(s.loggedDays).toBe(2);
    expect(s.weeklyRateKg).toBe(0.23);
    const a = eatingAnswer(s);
    expect(a.answer).toBe("Gaining 0.23 kg a week");
    expect(a.detail).toBe("Goal is gaining (0.25 kg a week). 2,700 kcal on average, 96% on target, 170 g protein, over 2 logged days.");
  });

  it("is empty with nothing logged", () => {
    const s = eatingSummary({ days: [], trend: null, targetKcal: null, goalType: null, startIso: "2026-01-01", endIso: "2026-02-01" });
    expect(eatingAnswer(s).state).toBe("empty");
  });
});

describe("foodVsLiftsAnswer", () => {
  it("says what's missing when there's too little data", () => {
    const a = foodVsLiftsAnswer({ dayLevelReasoning: { inputs: { totalSessionSamples: 30, sessionsWithLoggedProtein: 7 }, confidence: "low" } });
    expect(a.answer).toBe("Too early to say");
    expect(a.detail).toBe("Needs food logged on 20 training days. You have 7 so far.");
    expect(a.hypothesis).toBe(true);
  });

  it("frames a difference as what happened, not a cause", () => {
    const a = foodVsLiftsAnswer({
      dayLevelProtein: { thresholdProteinG: 150, above: { sampleCount: 12, improveRate: 0.67 }, below: { sampleCount: 12, improveRate: 0.42 } },
      dayLevelReasoning: { inputs: {}, confidence: "medium" },
    });
    expect(a.answer).toBe("Workouts went better on higher-protein days");
    expect(a.detail).toBe("Volume went up on 67% of workouts on days with 150 g protein or more, and 42% below that.");
  });
});

describe("goalsAnswer", () => {
  const view = (title: string, status: GoalView["projection"]["status"], etaDays?: number): GoalView =>
    ({
      key: title,
      goal: null,
      title,
      measure: "",
      unit: "kg",
      target: 0,
      direction: 1,
      start: null,
      points: [],
      achievedAtMs: status === "achieved" ? NOW : null,
      projection: { status, current: null, ratePerWeek: null, eta: etaDays ? { likelyMs: NOW + etaDays * DAY, earlyMs: 0, lateMs: null } : null, atDeadline: null, line: [], band: [] },
      deadlineMs: null,
      progress: 0,
    }) as GoalView;

  it("leads with the soonest dated goal", () => {
    const a = goalsAnswer([view("Squat 160 kg", "on_track", 120), view("Bench 120 kg", "on_track", 69), view("Deadlift 200 kg", "stalled")], NOW);
    expect(a.answer).toBe("Bench 120 kg around 24 Jan");
    expect(a.mini).toEqual({ kind: "rows", rows: [{ label: "Squat 160 kg", value: "around March" }, { label: "Deadlift 200 kg", value: "stalled lately" }] });
  });

  it("handles no goals and all done", () => {
    expect(goalsAnswer([], NOW).state).toBe("empty");
    expect(goalsAnswer([view("Bench", "achieved")], NOW).answer).toBe("All your goals are done");
  });

  it("formats far dates by month", () => {
    expect(aroundDate(Date.UTC(2028, 2, 5), NOW)).toBe("March 2028");
  });
});

describe("foodVsLiftsAnswer without a pattern", () => {
  it("says there's no clear difference when there's enough data", () => {
    const a = foodVsLiftsAnswer({ dayLevelReasoning: { inputs: { totalSessionSamples: 40, sessionsWithLoggedProtein: 33, daySamplesAbove: 17, daySamplesBelow: 16 }, confidence: "low" } });
    expect(a.state).toBe("ready");
    expect(a.answer).toBe("No clear difference so far");
  });

  it("asks for more variety when protein barely changes", () => {
    const a = foodVsLiftsAnswer({ dayLevelReasoning: { inputs: { totalSessionSamples: 40, sessionsWithLoggedProtein: 33, daySamplesAbove: 30, daySamplesBelow: 3 }, confidence: "low" } });
    expect(a.answer).toBe("Too early to say");
  });
});
