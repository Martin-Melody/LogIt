import type { WidgetDataNeed, WidgetInput, WidgetWorkout, WidgetWorkoutBlock } from "./widgetView";
import { isPluginBlockType, PLUGIN_BLOCK_PREFIX, type PluginBlockData } from "../domain/blockPlugin";
import type { WorkoutSession } from "../domain/workout";
import type { WorkoutRepo } from "../data/workoutRepo";
import type { ExerciseRepo } from "../data/exercise/exerciseRepo";
import type { HabitRepo } from "../data/habitRepo";
import type { NutritionDeps } from "../usecases/nutrition/deps";
import type { ProgressionDeps } from "../usecases/progression/deps";
import type { ProgressionOutput } from "../domain/progression";
import { getExercises, type MobilityBlockData } from "../domain/workout";
import { dayTotals, localDateIso } from "../domain/nutrition";
import { getSuggestion } from "../usecases/progression/getSuggestion";
import { getNutritionTargets } from "../usecases/nutrition/getNutritionTargets";
import { computeStreak, dueOn, isSatisfied, weekProgress } from "../domain/habit";
import { addDays } from "../domain/dateIso";

/**
 * Load exactly the data slices a widget declared it needs, from whichever repos the app has
 * (local ones on the phone, the synced server copies on the dashboard), and shape them into a
 * WidgetInput. `session` and `todaysPlan` come from app state, so the caller supplies them.
 * Each slice fails on its own: a widget that asks for habits still gets its workouts.
 */

