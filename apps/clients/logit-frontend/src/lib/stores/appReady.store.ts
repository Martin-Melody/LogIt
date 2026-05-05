import { writable } from "svelte/store";

export const appReady = writable(false);
export const appInitError = writable<string | null>(null);
/** True on native when accounts exist but no account is currently active (user logged out). */
export const needsAccountAuth = writable(false);
