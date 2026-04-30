<script lang="ts">
  import { getBlockDef } from "./registry";
  import type { GripAction } from "./types";
  import type { WorkoutSession } from "$lib/domain/workout";

  const {
    type,
    blockId,
    data,
    saving,
    gripAction,
    onDelete,
    onMutate,
  } = $props<{
    type: string;
    blockId: string;
    data: unknown;
    saving: boolean;
    gripAction: GripAction;
    onDelete: () => void | Promise<void>;
    onMutate: (updater: (session: WorkoutSession) => WorkoutSession) => Promise<void>;
  }>();

  const def = $derived(getBlockDef(type));
</script>

{#if def}
  {@const BlockComponent = def.component}
  <BlockComponent
    {blockId}
    {data}
    {saving}
    {gripAction}
    {onDelete}
    {onMutate}
  />
{:else}
  <div class="border-t border-destructive/30 px-3 py-2 text-xs text-destructive">
    Unknown block type: {type}
  </div>
{/if}
