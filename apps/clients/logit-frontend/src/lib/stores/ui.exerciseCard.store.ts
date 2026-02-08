import { writable } from "svelte/store";

type ExerciseCardUiState = {
  expandedByExerciseId: Record<string, boolean>;
};

const KEY = "logit:ui:exercise-cards:v1";

function load(): ExerciseCardUiState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { expandedByExerciseId: {} };
    const parsed = JSON.parse(raw) as ExerciseCardUiState;
    return {
      expandedByExerciseId: parsed?.expandedByExerciseId ?? {},
    };
  } catch {
    return { expandedByExerciseId: {} };
  }
}

function persist(state: ExerciseCardUiState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

function createExerciseCardsUiStore() {
  const store = writable<ExerciseCardUiState>(load());

  store.subscribe((s) => persist(s));

  return {
    subscribe: store.subscribe,

    isExpanded(exerciseId: string, defaultValue = true) {
      return (getCurrent().expandedByExerciseId[exerciseId] ??
        defaultValue) as boolean;
    },

    setExpanded(exerciseId: string, expanded: boolean) {
      store.update((s) => ({
        ...s,
        expandedByExerciseId: {
          ...s.expandedByExerciseId,
          [exerciseId]: expanded,
        },
      }));
    },

    toggle(exerciseId: string, defaultValue = true) {
      store.update((s) => {
        const current = s.expandedByExerciseId[exerciseId] ?? defaultValue;
        return {
          ...s,
          expandedByExerciseId: {
            ...s.expandedByExerciseId,
            [exerciseId]: !current,
          },
        };
      });
    },

    reset() {
      store.set({ expandedByExerciseId: {} });
    },
  };

  function getCurrent() {
    let current!: ExerciseCardUiState;
    store.subscribe((v) => (current = v))();
    return current;
  }
}

export const exerciseCardsUi = createExerciseCardsUiStore();
