import { writable } from "svelte/store";
import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
import { getSplit } from "$lib/usecases/Splits/getSplit";
import { getActiveSplit } from "$lib/usecases/Splits/getActiveSplit";
import { browser } from "$app/environment";


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

// Reload whenever a background sync completes, not just at the touch-points that already
// call load() explicitly (app init, splits UI edits). Without this, gatherWidgetInput()'s
// "session"/"todaysPlan" needs (Today's Plan, Quick Start) read get(activeSplit) — a cached
// store value, not a fresh repo query like every other widget's own data — so if the active
// split id itself only arrived *after* this store's one initial load (e.g. it just synced
// down from the server for the first time on a fresh install), these two stayed stuck on
// "no split" even after WidgetCard.svelte's lastSyncedAt-triggered reload re-ran, since that
// reload gathered fresh input for everything except this cached value.
if (browser) {
  let seenLastSyncedAt: number | null = null;
  void import("$lib/sync/syncService").then(({ lastSyncedAt }) => {
    lastSyncedAt.subscribe((t) => {
      if (seenLastSyncedAt === null) {
        seenLastSyncedAt = t;
        return;
      }
      if (t !== seenLastSyncedAt) {
        seenLastSyncedAt = t;
        void activeSplit.load();
      }
    });
  });
}

