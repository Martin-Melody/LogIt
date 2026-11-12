<script lang="ts">
  import { Check, ChevronDown, ChevronRight, GripVertical, Link2Off, MoreHorizontal, Play, Plus, Repeat, Timer, Trash2, Zap } from "lucide-svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import type { SessionBlock, WorkoutSession } from "@logit/core/domain/workout";
  import {
    addSupersetRound,
    blockDisplayName,
    blockGroup,
    groupKindOf,
    groupLabel,
    groupProgress,
    groupRounds,
    memberRoundCount,
    removeGroup,
    setGroupKind,
    supersetRoundCount,
    ungroupSuperset,
  } from "@logit/core/domain/workout";
  import { canRunCircuit, groupTiming } from "@logit/core/domain/circuit";
  import { circuitRunner } from "$lib/features/session/circuit/circuitRunner";
  import { circuitDefaultsFrom, formatRestMs } from "$lib/features/session/circuit/circuitSettings";
  import { profile } from "$lib/stores/profile.store";
  import GroupEditSheet from "./GroupEditSheet.svelte";
  import type { GripAction } from "$lib/features/session/blocks/types";
  import BlockHost from "$lib/features/session/blocks/BlockHost.svelte";
  import { reveal } from "$lib/transitions";
  import { segment, segmentTrack } from "$lib/components/ui/choice";
  import { SvelteMap } from "svelte/reactivity";
  import { groupViews } from "./groupViews";

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

  // Its own name, else the kind chosen for it, else "Superset" for two, "Circuit" otherwise.
  const info = $derived(blockGroup(blocks[0]));
  const label = $derived(groupLabel(blocks.length, info?.label, info?.kind));
  const kind = $derived(groupKindOf(blocks.length, info?.kind));

  let confirmRemove = $state(false);
  let editOpen = $state(false);
  // Collapsed, the whole group is one line. It never collapses on its own.
  let collapsed = $state(false);
  const progress = $derived(groupProgress(blocks));

  // Expanded, a group shows its rounds (each opens and closes on its own) or, to drag,
  // add warm-ups and see the rep bars, its exercises one after another.
  const roundBlocks = $derived(blocks.filter((b: SessionBlock) => b.type === "strength" || b.type === "mobility"));
  const otherBlocks = $derived(blocks.filter((b: SessionBlock) => b.type !== "strength" && b.type !== "mobility"));
  const rounds = $derived(groupRounds(roundBlocks));
  const canShowRounds = $derived(rounds.length > 0);
  function initialView(): "rounds" | "exercises" {
    return groupViews.get(supersetId) ?? "rounds";
  }
  let view = $state<"rounds" | "exercises">(initialView());
  function setView(v: "rounds" | "exercises") {
    view = v;
    groupViews.set(supersetId, v);
  }
  const byRound = $derived(view === "rounds" && canShowRounds);
  // Rounds the user opened or closed; the rest follow: the round being worked on, and any
  // round with a rest running (its rest bar is inside it), are open.
  const roundChoice = new SvelteMap<number, boolean>();
  function roundOpen(r: number): boolean {
    return roundChoice.get(r) ?? (r === progress.currentRound - 1 || rounds[r]!.resting);
  }
  function roundStatus(r: number): string {
    const t = rounds[r]!;
    if (t.done === t.total) return "Done";
    if (t.done > 0 || r === progress.currentRound - 1) return `${t.done} of ${t.total} done`;
    if (r === progress.currentRound) return "Up next";
    return "";
  }
  /** Index in `blocks` of a member, for its rest (the last member rests between rounds). */
  function memberIndex(block: SessionBlock): number {
    return blocks.findIndex((b: SessionBlock) => b.id === block.id);
  }
  async function removeAll() {
    if (running) circuitRunner.end();
    await onMutate((s: WorkoutSession) => removeGroup(s, supersetId));
  }
  function ungroup() {
    if (running) circuitRunner.end();
    void onMutate((s: WorkoutSession) => ungroupSuperset(s, supersetId));
  }

  // Strength sets and mobility sets (an L/R pair is one round); cardio doesn't count.
  const roundCount = $derived(supersetRoundCount(blocks));

  // The countdown runs the group's drills (strength and cardio are logged by hand for now).
  const hasDrills = $derived(blocks.some((b: SessionBlock) => b.type === "mobility"));
  const canRun = $derived(canRunCircuit({ blocks }, supersetId));
  const running = $derived($circuitRunner.run?.supersetId === supersetId);
  const timing = $derived(groupTiming({ blocks }, supersetId, circuitDefaultsFrom($profile.restDefaults)));
  /**
   * The rest a member starts when one of its sets is ticked by hand: the rest between
   * exercises, or after the last one the rest between rounds. An unset round rest leaves
   * it to the exercise's own rest timer (undefined).
   */
  function memberRest(i: number): number | undefined {
    if (i < blocks.length - 1) return timing.memberRestMs;
    return info?.roundRestMs;
  }

  const summary = $derived.by(() => {
    const parts: string[] = [];
    if (info?.label?.trim()) parts.push(kind === "circuit" ? "Circuit" : "Superset");
    parts.push(`${blocks.length} exercise${blocks.length === 1 ? "" : "s"}`);
    if (collapsed && progress.roundCount > 0) {
      parts.push(`round ${progress.currentRound} of ${progress.roundCount}`);
      return parts.join(" · ");
    }
    if (roundCount > 0) parts.push(`${roundCount} round${roundCount === 1 ? "" : "s"}`);
    if (info?.roundRestMs) parts.push(`${formatRestMs(info.roundRestMs)} rest`);
    return parts.join(" · ");
  });
  function startOrShow() {
    if (running) circuitRunner.expand();
    else circuitRunner.start(supersetId);
  }
