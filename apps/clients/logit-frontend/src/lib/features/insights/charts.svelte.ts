import { browser } from "$app/environment";
import { apiClient } from "@logit/core/api/client";
import { chartToRow, chartsFromRows, insightChartsApi } from "@logit/core/api/insightChartsApi";
import {
  chartLines,
  chartSummary,
  metricDef,
  parseInsightChart,
  type ChartData,
  type ChartLine,
  type InsightChart,
} from "@logit/core/domain/insightChart";
import { rangeStartMs } from "@logit/core/domain/insights";
import { canonicalExerciseId, coreExerciseById, CORE_EXERCISES, findExerciseByName } from "@logit/core/domain/coreExercises";
import { localDateIso } from "@logit/core/domain/nutrition";
import { getExercises } from "@logit/core/domain/workout";
import type { WeightUnit } from "@logit/core/domain/units";
import { smoothWeightSeries } from "@logit/core/nutrition/trend";
import { getExerciseRepo, getHabitRepo, getNutritionRepo, getWorkoutRepo } from "$lib/data/repoProvider";
import { authStore } from "$lib/api/authStore.svelte";
import { homeConfig } from "$lib/stores/homeConfig.store";
import type { RuntimeWidgetDefinition } from "$lib/plugins";
import ChartWidget from "./ChartWidget.svelte";

/**
 * Saved Insights charts on the phone. They're made on the web (or by a coach) and pulled
 * from the server; the phone draws each one from its own data. "Phone home" on a chart puts
 * it on the home screen; switching it there (or in Customise home) saves the tick back.
 */

const KEY = "logit:insight-charts:v1";
/** chart id → the "phone home" tick last applied to the home layout, so a change made on
 * another device moves the widget, but a slot the user switched here isn't undone on every sync. */
const APPLIED_KEY = "logit:insight-charts-home-applied:v1";

function readCache(): InsightChart[] {
  if (!browser) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown[];
    return raw.map((c) => parseInsightChart(JSON.stringify(c))).filter((c): c is InsightChart => !!c);
  } catch {
    return [];
  }
}

function readApplied(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(APPLIED_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

export const chartWidgetId = (id: string) => `chart:${id}`;

function createChartsStore() {
  let charts = $state<InsightChart[]>(readCache());
  let syncing: Promise<void> | null = null;
  let lastSync = 0;

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(charts)); } catch {}
  }

  function applyToHome() {
    const applied = readApplied();
    const next: Record<string, boolean> = {};
    homeConfig.syncChartSlots(
      charts.map((c) => {
        const on = c.showOn.phoneHome;
        next[c.id] = on;
        return { id: chartWidgetId(c.id), on, changed: applied[c.id] !== on };
      }),
    );
    try { localStorage.setItem(APPLIED_KEY, JSON.stringify(next)); } catch {}
  }

  async function doSync() {
    if (!apiClient.isAuthenticated()) return;
    try {
      const { charts: rows } = await insightChartsApi.pull(0);
      charts = chartsFromRows(rows);
      persist();
      applyToHome();
      lastSync = Date.now();
    } catch {
      // Offline or signed out: keep the cached copy.
    }
  }

  return {
    get list() { return charts; },
    get(id: string) { return charts.find((c) => c.id === id) ?? null; },
    /** Pull the charts (at most every 30 s unless forced). */
    sync(force = false): Promise<void> {
      if (!force && Date.now() - lastSync < 30_000) return Promise.resolve();
      syncing ??= doSync().finally(() => (syncing = null));
      return syncing;
    },
    /** Put a chart on the home screen or take it off, and save the tick (Pro saves sync). */
    async setPhoneHome(id: string, on: boolean) {
      const c = charts.find((x) => x.id === id);
      if (!c) return;
      const next = { ...c, showOn: { ...c.showOn, phoneHome: on }, updatedAtMs: Date.now() };
      charts = charts.map((x) => (x.id === id ? next : x));
      persist();
      applyToHome();
      if (authStore.user && authStore.user.tier !== "Free") {
        await insightChartsApi.push([chartToRow(next)]).catch(() => {});
      }
    },
  };
}

