import { browser } from "$app/environment";
import { writable } from "svelte/store";
import { isNativePlatform } from "$lib/platform/isNative";
import { apiClient } from "$lib/api/client";
import { getServerMode } from "$lib/api/serverConfig";

const STORAGE_KEY = "logit:onboarding:v1";

type OnboardingState = { completed: boolean; step: number };

let _nativeRepo: typeof import("$lib/data/localAccountRepo") | null = null;
let _getOwnerId: (() => string | null) | null = null;

function loadFromStorage(): OnboardingState {
  if (!browser) return { completed: true, step: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { completed: false, step: 0 };
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return { completed: parsed.completed === true, step: parsed.step ?? 0 };
  } catch {
    return { completed: false, step: 0 };
  }
}

function createOnboardingStore() {
  const store = writable<OnboardingState>(loadFromStorage());

  function persist(state: OnboardingState) {
    if (!browser) return;
    if (isNativePlatform() && _nativeRepo && _getOwnerId) {
      const ownerId = _getOwnerId();
      if (ownerId) {
        _nativeRepo.updateLocalAccount(ownerId, {
          onboardingCompleted: state.completed,
          onboardingStep: state.step,
        }).catch(console.error);
      }
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }

  return {
    subscribe: store.subscribe,

    /** Called by initRepos() after the active account is resolved. */
    init(
      account: { onboardingCompleted: boolean; onboardingStep: number },
      nativeRepo: typeof import("$lib/data/localAccountRepo"),
      getOwnerId: () => string | null,
    ) {
      _nativeRepo = nativeRepo;
      _getOwnerId = getOwnerId;
      store.set({ completed: account.onboardingCompleted, step: account.onboardingStep });
    },

    setStep(step: number) {
      store.update((s) => {
        const next = { ...s, step };
        persist(next);
        return next;
      });
    },

    complete() {
      const next: OnboardingState = { completed: true, step: 0 };
      store.set(next);
      persist(next);
      if (browser && getServerMode() !== "offline" && apiClient.isAuthenticated()) {
        apiClient.updateOnboardingCompleted(true).catch(console.error);
      }
    },

    reset() {
      const next: OnboardingState = { completed: false, step: 0 };
      store.set(next);
      if (isNativePlatform()) {
        persist(next);
      } else if (browser) {
        localStorage.removeItem(STORAGE_KEY);
      }
    },
  };
}

export const onboarding = createOnboardingStore();
