import { loggedExercises } from "./loggedSets";
import type { WorkoutSession } from "./workout";
import { estimated1RM } from "./oneRepMax";
import type { DiaryDay } from "./nutrition";
import { dayTotals, localDateIso } from "./nutrition";
import type { Habit, HabitEntry } from "./habit";
import { isSatisfied } from "./habit";
import { isoToUtcMs, weekStartIso } from "./dateIso";
import type { WeightTrend } from "../nutrition/trend";
import { DEFAULT_INSIGHT_RANGE, INSIGHT_RANGES, isInsightRange, rangeStartMs, type InsightArea, type InsightRange } from "./insights";
import { toDisplayWeight, type WeightUnit } from "./units";

/**
 * A saved Insights chart: a small recipe (what to show, for which lifts, compared with
 * what, each point a session/week/month, over which range) rather than the numbers.
 * Recipes sync; every device draws the chart from its own copy of the data, so a chart on
 * the phone's home screen keeps up with workouts logged on the phone.
 */

export type ChartMetric =
  | "e1rm"
  | "top-set"
  | "volume"
  | "sets"
  | "best-reps"
  | "muscle-sets"
  | "body-weight"
  | "calories"
  | "protein"
  | "habit-days"
  | "workouts"
  | "training-time";

export type ChartCompare = "none" | "body-weight" | "calories" | "protein" | "workouts";
export type ChartBucket = "session" | "week" | "month";
export type ChartLift = { exerciseId?: string; exerciseName: string };

export type InsightChart = {
  id: string;
  name: string;
  metric: ChartMetric;
  /** For lift metrics: up to 4, one line each. */
  lifts: ChartLift[];
  /** For muscle-sets: added up into one line. */
  muscles: string[];
  /** For habit-days: one line each. */
  habitIds: string[];
  compare: ChartCompare;
  bucket: ChartBucket;
  range: InsightRange;
  showOn: { overview: boolean; phoneHome: boolean; coach: boolean };
  /** Set when a coach made this chart for the person. */
  from?: { userId: string; name: string };
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs?: number;
};

type Agg = "max" | "sum" | "mean" | "last";
type Kind = "lifts" | "muscles" | "habits" | null;

export type MetricDef = {
  id: ChartMetric;
  label: string;
  group: "Lifts" | "Muscles" | "Body" | "Habits" | "Workouts";
  /** "kg" values are kilograms and shown in the person's unit. */
  unit: "kg" | "reps" | "sets" | "kcal" | "g" | "days" | "workouts" | "min";
  agg: Agg;
  pick: Kind;
  area: InsightArea;
};

export const CHART_METRICS: MetricDef[] = [
  { id: "e1rm", label: "Estimated 1RM", group: "Lifts", unit: "kg", agg: "max", pick: "lifts", area: "training" },
  { id: "top-set", label: "Top set weight", group: "Lifts", unit: "kg", agg: "max", pick: "lifts", area: "training" },
  { id: "volume", label: "Volume (weight × reps)", group: "Lifts", unit: "kg", agg: "sum", pick: "lifts", area: "training" },
  { id: "sets", label: "Working sets", group: "Lifts", unit: "sets", agg: "sum", pick: "lifts", area: "training" },
  { id: "best-reps", label: "Most reps in a set", group: "Lifts", unit: "reps", agg: "max", pick: "lifts", area: "training" },
  { id: "muscle-sets", label: "Working sets per muscle", group: "Muscles", unit: "sets", agg: "sum", pick: "muscles", area: "training" },
  { id: "body-weight", label: "Body weight", group: "Body", unit: "kg", agg: "last", pick: null, area: "weight" },
  { id: "calories", label: "Calories", group: "Body", unit: "kcal", agg: "mean", pick: null, area: "nutrition" },
  { id: "protein", label: "Protein", group: "Body", unit: "g", agg: "mean", pick: null, area: "nutrition" },
  { id: "habit-days", label: "Days a habit was done", group: "Habits", unit: "days", agg: "sum", pick: "habits", area: "habits" },
  { id: "workouts", label: "Workouts", group: "Workouts", unit: "workouts", agg: "sum", pick: null, area: "training" },
  { id: "training-time", label: "Time training", group: "Workouts", unit: "min", agg: "sum", pick: null, area: "training" },
];

