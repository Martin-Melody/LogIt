import { writable } from "svelte/store";

type DaySelection = { splitId: string; dayId: string } | null;

const store = writable<DaySelection>(null);

export const selectedDayOverride = { subscribe: store.subscribe };

export function selectDayOverride(splitId: string, dayId: string) {
  store.set({ splitId, dayId });
}

export function clearDayOverride() {
  store.set(null);
}
