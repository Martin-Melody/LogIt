import { browser } from "$app/environment";
import { writable } from "svelte/store";

const STORAGE_KEY = "logit:onboarding:v1";

function isComplete(): boolean {
  if (!browser) return true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as { completed?: boolean }).completed === true : false;
  } catch {
    return false;
  }
}

function createOnboardingStore() {
  const store = writable<{ completed: boolean }>({ completed: isComplete() });

  return {
    subscribe: store.subscribe,
    complete() {
      const value = { completed: true };
      store.set(value);
      if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    },
    reset() {
      const value = { completed: false };
      store.set(value);
      if (browser) localStorage.removeItem(STORAGE_KEY);
    },
  };
}

export const onboarding = createOnboardingStore();
