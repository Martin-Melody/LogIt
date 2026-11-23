<script lang="ts">
  import { Check, ChevronDown, ChevronRight, GripVertical, Link2, Link2Off, MoreHorizontal, Play, Plus, Repeat, Timer, Trash2, Zap } from "lucide-svelte";
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
  import { addButton, segment, segmentTrack } from "$lib/components/ui/choice";
  import { openAllSignal } from "$lib/features/session/openAll";
  import { foldFor, type BlockStage } from "$lib/features/session/stage";
  import { untrack } from "svelte";
  import { formatLoad } from "@logit/core/domain/units";
  import type { MobilityBlockData, StrengthBlockData } from "@logit/core/domain/workout";
  import { SvelteMap } from "svelte/reactivity";
  import { get } from "svelte/store";
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
    stage,
    onReorder,
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
    onMutate: (updater: (s: WorkoutSession) => WorkoutSession, opts?: { auto?: boolean }) => Promise<void>;
    onDeleteBlock: (blockId: string) => void | Promise<void>;
    /** Where the group is in the workout (stage.ts): it folds like a single exercise. */
    stage?: BlockStage;
    onReorder?: () => void;
  }>();

  const noopGrip: GripAction = () => ({ destroy() {} });

  // Its own name, else the kind chosen for it, else "Superset" for two, "Circuit" otherwise.
  const info = $derived(blockGroup(blocks[0]));
  const label = $derived(groupLabel(blocks.length, info?.label, info?.kind));
  const kind = $derived(groupKindOf(blocks.length, info?.kind));

  let confirmRemove = $state(false);
  let editOpen = $state(false);
  // Collapsed, the whole group is one line. It starts the way the "Collapse blocks by
  // default" setting says, like a single exercise, and never collapses on its own after that.
  let collapsed = $state(
    untrack(() => stage) ? foldFor(untrack(() => stage)!, get(profile).blocksCollapsedByDefault) : get(profile).blocksCollapsedByDefault,
  );
  let seenStage = untrack(() => stage);
  $effect(() => {
    const st = stage;
    untrack(() => {
      if (!st || st === seenStage) return;
      seenStage = st;
      collapsed = foldFor(st, get(profile).blocksCollapsedByDefault);
    });
  });

  // "Open every exercise" in the workout menu.
  let seenOpenAll = get(openAllSignal);
  $effect(() => {
    const n = $openAllSignal;
    untrack(() => {
      if (n === seenOpenAll) return;
      seenOpenAll = n;
      collapsed = false;
    });
  });
  // The members' names ("Lateral Raise + Face Pull") unless the group has its own.
  const title = $derived(info?.label?.trim() || blocks.map((b: SessionBlock) => blockDisplayName(b)).join(" + "));
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const progress = $derived(groupProgress(blocks));

  // Expanded, a group shows its exercises one after another (the default: drag, warm-ups,
  // rep bars) or its rounds, each opening and closing on its own.
  const roundBlocks = $derived(blocks.filter((b: SessionBlock) => b.type === "strength" || b.type === "mobility"));
  const otherBlocks = $derived(blocks.filter((b: SessionBlock) => b.type !== "strength" && b.type !== "mobility"));
  const rounds = $derived(groupRounds(roundBlocks));
  const canShowRounds = $derived(rounds.length > 0);
  function initialView(): "rounds" | "exercises" {
    // Rounds first (merged design), unless this group was switched to exercises.
    return groupViews.get(supersetId) ?? (groupRounds(blocks.filter((b: SessionBlock) => b.type === "strength" || b.type === "mobility")).length > 0 ? "rounds" : "exercises");
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
  /** A round in one line: "A 10 × 14 · B 25 × 15", done or (still to do) planned. */
  function roundLine(r: number): string {
    const unit = $profile.weightUnit;
    return roundBlocks
      .map((b: SessionBlock, i: number) => {
        if (b.type === "strength") {
          const set = [...(b.data as StrengthBlockData).sets].sort((x, y) => x.orderIndex - y.orderIndex)[r];
          if (!set) return null;
          const kg = set.completed ? set.weight : set.weight || set.target?.weight || 0;
          const reps = set.completed ? set.reps : set.reps || set.target?.reps || 0;
          return `${LETTERS[i]} ${kg ? `${formatLoad(kg, unit, false, { withUnit: false })} × ` : "× "}${reps}`;
        }
        const d = b.data as MobilityBlockData;
        const set = [...d.sets].sort((x, y) => x.orderIndex - y.orderIndex)[r * (d.perSide ? 2 : 1)];
        if (!set) return null;
        return `${LETTERS[i]} ${d.metric === "hold" ? `${set.durationSec ?? set.targetSec ?? 0} s` : `× ${set.reps ?? 0}`}`;
      })
      .filter(Boolean)
      .join(" · ");
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

  // The countdown runs every member but cardio (logged by hand).
  const hasDrills = $derived(blocks.some((b: SessionBlock) => b.type !== "cardio"));
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
    parts.push(kind === "circuit" ? "Circuit" : "Superset");
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

<div class="transition-opacity {stage === 'current' ? '' : 'border-b border-border/50'} {dragging ? 'opacity-50' : ''}">
  <div class="flex items-center pl-1 pr-1 {stage === 'current' ? '' : 'border-t border-border bg-muted/20'}">
    <button
      type="button"
      class="shrink-0 h-11 w-9 flex items-center justify-center rounded-md text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
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
      class="shrink-0 h-11 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      onclick={() => (collapsed = !collapsed)}
      aria-expanded={!collapsed}
      aria-label="{collapsed ? 'Expand' : 'Collapse'} {label}"
    >
      {#if collapsed}<ChevronRight class="h-4 w-4" />{:else}<ChevronDown class="h-4 w-4" />{/if}
    </button>
    <span class="ml-0.5 mr-2 flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-muted" aria-hidden="true">
      {#if kind === "circuit"}<Repeat class="h-4 w-4" />{:else}<Link2 class="h-4 w-4" />{/if}
    </span>
    <button
      type="button"
      class="flex-1 min-w-0 min-h-11 py-1 pr-2 text-left disabled:opacity-50"
      onclick={() => (editOpen = true)}
      disabled={saving}
      aria-label="Edit {label}"
    >
      <span class="block truncate font-semibold {stage === 'current' ? 'text-[17px]' : 'text-[15px]'}">{title}</span>
      <span class="block truncate text-xs text-muted-foreground">{summary}</span>
    </button>
    {#if progress.total > 0}
      {@const allDone = progress.done >= progress.total}
      <span class="flex shrink-0 items-center gap-1 text-xs tabular-nums {allDone ? 'text-success' : 'text-muted-foreground'}">
        {#if allDone}<Check class="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />{/if}{progress.done} of {progress.total}
      </span>
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
        <div>
          {#each rounds as tally, r (r)}
            {@const open = roundOpen(r)}
            {@const done = tally.done === tally.total}
            {#if open}
              <div class="border-t border-border/60">
                <button
                  type="button"
                  class="flex min-h-10 w-full items-center gap-2.5 px-3 text-left text-[13px]"
                  onclick={() => roundChoice.set(r, false)}
                  aria-expanded="true"
                >
                  {#if done}<span class="flex size-[22px] items-center justify-center rounded-full bg-primary text-primary-foreground"><Check class="h-3 w-3" strokeWidth={3} /></span>{/if}
                  <span class="font-semibold">Round {r + 1}</span>
                  <span class="ml-auto text-xs text-muted-foreground">{roundStatus(r)}</span>
                </button>
                {#each roundBlocks.filter((b: SessionBlock) => memberRoundCount(b) > r) as block (block.id)}
                  <BlockHost
                    type={block.type}
                    blockId={block.id}
                    data={block.data}
                    {saving}
                    grouped
                    round={r}
                    roundLabel={LETTERS[roundBlocks.indexOf(block)]}
                    groupRestMs={memberRest(memberIndex(block))}
                    gripAction={noopGrip}
                    onGroup={onGroupBlock ? () => onGroupBlock(block.id) : undefined}
                    {onReorder}
                    onDelete={() => onDeleteBlock(block.id)}
                    {onMutate}
                  />
                {/each}
              </div>
            {:else}
              <button
                type="button"
                class="flex min-h-11 w-full items-center gap-2.5 border-t border-border/60 px-3 text-left text-[13px] tabular-nums text-muted-foreground"
                onclick={() => roundChoice.set(r, true)}
                aria-expanded="false"
              >
                {#if done}<span class="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check class="h-3 w-3" strokeWidth={3} /></span>{/if}
                <span class="shrink-0 font-semibold text-foreground">Round {r + 1}</span>
                <span class="min-w-0 truncate {done ? '' : 'text-info'}">{roundLine(r)}</span>
              </button>
            {/if}
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
              {onReorder}
              onDelete={() => onDeleteBlock(block.id)}
              {onMutate}
            />
          {/each}
        </div>
      {:else}
        <div class="ml-3 border-l-2 border-border">
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
                {stage}
                {onReorder}
                onGroup={onGroupBlock ? () => onGroupBlock(block.id) : undefined}
                onDelete={() => onDeleteBlock(block.id)}
                {onMutate}
              />
            </div>
          {/each}
        </div>
      {/if}

      <div class="flex flex-wrap gap-2 px-3 pt-2 pb-3">
        <button type="button" class={addButton} onclick={() => onMutate((s: WorkoutSession) => addSupersetRound(s, supersetId))} disabled={saving}>
          <Plus class="h-3.5 w-3.5" /> Add a round
        </button>
        {#if (canRun || running) && kind !== "circuit"}
          <button type="button" class={addButton} onclick={startOrShow} disabled={saving && !running}>
            {#if running}<Timer class="h-3.5 w-3.5" /> Show the timer{:else}<Play class="h-3.5 w-3.5" /> Countdown{/if}
          </button>
        {/if}
      </div>
      {#if (canRun || running) && kind === "circuit"}
        <div class="px-3 pb-3">
          <button type="button" class="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
            onclick={startOrShow} disabled={saving && !running}>
            {#if running}<Timer class="h-4 w-4" /> Show the timer{:else}<Play class="h-4 w-4 fill-current" /> Start {label.toLowerCase()}{/if}
          </button>
        </div>
      {/if}
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
