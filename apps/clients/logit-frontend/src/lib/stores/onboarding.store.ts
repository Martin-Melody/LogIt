import { browser } from "$app/environment";
import { writable } from "svelte/store";

const STORAGE_KEY = "logit:onboarding:v1";

type OnboardingState = { completed: boolean; step: number };

function load(): OnboardingState {
  if (!browser) return { completed: true, step: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { completed: false, step: 0 };
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      completed: parsed.completed === true,
      step: parsed.step ?? 0,
    };
  } catch {
    return { completed: false, step: 0 };
  }
}

function save(state: OnboardingState) {
  if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createOnboardingStore() {
  const store = writable<OnboardingState>(load());

  return {
    subscribe: store.subscribe,
    setStep(step: number) {
      store.update((s) => {
        const next = { ...s, step };
        save(next);
        return next;
      });
    },
    complete() {
      const next: OnboardingState = { completed: true, step: 0 };
      store.set(next);
      save(next);
    },
    reset() {
      const next: OnboardingState = { completed: false, step: 0 };
      store.set(next);
      if (browser) localStorage.removeItem(STORAGE_KEY);
    },
  };
}

export const onboarding = createOnboardingStore();
