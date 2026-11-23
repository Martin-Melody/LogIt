// "Same as Belt Squat?" on the setup card (design canvas I3): an exercise made by name turns out
// to be one in the library. Its workouts, split days, goals and settings (best lift too) move to the
// library exercise, then the made one is removed. Synced like the edits they stand for.
import { get } from "svelte/store";
import { getExerciseRepo, getSplitRepo, getWorkoutRepo } from "$lib/data/repoProvider";
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import { pushDeletedExercise, pushExerciseSetting, pushSessions } from "$lib/sync/syncService";
import { saveSplit } from "$lib/usecases/Splits/saveSplit";
import { currentSession } from "$lib/stores/currentSession.store";
import { goalsStore } from "$lib/features/goals/goalsStore";
import { bumpProgression } from "$lib/progression/store";
import { getProgressionDeps } from "$lib/usecases/progressionDeps";
import { mergeExerciseInGoal, mergeExerciseInSession, mergeExerciseInSplit, type ExerciseRef } from "@logit/core/domain/exerciseMerge";
import { getExerciseProgressionSettings, saveExerciseProgressionSettings } from "@logit/core/usecases/progression/exerciseProgressionSettings";
import type { Exercise } from "@logit/core/domain/exercise";
import type { StrengthBlockData } from "@logit/core/domain/workout";
import { touchSession } from "@logit/core/domain/workout";

/** How many logged sets of `from` would move (for the confirm line). */
export async function countSets(from: ExerciseRef): Promise<number> {
  let n = 0;
  for (const s of await getWorkoutRepo().listAllSessions()) {
    for (const b of s.blocks) {
      const d = b.data as StrengthBlockData;
      if (b.type === "strength" && (d.exerciseId === from.id || (!d.exerciseId && d.exerciseName.toLowerCase() === from.name.toLowerCase()))) {
        n += d.sets.filter((x) => x.completed).length;
      }
    }
  }
  return n;
}

export async function mergeOwnExercise(from: Exercise, to: Exercise): Promise<void> {
  const a: ExerciseRef = { id: from.id, name: from.name };
  const b: ExerciseRef = { id: to.id, name: to.name };
  const deps = getProgressionDeps();

  // The workout in progress first, through its store, so the screen follows.
  const draftId = get(currentSession)?.id;
  if (draftId) await currentSession.mutate((s) => mergeExerciseInSession(s, a, b) ?? s, { auto: true }).catch(() => {});

  const workouts = getWorkoutRepo();
  const moved = [];
  for (const s of await workouts.listAllSessions()) {
    if (s.id === draftId) continue;
    const merged = mergeExerciseInSession(s, a, b);
    if (!merged) continue;
    const next = touchSession(merged);
    await workouts.saveSession(next);
    moved.push(next);
  }
  pushSessions(moved);

  for (const split of await getSplitRepo().getListSplits()) {
    const next = mergeExerciseInSplit(split, a, b);
    if (next) await saveSplit(next);
  }

  for (const goal of get(goalsStore).goals) {
    const target = mergeExerciseInGoal(goal.target, a, b);
    if (target) goalsStore.update(goal.id, { target });
  }

  // Its own settings (rep range, algorithm) carry over unless the library one has some.
  const mine = await getExerciseProgressionSettings(from, deps);
  if (mine && !(await getExerciseProgressionSettings(to, deps))) {
    const row = await saveExerciseProgressionSettings(to, { repRange: mine.repRange, algorithmId: mine.algorithmId, behindPace: mine.behindPace, setTarget: mine.setTarget, startingLift: mine.startingLift }, deps);
    if (row) pushExerciseSetting(row);
  }

  const CHOICES_KEY = "logit:import-choices";
  try {
    const choices = JSON.parse(getAccountItem(CHOICES_KEY) ?? "{}") as Record<string, { exerciseId: string } | "own">;
    for (const [name, c] of Object.entries(choices)) if (c !== "own" && c.exerciseId === a.id) choices[name] = { exerciseId: b.id };
    // The made exercise's own name now means the library one in later imports.
    choices[a.name.toLowerCase()] = { exerciseId: b.id };
    setAccountItem(CHOICES_KEY, JSON.stringify(choices));
  } catch {}

  await getExerciseRepo().remove(a.id);
  pushDeletedExercise(a.id);
  bumpProgression();
}
