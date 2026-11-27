export const pluginBundle = { formatVersion: 1, pluginId: "app.getlogit.amrap-tm", family: "progression-algorithm", entryExport: "algorithm" };

// AMRAP training max (seed plugin): a four-week wave on a training max (TM). The last set of
// each session goes as many reps as possible; after week 3 the next cycle's TM comes from that
// set (90% of its estimated max), so a good day moves it up and a bad one doesn't stall you.
const WAVE = [
  [[0.65, 5], [0.75, 5], [0.85, 5]],
  [[0.70, 3], [0.80, 3], [0.90, 3]],
  [[0.75, 5], [0.85, 3], [0.95, 1]],
  [[0.40, 5], [0.50, 5], [0.60, 5]],
];
const round = (kg, inc) => Math.max(inc, Math.round(kg / inc) * inc);
const e1rm = (w, r) => w * (1 + r / 30);

export const algorithm = {
  id: "app.getlogit.amrap-tm",
  name: "AMRAP training max",
  description: "A four-week wave on a training max; the last set of each session is as many reps as you can, and the next cycle's max comes from it.",
  defaultState: {},
  defaultPreferences: { increment: 2.5 },
  preferencesSchema: [
    { key: "increment", label: "Round weights to", type: "number", default: 2.5, min: 0.5, max: 5, step: 0.5, unit: "kg" },
  ],

  suggest(input) {
    const inc = Number(input.userPreferences?.increment ?? 2.5) || 2.5;
    const state = { ...(input.state ?? {}) };
    const last = input.history?.[0];
    const working = (last?.sets ?? []).filter((s) => s.setType !== "warmup" && s.weight > 0 && s.reps > 0);

    // First use: what's already logged starts week 1, it doesn't count as one.
    if (state.seenMs === undefined && last) state.seenMs = last.performedAtMs;
    // A new session since we last looked: move on a week, and after week 3 reset the max.
    if (last && working.length && last.performedAtMs > (state.seenMs ?? 0)) {
      const done = state.week ?? 1;
      if (done === 3) {
        const amrap = working[working.length - 1];
        state.tm = round(e1rm(amrap.weight, amrap.reps) * 0.9, inc);
        state.lastAmrap = { weight: amrap.weight, reps: amrap.reps };
      }
      state.week = (done % 4) + 1;
      state.seenMs = last.performedAtMs;
    }
    if (!state.tm) {
      const best = input.strengthEstimate?.kg ?? (working.length ? Math.max(...working.map((s) => e1rm(s.weight, s.reps))) : 0);
      if (!best) return { sets: [], nextState: state, label: "Needs one session", notes: "Log this lift once and the training max comes from it." };
      state.tm = round(best * 0.9, inc);
    }
    const week = state.week ?? 1;
    const sets = WAVE[week - 1].map(([pct, reps], i, all) => ({
      reps,
      weight: round(state.tm * pct, inc),
      ...(i === all.length - 1 && week !== 4 ? { note: "As many reps as you can" } : {}),
    }));
    return {
      sets,
      nextState: state,
      label: week === 4 ? "Deload week" : `Week ${week} of 3`,
      notes: week === 4 ? "Light week before the next cycle." : `Training max ${state.tm} kg. Last set: ${sets[2].reps}+ reps.`,
      displayMode: "block",
      reasoning: {
        inputs: { week, trainingMaxKg: state.tm },
        computed: { topSetKg: sets[2].weight },
        confidence: state.lastAmrap ? "high" : "medium",
        verdict: state.lastAmrap ? `Max from your last AMRAP: ${state.lastAmrap.weight} kg × ${state.lastAmrap.reps}` : "Max from your best recent set",
      },
    };
  },
};
