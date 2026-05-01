import { get } from "svelte/store";
import type { Exercise } from "$lib/domain/exercise";
import type { WorkoutSession } from "$lib/domain/workout";
import type { WorkoutSplit } from "$lib/domain/WorkoutSplit";
import type { ExerciseProgressionState, UserProgressionConfig } from "$lib/domain/progression";
import type { UserProfile } from "$lib/stores/profile.store";
import {
  getExerciseRepo,
  getSplitRepo,
  getWorkoutRepo,
  getProgressionRepo,
} from "$lib/data/repoProvider";
import { profile } from "$lib/stores/profile.store";
import { saveTextFile } from "$lib/platform/fileSave";

export const EXPORT_VERSION = 1 as const;

export type ExportData = {
  version: typeof EXPORT_VERSION;
  exportedAtMs: number;
  profile: UserProfile;
  exercises: Exercise[];
  splits: { splits: WorkoutSplit[]; activeSplitId: string | null };
  sessions: WorkoutSession[];
  progression: { config: UserProgressionConfig | null; states: ExerciseProgressionState[] };
};

export async function exportData(): Promise<ExportData> {
  const exerciseRepo = getExerciseRepo();
  const splitRepo = getSplitRepo();
  const workoutRepo = getWorkoutRepo();
  const progressionRepo = getProgressionRepo();

  // Only export user-created exercises — core exercises are always present in the app
  const exercises = await exerciseRepo.list({ filter: "mine", limit: 100000 });

  const splitHeaders = await splitRepo.getListSplits({ includeArchived: true, limit: 100000 });
  const splitsFull = await Promise.all(splitHeaders.map((s) => splitRepo.getSplit(s.id)));
  const activeSplitId = await splitRepo.getActiveSplitId();

  const sessions = await workoutRepo.listAllSessions();

  const progressionConfig = await progressionRepo.getConfig();
  const progressionStates = await progressionRepo.listExerciseStates();

  return {
    version: EXPORT_VERSION,
    exportedAtMs: Date.now(),
    profile: get(profile),
    exercises,
    splits: {
      splits: splitsFull.filter((s): s is WorkoutSplit => s !== null),
      activeSplitId,
    },
    sessions,
    progression: {
      config: progressionConfig,
      states: progressionStates,
    },
  };
}

export async function downloadExport(data: ExportData): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  const date = new Date(data.exportedAtMs).toISOString().slice(0, 10);
  await saveTextFile(`logit-backup-${date}.json`, json);
}
