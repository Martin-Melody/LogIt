import type { ExerciseRepo } from "@logit/core/data/exercise/exerciseRepo";
import type { WorkoutRepo } from "@logit/core/data/workoutRepo";
import type { Exercise } from "@logit/core/domain/exercise";
import { canonicalExerciseId, coreExerciseById, findExerciseByName, CORE_EXERCISES } from "@logit/core/domain/coreExercises";
import type { GoalView } from "@logit/core/domain/goalView";
import type { InsightArea } from "@logit/core/domain/insights";
import { DEFAULT_INSIGHT_RANGE, isInsightRange, rangeStartMs, type InsightRange } from "@logit/core/domain/insights";
import { chartAreas, chartLines, chartSummary, metricDef, type ChartData, type ChartLine, type InsightChart } from "@logit/core/domain/insightChart";
import { localDateIso } from "@logit/core/domain/nutrition";
import type { Habit, HabitEntry } from "@logit/core/domain/habit";
import type { WeightUnit } from "@logit/core/domain/units";
import { getExercises } from "@logit/core/domain/workout";
import { smoothWeightSeries } from "@logit/core/nutrition/trend";
import { syncApi, type RemoteProfile } from "@logit/core/api/syncApi";
import type { Sharing } from "@logit/core/api/coachApi";
import { chartToRow, chartsFromRows, insightChartsApi } from "@logit/core/api/insightChartsApi";
import type { InsightDeps } from "@logit/core/usecases/insights/getInsightAnswers";
import { getOwnNutritionDeps, getOwnProfile, getWebDeps, getWebNutritionDeps } from "$lib/deps";
import { sessionVolumeKg } from "$lib/features/sessionVolume";
import { goalsFromProfile, goalViews, ownBodyweightView } from "$lib/features/habitsGoals/goalsData";
import { parseRows } from "$lib/features/overview/overviewData";

/**
 * Insights on the dashboard: the repos and settings the core Insights code needs, for your
 * own data or a client's (as their coach), and your saved charts.
 */

/** Calls to the same read method with the same arguments share one request. */
function memo<T extends object>(target: T): T {
  const cache = new Map<string, Promise<unknown>>();
  return new Proxy(target, {
    get(t, key, receiver) {
      const v = Reflect.get(t, key, receiver);
      if (typeof v !== "function" || typeof key !== "string" || !/^(list|get)/.test(key)) {
        return typeof v === "function" ? v.bind(t) : v;
      }
      return (...args: unknown[]) => {
        const k = `${key}:${JSON.stringify(args)}`;
        if (!cache.has(k)) cache.set(k, (v as (...a: unknown[]) => Promise<unknown>).apply(t, args));
        return cache.get(k);
      };
    },
  });
}

/** The synced exercise repo only has the lifter's own exercises; fall back to the built-in
 * library so a core exercise's muscles are known too (as on the phone). */
