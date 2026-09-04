// "Copy to mine" — P3 (cheap, id-reference tier: Algorithm/Widget) and P4 (full-fidelity
// tier: Split/Exercise/Habit) of docs/architecture/profile-progress-redesign.md.
import { get } from "svelte/store";
import { createId } from "@logit/core/domain/ids";
import { nowMs } from "@logit/core/domain/time";
import { setProgressionAlgorithm } from "@logit/core/usecases/progression/getProgressionConfig";
import { setAnalyticsPlugin } from "@logit/core/usecases/progression/getAnalyticsConfig";
import { setNutritionAlgorithm } from "@logit/core/usecases/nutrition/getNutritionAlgorithmConfig";
import { touchGoal, defaultNutritionGoal } from "@logit/core/domain/nutrition";
import type { WorkoutSplit, SplitDay, PlannedBlock, PlannedTargets } from "@logit/core/domain/WorkoutSplit";
import type { Exercise, MuscleGroup, ExerciseType, Machine } from "@logit/core/domain/exercise";
import type { Habit, HabitCadence, HabitTone } from "@logit/core/domain/habit";
import { getProgressionDeps } from "$lib/usecases/progressionDeps";
import { bumpProgression } from "$lib/progression/store";
import { getNutritionRepo, getSplitRepo, getExerciseRepo, getHabitRepo } from "$lib/data/repoProvider";
import { pushNutritionGoal, pushSplit, pushExercise, pushHabit } from "$lib/sync/syncService";
import { profileConfig } from "$lib/stores/profileConfig.store";
import { homeConfig } from "$lib/stores/homeConfig.store";
import { localProfileWidgetRegistry } from "$lib/features/profileWidgets/localProfileWidgetRegistry";
import { localWidgetRegistry } from "$lib/features/widgets/localWidgetRegistry";

export type AlgorithmFamily = "progression" | "analytics" | "nutrition";

export async function copyAlgorithmToMine(id: string, family: AlgorithmFamily): Promise<void> {
  if (family === "progression") {
    await setProgressionAlgorithm(id, getProgressionDeps());
    bumpProgression();
    return;
  }
  if (family === "analytics") {
    await setAnalyticsPlugin(id, getProgressionDeps());
    bumpProgression();
    return;
  }
  // nutrition — the goal record itself carries the algorithm choice, unlike
  // progression/analytics which have their own config rows.
  const repo = getNutritionRepo();
  const existing = await repo.getGoal();
  const goal = existing ?? defaultNutritionGoal();
  const next = touchGoal(setNutritionAlgorithm(goal, id));
  await repo.saveGoal(next);
  pushNutritionGoal(next);
}

/** Enables the widget if it isn't already — never disables one the copier already has on,
 * since this a `toggleWidget()`-shaped store API (flip, not set). Widget ids are unique across
 * the two local registries (profile-grid widgets vs. home-screen widgets), so try both. */
export function copyWidgetToMine(id: string): boolean {
  if (localProfileWidgetRegistry.get(id)) {
    if (!get(profileConfig).slots.find((s) => s.id === id)?.enabled) profileConfig.toggleWidget(id);
    return true;
  }
  if (localWidgetRegistry.get(id)) {
    if (!get(homeConfig).slots.find((s) => s.id === id)?.enabled) homeConfig.toggleWidget(id);
    return true;
  }
  // Not in either fixed local registry — most likely a widget from a plugin the copier
  // doesn't have installed. Plugin distribution is a different problem, out of scope here
  // (see docs/architecture/profile-progress-redesign.md §4).
  return false;
}

// ── Exercise ──────────────────────────────────────────────────────────────────

export type CopyableExercise = {
  name: string;
  notes?: string;
  primaryMuscles?: MuscleGroup[];
  secondaryMuscles?: MuscleGroup[];
  exerciseType?: ExerciseType;
  machines?: Machine[];
  defaultMachineId?: string;
};

/** Returns the local exercise the copier ends up with — either one they already had by this
 * name, or a freshly created copy (always non-core, fresh id — never the source's id, which
 * belongs to someone else's table). */