export type WidgetInputSources = {
  workoutRepo: Pick<WorkoutRepo, "listAllSessions" | "listRecentSessions">;
  exerciseRepo?: Pick<ExerciseRepo, "list"> | null;
  habitRepo?: Pick<HabitRepo, "listHabits" | "listEntries"> | null;
  nutritionDeps?: Pick<NutritionDeps, "nutritionRepo" | "nutritionAlgorithmRegistry" | "assignedNutritionPlanRepo"> | null;
  progressionDeps?: ProgressionDeps | null;
  fallbackWeightKg?: number | null;
  weightUnit: "kg" | "lbs";
  timeZone?: string;
  /** The session + today's plan slices, from app state. */
  plan?: () => Pick<WidgetInput, "session" | "todaysPlan">;
  /** Called when a slice can't be loaded (it's left out). */
  onSliceError?: (need: string, error: unknown) => void;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** A workout's plugin blocks for widgets: values only, at most 100 entries each. */
function pluginBlocksOf(s: WorkoutSession): { blocks?: WidgetWorkoutBlock[] } {
  const blocks = s.blocks
    .filter((b) => isPluginBlockType(b.type))
    .map((b): WidgetWorkoutBlock => {
      const d = b.data as PluginBlockData;
      return { pluginId: b.type.slice(PLUGIN_BLOCK_PREFIX.length), name: d.name, fields: { ...(d.blockFields ?? {}) }, entries: (d.entries ?? []).slice(0, 100).map((e) => ({ ...e.values })) };
    });
  return blocks.length ? { blocks } : {};
}

export function formatTarget(o: ProgressionOutput): string {
  const first = o.sets[0];
  if (!first) return o.label ?? "—";
  const reps = Array.isArray(first.reps) ? `${first.reps[0]}–${first.reps[1]}` : String(first.reps);
  return `${o.sets.length}×${reps} @ ${first.weight}kg`;
}

export async function gatherWidgetInputFrom(
  needs: readonly WidgetDataNeed[],
  src: WidgetInputSources,
  now: number = Date.now(),
): Promise<WidgetInput> {
  const want = new Set(needs);
  const input: WidgetInput = {
    now,
    timeZone: src.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    prefs: { weightUnit: src.weightUnit },
  };

  if ((want.has("session") || want.has("todaysPlan")) && src.plan) {
    const p = src.plan();
    if (want.has("session") && p.session) input.session = p.session;
    if (want.has("todaysPlan") && p.todaysPlan) input.todaysPlan = p.todaysPlan;
  }

  const slice = (need: string, job: () => Promise<void>) =>
    job().catch((e) => src.onSliceError?.(need, e));
  const tasks: Promise<void>[] = [];

  // One read of the session list for both slices that use it.
  let all: Promise<Awaited<ReturnType<WorkoutRepo["listAllSessions"]>>> | null = null;
  const sessions = () => (all ??= src.workoutRepo.listAllSessions());

  if (want.has("workouts")) {
    tasks.push(
      slice("workouts", async () => {
        // Bound what we hand widgets (and serialise into the sandbox): recent history only.
        const cutoff = now - 200 * DAY_MS;
        const recent = (await sessions()).filter((s) => (s.endedAtMs ?? s.startedAtMs) >= cutoff).slice(0, 150);
        input.workouts = recent.map(
          (s): WidgetWorkout => ({
            id: s.id,
            startedAtMs: s.startedAtMs,
            endedAtMs: s.endedAtMs ?? undefined,
            exercises: getExercises(s).map((ex) => ({
              exerciseId: ex.exerciseId ?? undefined,
              name: ex.exerciseName,
              sets: ex.sets.map((set) => ({
                weight: Number(set.weight) || 0,
                reps: Number(set.reps) || 0,
                type: set.setType,
              })),
            })),
            ...pluginBlocksOf(s),
          }),
        );
      }),
    );
  }

  if (want.has("mobility")) {
    tasks.push(
      slice("mobility", async () => {
        const cutoff = now - 200 * DAY_MS;
        const recent = (await sessions())
          .filter((s) => (s.endedAtMs ?? s.startedAtMs) >= cutoff)
          .sort((a, b) => (b.endedAtMs ?? b.startedAtMs) - (a.endedAtMs ?? a.startedAtMs));

        type Agg = {
          name: string;
          metric: "hold" | "reps";
          perSide: boolean;
          lastPerformedAtMs: number;
          sessionsLogged: number;
          bestHoldSec: number;
          bestReps: number;
        };
        const byDrill = new Map<string, Agg>();
        const dayKeys = new Set<string>();

        for (const s of recent) {
          const at = s.endedAtMs ?? s.startedAtMs;
          let hadMobility = false;
          for (const block of s.blocks) {
            if (block.type !== "mobility") continue;
            hadMobility = true;
            const d = block.data as MobilityBlockData;
            const key = (d.drillId || d.drillName).toLowerCase();
            const agg = byDrill.get(key) ?? {
              name: d.drillName,
              metric: d.metric,
              perSide: d.perSide,
              lastPerformedAtMs: at,
              sessionsLogged: 0,
              bestHoldSec: 0,
              bestReps: 0,
            };
            agg.sessionsLogged += 1;
            agg.lastPerformedAtMs = Math.max(agg.lastPerformedAtMs, at);
            for (const set of d.sets) {
              if (set.durationSec) agg.bestHoldSec = Math.max(agg.bestHoldSec, set.durationSec);
              if (set.reps) agg.bestReps = Math.max(agg.bestReps, set.reps);
            }
            byDrill.set(key, agg);
          }
          if (hadMobility) dayKeys.add(new Date(at).toISOString().slice(0, 10));
        }

        // Consecutive-day streak ending today or yesterday.
        let streakDays = 0;
        const cursor = new Date(now);
        for (let i = 0; i < 400; i++) {
          const iso = cursor.toISOString().slice(0, 10);
          if (dayKeys.has(iso)) streakDays++;
          else if (i > 0) break;
          cursor.setDate(cursor.getDate() - 1);
        }

        const weekAgo = now - 7 * DAY_MS;
        input.mobility = {
          streakDays,
          drillsThisWeek: [...byDrill.values()].filter((d) => d.lastPerformedAtMs >= weekAgo).length,
          drills: [...byDrill.values()]
            .sort((a, b) => b.lastPerformedAtMs - a.lastPerformedAtMs)
            .slice(0, 20)
            .map((d) => ({
              name: d.name,
              metric: d.metric,
              perSide: d.perSide,
              lastPerformedAtMs: d.lastPerformedAtMs,
              sessionsLogged: d.sessionsLogged,
              bestHoldSec: d.bestHoldSec || undefined,
              bestReps: d.bestReps || undefined,
            })),
        };
      }),
    );
  }

  if (want.has("exercises") && src.exerciseRepo) {
    const repo = src.exerciseRepo;
    tasks.push(
      slice("exercises", async () => {
        input.exercises = (await repo.list()).map((e) => ({
          id: e.id,
          name: e.name,
          primaryMuscles: e.primaryMuscles ?? [],
          secondaryMuscles: e.secondaryMuscles ?? [],
        }));
      }),
    );
  }

  if (want.has("progressionTargets") && src.progressionDeps) {
    const deps = src.progressionDeps;
    tasks.push(
      slice("progressionTargets", async () => {
        // Which exercises to show: the most recently *trained* ones, from real session
        // history — so a freshly picked algorithm shows suggestions straight away, using
        // getSuggestion()'s history-based fallback.
        const recentSessions = await src.workoutRepo.listRecentSessions({ limit: 20 });
        const seen = new Set<string>();
        const candidates: { id?: string; name: string }[] = [];
        outer: for (const session of recentSessions) {
          for (const ex of getExercises(session)) {
            const key = ex.exerciseId ?? ex.exerciseName.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            candidates.push({ id: ex.exerciseId, name: ex.exerciseName });
            if (candidates.length >= 6) break outer;
          }
        }
        const rows = await Promise.all(
          candidates.map(async (c) => {
            const out = await getSuggestion({ id: c.id, name: c.name }, deps).catch(() => null);
            return out ? { exerciseName: c.name, target: formatTarget(out) } : null;
          }),
        );
        input.progressionTargets = rows.filter((r): r is NonNullable<typeof r> => r !== null);
      }),
    );
  }

  if (want.has("nutritionDays") && src.nutritionDeps) {
    const deps = src.nutritionDeps;
    tasks.push(
      slice("nutritionDays", async () => {
        const from = localDateIso(new Date(now - 27 * DAY_MS));
        const [days, nut] = await Promise.all([
          deps.nutritionRepo.listDaysInRange(from, localDateIso(new Date(now))),
          getNutritionTargets(deps, { fallbackWeightKg: src.fallbackWeightKg, now }).catch(() => null),
        ]);
        input.nutritionDays = {
          days: days.filter((d) => d.items.length > 0).map((d) => { const t = dayTotals(d); return { dateIso: d.dateIso, kcal: Math.round(t.kcal), proteinG: Math.round(t.proteinG) }; }).sort((a, b) => a.dateIso.localeCompare(b.dateIso)),
          targetKcal: nut?.targets?.kcal,
          targetProteinG: nut?.targets?.macros.proteinG,
        };
      }),
    );
  }

  if ((want.has("nutrition") || want.has("bodyweight")) && src.nutritionDeps) {
    const deps = src.nutritionDeps;
    tasks.push(
      slice("nutrition", async () => {
        const nut = await getNutritionTargets(deps, { fallbackWeightKg: src.fallbackWeightKg, now });

        if (want.has("nutrition")) {
          const day = await deps.nutritionRepo.getDay(localDateIso(new Date(now))).catch(() => null);
          const consumed = day ? dayTotals(day) : { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
          input.nutrition = {
            hasGoal: !!nut.goal || !!nut.coachPlan,
            sourceLabel: nut.targets?.sourceLabel,
            targetKcal: nut.targets?.kcal,
            consumedKcal: consumed.kcal,
            targetMacros: nut.targets
              ? { proteinG: nut.targets.macros.proteinG, carbsG: nut.targets.macros.carbsG, fatG: nut.targets.macros.fatG }
              : undefined,
            consumedMacros: { proteinG: consumed.proteinG, carbsG: consumed.carbsG, fatG: consumed.fatG },
          };
        }

        if (want.has("bodyweight")) {
          input.bodyweight = {
            currentKg: nut.trend.currentKg ?? undefined,
            weeklyRateKg: nut.trend.weeklyRateKg,
            targetKg: nut.goal?.targetWeightKg ?? undefined,
            trendPoints: nut.trend.points.map((pt) => ({ dateIso: pt.dateIso, kg: pt.smoothedKg })),
          };
        }
      }),
    );
  }

  if (want.has("habits") && src.habitRepo) {
    const repo = src.habitRepo;
    tasks.push(
      slice("habits", async () => {
        const habits = await repo.listHabits();
        if (habits.length === 0) {
          input.habits = [];
          return;
        }
        const today = localDateIso(new Date(now));
        // Streaks need history; 100 days back covers any realistic run.
        const entries = await repo.listEntries({ fromIso: addDays(today, -100), toIso: today });
        const byHabit = new Map<string, typeof entries>();
        for (const e of entries) {
          const list = byHabit.get(e.habitId) ?? [];
          list.push(e);
          byHabit.set(e.habitId, list);
        }
        input.habits = habits.map((h) => {
          const hEntries = byHabit.get(h.id) ?? [];
          const todayEntry = hEntries.find((e) => e.dateIso === today);
          const wp = weekProgress(h, hEntries, today);
          return {
            id: h.id,
            name: h.name,
            icon: h.icon,
            dueToday: dueOn(h, today),
            doneToday: isSatisfied(h, todayEntry),
            streak: computeStreak(h, hEntries, today),
            weekProgress: wp ?? undefined,
          };
        });
      }),
    );
  }

  await Promise.all(tasks);
  return input;
}
