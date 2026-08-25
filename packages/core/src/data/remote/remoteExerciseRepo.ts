import type { ExerciseRepo, ListExercisesOptions } from "../exercise/exerciseRepo";
import type { Exercise } from "../../domain/exercise";
import { syncApi } from "../../api/syncApi";

const NOT_SUPPORTED = "Not supported in read-only remote mode.";

async function fetchAllExercises(clientId?: string): Promise<Exercise[]> {
  const { exercises } = await syncApi.pullExercises(0, clientId);
  const parsed: Exercise[] = [];
  for (const entry of exercises) {
    if (entry.deletedAtMs || !entry.dataJson) continue;
    try {
      parsed.push(JSON.parse(entry.dataJson) as Exercise);
    } catch {}
  }
  return parsed;
}

/** Read-only ExerciseRepo backed by the sync API's pull endpoint. See
 * remoteWorkoutRepo.ts for the rationale. Only covers a user's own
 * (non-core) exercises — the sync endpoint never carried the shared core
 * exercise library. */
export function createRemoteExerciseRepo(clientId?: string): ExerciseRepo {
  return {
    async list(options?: ListExercisesOptions): Promise<Exercise[]> {
      let exercises = await fetchAllExercises(clientId);
      if (options?.query) {
        const q = options.query.toLowerCase();
        exercises = exercises.filter((e) => e.name.toLowerCase().includes(q));
      }
      if (options?.offset) exercises = exercises.slice(options.offset);
      if (options?.limit) exercises = exercises.slice(0, options.limit);
      return exercises;
    },

    async create(): Promise<Exercise> {
      throw new Error(NOT_SUPPORTED);
    },

    async getByName(name: string): Promise<Exercise | null> {
      const lower = name.toLowerCase();
      const exercises = await fetchAllExercises(clientId);
      return exercises.find((e) => e.name.toLowerCase() === lower) ?? null;
    },

    async getById(id: string): Promise<Exercise | null> {
      const exercises = await fetchAllExercises(clientId);
      return exercises.find((e) => e.id === id) ?? null;
    },

    async update(): Promise<Exercise> {
      throw new Error(NOT_SUPPORTED);
    },

    async remove(): Promise<void> {
      throw new Error(NOT_SUPPORTED);
    },

    async saveExercise(): Promise<void> {
      throw new Error(NOT_SUPPORTED);
    },

    async clearAll(): Promise<void> {
      throw new Error(NOT_SUPPORTED);
    },
  };
}
