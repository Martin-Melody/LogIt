import {
  getExerciseRepo,
  getSplitRepo,
  getWorkoutRepo,
  getProgressionRepo,
} from "$lib/data/repoProvider";
import { profile } from "$lib/stores/profile.store";
import { type ExportData, EXPORT_VERSION } from "./exportData";

export type { ExportData };

export type ImportCategories = {
  profile: boolean;
  exercises: boolean;
  splits: boolean;
  sessions: boolean;
  progression: boolean;
};

export function parseExportFile(json: string): ExportData {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Invalid file: could not parse JSON.");
  }

  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid file: expected a JSON object.");
  }

  const d = data as Record<string, unknown>;

  if (d.version !== EXPORT_VERSION) {
    throw new Error(
      `Unsupported backup version: ${String(d.version)}. Expected version ${EXPORT_VERSION}.`,
    );
  }

  return d as unknown as ExportData;
}

export async function importData(
  data: ExportData,
  categories: ImportCategories,
): Promise<void> {
  const exerciseRepo = getExerciseRepo();
  const splitRepo = getSplitRepo();
  const workoutRepo = getWorkoutRepo();
  const progressionRepo = getProgressionRepo();

  if (categories.profile && data.profile) {
    profile.save(data.profile);
  }

  if (categories.exercises && data.exercises) {
    await exerciseRepo.clearAll();
    for (const exercise of data.exercises) {
      await exerciseRepo.saveExercise(exercise);
    }
  }

  if (categories.splits && data.splits) {
    const existing = await splitRepo.getListSplits({ includeArchived: true, limit: 100000 });
    for (const split of existing) {
      await splitRepo.deleteSplit(split.id);
    }
    for (const split of data.splits.splits) {
      await splitRepo.saveSplit(split);
    }
    await splitRepo.setActiveSplitId(data.splits.activeSplitId);
  }

  if (categories.sessions && data.sessions) {
    await workoutRepo.clearAllSessions();
    for (const session of data.sessions) {
      await workoutRepo.saveSession(session);
    }
  }

  if (categories.progression && data.progression) {
    await progressionRepo.clearConfig();
    await progressionRepo.clearStates();
    if (data.progression.config) {
      await progressionRepo.saveConfig(data.progression.config);
    }
    for (const state of data.progression.states) {
      await progressionRepo.saveExerciseState(state);
    }
  }
}
