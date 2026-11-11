<script lang="ts">
  import { GripVertical, Link2Off, Plus } from "lucide-svelte";
  import type { SessionBlock, WorkoutSession } from "@logit/core/domain/workout";
  import { addSupersetRound, blockGroup, groupLabel, supersetRoundCount, ungroupSuperset } from "@logit/core/domain/workout";
  import type { GripAction } from "$lib/features/session/blocks/types";
  import BlockHost from "$lib/features/session/blocks/BlockHost.svelte";
  import { reveal } from "$lib/transitions";

  const {
    supersetId,
    blocks,
    saving = false,
    dragging = false,
    draggingBlockId = null,
    groupGripAction,
    memberGripAction,
    onGroupBlock,
    onMutate,
    onDeleteBlock,
  } = $props<{
    supersetId: string;
    blocks: SessionBlock[];
    saving?: boolean;
    dragging?: boolean;
    groupGripAction: GripAction;
    /** The member being dragged within the group, faded while it moves. */
    draggingBlockId?: string | null;
    /** Grip for one member: drags it within the group. */
    memberGripAction?: (blockId: string) => GripAction;
    /** Opens "Superset / circuit with…" for a member (adds to this group). */
    onGroupBlock?: (blockId: string) => void;
    onMutate: (updater: (s: WorkoutSession) => WorkoutSession) => Promise<void>;
    onDeleteBlock: (blockId: string) => void | Promise<void>;
  }>();

  const noopGrip: GripAction = () => ({ destroy() {} });

  // "Superset" for two, "Circuit" for three or more, unless it was given a name.
  const label = $derived(groupLabel(blocks.length, blockGroup(blocks[0])?.label));

  // Strength sets and mobility sets (an L/R pair is one round); cardio doesn't count.
  const roundCount = $derived(supersetRoundCount(blocks));
</script>

<div class="border-y border-primary/30 bg-primary/[0.03] transition-opacity {dragging ? 'opacity-50' : ''}">
  <div class="flex items-center gap-2 pl-1 pr-1">
    <button
      type="button"
      class="shrink-0 h-11 w-9 flex items-center justify-center rounded-md text-primary/70 cursor-grab active:cursor-grabbing touch-none"
      style="touch-action: none"
      use:groupGripAction
      aria-label="Drag {label.toLowerCase()} to reorder"
      tabindex="-1"
      disabled={saving}
    >
      <GripVertical class="h-4 w-4" />
    </button>
    <span class="text-xs font-medium text-primary uppercase tracking-wide">{label}</span>
    <span class="text-xs text-muted-foreground">
      {blocks.length} exercises{roundCount > 0 ? ` · ${roundCount} round${roundCount === 1 ? "" : "s"}` : ""}
    </span>
    <button
      type="button"
      class="ml-auto flex h-11 items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
      onclick={() => onMutate((s: WorkoutSession) => ungroupSuperset(s, supersetId))}
      disabled={saving}
    >
      <Link2Off class="h-3.5 w-3.5" /> Ungroup
    </button>
  </div>

  <div class="ml-3 border-l-2 border-primary/30">
    {#each blocks as block, i (block.id)}
      <div class="transition-opacity {draggingBlockId === block.id ? 'opacity-50' : ''}" transition:reveal>
        <BlockHost
          type={block.type}
          blockId={block.id}
          data={block.data}
          {saving}
          grouped
          restsOnComplete={i === blocks.length - 1}
          gripAction={memberGripAction ? memberGripAction(block.id) : noopGrip}
          onGroup={onGroupBlock ? () => onGroupBlock(block.id) : undefined}
          onDelete={() => onDeleteBlock(block.id)}
          {onMutate}
        />
      </div>
    {/each}
  </div>

  <button
    type="button"
    class="w-full h-11 px-3 text-xs font-medium text-primary text-left hover:bg-primary/5 disabled:opacity-40"
    onclick={() => onMutate((s: WorkoutSession) => addSupersetRound(s, supersetId))}
    disabled={saving}
  >
    <Plus class="inline h-3.5 w-3.5 -mt-0.5" /> Add round
  </button>
</div>
