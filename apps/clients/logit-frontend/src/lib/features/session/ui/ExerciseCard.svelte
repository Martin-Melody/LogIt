<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Plus, Trash2, ChevronDown, ChevronRight, GripVertical, Timer, ArrowLeftRight, Link2 } from "lucide-svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import ReasoningDialog from "$lib/components/Dialogs/ReasoningDialog.svelte";
  import type { ProgressionOutput, SuggestedSet } from "@logit/core/domain/progression";
  import type { GripAction } from "$lib/features/session/blocks/types";
  import type { WeightUnit } from "@logit/core/domain/units";
  import { formatWeight } from "@logit/core/domain/units";
  import { reveal } from "$lib/transitions";

  const {
    exerciseName = "",
    setCount = 0,
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
    children,
  } = $props<{
    exerciseName?: string;
    setCount?: number;
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
    children?: import("svelte").Snippet;
  }>();

  function formatReps(reps: SuggestedSet["reps"]): string {
    return Array.isArray(reps) ? `${reps[0]}–${reps[1]}` : String(reps);
  }

  function formatTarget(s: ProgressionOutput): string {
    const { sets } = s;
    if (sets.length === 0) return s.label ?? "";
    const first = sets[0];
    const allSame = sets.every(
      (x) => x.weight === first.weight && JSON.stringify(x.reps) === JSON.stringify(first.reps),
    );
    const w = (kg: number) => formatWeight(kg, weightUnit, { space: false });
    const setsStr = allSame
      ? `${sets.length}×${formatReps(first.reps)} @ ${w(first.weight)}`
      : sets.map((x) => `${formatReps(x.reps)}@${w(x.weight)}`).join(", ");
    return s.label ? `${setsStr} · ${s.label}` : setsStr;
  }
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

    <span class="text-xs text-muted-foreground shrink-0">
      {setCount} set{setCount === 1 ? "" : "s"}
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
    <div class="px-3 pb-1.5 -mt-1 flex items-center gap-2 flex-wrap">
      {#if suggestion.displayMode === "block"}
        {#if suggestion.label}
          <p class="text-xs text-muted-foreground/60">{suggestion.label}</p>
        {/if}
      {:else}
        <!-- Summary mode (default) -->
        <p class="text-xs text-muted-foreground">
          Target: {formatTarget(suggestion)}
        </p>
      {/if}
      {#if suggestion.reasoning}
        <ReasoningDialog reasoning={suggestion.reasoning} />
      {/if}
    </div>
    {#if suggestion.notes}
      <p class="px-3 pb-1.5 text-xs text-amber-600 dark:text-amber-400 -mt-1">{suggestion.notes}</p>
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
