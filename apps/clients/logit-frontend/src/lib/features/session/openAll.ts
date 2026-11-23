import { writable } from "svelte/store";

/** Bumped by the workout menu's "Open every exercise": every block opens when it changes. */
export const openAllSignal = writable(0);
