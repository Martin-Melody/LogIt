<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Plus, X, Check, Trash2, ChevronDown, ChevronRight, GripVertical, Timer } from "lucide-svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import type { ProgressionOutput, SuggestedSet } from "@logit/core/domain/progression";
  import type { GripAction } from "$lib/features/session/blocks/types";

  const {
    exerciseName = "",
    setCount = 0,
    saving = false,
    collapsed = false,
    hasActiveTimer = false,
    suggestion = null,
    gripAction,
    onAddSet = () => {},
    onRename = () => {},
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
    gripAction: GripAction;
    onAddSet?: () => void | Promise<void>;
    onRename?: (nextName: string) => void | Promise<void>;
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
    const setsStr = allSame
      ? `${sets.length}×${formatReps(first.reps)} @ ${first.weight}kg`
      : sets.map((x) => `${formatReps(x.reps)}@${x.weight}kg`).join(", ");
    return s.label ? `${setsStr} · ${s.label}` : setsStr;
  }

  const ui = $state({ editing: false, draftName: "" });
  let inputEl = $state<HTMLInputElement | null>(null);

  $effect(() => { if (ui.editing) inputEl?.focus(); });

  function startEdit() {
    ui.draftName = exerciseName;
    ui.editing = true;
  }

  async function commit() {
    const next = ui.draftName.trim();
    ui.editing = false;
    if (!next || next === exerciseName) return;
    await onRename(next);
  }

  function cancel() {
    ui.editing = false;
    ui.draftName = exerciseName;
  }
</script>

<div class="border-b border-border/50">
<!-- Exercise section header -->
<div class="border-t border-border bg-muted/20" data-tour="session-exercise-header">
  <div class="flex items-center gap-2 px-3 py-2">
    {#if ui.editing}
      <input
        bind:this={inputEl}
        class="flex-1 min-w-0 bg-transparent text-sm font-semibold focus:outline-none border-b border-primary"
        bind:value={ui.draftName}
        disabled={saving}
        onkeydown={(e) => {
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") cancel();
        }}
        onblur={() => void commit()}
      />
      <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" onclick={cancel}>
        <X class="h-3.5 w-3.5" />
      </Button>
      <Button size="icon" class="h-7 w-7 shrink-0" onclick={() => void commit()}>
        <Check class="h-3.5 w-3.5" />
      </Button>
    {:else}
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
        onclick={startEdit}
        disabled={saving}
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
    {/if}
  </div>

  {#if !collapsed && suggestion && suggestion.sets.length > 0}
    {#if suggestion.displayMode === "block"}
      {#if suggestion.label}
        <p class="px-3 pb-1.5 text-xs text-muted-foreground/60 -mt-1">{suggestion.label}</p>
      {/if}
    {:else}
      <!-- Summary mode (default) -->
      <p class="px-3 pb-1.5 text-xs text-muted-foreground -mt-1">
        Target: {formatTarget(suggestion)}
      </p>
    {/if}
    {#if suggestion.notes}
      <p class="px-3 pb-1.5 text-xs text-amber-600 dark:text-amber-400 -mt-1">{suggestion.notes}</p>
    {/if}
  {/if}
</div>

<!-- Sets -->
{#if !collapsed}
  {@render children?.()}
{/if}
</div>
