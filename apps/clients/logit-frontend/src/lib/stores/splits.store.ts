import type { ListSplitsOptions } from "$lib/data/splitRepo";
import type { WorkoutSplit } from "$lib/domain/WorkoutSplit";
import { writable } from "svelte/store";
import { setActiveSplit } from "$lib/usecases/Splits/setActiveSplit";
import { listSplits } from "$lib/usecases/Splits/listSplits";

type SplitsStore = {
  subscribe: (run: (value: WorkoutSplit[]) => void) => () => void;
  refresh: (options?: ListSplitsOptions) => Promise<WorkoutSplit[]>;
  clear: () => void;
  setActive: (id: string | null) => Promise<void>;
};

function createSplitStore(): SplitsStore {
  const store = writable<WorkoutSplit[]>([]);
  let refreshToken = 0;
  return {
    subscribe: store.subscribe,

    async refresh(options?: ListSplitsOptions) {
      const token = ++refreshToken;

      const splits = await listSplits(options);

      if (token !== refreshToken) return splits;

      store.set(splits);
      return splits;
    },

    clear() {
      store.set([]);
    },

    async setActive(id: string | null) {
      await setActiveSplit(id);

      await this.refresh();
    },
  };
}

export const splits = createSplitStore();
