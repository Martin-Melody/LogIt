<script lang="ts">
  import { Plus, Trash2, ChevronDown, ChevronRight, GripVertical, Timer, ArrowLeftRight, Link2, MoreHorizontal } from "lucide-svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import ReasoningDialog from "$lib/components/Dialogs/ReasoningDialog.svelte";
  import type { ProgressionOutput } from "@logit/core/domain/progression";
  import { changeTagClass, meterRow } from "$lib/features/session/planFormat";
  import type { GripAction } from "$lib/features/session/blocks/types";
  import type { WeightUnit } from "@logit/core/domain/units";
  import { formatLoad } from "@logit/core/domain/units";
  import { reveal } from "$lib/transitions";

  const {
    exerciseName = "",
    setCount = 0,
    doneCount = 0,
    meter = [],
    saving = false,
    collapsed = false,
    hasActiveTimer = false,
    suggestion = null,
    weightUnit = "kg",
    bodyweight = false,
    grouped = false,
    canSuperset = false,
    gripAction,
    onAddSet = () => {},
    onOpenDetail = () => {},
    onSwap = () => {},
    onSuperset = () => {},
    onDelete = () => {},
    onToggleCollapse = () => {},
    onDismissNudge = () => {},
    onAcceptNudge = () => {},
    children,
  } = $props<{
    exerciseName?: string;
    setCount?: number;
    /** Working sets ticked off so far. */
    doneCount?: number;
    /** Per working set: reps done (0 if not yet) and reps planned, for the meter. */
    meter?: { done: number; target: number }[];
    saving?: boolean;
    collapsed?: boolean;
    hasActiveTimer?: boolean;
    suggestion?: ProgressionOutput | null;
    weightUnit?: WeightUnit;
    /** Weights are relative to bodyweight (BW, BW−25, BW+10). */
    bodyweight?: boolean;
    grouped?: boolean;
    canSuperset?: boolean;
    gripAction: GripAction;
    onAddSet?: () => void | Promise<void>;
    onOpenDetail?: () => void;
    onSwap?: () => void;
    onSuperset?: () => void | Promise<void>;
    onDelete?: () => void | Promise<void>;
    onToggleCollapse?: () => void;
    onDismissNudge?: (nudgeId: string) => void | Promise<void>;
    onAcceptNudge?: (nudgeId: string) => void | Promise<void>;
    children?: import("svelte").Snippet;
  }>();

  let confirmRemove = $state(false);

  const goal = $derived(suggestion?.progressGoal ?? null);
  const fatiguePct = $derived(Math.round(suggestion?.reasoning?.computed?.fatigueDiscountPct ?? 0));
  const showMeter = $derived(!collapsed && goal !== null && meter.length > 0 && goal.reps <= 30);

  // One cell per rep up to the goal: reps towards today's aim (blue), reps beyond it
  // (green), the aim still to do (dashed), or still to go before the weight goes up.
  const meterRows = $derived(
    showMeter && goal
      ? meter.map((m: { done: number; target: number }, i: number) => ({
          label: `${i + 1}`,
          ...meterRow(m.done, m.target, goal.reps),
        }))
      : [],
  );
</script>

