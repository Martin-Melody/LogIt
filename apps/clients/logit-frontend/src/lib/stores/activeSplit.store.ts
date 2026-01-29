import { writable } from "svelte/store";
import type { WorkoutSplit } from "$lib/domain/WorkoutSplit";
import { getSplit } from "$lib/usecases/Splits/getSplit";
import { getActiveSplit } from "$lib/usecases/Splits/getActiveSplit";


type ActiveSplitStore = {
  subscribe: (run: (value: WorkoutSplit | null) => void) => () => void;
  load: () => Promise<WorkoutSplit | null>;
  set: (split: WorkoutSplit | null) => void;
  clear: () => void;
};

function createActiveSplitStore(): ActiveSplitStore {
  const store = writable<WorkoutSplit | null>(null);
  let loadToken = 0;

  return {
    subscribe: store.subscribe,

    async load() {
      const token = ++loadToken;

      const id = await getActiveSplit();
      if (!id) {
        if (token === loadToken) store.set(null);
        return null;
      }

      const split = await getSplit(id);

      if (token !== loadToken) return split;

      store.set(split);
      return split;
    },

    set(split) {
      store.set(split);
    },

    clear() {
      store.set(null);
    },
  };
}

export const activeSplit = createActiveSplitStore();

