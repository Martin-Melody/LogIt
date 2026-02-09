import { writable } from "svelte/store";
import { getWorkoutRepo } from "$lib/data/repoProvider";
import type { SetTypeOption } from "$lib/data/types";

function createSetTypesStore() {
  const { subscribe, set, update } = writable({
    loading: false,
    options: [] as SetTypeOption[],
    error: null as string | null,
    loaded: false,
  });

  return {
    subscribe,
    async load() {
      update((s) => ({ ...s, loading: true, error: null }));
      try {
        const options = await getWorkoutRepo().getSetTypes();
        set({ loading: false, options, error: null, loaded: true });
      } catch (e) {
        update((s) => ({
          ...s,
          loading: false,
          error: e instanceof Error ? e.message : "Failed to load set types",
        }));
      }
    },
  };
}

export const setTypesStore = createSetTypesStore();
