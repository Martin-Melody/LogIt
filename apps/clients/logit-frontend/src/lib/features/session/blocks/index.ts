import { registerBlock } from "./registry";
import StrengthBlock from "./strength/StrengthBlock.svelte";
import CardioBlock from "./cardio/CardioBlock.svelte";

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

export { registerBlock, getBlockDef, listBlockDefs } from "./registry";
export type { SessionBlockDefinition, BlockBaseProps } from "./types";
