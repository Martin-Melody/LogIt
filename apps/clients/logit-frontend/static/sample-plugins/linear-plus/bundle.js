export const pluginBundle = {
  formatVersion: 1,
  pluginId: "sample.progression.linear-plus",
  family: "progression-algorithm",
  entryExport: "algorithm",
};

export const algorithm = {
  id: "sample.progression.linear-plus",
  name: "Linear Plus",
  description:
    "A sample progression algorithm that increases the last working weight by a fixed amount.",
  author: "Logit Samples",
  defaultState: {
    baseWeight: 20,
    incrementKg: 2.5,
    reps: 8,
  },
  suggest(input) {
    const state = input.state || {};
    const incrementKg = Number(state.incrementKg ?? 2.5) || 2.5;
    const reps = Number(state.reps ?? 8) || 8;
    const baseWeight = Number(state.baseWeight ?? 20) || 20;

    const mostRecentSet = input.history[0]?.sets[0];
    const lastWeight = mostRecentSet && Number.isFinite(mostRecentSet.weight)
      ? Number(mostRecentSet.weight)
      : baseWeight;
    const nextWeight = Math.max(0, lastWeight + incrementKg);

    return {
      sets: [
        {
          reps,
          weight: nextWeight,
        },
      ],
      nextState: {
        ...state,
        baseWeight,
        incrementKg,
        reps,
        lastWeight: nextWeight,
      },
      label: "Linear Plus",
      notes: `Increase from ${lastWeight}kg to ${nextWeight}kg.`,
    };
  },
};