export const CHART_COMPARES: { id: ChartCompare; label: string }[] = [
  { id: "none", label: "Nothing" },
  { id: "body-weight", label: "Body weight" },
  { id: "calories", label: "Calories" },
  { id: "protein", label: "Protein" },
  { id: "workouts", label: "Workouts" },
];

export const CHART_BUCKETS: { id: ChartBucket; label: string }[] = [
  { id: "session", label: "A session" },
  { id: "week", label: "A week" },
  { id: "month", label: "A month" },
];

export const MAX_CHART_LINES = 4;
/** A secondary muscle's set counts this much (same as the muscle balance question). */
const SECONDARY_MUSCLE_WEIGHT = 0.4;

export function metricDef(id: ChartMetric): MetricDef {
  return CHART_METRICS.find((m) => m.id === id)!;
}

/** The data areas a chart reads, for a coach's sharing switches. */
export function chartAreas(chart: Pick<InsightChart, "metric" | "compare">): InsightArea[] {
  const areas = new Set<InsightArea>([metricDef(chart.metric).area]);
  if (chart.compare !== "none") areas.add(metricDef(chart.compare).area);
  return [...areas];
}

export function newChart(id: string, nowMs: number): InsightChart {
  return {
    id,
    name: "",
    metric: "e1rm",
    lifts: [],
    muscles: [],
    habitIds: [],
    compare: "none",
    bucket: "week",
    range: DEFAULT_INSIGHT_RANGE,
    showOn: { overview: true, phoneHome: false, coach: false },
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };
}

/** A synced chart's JSON back to a chart, or null when it isn't one. Fills gaps with defaults. */
export function parseInsightChart(json: string | null | undefined): InsightChart | null {
  if (!json) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string") return null;
  const metric = CHART_METRICS.some((m) => m.id === raw.metric) ? (raw.metric as ChartMetric) : null;
  if (!metric) return null;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const lifts = Array.isArray(raw.lifts)
    ? raw.lifts
        .filter((l): l is ChartLift => !!l && typeof l === "object" && typeof (l as ChartLift).exerciseName === "string")
        .map((l) => (typeof l.exerciseId === "string" ? { exerciseId: l.exerciseId, exerciseName: l.exerciseName } : { exerciseName: l.exerciseName }))
        .slice(0, MAX_CHART_LINES)
    : [];
  const showOn = (raw.showOn ?? {}) as Record<string, unknown>;
  const from = raw.from as { userId?: unknown; name?: unknown } | undefined;
  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : "",
    metric,
    lifts,
    muscles: strings(raw.muscles),
    habitIds: strings(raw.habitIds).slice(0, MAX_CHART_LINES),
    compare: CHART_COMPARES.some((c) => c.id === raw.compare) ? (raw.compare as ChartCompare) : "none",
    bucket: CHART_BUCKETS.some((b) => b.id === raw.bucket) ? (raw.bucket as ChartBucket) : "week",
    range: isInsightRange(raw.range) ? raw.range : DEFAULT_INSIGHT_RANGE,
    showOn: { overview: showOn.overview === true, phoneHome: showOn.phoneHome === true, coach: showOn.coach === true },
    ...(from && typeof from.userId === "string" && typeof from.name === "string" ? { from: { userId: from.userId, name: from.name } } : {}),
    createdAtMs: typeof raw.createdAtMs === "number" ? raw.createdAtMs : 0,
    updatedAtMs: typeof raw.updatedAtMs === "number" ? raw.updatedAtMs : 0,
    ...(typeof raw.deletedAtMs === "number" ? { deletedAtMs: raw.deletedAtMs } : {}),
  };
}

/** What's missing before the chart can be drawn, or null when it's ready. */
export function chartProblem(chart: InsightChart): string | null {
  const pick = metricDef(chart.metric).pick;
  if (pick === "lifts" && chart.lifts.length === 0) return "Pick at least one lift.";
  if (pick === "muscles" && chart.muscles.length === 0) return "Pick at least one muscle.";
  if (pick === "habits" && chart.habitIds.length === 0) return "Pick at least one habit.";
  return null;
}

