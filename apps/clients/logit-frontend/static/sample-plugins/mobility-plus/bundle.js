export const pluginBundle = {
  formatVersion: 1,
  pluginId: "sample.mobility-progression.mobility-plus",
  family: "mobility-progression",
  entryExport: "algorithm",
};

// A minimal community mobility progression algorithm: add a fixed number of
// seconds to a hold (or a rep to a rep drill) every session, per side. No depth
// gate, no soft cap — deliberately simpler than the built-in "Linear mobility"
// to show the contract surface.
export const algorithm = {
  id: "sample.mobility-progression.mobility-plus",
  name: "Mobility Plus",
  description: "Adds a fixed amount of hold time or reps each session, per side.",
  author: "Logit Samples",
  defaultState: {},
  defaultPreferences: { holdStepSec: 5, repStep: 1, sets: 3 },
  preferencesSchema: [
    { key: "holdStepSec", label: "Hold step", type: "number", default: 5, min: 1, max: 30, unit: "s" },
    { key: "repStep", label: "Rep step", type: "number", default: 1, min: 1, max: 5, unit: "reps" },
    { key: "sets", label: "Sets per side", type: "number", default: 3, min: 1, max: 6, unit: "sets" },
  ],
  suggest(input) {
    const prefs = input.userPreferences || {};
    const holdStep = Number(prefs.holdStepSec ?? 5) || 5;
    const repStep = Number(prefs.repStep ?? 1) || 1;
    const count = Math.max(1, Number(prefs.sets ?? 3) || 3);
    const isHold = input.drill.metric === "hold";
    const sides = input.drill.perSide ? ["left", "right"] : [null];
    const last = input.history[0];

    const sets = [];
    const parts = [];
    for (const side of sides) {
      const sideSets = (last?.sets || []).filter((s) => (side ? s.side === side : !s.side));
      const best = sideSets.reduce(
        (m, s) => Math.max(m, isHold ? Number(s.durationSec || 0) : Number(s.reps || 0)),
        0,
      );
      const next = isHold ? (best || 15) + holdStep : (best || 5) + repStep;
      for (let i = 0; i < count; i++) {
        sets.push(side ? (isHold ? { side, durationSec: next } : { side, reps: next }) : (isHold ? { durationSec: next } : { reps: next }));
      }
      parts.push(`${next}${isHold ? "s" : ""}${side ? ` ${side[0].toUpperCase()}` : ""}`);
    }

    return { sets, nextState: {}, label: `Try ${parts.join(" · ")}` };
  },
};
