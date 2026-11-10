<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Plus, Trash2, ChevronDown, ChevronRight, GripVertical, Timer, ArrowLeftRight, Link2 } from "lucide-svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import ReasoningDialog from "$lib/components/Dialogs/ReasoningDialog.svelte";
  import type { ProgressionOutput } from "@logit/core/domain/progression";
  import { changeTagClass } from "$lib/features/session/planFormat";
  import type { GripAction } from "$lib/features/session/blocks/types";
  import type { WeightUnit } from "@logit/core/domain/units";
  import { formatWeight } from "@logit/core/domain/units";
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

  const goal = $derived(suggestion?.progressGoal ?? null);
  const fatiguePct = $derived(Math.round(suggestion?.reasoning?.computed?.fatigueDiscountPct ?? 0));
  const showMeter = $derived(!collapsed && goal !== null && meter.length > 0 && goal.reps <= 30);

  // One cell per rep up to the goal: done, still planned for today, or still to go.
  const meterRows = $derived(
    showMeter && goal
      ? meter.map((m: { done: number; target: number }, i: number) => ({
          label: `Set ${i + 1}`,
          shown: m.done > 0 ? m.done : m.target,
          cells: Array.from({ length: goal.reps }, (_, c) =>
            c < m.done ? "done" : m.done === 0 && c < m.target ? "target" : "rest",
          ),
        }))
      : [],
  );
</script>

<div class="border-b border-border/50">
<!-- Exercise section header -->
<div class="border-t border-border bg-muted/20" data-tour="session-exercise-header">
  <div class="flex items-center gap-2 px-3 py-2">
    {#if !grouped}
      <!-- Grip handle -->
      <button
        type="button"
        class="shrink-0 h-7 w-7 flex items-center justify-center rounded text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
        style="touch-action: none"
        use:gripAction
        aria-label="Drag to reorder"
        tabindex="-1"
        disabled={saving}
      >
        <GripVertical class="h-3.5 w-3.5" />
      </button>
    {/if}

    <!-- Collapse toggle -->
    <button
      type="button"
      class="shrink-0 h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
      onclick={onToggleCollapse}
      aria-label={collapsed ? "Expand exercise" : "Collapse exercise"}
      disabled={saving}
    >
      {#if collapsed}
        <ChevronRight class="h-3.5 w-3.5" />
      {:else}
        <ChevronDown class="h-3.5 w-3.5" />
      {/if}
    </button>

    <button
      type="button"
      class="flex-1 min-w-0 text-left"
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
      <span class="shrink-0 flex items-center text-primary animate-pulse" aria-label="Rest timer active">
        <Timer class="h-3.5 w-3.5" />
      </span>
    {/if}

    {#if canSuperset}
      <button
        type="button"
        class="shrink-0 h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-primary"
        onclick={() => void onSuperset()}
        disabled={saving}
        aria-label="Superset with next exercise"
      >
        <Link2 class="h-3.5 w-3.5" />
      </button>
    {/if}

    <button
      type="button"
      class="shrink-0 h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
      onclick={onSwap}
      disabled={saving}
      aria-label="Swap exercise"
    >
      <ArrowLeftRight class="h-3.5 w-3.5" />
    </button>

    {#if !collapsed}
      <Button
        size="icon"
        class="h-7 w-7 shrink-0"
        onclick={() => void onAddSet()}
        disabled={saving}
        aria-label="Add set"
      >
        <Plus class="h-3.5 w-3.5" />
      </Button>
    {/if}

    <ConfirmDialog
      title="Remove exercise?"
      description="Removes this exercise and all its sets from the session."
      confirmLabel="Remove"
      {saving}
      onConfirm={onDelete}
    >
      {#snippet child({ props })}
        <Button
          {...props}
          size="icon"
          variant="ghost"
          class="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          disabled={saving}
          aria-label="Delete exercise"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </Button>
      {/snippet}
    </ConfirmDialog>
  </div>

  {#if !collapsed && suggestion && suggestion.sets.length > 0}
    {#if showMeter && goal}
      <div class="px-3 pb-2.5 flex flex-col gap-1.5" data-testid="progress-meter">
        <div class="flex items-center gap-2">
          {#if suggestion.change}
            <span class="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold {changeTagClass(suggestion.change.kind)}">
              {suggestion.change.text}
            </span>
          {/if}
          <p class="flex-1 text-xs text-muted-foreground">
            Reps towards <strong class="font-semibold text-foreground">{formatWeight(goal.weight, weightUnit)}</strong>
            ({goal.reps} on every set)
          </p>
          {#if suggestion.reasoning}
            <ReasoningDialog reasoning={suggestion.reasoning} />
          {/if}
        </div>
        {#each meterRows as row (row.label)}
          <div class="flex items-center gap-2" aria-label="{row.label}: {row.shown} of {goal.reps} reps">
            <span class="w-9 text-[11px] text-muted-foreground">{row.label}</span>
            <div class="flex flex-1 gap-[3px]" aria-hidden="true">
              {#each row.cells as cell, c (c)}
                <span
                  class="h-2.5 flex-1 rounded-[2px]
                    {cell === 'done'
                    ? 'bg-blue-700 dark:bg-blue-400'
                    : cell === 'target'
                      ? 'border border-blue-400 bg-blue-100 dark:border-blue-400/70 dark:bg-blue-500/20'
                      : 'bg-muted-foreground/15'}"
                ></span>
              {/each}
            </div>
            <span class="w-8 text-right text-[11px] tabular-nums text-muted-foreground">{row.shown}/{goal.reps}</span>
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
          <span class="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold {changeTagClass(suggestion.change.kind)}">
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
      <p class="px-3 pb-1.5 text-xs text-amber-600 dark:text-amber-400 -mt-1">{suggestion.notes}</p>
    {/if}
    {#if suggestion.nudge}
      <div class="mx-3 mb-1.5 -mt-1 flex items-start gap-2 rounded border border-sky-500/30 bg-sky-500/10 px-2 py-1.5">
        <p class="flex-1 text-xs text-sky-700 dark:text-sky-400">{suggestion.nudge.message}</p>
        <div class="flex shrink-0 items-center gap-2">
          {#if suggestion.nudge.actionLabel}
            <button
              type="button"
              class="text-xs font-medium text-sky-700 dark:text-sky-400 underline underline-offset-2"
              onclick={() => onAcceptNudge(suggestion.nudge!.id)}
            >
              {suggestion.nudge.actionLabel}
            </button>
          {/if}
          <button
            type="button"
            class="text-xs text-sky-700 dark:text-sky-400 underline underline-offset-2"
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
