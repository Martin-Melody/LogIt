<script lang="ts">
  import { GripVertical, Link2Off, Play, Plus, Timer } from "lucide-svelte";
  import type { SessionBlock, WorkoutSession } from "@logit/core/domain/workout";
  import {
    addSupersetRound,
    blockGroup,
    groupLabel,
    setGroupRoundRest,
    supersetRoundCount,
    ungroupSuperset,
  } from "@logit/core/domain/workout";
  import { canRunCircuit, circuitRoundRestMs } from "@logit/core/domain/circuit";
  import { circuitRunner } from "$lib/features/session/circuit/circuitRunner";
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

  // The countdown runs the group's drills (strength and cardio are logged by hand for now).
  const hasDrills = $derived(blocks.some((b: SessionBlock) => b.type === "mobility"));
  const canRun = $derived(canRunCircuit({ blocks }, supersetId));
  const running = $derived($circuitRunner.run?.supersetId === supersetId);
  const roundRestMs = $derived(circuitRoundRestMs({ blocks }, supersetId));

  const ROUND_REST_LADDER = [0, 30_000, 45_000, 60_000, 90_000, 120_000];
  function cycleRoundRest() {
    const i = ROUND_REST_LADDER.indexOf(roundRestMs);
    const next = ROUND_REST_LADDER[(i + 1) % ROUND_REST_LADDER.length]!;
    void onMutate((s: WorkoutSession) => setGroupRoundRest(s, supersetId, next || undefined));
  }
  function fmtRest(ms: number): string {
    const sec = Math.round(ms / 1000);
    return sec >= 60 && sec % 60 === 0 ? `${sec / 60} min` : `${sec} s`;
  }
  function startOrShow() {
    if (running) circuitRunner.expand();
    else circuitRunner.start(supersetId);
  }
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
    <div class="flex-1 min-w-0 py-1.5">
      <span class="block text-xs font-medium text-primary uppercase tracking-wide">{label}</span>
      <span class="block text-xs text-muted-foreground truncate">
        {blocks.length} exercises{roundCount > 0 ? ` · ${roundCount} round${roundCount === 1 ? "" : "s"}` : ""}
      </span>
    </div>
    <button
      type="button"
      class="shrink-0 flex h-11 items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
      onclick={() => onMutate((s: WorkoutSession) => ungroupSuperset(s, supersetId))}
      disabled={saving || running}
    >
      <Link2Off class="h-3.5 w-3.5" /> Ungroup
    </button>
    {#if canRun || running}
      <button
        type="button"
        class="shrink-0 flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        onclick={startOrShow}
        disabled={saving && !running}
        aria-label={running ? `Show the ${label.toLowerCase()} timer` : `Start ${label.toLowerCase()}`}
      >
        {#if running}<Timer class="h-4 w-4" /> Running{:else}<Play class="h-4 w-4 fill-current" /> Start{/if}
      </button>
    {/if}
  </div>

  {#if hasDrills}
    <div class="flex flex-wrap gap-2 pb-2 pl-11 pr-3">
      <button
        type="button"
        class="h-8 rounded-full border border-border bg-background px-3 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
        onclick={cycleRoundRest}
        disabled={saving}
        aria-label="Rest between rounds: {roundRestMs ? fmtRest(roundRestMs) : 'off'}. Tap to change."
      >
        Rest between rounds: {roundRestMs ? fmtRest(roundRestMs) : "off"}
      </button>
    </div>
  {/if}

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
