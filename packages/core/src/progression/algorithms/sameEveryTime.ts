import type { MobilityProgressionAlgorithm, SuggestedMobilitySet } from "../../domain/mobilityProgression";

/**
 * "Same every time": no progression. Last session's holds (or reps, and load) again, side by
 * side; the first time, 30-second holds (or 10 reps). For people who just want their routine.
 * The default stays Linear mobility (Martin, 2026-11-20); this is one tap away on a drill.
 */
export const SAME_EVERY_TIME_ID = "same-every-time";

type Prefs = { holdSec: number; reps: number; setsPerSide: number };
const DEFAULT_PREFERENCES: Prefs = { holdSec: 30, reps: 10, setsPerSide: 2 };

export const sameEveryTime: MobilityProgressionAlgorithm = {
  id: SAME_EVERY_TIME_ID,
  name: "Same every time",
  description: "The same holds every session: last time's, or 30 seconds each to start. Nothing changes unless you change it.",
  author: "Logit",
  defaultState: null,
  defaultPreferences: DEFAULT_PREFERENCES,
  preferencesSchema: [
    { key: "holdSec", label: "Hold", description: "For a drill done for the first time.", type: "number", default: 30, min: 5, max: 300, step: 5, unit: "s" },
    { key: "reps", label: "Reps", description: "For a rep drill done for the first time.", type: "number", default: 10, min: 1, max: 50, step: 1, unit: "reps" },
    { key: "setsPerSide", label: "Sets", description: "Per side for one-sided drills, for the first time.", type: "number", default: 2, min: 1, max: 6, step: 1, unit: "sets" },
  ],
  suggest(input) {
    const prefs = { ...DEFAULT_PREFERENCES, ...((input.userPreferences ?? {}) as Partial<Prefs>) };
    const last = input.history.find((h) => h.sets.some((s) => s.completed !== false));
    if (last) {
      const done = last.sets.filter((s) => s.completed !== false);
      const sets: SuggestedMobilitySet[] = done.map((s) => ({
        ...(s.side ? { side: s.side } : {}),
        ...(input.drill.metric === "hold" ? { durationSec: s.durationSec ?? s.targetSec ?? prefs.holdSec } : { reps: s.reps ?? prefs.reps }),
        ...(s.loadKg ? { loadKg: s.loadKg } : {}),
      }));
      const first = sets[0];
      const what = first?.durationSec != null ? `${first.durationSec} s` : `${first?.reps ?? prefs.reps} reps`;
      return { sets, nextState: null, label: `Same as last time: ${what}` };
    }
    const one = input.drill.metric === "hold" ? { durationSec: prefs.holdSec } : { reps: prefs.reps };
    const sides = input.drill.perSide ? (["left", "right"] as const) : [undefined];
    const sets: SuggestedMobilitySet[] = [];
    for (let i = 0; i < prefs.setsPerSide; i++) for (const side of sides) sets.push({ ...(side ? { side } : {}), ...one });
    return { sets, nextState: null, label: input.drill.metric === "hold" ? `${prefs.holdSec} s holds` : `${prefs.reps} reps` };
  },
};
