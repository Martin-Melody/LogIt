import { writable } from "svelte/store";

/**
 * Bumped whenever a habit or check-off changes anywhere in the app. Widgets that
 * read `habits` re-compute when this changes; the `/habits` page bumps it after
 * every write.
 */
export const habitsRevision = writable(0);

export function bumpHabits(): void {
  habitsRevision.update((n) => n + 1);
}
