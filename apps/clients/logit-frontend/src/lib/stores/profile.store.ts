import { browser } from "$app/environment";
import { writable } from "svelte/store";

export type UserProfile = {
  name: string;
  height: number | null;
  heightUnit: "cm" | "in";
  weight: number | null;
  weightUnit: "kg" | "lbs";
  blocksCollapsedByDefault: boolean;
  // Keyed by set type string so plugin-added types slot in without schema changes.
  // undefined value (or absent key) means no auto-timer for that type.
  restDefaults: Record<string, number | undefined>;
};

const STORAGE_KEY = "logit:profile:v1";

const defaultRestDefaults: Record<string, number | undefined> = {
  normal:  90_000,
  warmup:  undefined,
  dropset: 30_000,
  amrap:   undefined,
  failure: 90_000,
};

const defaultProfile: UserProfile = {
  name: "",
  height: null,
  heightUnit: "cm",
  weight: null,
  weightUnit: "kg",
  blocksCollapsedByDefault: true,
  restDefaults: defaultRestDefaults,
};

function load(): UserProfile {
  if (!browser) return { ...defaultProfile };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultProfile };
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return {
      ...defaultProfile,
      ...parsed,
      // Deep-merge so new set types added to defaults reach existing users.
      restDefaults: { ...defaultRestDefaults, ...(parsed.restDefaults ?? {}) },
    };
  } catch {
    return { ...defaultProfile };
  }
}

function createProfileStore() {
  const store = writable<UserProfile>(load());

  return {
    subscribe: store.subscribe,
    save(patch: Partial<UserProfile>) {
      store.update((p) => {
        const next = { ...p, ...patch };
        if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
  };
}

export const profile = createProfileStore();
