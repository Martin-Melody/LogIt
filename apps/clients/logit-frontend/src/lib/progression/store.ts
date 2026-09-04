import { writable } from "svelte/store";

/**
 * Bumped whenever the user's progression config (which algorithm, its preferences) changes
 * anywhere in the app — same pattern as habitsRevision (features/habits/store.ts). The
 * Progression widget's data (getSuggestion(), via progressionRepo.getConfig()) is read fresh
 * from the repo every time WidgetCard.svelte reloads it, but nothing was telling it *to*
 * reload after a plain settings change (as opposed to a background sync, or the reactive
 * session/split-day signals it already watches) — so picking an algorithm in Settings saved
 * correctly but the widget kept showing its empty state until some unrelated reload happened
 * to fire. Settings' progression picker bumps this after every save.
 */
export const progressionRevision = writable(0);

export function bumpProgression(): void {
  progressionRevision.update((n) => n + 1);
}