<div class="border-b border-border/50">
<!-- Exercise section header -->
<div class="border-t border-border bg-muted/20" data-tour="session-exercise-header">
  <!-- Every control here is a 44px target. Swap / superset / remove live in the
       ⋯ menu so the row doesn't need six icons and the name keeps its room. -->
  <div class="flex items-center pl-1 pr-1">
    <!-- Grip handle. Inside a superset / circuit it moves the exercise within the group. -->
    <button
      type="button"
      class="shrink-0 h-11 w-9 flex items-center justify-center rounded-md text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
      style="touch-action: none"
      use:gripAction
      aria-label={grouped ? "Drag to reorder within the group" : "Drag to reorder"}
      tabindex="-1"
      disabled={saving}
    >
      <GripVertical class="h-4 w-4" />
    </button>

    <!-- Collapse toggle -->
    <button
      type="button"
      class="shrink-0 h-11 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      onclick={onToggleCollapse}
      aria-label={collapsed ? "Expand exercise" : "Collapse exercise"}
      disabled={saving}
    >
      {#if collapsed}
        <ChevronRight class="h-4 w-4" />
      {:else}
        <ChevronDown class="h-4 w-4" />
      {/if}
    </button>

    <button
      type="button"
      class="flex-1 min-w-0 h-11 pl-1 pr-2 text-left"
      onclick={onOpenDetail}
      disabled={saving}
      aria-label="{exerciseName} — open details"
    >
      <span class="text-sm font-semibold truncate block">{exerciseName}</span>
    </button>

    <span class="text-xs text-muted-foreground shrink-0 tabular-nums">
      {#if setCount > 0}{doneCount} of {setCount}{:else}0 sets{/if}
    </span>

    {#if collapsed && hasActiveTimer}
      <span class="shrink-0 ml-2 flex items-center text-primary animate-pulse" aria-label="Rest timer active">
        <Timer class="h-4 w-4" />
      </span>
    {/if}

    {#if !collapsed}
      <button
        type="button"
        class="shrink-0 ml-1 h-11 w-11 flex items-center justify-center disabled:opacity-50"
        onclick={() => void onAddSet()}
        disabled={saving}
        aria-label="Add set"
      >
        <span class="h-8 w-8 flex items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Plus class="h-4 w-4" />
        </span>
      </button>
    {/if}

    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        class="shrink-0 h-11 w-11 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-50"
        disabled={saving}
        aria-label="More actions for {exerciseName}"
      >
        <MoreHorizontal class="h-5 w-5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <DropdownMenu.Item onSelect={onSwap}>
          <ArrowLeftRight /> Swap exercise
        </DropdownMenu.Item>
        {#if canSuperset}
          <DropdownMenu.Item onSelect={() => void onSuperset()}>
            <Link2 /> Superset / circuit with…
          </DropdownMenu.Item>
        {/if}
        <DropdownMenu.Item variant="destructive" onSelect={() => (confirmRemove = true)}>
          <Trash2 /> Remove exercise
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    <ConfirmDialog
      title="Remove exercise?"
      description="Removes this exercise and all its sets from the session."
      confirmLabel="Remove"
      {saving}
      onConfirm={onDelete}
      open={confirmRemove}
      onOpenChange={(v: boolean) => (confirmRemove = v)}
    />
  </div>

  {#if !collapsed && suggestion && suggestion.sets.length > 0}
    {#if showMeter && goal}
      <div class="px-3 pb-2.5 flex flex-col gap-1.5" data-testid="progress-meter">
        <div class="flex items-center gap-2">
          {#if suggestion.change}
            <span class="shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold {changeTagClass(suggestion.change.kind)}">
              {suggestion.change.text}
            </span>
          {/if}
          <p class="flex-1 text-xs text-muted-foreground">
            {#if goal.weight !== undefined}
              {goal.reps} on every set → <strong class="font-semibold text-foreground">{formatLoad(goal.weight, weightUnit, bodyweight)}</strong>
            {:else}
              A set goes up at <strong class="font-semibold text-foreground">{goal.reps} reps</strong>
            {/if}
          </p>
          {#if suggestion.reasoning}
            <ReasoningDialog reasoning={suggestion.reasoning} />
          {/if}
        </div>
        {#each meterRows as row (row.label)}
          <div class="flex items-center gap-2" aria-label="Set {row.label}: {row.spoken}">
            <span class="w-3 text-[11px] tabular-nums text-muted-foreground">{row.label}</span>
            <div class="flex flex-1 gap-[3px]" aria-hidden="true">
              {#each row.cells as cell, c (c)}
                <span
                  class="h-2.5 flex-1 rounded-[2px]
                    {cell === 'hit'
                    ? 'bg-info'
                    : cell === 'bonus'
                      ? 'bg-success'
                      : cell === 'target'
                      ? 'border border-dashed border-muted-foreground/60'
                      : 'bg-muted-foreground/15'}"
                ></span>
              {/each}
            </div>
            <span class="w-11 text-right text-[11px] tabular-nums text-muted-foreground">{row.right}</span>
          </div>
        {/each}
        {#if suggestion.change?.detail}
          <p class="text-xs text-muted-foreground">{suggestion.change.detail}</p>
        {/if}
        {#if fatiguePct > 0}
          <p class="text-xs text-muted-foreground">
            {fatiguePct}% lighter today: earlier exercises already worked these muscles.
          </p>
        {/if}
      </div>
    {:else}
      <div class="px-3 pb-1.5 -mt-1 flex items-center gap-2 flex-wrap">
        {#if suggestion.change}
          <span class="shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold {changeTagClass(suggestion.change.kind)}">
            {suggestion.change.text}
          </span>
        {/if}
        {#if suggestion.change?.detail}
          <p class="text-xs text-muted-foreground">{suggestion.change.detail}</p>
        {:else if suggestion.label}
          <p class="text-xs text-muted-foreground">{suggestion.label}</p>
        {/if}
        {#if suggestion.reasoning}
          <ReasoningDialog reasoning={suggestion.reasoning} />
        {/if}
      </div>
    {/if}
    {#if suggestion.notes}
      <p class="px-3 pb-1.5 text-xs text-warning -mt-1">{suggestion.notes}</p>
    {/if}
    {#if suggestion.nudge}
      <div class="mx-3 mb-1.5 -mt-1 flex items-start gap-2 rounded-md border border-info/30 bg-info/10 px-2 py-1.5">
        <p class="flex-1 text-xs text-info">{suggestion.nudge.message}</p>
        <div class="flex shrink-0 items-center gap-2">
          {#if suggestion.nudge.actionLabel}
            <button
              type="button"
              class="text-xs font-medium text-info underline underline-offset-2"
              onclick={() => onAcceptNudge(suggestion.nudge!.id)}
            >
              {suggestion.nudge.actionLabel}
            </button>
          {/if}
          <button
            type="button"
            class="text-xs text-info underline underline-offset-2"
            onclick={() => onDismissNudge(suggestion.nudge!.id)}
          >
            {suggestion.nudge.actionLabel ? "Not now" : "Got it"}
          </button>
        </div>
      </div>
    {/if}
  {/if}
</div>

<!-- Sets -->
{#if !collapsed}
  <div transition:reveal>
    {@render children?.()}
  </div>
{/if}
</div>
