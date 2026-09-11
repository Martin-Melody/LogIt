export const pluginBundle = {
  formatVersion: 1,
  pluginId: "com.demo.mobility",
  family: "mobility-progression",
  entryExport: "algorithm",
};

export const algorithm = {
  id: "com.demo.mobility",
  name: "Mobility Demo",
  description: "Adds a few seconds of hold time each session.",
  defaultState: { step: 5 },
  suggest(input) {
    const step = Number(input.state?.step ?? 5);
    const last = Number(input.history?.[0]?.sets?.[0]?.durationSec ?? 20);
    return { sets: [{ durationSec: last + step }], nextState: input.state ?? {} };
  },
};
