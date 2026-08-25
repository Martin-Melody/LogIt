import { writable } from "svelte/store";
import type { Exercise } from "@logit/core/domain/exercise";
import { getExerciseRepo } from "$lib/data/repoProvider";
import { pushExercise } from "$lib/sync/syncService";

type ExercisesState = {
  query: string;
  items: Exercise[];
  loading: boolean;
  error: string | null;
};

function createExercisesStore() {
  const { subscribe, update, set } = writable<ExercisesState>({
    query: "",
    items: [],
    loading: false,
    error: null,
  });

  async function refresh(query?: string) {
    update((s) => ({ ...s, loading: true, error: null }));
    try {
      const q = query ?? "";
      const items = await getExerciseRepo().list({ query: q, limit: 50 });
      update((s) => ({ ...s, query: q, items, loading: false }));
    } catch (e) {
      update((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : "Failed to load exercises",
      }));
    }
  }

  async function create(name: string) {
    const ex = await getExerciseRepo().create(name);
    pushExercise(ex);
    await refresh(name);
    return ex;
  }

  function clear() {
    set({ query: "", items: [], loading: false, error: null });
  }

  return { subscribe, refresh, create, clear };
}

export const exercisesStore = createExercisesStore();
