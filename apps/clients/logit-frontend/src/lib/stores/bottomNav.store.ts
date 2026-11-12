import { writable } from "svelte/store";

/**
 * Height in px of the layout's footer (the bottom nav plus the safe-area inset), 0 while
 * the nav is hidden. Bars that are `position: fixed` to the bottom of the screen (the
 * workout's finish bar) sit this far up so they stay above the nav.
 */
export const bottomNavHeight = writable(0);
