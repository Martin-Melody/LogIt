// "Copy to mine" — P3 (cheap, id-reference tier: Algorithm/Widget) and P4 (full-fidelity
// tier: Split/Exercise/Habit) of docs/architecture/profile-progress-redesign.md.
import { get } from "svelte/store";
import { setProgressionAlgorithm } from "@logit/core/usecases/progression/getProgressionConfig";
import { setAnalyticsPlugin } from "@logit/core/usecases/progression/getAnalyticsConfig";
import { setNutritionAlgorithm } from "@logit/core/usecases/nutrition/getNutritionAlgorithmConfig";
import { touchGoal, defaultNutritionGoal } from "@logit/core/domain/nutrition";
import type { Exercise } from "@logit/core/domain/exercise";
import {
  habitFromShared,
  libraryItemFromShared,
  splitFromShared,
  type SharedExercise,
  type SharedHabit,
  type SharedLibraryItem,
  type SharedSplit,
} from "@logit/core/domain/sharedContent";
import type { OwnLibraryItem } from "@logit/core/data/libraryRepo";
import { loadLibrary, saveOwnItem } from "$lib/data/library/library";
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

// ── Exercise / library item ───────────────────────────────────────────────────

// The payload types live in @logit/core (sharedContent) so the web copies the same way.
export type CopyableExercise = SharedExercise;
export type CopyableLibraryItem = SharedLibraryItem;
export type CopyableSplit = SharedSplit;
export type CopyableHabit = SharedHabit;

/** Returns the local exercise the copier ends up with — either one they already had by this
 * name, or a freshly created copy (always non-core, fresh id — never the source's id, which
 * belongs to someone else's table). */
export async function copyExerciseToMine(payload: CopyableExercise): Promise<Exercise> {
  const repo = getExerciseRepo();
  const existing = await repo.getByName(payload.name);
  if (existing) return existing;
  const copy = libraryItemFromShared(payload);
  if (copy.kind !== "strength") throw new Error("not a strength exercise");
  await repo.saveExercise(copy.item);
  pushExercise(copy.item);
  return copy.item;
}

/** Any library item: strength goes to the exercise table, cardio and mobility to your own
 * library items. One you already have by that name is kept. Returns false when it was already there. */
export async function copyLibraryItemToMine(payload: CopyableLibraryItem): Promise<boolean> {
  if (!("kind" in payload) || (payload.kind !== "cardio" && payload.kind !== "mobility")) {
    const repo = getExerciseRepo();
    if (await repo.getByName(payload.name)) return false;
    await copyExerciseToMine(payload as SharedExercise);
    return true;
  }
  const name = payload.name.trim().toLowerCase();
  const have = (await loadLibrary(payload.kind)).some((e) => e.source === "mine" && e.item.name.trim().toLowerCase() === name);
  if (have) return false;
  await saveOwnItem(libraryItemFromShared(payload) as OwnLibraryItem);
  return true;
}

// ── Split ─────────────────────────────────────────────────────────────────────

/** A block's `exerciseId` only means something in the *author's* database — resolve to the
 * copier's own id: a core exercise with that exact id (the same everywhere), an exercise of
 * theirs by name, or a copy made from the embedded `customExercises` entry. Otherwise the
 * block stays name-only. */
export async function copySplitToMine(payload: CopyableSplit): Promise<void> {
  const repo = getExerciseRepo();
  const split = await splitFromShared(payload, async (name, sourceId, custom) => {
    if (sourceId) {
      const byId = await repo.getById(sourceId);
      if (byId?.isCore) return byId.id;
    }
    const existing = await repo.getByName(name);
    if (existing) return existing.id;
    return custom ? (await copyExerciseToMine(custom)).id : undefined;
  });
  await getSplitRepo().saveSplit(split);
  pushSplit(split);
}

// ── Habit ─────────────────────────────────────────────────────────────────────

export async function copyHabitToMine(payload: CopyableHabit): Promise<void> {
  const habit = habitFromShared(payload);
  await getHabitRepo().saveHabit(habit);
  pushHabit(habit);
}
