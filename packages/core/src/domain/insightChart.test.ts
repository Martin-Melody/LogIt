import { describe, expect, it } from "vitest";
import {
  chartAreas,
  chartLines,
  chartProblem,
  chartSummary,
  defaultChartName,
  newChart,
  parseInsightChart,
  type InsightChart,
} from "./insightChart";
import type { SessionBlock, SetEntry, WorkoutSession } from "./workout";

let n = 0;
const id = (p: string) => `${p}${++n}`;
const NOW = Date.UTC(2026, 10, 16, 12); // Monday 16 Nov 2026

function set(weight: number, reps: number, extra: Partial<SetEntry> = {}): SetEntry {
  return { id: id("set"), setType: "normal", reps, weight, orderIndex: n, completed: true, ...extra };
}

function lift(name: string, sets: SetEntry[]): SessionBlock {
  return { id: id("b"), type: "strength", orderIndex: n, data: { exerciseName: name, sets } };
}

/** A session `daysAgo` days before NOW, an hour long. */
function session(daysAgo: number, blocks: SessionBlock[]): WorkoutSession {
  const start = NOW - daysAgo * 86_400_000;
  return { id: id("s"), startedAtMs: start, endedAtMs: start + 3_600_000, blocks };
}

function chart(patch: Partial<InsightChart>): InsightChart {
  return { ...newChart("c1", NOW), ...patch };
}

describe("chartLines", () => {
  const sessions = [
    session(20, [lift("Bench press", [set(100, 5), set(100, 5), set(40, 10, { setType: "warmup" })])]),
    session(18, [lift("Bench press", [set(102.5, 5)]), lift("Squat", [set(140, 5)])]),
    session(6, [lift("bench press", [set(105, 3)])]),
    session(400, [lift("Bench press", [set(200, 1)])]),
  ];

  it("takes the best estimated 1RM per week for each lift, inside the range", () => {
    const lines = chartLines(chart({ metric: "e1rm", lifts: [{ exerciseName: "Bench press" }], bucket: "week" }), { sessions }, NOW);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.label).toBe("Bench press");
    expect(lines[0]!.axis).toBe("left");
    // Week of 26 Oct: max(100×(1+5/30), 102.5×(1+5/30)) = 119.6; week of 9 Nov: 105×1.1 = 115.5.
    expect(lines[0]!.points.map((p) => p.value)).toEqual([119.6, 115.5]);
  });

  it("adds working sets up per session, skipping warm-ups", () => {
    const lines = chartLines(chart({ metric: "sets", lifts: [{ exerciseName: "Bench press" }], bucket: "session" }), { sessions }, NOW);
    expect(lines[0]!.points.map((p) => p.value)).toEqual([2, 1, 1]);
  });

  it("fills empty weeks with 0 for counts", () => {
    const lines = chartLines(chart({ metric: "workouts", bucket: "week", range: "4w" }), { sessions }, NOW);
    const values = lines[0]!.points.map((p) => p.value);
    expect(values.length).toBeGreaterThanOrEqual(5);
    expect(values.reduce((a, b) => a + b, 0)).toBe(3);
    expect(values).toContain(0);
  });

  it("counts muscle sets, a helping muscle at 0.4", () => {
    const musclesOf = (ex: { exerciseName: string }) =>
      ex.exerciseName.toLowerCase().includes("bench") ? { primary: ["chest"], secondary: ["triceps"] } : { primary: ["quads"], secondary: [] };
    const lines = chartLines(chart({ metric: "muscle-sets", muscles: ["triceps"], bucket: "session" }), { sessions, musclesOf }, NOW);
    expect(lines[0]!.points.map((p) => p.value)).toEqual([0.8, 0.4, 0.4]);
  });

  it("puts the comparison on the right scale", () => {
    const weight = {
      points: [
        { dateIso: "2026-10-27", actualKg: 82, smoothedKg: 82 },
        { dateIso: "2026-11-10", actualKg: 83, smoothedKg: 83.4 },
      ],
      currentKg: 83.4,
      currentActualKg: 83,
      weeklyRateKg: 0.3,
    };
    const lines = chartLines(chart({ metric: "e1rm", lifts: [{ exerciseName: "Bench press" }], compare: "body-weight" }), { sessions, weight }, NOW);
    expect(lines.map((l) => [l.label, l.axis])).toEqual([
      ["Bench press", "left"],
      ["Body weight", "right"],
    ]);
    expect(lines[1]!.points.map((p) => p.value)).toEqual([82, 83.4]);
  });
});

describe("chartSummary", () => {
  it("says where each line started and ended, side by side", () => {
    const c = chart({ metric: "e1rm", lifts: [{ exerciseName: "Bench press" }], compare: "body-weight" });
    const s = chartSummary(c, [
      { key: "a", label: "Bench press", axis: "left", unit: "kg", points: [{ tMs: 1, value: 104 }, { tMs: 2, value: 112 }] },
      { key: "b", label: "Body weight", axis: "right", unit: "kg", points: [{ tMs: 1, value: 82.4 }, { tMs: 2, value: 84.5 }] },
    ]);
    expect(s).toBe("Over the last 12 weeks, Bench press est. 1RM went from 104 kg to 112 kg (+8%) and body weight went from 82.4 kg to 84.5 kg.");
  });

  it("averages counts", () => {
    const c = chart({ metric: "workouts", bucket: "week" });
    const s = chartSummary(c, [{ key: "w", label: "Workouts", axis: "left", unit: "workouts", points: [{ tMs: 1, value: 3 }, { tMs: 2, value: 5 }] }]);
    expect(s).toBe("Over the last 12 weeks, workouts averaged 4 workouts a week.");
  });
});

describe("recipes", () => {
  it("round-trips through JSON and drops junk", () => {
    const c = chart({ name: "Bench vs body", lifts: [{ exerciseName: "Bench press", exerciseId: "ex1" }], compare: "body-weight", from: { userId: "u", name: "Alex" } });
    expect(parseInsightChart(JSON.stringify(c))).toEqual(c);
    expect(parseInsightChart(JSON.stringify({ ...c, metric: "nope" }))).toBeNull();
    expect(parseInsightChart("not json")).toBeNull();
    const parsed = parseInsightChart(JSON.stringify({ id: "x", metric: "workouts", bucket: "fortnight", showOn: { coach: "yes" } }))!;
    expect(parsed.bucket).toBe("week");
    expect(parsed.showOn).toEqual({ overview: false, phoneHome: false, coach: false });
  });

  it("knows what's missing, its name and its data areas", () => {
    expect(chartProblem(chart({ metric: "e1rm" }))).toBe("Pick at least one lift.");
    expect(chartProblem(chart({ metric: "workouts" }))).toBeNull();
    expect(defaultChartName(chart({ metric: "e1rm", lifts: [{ exerciseName: "Bench press" }], compare: "body-weight" }))).toBe("Bench press est. 1RM vs body weight");
    expect(chartAreas(chart({ metric: "e1rm", compare: "protein" }))).toEqual(["training", "nutrition"]);
  });
});
