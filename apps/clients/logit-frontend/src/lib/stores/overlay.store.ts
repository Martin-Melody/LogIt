import { writable, derived } from "svelte/store";

const _count = writable(0);

export const overlayOpen = derived(_count, (n) => n > 0);

export function openOverlay() {
  _count.update((n) => n + 1);
}

export function closeOverlay() {
  _count.update((n) => Math.max(0, n - 1));
}