function withCoreExercises(repo: ExerciseRepo): ExerciseRepo {
  return new Proxy(repo, {
    get(t, key, receiver) {
      if (key === "getById") {
        return async (id: string) => (await t.getById(id)) ?? coreExerciseById(canonicalExerciseId(id)) ?? null;
      }
      if (key === "getByName") {
        return async (name: string) => (await t.getByName(name)) ?? findExerciseByName(CORE_EXERCISES, name) ?? null;
      }
      const v = Reflect.get(t, key, receiver);
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
}

export type InsightsOwner = {
  /** A client's user id when a coach is looking; absent for your own. */
  clientId?: string;
  name?: string;
  sharing?: Sharing;
};

export function hiddenAreas(sharing: Sharing | undefined): InsightArea[] {
  if (!sharing) return [];
  const out: InsightArea[] = [];
  if (!sharing.workouts) out.push("training");
  if (!sharing.nutrition) out.push("nutrition");
  if (!sharing.bodyweight) out.push("weight");
  if (!sharing.habits) out.push("habits");
  return out;
}

export type InsightsSetup = { deps: InsightDeps; unit: WeightUnit; profile: RemoteProfile | null };

export async function insightsSetup(owner: InsightsOwner = {}): Promise<InsightsSetup> {
  const { clientId } = owner;
  const profile = clientId
    ? await syncApi.pullProfile(clientId).then((r) => r.profile).catch(() => null)
    : await getOwnProfile().catch(() => null);
  const unit: WeightUnit = profile?.weightUnit === "lbs" ? "lbs" : "kg";
  const { goals, streak } = goalsFromProfile(profile);
  const hidden = hiddenAreas(owner.sharing);

  const base = getWebDeps(clientId);
  const workoutRepo = memo<WorkoutRepo>(base.workoutRepo);
  const progression = { ...base, workoutRepo, exerciseRepo: withCoreExercises(memo(base.exerciseRepo)) };
  const nutritionBase = hidden.includes("nutrition") ? null : clientId ? getWebNutritionDeps(clientId) : getOwnNutritionDeps();
  const nutrition = nutritionBase ? { ...nutritionBase, nutritionRepo: memo(nutritionBase.nutritionRepo) } : null;

  const deps: InsightDeps = {
    progression,
    nutrition,
    streak,
    sessionVolumeKg,
    hidden,
    ownerName: owner.name,
    async loadGoalViews(): Promise<GoalView[]> {
      const sessions = await workoutRepo.listAllSessions();
      const views = await goalViews(goals, sessions, unit, clientId);
      if (!clientId) {
        const bw = await ownBodyweightView().catch(() => null);
        if (bw) views.push(bw);
      }
      return views;
    },
  };
  return { deps, unit, profile };
}

// ── Charts ──────────────────────────────────────────────────────────────────

export async function loadMyCharts(): Promise<InsightChart[]> {
  const { charts } = await insightChartsApi.pull(0);
  return chartsFromRows(charts);
}

export async function saveMyChart(chart: InsightChart): Promise<InsightChart> {
  const saved = { ...chart, updatedAtMs: Date.now() };
  await insightChartsApi.push([chartToRow(saved)]);
  return saved;
}

export async function deleteMyChart(chart: InsightChart): Promise<void> {
  const now = Date.now();
  await insightChartsApi.push([chartToRow({ ...chart, updatedAtMs: now, deletedAtMs: now })]);
}

/** Whether a coach can draw this chart for a client with these sharing switches. */
export function chartVisible(chart: Pick<InsightChart, "metric" | "compare">, sharing: Sharing | undefined): boolean {
  const hidden = hiddenAreas(sharing);
  return !chartAreas(chart).some((a) => hidden.includes(a));
}

/**
 * Everything a chart reads, loaded once for a set of charts (so the Overview's charts share
 * one fetch). `setup` comes from insightsSetup, so a coach's view reads the client's data.
 */
export async function loadChartData(charts: InsightChart[], setup: InsightsSetup, clientId?: string): Promise<ChartData> {
  const ids = new Set(charts.flatMap((c) => [c.metric, c.compare]));
  const needs = (m: string) => ids.has(m as never);
  const earliest = Math.min(Date.now(), ...charts.map((c) => rangeStartMs(c.range, Date.now())));
  const fromIso = localDateIso(new Date(earliest));
  const toIso = localDateIso();
  const anyLift = charts.some((c) => metricDef(c.metric).area === "training" || c.compare === "workouts");
  const nutritionRepo = setup.deps.nutrition?.nutritionRepo ?? null;

  const [sessions, weightEntries, days, habits, habitEntries] = await Promise.all([
    anyLift ? setup.deps.progression.workoutRepo.listAllSessions() : Promise.resolve([]),
    needs("body-weight") && nutritionRepo ? nutritionRepo.listWeightEntries().catch(() => []) : Promise.resolve([]),
    (needs("calories") || needs("protein")) && nutritionRepo ? nutritionRepo.listDaysInRange(fromIso, toIso).catch(() => []) : Promise.resolve([]),
    needs("habit-days") ? syncApi.pullHabits(0, clientId).then((r) => parseRows<Habit>(r.habits)).catch(() => [] as Habit[]) : Promise.resolve([] as Habit[]),
    needs("habit-days") ? syncApi.pullHabitEntries(0, clientId).then((r) => parseRows<HabitEntry>(r.entries)).catch(() => [] as HabitEntry[]) : Promise.resolve([] as HabitEntry[]),
  ]);

  let musclesOf: ChartData["musclesOf"];
  if (needs("muscle-sets")) {
    const repo = setup.deps.progression.exerciseRepo;
    const table = new Map<string, { primary: string[]; secondary: string[] } | null>();
    const keyOf = (ex: { exerciseId?: string; exerciseName: string }) => ex.exerciseId ?? ex.exerciseName.trim().toLowerCase();
    for (const s of sessions) {
      for (const ex of getExercises(s)) {
        const k = keyOf(ex);
        if (table.has(k)) continue;
        table.set(k, null);
        const found: Exercise | null = ex.exerciseId ? await repo.getById(ex.exerciseId) : await repo.getByName(ex.exerciseName);
        table.set(k, found ? { primary: found.primaryMuscles ?? [], secondary: found.secondaryMuscles ?? [] } : null);
      }
    }
    musclesOf = (ex) => table.get(keyOf(ex)) ?? null;
  }

  return {
    sessions,
    musclesOf,
    weight: weightEntries.length ? smoothWeightSeries(weightEntries) : null,
    days,
    habits,
    habitEntries,
  };
}

export type DrawnChart = { chart: InsightChart; lines: ChartLine[]; summary: string };

/** Lines and the summary for each chart, from one shared data load. */
export async function drawCharts(charts: InsightChart[], setup: InsightsSetup, clientId?: string): Promise<DrawnChart[]> {
  if (charts.length === 0) return [];
  const data = await loadChartData(charts, setup, clientId);
  const now = Date.now();
  const habitName = (id: string) => data.habits?.find((h) => h.id === id)?.name ?? "Habit";
  return charts.map((chart) => {
    const lines = chartLines(chart, data, now, { habitName });
    return { chart, lines, summary: chartSummary(chart, lines, setup.unit) };
  });
}

const RANGE_KEY = "logit-web:insights-range";

export function savedRange(): InsightRange {
  try {
    const v = localStorage.getItem(RANGE_KEY);
    return isInsightRange(v) ? v : DEFAULT_INSIGHT_RANGE;
  } catch {
    return DEFAULT_INSIGHT_RANGE;
  }
}

export function rememberRange(r: InsightRange): void {
  try { localStorage.setItem(RANGE_KEY, r); } catch {}
}
