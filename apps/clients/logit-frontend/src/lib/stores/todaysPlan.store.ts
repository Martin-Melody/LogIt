import { writable } from "svelte/store";

/**
 * The page picked on the Today's plan card with ‹ ›: a date in the coming days and the
 * workout on it (`dayId: null` for a rest day). Unset = the card's default page.
 */
type DaySelection = { splitId: string; dayId: string | null; dateIso?: string } | null;

const store = writable<DaySelection>(null);

export const selectedDayOverride = { subscribe: store.subscribe };

export function selectDayOverride(splitId: string, dayId: string | null, dateIso?: string) {
  store.set({ splitId, dayId, ...(dateIso ? { dateIso } : {}) });
}

export function clearDayOverride() {
  store.set(null);
}
