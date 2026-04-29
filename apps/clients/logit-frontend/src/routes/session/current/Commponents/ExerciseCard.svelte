<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Plus, X, Check, Trash2, ArrowUp, ArrowDown, ChevronDown, ChevronRight } from "lucide-svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import type { ProgressionOutput, SuggestedSet } from "$lib/domain/progression";

  const {
    exerciseName = "",
    setCount = 0,
    saving = false,
    canMoveUp = false,
    canMoveDown = false,
    suggestion = null,
    onAddSet = () => {},
    onRename = () => {},
    onDelete = () => {},
    onMoveUp = () => {},
    onMoveDown = () => {},
    children,
  } = $props<{
    exerciseName?: string;
    setCount?: number;
    saving?: boolean;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    suggestion?: ProgressionOutput | null;
    onAddSet?: () => void | Promise<void>;
    onRename?: (nextName: string) => void | Promise<void>;
    onDelete?: () => void | Promise<void>;
    onMoveUp?: () => void | Promise<void>;
    onMoveDown?: () => void | Promise<void>;
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
      <button
        type="button"
        class="flex-1 min-w-0 text-left"
        onclick={startEdit}
        disabled={saving}
      >
        <span class="text-sm font-semibold truncate block">{exerciseName}</span>
      </button>

      <div class="flex items-center gap-0.5 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          disabled={!canMoveUp || saving}
          aria-label="Move exercise up"
          onclick={() => void onMoveUp()}
        >
          <ArrowUp class="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          disabled={!canMoveDown || saving}
          aria-label="Move exercise down"
          onclick={() => void onMoveDown()}
        >
          <ArrowDown class="h-3.5 w-3.5" />
        </Button>
      </div>

      <span class="text-xs text-muted-foreground shrink-0">
        {setCount} set{setCount === 1 ? "" : "s"}
      </span>

      <Button
        size="icon"
        class="h-7 w-7 shrink-0"
        onclick={() => void onAddSet()}
        disabled={saving}
        aria-label="Add set"
      >
        <Plus class="h-3.5 w-3.5" />
      </Button>

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

  {#if suggestion && suggestion.sets.length > 0}
    <p class="px-3 pb-1.5 text-xs text-muted-foreground -mt-1">
      Target: {formatTarget(suggestion)}
    </p>
  {/if}
</div>

<!-- Sets -->
{@render children?.()}
