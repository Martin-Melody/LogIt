import { registerBlock } from "./registry";
import StrengthBlock from "./strength/StrengthBlock.svelte";

registerBlock({
  type: "strength",
  label: "Strength exercise",
  description: "Track sets with reps and weight.",
  component: StrengthBlock,
});

export { registerBlock, getBlockDef, listBlockDefs } from "./registry";
export type { SessionBlockDefinition, BlockBaseProps } from "./types";
