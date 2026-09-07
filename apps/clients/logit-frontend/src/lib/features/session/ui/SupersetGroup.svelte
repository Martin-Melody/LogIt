<script lang="ts">
  import { GripVertical, Link2Off, Plus } from "lucide-svelte";
  import type { SessionBlock, WorkoutSession } from "@logit/core/domain/workout";
  import { addSupersetRound, ungroupSuperset } from "@logit/core/domain/workout";
  import type { GripAction } from "$lib/features/session/blocks/types";
  import BlockHost from "$lib/features/session/blocks/BlockHost.svelte";
  import { reveal } from "$lib/transitions";

  const {
    supersetId,
    blocks,
    saving = false,
    dragging = false,
    groupGripAction,
    onMutate,
    onDeleteBlock,
  } = $props<{
    supersetId: string;
    blocks: SessionBlock[];
    saving?: boolean;
    dragging?: boolean;
    groupGripAction: GripAction;
    onMutate: (updater: (s: WorkoutSession) => WorkoutSession) => Promise<void>;
    onDeleteBlock: (blockId: string) => void | Promise<void>;
  }>();

  const noopGrip: GripAction = () => ({ destroy() {} });

  const roundCount = $derived(
    Math.max(
      0,
      ...blocks.map((b: SessionBlock) =>
        b.type === "strength" ? (b.data as { sets: unknown[] }).sets.length : 0,
      ),
    ),
  );
</script>

<div class="border-y border-primary/30 bg-primary/[0.03] transition-opacity {dragging ? 'opacity-50' : ''}">
  <div class="flex items-center gap-2 px-3 py-1.5">
    <button
      type="button"
      class="shrink-0 h-6 w-6 flex items-center justify-center rounded text-primary/70 cursor-grab active:cursor-grabbing touch-none"
      style="touch-action: none"
      use:groupGripAction
      aria-label="Drag superset to reorder"
      tabindex="-1"
      disabled={saving}
    >
      <GripVertical class="h-3.5 w-3.5" />
    </button>
    <span class="text-xs font-semibold text-primary uppercase tracking-wide">Superset</span>
    <span class="text-xs text-muted-foreground">
      {blocks.length} exercises{roundCount > 0 ? ` · ${roundCount} round${roundCount === 1 ? "" : "s"}` : ""}
    </span>
    <button
      type="button"
      class="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      onclick={() => onMutate((s: WorkoutSession) => ungroupSuperset(s, supersetId))}
      disabled={saving}
    >
      <Link2Off class="h-3.5 w-3.5" /> Ungroup
    </button>
  </div>

  <div class="ml-3 border-l-2 border-primary/30">
    {#each blocks as block, i (block.id)}
      <div transition:reveal>
        <BlockHost
          type={block.type}
          blockId={block.id}
          data={block.data}
          {saving}
          grouped
          restsOnComplete={i === blocks.length - 1}
          gripAction={noopGrip}
          onDelete={() => onDeleteBlock(block.id)}
          {onMutate}
        />
      </div>
    {/each}
  </div>

  <button
    type="button"
    class="w-full px-3 py-2 text-xs font-medium text-primary text-left hover:bg-primary/5 disabled:opacity-40"
    onclick={() => onMutate((s: WorkoutSession) => addSupersetRound(s, supersetId))}
    disabled={saving}
  >
    <Plus class="inline h-3.5 w-3.5 -mt-0.5" /> Add round
  </button>
</div>