</script>

<div class="border-y border-primary/30 bg-primary/[0.03] transition-opacity {dragging ? 'opacity-50' : ''}">
  <div class="flex items-center gap-2 py-1 pl-1 pr-1">
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
    <button
      type="button"
      class="shrink-0 -ml-2 h-11 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      onclick={() => (collapsed = !collapsed)}
      aria-expanded={!collapsed}
      aria-label="{collapsed ? 'Expand' : 'Collapse'} {label}"
    >
      {#if collapsed}<ChevronRight class="h-4 w-4" />{:else}<ChevronDown class="h-4 w-4" />{/if}
    </button>
    <button
      type="button"
      class="flex-1 min-w-0 py-1.5 text-left rounded-md disabled:opacity-50"
      onclick={() => (editOpen = true)}
      disabled={saving}
      aria-label="Edit {label}"
    >
      <span class="flex items-center gap-1 text-xs font-medium text-primary uppercase tracking-wide">
        <span class="truncate">{label}</span>
      </span>
      <span class="block text-xs text-muted-foreground truncate">{summary}</span>
    </button>
    {#if collapsed && progress.total > 0}
      <span class="shrink-0 text-xs text-muted-foreground tabular-nums">{progress.done} of {progress.total}</span>
    {/if}
    {#if canRun || running}
      <button
        type="button"
        class="shrink-0 flex h-8 items-center gap-1 rounded-md bg-primary pl-2 pr-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        onclick={startOrShow}
        disabled={saving && !running}
        aria-label={running ? `Show the ${label.toLowerCase()} timer` : `Start ${label.toLowerCase()}`}
      >
        {#if running}<Timer class="h-3.5 w-3.5" /> Running{:else}<Play class="h-3.5 w-3.5 fill-current" /> Start{/if}
      </button>
    {/if}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        class="shrink-0 h-11 w-11 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-50"
        disabled={saving}
        aria-label="More actions for this {label.toLowerCase()}"
      >
        <MoreHorizontal class="h-5 w-5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        {#if kind === "superset"}
          <DropdownMenu.Item onSelect={() => onMutate((s: WorkoutSession) => setGroupKind(s, supersetId, "circuit"))}>
            <Repeat /> Make it a circuit
          </DropdownMenu.Item>
        {:else if blocks.length >= 2}
          <DropdownMenu.Item onSelect={() => onMutate((s: WorkoutSession) => setGroupKind(s, supersetId, "superset"))}>
            <Zap /> Make it a superset
          </DropdownMenu.Item>
        {/if}
        <DropdownMenu.Item onSelect={ungroup}>
          <Link2Off /> Ungroup
        </DropdownMenu.Item>
        <DropdownMenu.Item variant="destructive" onSelect={() => (confirmRemove = true)}>
          <Trash2 /> Remove {label.toLowerCase()} and its exercises
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>

  {#if collapsed}
    {#if progress.total > 0}
      <div class="h-[3px] bg-muted" role="progressbar" aria-label="{label} progress" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
        <div class="h-full bg-info transition-[width]" style="width: {(progress.done / progress.total) * 100}%"></div>
      </div>
    {/if}
  {:else}
    <div transition:reveal>
      {#if canShowRounds}
        <div class="px-3 pb-2">
          <div class={segmentTrack} role="group" aria-label="Show {label}">
            <button type="button" class={segment(byRound)} aria-pressed={byRound} onclick={() => setView("rounds")}>By round</button>
            <button type="button" class={segment(!byRound)} aria-pressed={!byRound} onclick={() => setView("exercises")}>By exercise</button>
          </div>
        </div>
      {/if}

      {#if byRound}
        <div class="ml-3 border-l-2 border-primary/30">
          {#each rounds as tally, r (r)}
            {@const open = roundOpen(r)}
            <div class="border-t border-border/60 first:border-t-0">
              <button
                type="button"
                class="w-full min-h-11 flex items-center gap-2 pl-3 pr-4 text-left text-sm {open ? 'font-semibold' : 'text-muted-foreground'}"
                onclick={() => roundChoice.set(r, !open)}
                aria-expanded={open}
              >
                {#if open}<ChevronDown class="h-4 w-4 shrink-0" />{:else}<ChevronRight class="h-4 w-4 shrink-0" />{/if}
                <span class="flex-1">Round {r + 1}</span>
                <span class="text-xs font-normal text-muted-foreground">{roundStatus(r)}</span>
                {#if tally.done === tally.total}<Check class="h-4 w-4 shrink-0 text-info" aria-hidden="true" />{/if}
              </button>
              {#if open}
                <div transition:reveal>
                  {#each roundBlocks.filter((b: SessionBlock) => memberRoundCount(b) > r) as block (block.id)}
                    <BlockHost
                      type={block.type}
                      blockId={block.id}
                      data={block.data}
                      {saving}
                      grouped
                      round={r}
                      groupRestMs={memberRest(memberIndex(block))}
                      gripAction={noopGrip}
                      onGroup={onGroupBlock ? () => onGroupBlock(block.id) : undefined}
                      onDelete={() => onDeleteBlock(block.id)}
                      {onMutate}
                    />
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
          {#each otherBlocks as block (block.id)}
            <BlockHost
              type={block.type}
              blockId={block.id}
              data={block.data}
              {saving}
              grouped
              groupRestMs={memberRest(memberIndex(block))}
              gripAction={noopGrip}
              onGroup={onGroupBlock ? () => onGroupBlock(block.id) : undefined}
              onDelete={() => onDeleteBlock(block.id)}
              {onMutate}
            />
          {/each}
        </div>
      {:else}
        <div class="ml-3 border-l-2 border-primary/30">
          {#each blocks as block, i (block.id)}
            <div class="transition-opacity {draggingBlockId === block.id ? 'opacity-50' : ''}" transition:reveal>
              <BlockHost
                type={block.type}
                blockId={block.id}
                data={block.data}
                {saving}
                grouped
                groupRestMs={memberRest(i)}
                gripAction={memberGripAction ? memberGripAction(block.id) : noopGrip}
                onGroup={onGroupBlock ? () => onGroupBlock(block.id) : undefined}
                onDelete={() => onDeleteBlock(block.id)}
                {onMutate}
              />
            </div>
          {/each}
        </div>
      {/if}

      <button
        type="button"
        class="w-full h-11 px-3 text-xs font-medium text-primary text-left hover:bg-primary/5 disabled:opacity-40"
        onclick={() => onMutate((s: WorkoutSession) => addSupersetRound(s, supersetId))}
        disabled={saving}
      >
        <Plus class="inline h-3.5 w-3.5 -mt-0.5" /> Add round
      </button>
    </div>
  {/if}
</div>

<GroupEditSheet
  open={editOpen}
  {supersetId}
  {blocks}
  {saving}
  onClose={() => (editOpen = false)}
  {onMutate}
  onUngroup={() => {
    editOpen = false;
    ungroup();
  }}
  onRemove={() => {
    editOpen = false;
    confirmRemove = true;
  }}
/>

<ConfirmDialog
  title="Remove {label.toLowerCase()}?"
  description={blocks.length === 1
    ? `Removes ${blockDisplayName(blocks[0])} and everything logged in it.`
    : `Removes all ${blocks.length} exercises and everything logged in them.`}
  confirmLabel="Remove"
  {saving}
  onConfirm={removeAll}
  open={confirmRemove}
  onOpenChange={(v: boolean) => (confirmRemove = v)}
/>
