import { loggedExercises } from "../../domain/loggedSets";
import { getExerciseProgressStory, type ExerciseProgressStory } from "./getExerciseProgressStory";
import type { ProgressionDeps } from "./deps";

const HISTORY_LIMIT = 100;

/**
 * One ExerciseProgressStory per distinct exercise the user has actually trained
 * recently — the data source for the /progress list. Exists so that list and the
 * per-exercise detail panel (ExerciseProgressionPanel) agree on status/reasoning by
 * construction, both reading getExerciseProgressStory rather than the list keeping
 * its own separate, drifting trend computation.
 */
export async function getAllExerciseProgressStories(
  deps: ProgressionDeps,
): Promise<ExerciseProgressStory[]> {
  const sessions = await deps.workoutRepo.listRecentSessions({ limit: HISTORY_LIMIT });

  // One story per lift *name*: history already matches by name (findExerciseIndexInSession),
  // so the same lift saved under several exercise ids (the built-in "Dips" and a library
  // copy, say) would otherwise show up once per id with identical numbers. Sessions come
  // newest first, so the id kept is the one used most recently.
  const seen = new Map<string, { id?: string; name: string }>();
  for (const session of sessions) {
    for (const ex of loggedExercises(session)) {
      const key = ex.exerciseName.toLowerCase().trim();
      if (!seen.has(key)) seen.set(key, { id: ex.exerciseId, name: ex.exerciseName });
    }
  }

  const stories: ExerciseProgressStory[] = [];
  for (const { id, name } of seen.values()) {
    const story = await getExerciseProgressStory({ id, name }, deps);
    if (story) stories.push(story);
  }
  return stories;
}
