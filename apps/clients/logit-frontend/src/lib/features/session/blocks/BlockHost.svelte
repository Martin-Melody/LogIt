<script lang="ts">
  import { getBlockDef } from "./registry";
  import type { BlockBaseProps } from "./types";
  import type { WorkoutSession } from "$lib/domain/workout";

  const {
    type,
    data,
    saving,
    canMoveUp,
    canMoveDown,
    onMoveUp,
    onMoveDown,
    onDelete,
    onMutate,
  } = $props<{
    type: string;
    data: unknown;
    saving: boolean;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onMoveUp: () => void | Promise<void>;
    onMoveDown: () => void | Promise<void>;
    onDelete: () => void | Promise<void>;
    onMutate: (updater: (session: WorkoutSession) => WorkoutSession) => Promise<void>;
  }>();

  const def = $derived(getBlockDef(type));
</script>

{#if def}
  {@const BlockComponent = def.component}
  <BlockComponent
    {data}
    {saving}
    {canMoveUp}
    {canMoveDown}
    {onMoveUp}
    {onMoveDown}
    {onDelete}
    {onMutate}
  />
{:else}
  <div class="border-t border-destructive/30 px-3 py-2 text-xs text-destructive">
    Unknown block type: {type}
  </div>
{/if}
