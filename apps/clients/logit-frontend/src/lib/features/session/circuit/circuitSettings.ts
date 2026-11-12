// The app-wide circuit defaults (Settings › Session). They live in the profile's
// `restDefaults` next to the per-set-type rests, under their own keys, so they sync and
// persist with them without a new column. 0 means off; missing means the built-in default.

import { DEFAULT_CIRCUIT_SETTINGS, type CircuitDefaults } from "@logit/core/domain/circuit";

export const GET_READY_KEY = "circuit.getReady";
export const BETWEEN_EXERCISES_KEY = "circuit.betweenExercises";

export function circuitDefaultsFrom(restDefaults: Record<string, number | undefined>): CircuitDefaults {
  const getReady = restDefaults[GET_READY_KEY];
  const between = restDefaults[BETWEEN_EXERCISES_KEY];
  return {
    leadInMs: typeof getReady === "number" && getReady > 0 ? getReady : DEFAULT_CIRCUIT_SETTINGS.leadInMs,
    memberRestMs: typeof between === "number" && between >= 0 ? between : DEFAULT_CIRCUIT_SETTINGS.memberRestMs,
  };
}

/** "Off", "15 s", "1 min", "1:30". */
export function formatRestMs(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec <= 0) return "Off";
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}:${String(s).padStart(2, "0")}` : `${m} min`;
}

/** "3:05" for a duration. */
export function formatClock(ms: number): string {
  const sec = Math.round(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}
