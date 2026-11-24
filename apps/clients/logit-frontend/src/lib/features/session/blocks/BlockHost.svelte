<script lang="ts">
  import { getBlockDef } from "./registry";
  import type { GripAction } from "./types";
  import type { WorkoutSession } from "@logit/core/domain/workout";

  const {
    type,
    blockId,
    data,
    saving,
    grouped = false,
    groupRestMs,
    round,
    roundLabel,
    stage,
    gripAction,
    onGroup,
    onReorder,
    onDelete,
    onMutate,
  } = $props<{
    type: string;
    blockId: string;
    data: unknown;
    saving: boolean;
    grouped?: boolean;
    groupRestMs?: number;
    round?: number;
    roundLabel?: string;
    stage?: import("$lib/features/session/stage").BlockStage;
    gripAction: GripAction;
    onGroup?: () => void;
    onReorder?: () => void;
    onDelete: () => void | Promise<void>;
    onMutate: (updater: (session: WorkoutSession) => WorkoutSession, opts?: { auto?: boolean }) => Promise<void>;
  }>();

  const def = $derived(getBlockDef(type));
</script>

{#if def}
  {@const BlockComponent = def.component}
  <BlockComponent
    {blockId}
    blockType={type}
    {data}
    {saving}
    {grouped}
    {groupRestMs}
    {round}
    {roundLabel}
    {stage}
    {gripAction}
    {onGroup}
    {onReorder}
    {onDelete}
    {onMutate}
  />
{:else}
  <div class="border-t border-destructive/30 px-3 py-2 text-xs text-destructive">
    Unknown block type: {type}
  </div>
{/if}
