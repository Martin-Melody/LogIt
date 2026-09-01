export const pluginBundle = {
  formatVersion: 1,
  pluginId: "com.demo.linear",
  family: "progression-algorithm",
  entryExport: "algorithm",
};

export const algorithm = {
  id: "com.demo.linear",
  name: "Linear Demo",
  description: "Adds a fixed increment each session.",
  defaultState: { increment: 2.5 },
  suggest(input) {
    const inc = Number(input.state?.increment ?? 2.5);
    const last = Number(input.history?.[0]?.sets?.[0]?.weight ?? 20);
    return { sets: [{ reps: 8, weight: last + inc }], nextState: input.state ?? {} };
  },
};
