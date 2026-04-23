import { browser } from "$app/environment";
import { writable } from "svelte/store";

export type UserProfile = {
  name: string;
  height: number | null;
  heightUnit: "cm" | "in";
  weight: number | null;
  weightUnit: "kg" | "lbs";
};

const STORAGE_KEY = "logit:profile:v1";

const defaultProfile: UserProfile = {
  name: "",
  height: null,
  heightUnit: "cm",
  weight: null,
  weightUnit: "kg",
};

function load(): UserProfile {
  if (!browser) return { ...defaultProfile };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultProfile };
    return { ...defaultProfile, ...(JSON.parse(raw) as Partial<UserProfile>) };
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