/** A name when the person didn't type one: "Bench press est. 1RM vs body weight". */
export function defaultChartName(chart: InsightChart, habitName: (id: string) => string = () => "Habit"): string {
  const m = metricDef(chart.metric);
  let base: string;
  if (m.pick === "lifts" && chart.lifts.length) base = `${chart.lifts.map((l) => l.exerciseName).join(", ")} ${m.id === "e1rm" ? "est. 1RM" : m.label.toLowerCase()}`;
  else if (m.pick === "muscles" && chart.muscles.length) base = `${chart.muscles.map(capitalize).join(", ")} sets`;
  else if (m.pick === "habits" && chart.habitIds.length) base = chart.habitIds.map(habitName).join(", ");
  else base = m.label;
  return chart.compare === "none" ? base : `${base} vs ${metricDef(chart.compare).label.toLowerCase()}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Drawing data ────────────────────────────────────────────────────────────

export type ChartData = {
  sessions: WorkoutSession[];
  /** An exercise's muscles, for muscle-sets. Load them before calling (sync lookup). */
  musclesOf?: (ex: ChartLift) => { primary: string[]; secondary: string[] } | null;
  weight?: WeightTrend | null;
  days?: DiaryDay[];
  habits?: Habit[];
  habitEntries?: HabitEntry[];
};

export type ChartPoint = { tMs: number; value: number };

export type ChartLine = {
  key: string;
  label: string;
  axis: "left" | "right";
  unit: MetricDef["unit"];
  points: ChartPoint[];
};

/** Start of the bucket a time falls in: the session itself, its local Monday, or the 1st. */
function bucketStart(ms: number, bucket: ChartBucket): number {
  if (bucket === "session") return ms;
  const iso = localDateIso(new Date(ms));
  if (bucket === "week") return isoToUtcMs(weekStartIso(iso));
  return isoToUtcMs(`${iso.slice(0, 7)}-01`);
}

function dayMs(iso: string, bucket: ChartBucket): number {
  // Day data (weight, food, habits) has no session to sit on, so "a session" means a day.
  if (bucket === "week") return isoToUtcMs(weekStartIso(iso));
  if (bucket === "month") return isoToUtcMs(`${iso.slice(0, 7)}-01`);
  return isoToUtcMs(iso);
}

function nextBucket(t: number, bucket: ChartBucket): number {
  if (bucket === "week") return t + 7 * 86_400_000;
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/**
 * The whole weeks (or months) in the range, for totals: a week the range cuts in half and
 * the week still going would both look like a drop, so they're left out, and a week with
 * nothing in it is a real 0.
 */
function wholeBuckets(startMs: number, nowMs: number, bucket: ChartBucket): number[] {
  if (bucket === "session") return [];
  const out: number[] = [];
  const first = bucketStart(startMs, bucket);
  // The range starting mid-week means the first week isn't whole.
  let t = first < isoToUtcMs(localDateIso(new Date(startMs))) ? nextBucket(first, bucket) : first;
  const current = bucketStart(nowMs, bucket);
  while (t < current) {
    out.push(t);
    t = nextBucket(t, bucket);
  }
  return out;
}

function aggregate(samples: ChartPoint[], agg: Agg, fill: number[] | null): ChartPoint[] {
  const by = new Map<number, number[]>();
  // With whole buckets given, samples outside them (a cut-off first week, this week) are dropped.
  const allowed = fill ? new Set(fill) : null;
  for (const s of samples) {
    if (allowed && !allowed.has(s.tMs)) continue;
    (by.get(s.tMs) ?? by.set(s.tMs, []).get(s.tMs)!).push(s.value);
  }
  if (fill) for (const t of fill) if (!by.has(t)) by.set(t, []);
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tMs, vs]) => {
      let value = 0;
      if (vs.length === 0) value = 0;
      else if (agg === "max") value = Math.max(...vs);
      else if (agg === "sum") value = vs.reduce((a, b) => a + b, 0);
      else if (agg === "mean") value = vs.reduce((a, b) => a + b, 0) / vs.length;
      else value = vs[vs.length - 1]!;
      return { tMs, value: Math.round(value * 10) / 10 };
    });
}

function sameLift(a: ChartLift, b: { exerciseId?: string; exerciseName: string }): boolean {
  if (a.exerciseId && b.exerciseId) return a.exerciseId === b.exerciseId;
  return a.exerciseName.trim().toLowerCase() === b.exerciseName.trim().toLowerCase();
}

function workingSets(ex: ReturnType<typeof loggedExercises>[number]) {
  return ex.sets.filter((s) => (s.setType === "normal" || !s.setType) && s.completed !== false && s.reps > 0);
}

function liftValue(metric: ChartMetric, sets: ReturnType<typeof workingSets>): number | null {
  if (sets.length === 0) return null;
  switch (metric) {
    case "e1rm": {
      const loaded = sets.filter((s) => s.weight > 0);
      return loaded.length ? Math.max(...loaded.map((s) => estimated1RM(s.weight, s.reps))) : null;
    }
    case "top-set": {
      const loaded = sets.filter((s) => s.weight > 0);
      return loaded.length ? Math.max(...loaded.map((s) => s.weight)) : null;
    }
    case "volume":
      return sets.reduce((v, s) => v + s.weight * s.reps, 0);
    case "sets":
      return sets.length;
    case "best-reps":
      return Math.max(...sets.map((s) => s.reps));
    default:
      return null;
  }
}

function finishedInRange(data: ChartData, startMs: number): WorkoutSession[] {
  return data.sessions
    .filter((s) => s.endedAtMs != null && s.startedAtMs >= startMs)
    .sort((a, b) => a.startedAtMs - b.startedAtMs);
}

function metricLines(
  metric: ChartMetric,
  chart: InsightChart,
  data: ChartData,
  ctx: { startMs: number; nowMs: number; axis: "left" | "right"; habitName: (id: string) => string },
): ChartLine[] {
  const def = metricDef(metric);
  const { bucket } = chart;
  const fill = def.agg === "sum" && bucket !== "session" ? wholeBuckets(ctx.startMs, ctx.nowMs, bucket) : null;
  const startIso = localDateIso(new Date(ctx.startMs));
  const line = (key: string, label: string, samples: ChartPoint[]): ChartLine => ({
    key,
    label,
    axis: ctx.axis,
    unit: def.unit,
    points: aggregate(samples, def.agg, fill),
  });
  const sessions = () => finishedInRange(data, ctx.startMs);

  switch (metric) {
    case "e1rm":
    case "top-set":
    case "volume":
    case "sets":
    case "best-reps":
      return chart.lifts.slice(0, MAX_CHART_LINES).map((lift) => {
        const samples: ChartPoint[] = [];
        for (const s of sessions()) {
          for (const ex of loggedExercises(s)) {
            if (!sameLift(lift, ex)) continue;
            const v = liftValue(metric, workingSets(ex));
            if (v != null) samples.push({ tMs: bucketStart(s.startedAtMs, bucket), value: v });
          }
        }
        return line(`${metric}:${lift.exerciseId ?? lift.exerciseName}`, lift.exerciseName, samples);
      });
    case "muscle-sets": {
      const wanted = new Set(chart.muscles);
      const samples: ChartPoint[] = [];
      for (const s of sessions()) {
        let n = 0;
        for (const ex of loggedExercises(s)) {
          const m = data.musclesOf?.({ exerciseId: ex.exerciseId, exerciseName: ex.exerciseName });
          if (!m) continue;
          const sets = workingSets(ex).length;
          // Counted once per exercise even when it hits two of the chosen muscles.
          if (m.primary.some((g) => wanted.has(g))) n += sets;
          else if (m.secondary.some((g) => wanted.has(g))) n += sets * SECONDARY_MUSCLE_WEIGHT;
        }
        if (n > 0) samples.push({ tMs: bucketStart(s.startedAtMs, bucket), value: n });
      }
      return [line(`muscles:${chart.muscles.join("+")}`, chart.muscles.map(capitalize).join(", "), samples)];
    }
    case "workouts":
      return [line("workouts", "Workouts", sessions().map((s) => ({ tMs: bucketStart(s.startedAtMs, bucket), value: 1 })))];
    case "training-time":
      return [
        line(
          "training-time",
          "Time training",
          sessions().map((s) => ({ tMs: bucketStart(s.startedAtMs, bucket), value: Math.max(0, ((s.endedAtMs ?? s.startedAtMs) - s.startedAtMs) / 60_000) })),
        ),
      ];
    case "body-weight":
      return [
        line(
          "body-weight",
          "Body weight",
          (data.weight?.points ?? []).filter((p) => p.dateIso >= startIso).map((p) => ({ tMs: dayMs(p.dateIso, bucket), value: p.smoothedKg })),
        ),
      ];
    case "calories":
    case "protein": {
      const samples: ChartPoint[] = [];
      for (const d of data.days ?? []) {
        if (d.deletedAtMs || d.dateIso < startIso) continue;
        const t = dayTotals(d);
        if (t.kcal <= 0) continue;
        samples.push({ tMs: dayMs(d.dateIso, bucket), value: metric === "calories" ? t.kcal : t.proteinG });
      }
      return [line(metric, def.label, samples)];
    }
    case "habit-days":
      return chart.habitIds.slice(0, MAX_CHART_LINES).map((id) => {
        const habit = data.habits?.find((h) => h.id === id);
        const samples: ChartPoint[] = [];
        if (habit) {
          for (const e of data.habitEntries ?? []) {
            if (e.habitId !== id || e.dateIso < startIso || !isSatisfied(habit, e)) continue;
            samples.push({ tMs: dayMs(e.dateIso, bucket), value: 1 });
          }
        }
        return line(`habit:${id}`, habit?.name ?? ctx.habitName(id), samples);
      });
  }
}

/** The lines to draw: the main metric on the left scale, the comparison on the right. */
export function chartLines(
  chart: InsightChart,
  data: ChartData,
  nowMs: number,
  opts: { habitName?: (id: string) => string } = {},
): ChartLine[] {
  const ctx = { startMs: rangeStartMs(chart.range, nowMs), nowMs, habitName: opts.habitName ?? (() => "Habit") };
  const lines = metricLines(chart.metric, chart, data, { ...ctx, axis: "left" });
  if (chart.compare !== "none") lines.push(...metricLines(chart.compare, chart, data, { ...ctx, axis: "right" }));
  return lines;
}

export function formatChartValue(value: number, unit: MetricDef["unit"], weightUnit: WeightUnit = "kg"): string {
  switch (unit) {
    case "kg": {
      const v = toDisplayWeight(value, weightUnit);
      return `${v >= 1000 ? Math.round(v).toLocaleString("en-GB") : Math.round(v * 10) / 10} ${weightUnit === "lbs" ? "lb" : "kg"}`;
    }
    case "kcal":
      return `${Math.round(value).toLocaleString("en-GB")} kcal`;
    case "g":
      return `${Math.round(value)} g`;
    case "min":
      return `${Math.round(value)} min`;
    default:
      return `${Math.round(value * 10) / 10} ${unit}`;
  }
}

const BUCKET_WORD: Record<ChartBucket, string> = { session: "session", week: "week", month: "month" };

/**
 * One or two plain sentences under the chart: where each line started and ended (or its
 * average, for counts). Side by side only; it never says one line drives the other.
 */
export function chartSummary(chart: InsightChart, lines: ChartLine[], weightUnit: WeightUnit = "kg"): string {
  const range = INSIGHT_RANGES.find((r) => r.id === chart.range)!.label;
  const parts: string[] = [];
  for (const l of lines) {
    const pts = l.points;
    if (pts.length === 0) continue;
    const def = l.axis === "left" ? metricDef(chart.metric) : metricDef(chart.compare as ChartMetric);
    const label = def.pick === "lifts" ? `${l.label} ${def.id === "e1rm" ? "est. 1RM" : def.label.toLowerCase()}` : l.label.toLowerCase();
    if (def.agg === "sum") {
      const avg = pts.reduce((a, p) => a + p.value, 0) / pts.length;
      parts.push(`${label} averaged ${formatChartValue(avg, l.unit, weightUnit)} a ${BUCKET_WORD[chart.bucket === "session" ? "session" : chart.bucket]}`);
    } else if (pts.length >= 2) {
      const first = pts[0]!.value;
      const last = pts[pts.length - 1]!.value;
      const pct = first > 0 && l.unit === "kg" && def.pick === "lifts" ? ` (${last >= first ? "+" : "−"}${Math.abs(Math.round(((last - first) / first) * 100))}%)` : "";
      parts.push(`${label} went from ${formatChartValue(first, l.unit, weightUnit)} to ${formatChartValue(last, l.unit, weightUnit)}${pct}`);
    }
  }
  if (parts.length === 0) return `Nothing to show in the last ${range} yet.`;
  const joined = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Over the last ${range}, ${joined}.`;
}