export async function copyExerciseToMine(payload: CopyableExercise): Promise<Exercise> {
  const repo = getExerciseRepo();
  const existing = await repo.getByName(payload.name);
  if (existing) return existing;
  const exercise: Exercise = {
    id: createId("ex"),
    name: payload.name,
    notes: payload.notes ?? null,
    isCore: false,
    createdAtMs: nowMs(),
    primaryMuscles: payload.primaryMuscles ?? [],
    secondaryMuscles: payload.secondaryMuscles ?? [],
    exerciseType: payload.exerciseType,
    machines: payload.machines,
    defaultMachineId: payload.defaultMachineId,
  };
  await repo.saveExercise(exercise);
  pushExercise(exercise);
  return exercise;
}

// ── Split ─────────────────────────────────────────────────────────────────────

type CopyableBlock =
  | { type: "strength"; orderIndex: number; exerciseName: string; exerciseId?: string; targets?: PlannedTargets }
  | { type: "cardio"; orderIndex: number; activityName: string };

export type CopyableSplit = {
  name: string;
  days: { name?: string; orderIndex: number; blocks: CopyableBlock[] }[];
  /** Full definitions of every non-core exercise this split uses, so a copier who doesn't
   * already have one by that name can get a real local copy instead of a dangling reference —
   * core/bundled exercises are seeded with the same id everywhere and never need this. */
  customExercises: CopyableExercise[];
};

/** A block's `exerciseId` only means something in the *author's* local database — resolve
 * to the copier's own exercise id by trying, in order: a core exercise sharing that exact id
 * (portable, seeded identically everywhere), an existing local exercise with a matching name,
 * or creating a local copy from the embedded `customExercises` entry. Falls back to leaving
 * the block name-only (no id) if none of those resolve. */
async function resolveExerciseId(
  name: string,
  sourceId: string | undefined,
  customByName: Map<string, CopyableExercise>,
  cache: Map<string, string | undefined>,
): Promise<string | undefined> {
  if (cache.has(name)) return cache.get(name);
  const repo = getExerciseRepo();

  if (sourceId) {
    const byId = await repo.getById(sourceId);
    if (byId?.isCore) { cache.set(name, byId.id); return byId.id; }
  }
  const existing = await repo.getByName(name);
  if (existing) { cache.set(name, existing.id); return existing.id; }

  const source = customByName.get(name);
  const id = source ? (await copyExerciseToMine(source)).id : undefined;
  cache.set(name, id);
  return id;
}

export async function copySplitToMine(payload: CopyableSplit): Promise<void> {
  const customByName = new Map(payload.customExercises.map((e) => [e.name, e]));
  const idCache = new Map<string, string | undefined>();

  const days: SplitDay[] = [];
  for (const d of payload.days) {
    const blocks: PlannedBlock[] = [];
    for (const b of d.blocks) {
      if (b.type === "strength") {
        blocks.push({
          type: "strength",
          id: createId("blk"),
          orderIndex: b.orderIndex,
          exerciseName: b.exerciseName,
          exerciseId: await resolveExerciseId(b.exerciseName, b.exerciseId, customByName, idCache),
          targets: b.targets,
        });
      } else {
        blocks.push({ type: "cardio", id: createId("blk"), orderIndex: b.orderIndex, activityName: b.activityName });
      }
    }
    days.push({ id: createId("day"), orderIndex: d.orderIndex, name: d.name, blocks });
  }

  const now = nowMs();
  const split: WorkoutSplit = {
    id: createId("split"),
    name: payload.name,
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
    days,
  };
  await getSplitRepo().saveSplit(split);
  pushSplit(split);
}

// ── Habit ─────────────────────────────────────────────────────────────────────

export type CopyableHabit = {
  name: string;
  cadence: HabitCadence;
  target?: { value: number; unit?: string };
  icon?: string;
  tone?: HabitTone;
};

export async function copyHabitToMine(payload: CopyableHabit): Promise<void> {
  const now = nowMs();
  const habit: Habit = {
    id: createId("habit"),
    name: payload.name,
    cadence: payload.cadence,
    target: payload.target,
    icon: payload.icon,
    tone: payload.tone,
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
  };
  await getHabitRepo().saveHabit(habit);
  pushHabit(habit);
}
