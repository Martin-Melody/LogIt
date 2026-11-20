import { registerBlock } from "./registry";
import StrengthBlock from "./strength/StrengthBlock.svelte";
import CardioBlock from "./cardio/CardioBlock.svelte";
import MobilityBlock from "./mobility/MobilityBlock.svelte";
import PluginBlock from "./plugin/PluginBlock.svelte";

registerBlock({
  type: "strength",
  label: "Strength exercise",
  description: "Track sets with reps and weight.",
  component: StrengthBlock,
});

registerBlock({
  type: "cardio",
  label: "Cardio / Endurance",
  description: "Track intervals with duration and distance.",
  component: CardioBlock,
});

registerBlock({
  type: "mobility",
  label: "Mobility / Stretching",
  description: "Progressively overload holds or reps, per side.",
  component: MobilityBlock,
});

// Every plugin block (`plugin:<id>`); the Add block sheet lists installed plugins itself.
registerBlock({
  type: "plugin:*",
  label: "Plugin block",
  component: PluginBlock,
});

export { registerBlock, getBlockDef, listBlockDefs } from "./registry";
export type { SessionBlockDefinition, BlockBaseProps } from "./types";