export const insightCharts = createChartsStore();

// ── Drawing ─────────────────────────────────────────────────────────────────

export type DrawnChart = { chart: InsightChart; lines: ChartLine[]; summary: string };

async function loadChartData(charts: InsightChart[]): Promise<ChartData> {
  const ids = new Set<string>(charts.flatMap((c) => [c.metric, c.compare]));
  const now = Date.now();
  const fromIso = localDateIso(new Date(Math.min(now, ...charts.map((c) => rangeStartMs(c.range, now)))));
  const training = charts.some((c) => metricDef(c.metric).area === "training" || c.compare === "workouts");
  const nutrition = getNutritionRepo();
  const habitRepo = getHabitRepo();
  const [sessions, weightEntries, days, habits, habitEntries] = await Promise.all([
    training ? getWorkoutRepo().listAllSessions() : Promise.resolve([]),
    ids.has("body-weight") ? nutrition.listWeightEntries().catch(() => []) : Promise.resolve([]),
    ids.has("calories") || ids.has("protein") ? nutrition.listDaysInRange(fromIso, localDateIso(new Date(now))).catch(() => []) : Promise.resolve([]),
    ids.has("habit-days") ? habitRepo.listHabits({ includeArchived: true }).catch(() => []) : Promise.resolve([]),
    ids.has("habit-days") ? habitRepo.listEntries().catch(() => []) : Promise.resolve([]),
  ]);

  let musclesOf: ChartData["musclesOf"];
  if (ids.has("muscle-sets")) {
    const repo = getExerciseRepo();
    const table = new Map<string, { primary: string[]; secondary: string[] } | null>();
    const keyOf = (ex: { exerciseId?: string; exerciseName: string }) => ex.exerciseId ?? ex.exerciseName.trim().toLowerCase();
    for (const s of sessions) {
      for (const ex of getExercises(s)) {
        const k = keyOf(ex);
        if (table.has(k)) continue;
        const found =
          (ex.exerciseId ? await repo.getById(ex.exerciseId).catch(() => null) : await repo.getByName(ex.exerciseName).catch(() => null)) ??
          (ex.exerciseId ? coreExerciseById(canonicalExerciseId(ex.exerciseId)) : undefined) ??
          findExerciseByName(CORE_EXERCISES, ex.exerciseName) ??
          null;
        table.set(k, found ? { primary: found.primaryMuscles ?? [], secondary: found.secondaryMuscles ?? [] } : null);
      }
    }
    musclesOf = (ex) => table.get(keyOf(ex)) ?? null;
  }
  return { sessions, musclesOf, weight: weightEntries.length ? smoothWeightSeries(weightEntries) : null, days, habits, habitEntries };
}

export async function drawCharts(charts: InsightChart[], unit: WeightUnit): Promise<DrawnChart[]> {
  if (charts.length === 0) return [];
  const data = await loadChartData(charts);
  const now = Date.now();
  const habitName = (id: string) => data.habits?.find((h) => h.id === id)?.name ?? "Habit";
  return charts.map((chart) => {
    const lines = chartLines(chart, data, now, { habitName });
    return { chart, lines, summary: chartSummary(chart, lines, unit) };
  });
}

/** Home-screen widget definitions for the saved charts (alongside the built-in ones). */
export function chartWidgets(charts: InsightChart[]): RuntimeWidgetDefinition[] {
  return charts.map((c, i) => ({
    id: chartWidgetId(c.id),
    label: c.name || "Chart",
    description: c.from ? `Chart from ${c.from.name}` : "Your chart from Insights",
    component: ChartWidget,
    props: { chartId: c.id },
    defaultEnabled: c.showOn.phoneHome,
    defaultOrder: 100 + i,
    source: "builtin" as const,
    pluginEnabled: true,
    bundleContract: null,
  }));
}
