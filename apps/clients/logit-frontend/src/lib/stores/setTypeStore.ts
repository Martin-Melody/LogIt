import { writable, get } from "svelte/store";
import type { SetTypeOption } from "$lib/data/types";
import { getSetTypes } from "$lib/usecases/getSetTypes";

type SetTypesState = {
  loading: boolean;
  error: string | null;
  options: SetTypeOption[];
  loaded: boolean;
};

function createSetTypesStore() {
  const store = writable<SetTypesState>({
    loading: false,
    error: null,
    options: [],
    loaded: false,
  });

  async function load(force = false) {
    const snapshot = get(store); // ✅ type-safe

    if (!force && snapshot.loaded) return;
    if (snapshot.loading) return; // optional: prevent duplicate inflight loads

    store.update((s) => ({ ...s, loading: true, error: null }));

    try {
      const options = await getSetTypes();
      store.set({ loading: false, error: null, options, loaded: true });
    } catch (e) {
      store.set({
        loading: false,
        error: e instanceof Error ? e.message : "Failed to load set types",
        options: [],
        loaded: false,
      });
    }
  }

  function clear() {
    store.set({ loading: false, error: null, options: [], loaded: false });
  }

  return { subscribe: store.subscribe, load, clear };
}

export const setTypesStore = createSetTypesStore();
