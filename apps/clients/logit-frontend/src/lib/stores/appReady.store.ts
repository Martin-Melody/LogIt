import { writable } from "svelte/store";

export const appReady = writable(false);
export const appInitError = writable<string | null>(null);
