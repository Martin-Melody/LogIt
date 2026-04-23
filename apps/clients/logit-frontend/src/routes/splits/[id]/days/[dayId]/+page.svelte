<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { back } from "$lib/navigation";

  import { Button } from "$lib/components/ui/button";

  import type { WorkoutSplit, SplitDay, PlannedExercise } from "$lib/domain/WorkoutSplit";
  import { touchSplit } from "$lib/domain/WorkoutSplit";
  import { createId } from "$lib/domain/ids";

  import { getSplit } from "$lib/usecases/Splits/getSplit";
  import { saveSplit } from "$lib/usecases/Splits/saveSplit";

  import { ArrowLeft, Plus, Trash, Check, X, GripVertical } from "lucide-svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import ExerciseSearchInput from "$lib/components/ExerciseSearchInput.svelte";

  const props = $props<{ params: { id: string; dayId: string } }>();
  const splitId = $derived(props.params.id);
  const dayId = $derived(props.params.dayId);

  const ui = $state({
    loading: true,
    saving: false,
    error: null as string | null,
    addOpen: false,
    renamingDay: false,
    dayNameDraft: "",
  });

  let split = $state<WorkoutSplit | null>(null);
  let dayNameInput = $state<HTMLInputElement | null>(null);

  const day = $derived<SplitDay | null>(
    split ? ((split.days ?? []).find((x) => x.id === dayId) ?? null) : null,
  );

  function sortExercises(exs: PlannedExercise[]): PlannedExercise[] {
    return [...exs].sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      split = await getSplit(splitId);
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load";
      split = null;
    } finally {
      ui.loading = false;
    }
  }

  async function persist(next: WorkoutSplit) {
    ui.saving = true;
    ui.error = null;
    try {
      const touched = touchSplit(next);
      await saveSplit(touched);
      split = touched;
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to save";
    } finally {
      ui.saving = false;
    }
  }

  function startRenameDay() {
    if (!day) return;
    ui.dayNameDraft = day.name ?? "";
    ui.renamingDay = true;
    queueMicrotask(() => dayNameInput?.focus());
  }

  async function commitRenameDay() {
    if (!split || !day) return;
    const name = ui.dayNameDraft.trim();
    ui.renamingDay = false;
    if (name === (day.name ?? "")) return;
    const next: WorkoutSplit = {
      ...split,
      days: split.days.map((d) => (d.id === day.id ? { ...d, name } : d)),
    };
    await persist(next);
  }

  function cancelRenameDay() {
    ui.renamingDay = false;
    ui.dayNameDraft = day?.name ?? "";
  }

  async function addExercise(selection: { name: string; exerciseId?: string }) {
    if (!split || !day) return;
    const nextOrder =
      day.exercises.length === 0
        ? 0
        : Math.max(...day.exercises.map((e) => e.orderIndex)) + 1;
    const newEx: PlannedExercise = {
      id: createId("pex"),
      orderIndex: nextOrder,
      exerciseName: selection.name,
      exerciseId: selection.exerciseId,
      targets: {},
    };
    const next: WorkoutSplit = {
      ...split,
      days: split.days.map((d) =>
        d.id === day.id ? { ...d, exercises: [...d.exercises, newEx] } : d,
      ),
    };
    ui.addOpen = false;
    await persist(next);
  }

  async function deleteExercise(exId: string) {
    if (!split || !day) return;
    const next: WorkoutSplit = {
      ...split,
      days: split.days.map((d) => {
        if (d.id !== day.id) return d;
        return { ...d, exercises: d.exercises.filter((e) => e.id !== exId) };
      }),
    };
    await persist(next);
  }

  async function deleteDay() {
    if (!split || !day) return;
    const next: WorkoutSplit = {
      ...split,
      days: split.days
        .filter((d) => d.id !== day.id)
        .map((d, i) => ({ ...d, orderIndex: i })),
    };
    await persist(next);
    back(`/splits/${splitId}`);
  }

  onMount(() => { void load(); });
</script>

<div class="flex flex-col pb-24">
  <!-- Header -->
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={() => back(`/splits/${splitId}`)}>
      <ArrowLeft class="h-4 w-4" />
    </Button>

    {#if ui.renamingDay}
      <input
        bind:this={dayNameInput}
        class="flex-1 min-w-0 bg-transparent text-sm font-semibold focus:outline-none border-b border-primary"
        bind:value={ui.dayNameDraft}
        placeholder="Day name (optional)"
        disabled={ui.saving}
        onkeydown={(e) => {
          if (e.key === "Enter") void commitRenameDay();
          if (e.key === "Escape") cancelRenameDay();
        }}
        onblur={() => void commitRenameDay()}
      />
      <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" onclick={cancelRenameDay}>
        <X class="h-3.5 w-3.5" />
      </Button>
      <Button size="icon" class="h-7 w-7 shrink-0" onclick={() => void commitRenameDay()}>
        <Check class="h-3.5 w-3.5" />
      </Button>
    {:else}
      <button
        type="button"
        class="flex-1 min-w-0 text-left"
        onclick={startRenameDay}
        disabled={ui.loading || ui.saving || !day}
      >
        <span class="text-sm font-semibold">
          {#if day}
            Day {day.orderIndex + 1}{day.name ? ` — ${day.name}` : ""}
          {:else}
            Day
          {/if}
        </span>
      </button>

      <div class="flex items-center gap-1 shrink-0">
        <Button
          size="icon"
          class="h-7 w-7"
          disabled={!day || ui.saving}
          onclick={() => (ui.addOpen = !ui.addOpen)}
          aria-label="Add exercise"
        >
          <Plus class="h-3.5 w-3.5" />
        </Button>

        <ConfirmDialog
          title="Delete this day?"
          description="Removes the day and all its exercises. Cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          saving={ui.saving}
          onConfirm={deleteDay}
        >
          <Button variant="ghost" size="icon" class="h-7 w-7 text-destructive" disabled={!day || ui.saving}>
            <Trash class="h-3.5 w-3.5" />
          </Button>
        </ConfirmDialog>
      </div>
    {/if}
  </div>

  {#if ui.error}
    <p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>
  {/if}

  <!-- Add exercise inline search -->
  {#if ui.addOpen}
    <div class="px-3 py-2 border-b border-border bg-muted/30">
      <ExerciseSearchInput
        placeholder="Search or add exercise…"
        disabled={ui.saving}
        autofocus={ui.addOpen}
        onConfirm={(sel) => void addExercise(sel)}
      />
      <Button
        variant="ghost"
        class="mt-1 h-7 px-2 text-xs text-muted-foreground"
        onclick={() => (ui.addOpen = false)}
      >
        Cancel
      </Button>
    </div>
  {/if}

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if !split}
    <p class="px-3 py-4 text-sm text-muted-foreground">Split not found.</p>
  {:else if !day}
    <p class="px-3 py-4 text-sm text-muted-foreground">Day not found.</p>
  {:else if day.exercises.length === 0}
    <div class="px-3 py-6 flex flex-col items-center gap-2 text-center">
      <p class="text-sm text-muted-foreground">No exercises yet.</p>
      <Button variant="outline" size="sm" onclick={() => (ui.addOpen = true)}>
        Add first exercise
      </Button>
    </div>
  {:else}
    <!-- Exercise section header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-border">
      <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Exercises · {day.exercises.length}
      </span>
    </div>

    <ul class="divide-y divide-border">
      {#each sortExercises(day.exercises) as ex, i (ex.id)}
        <li class="flex items-center gap-2 px-3 py-2.5">
          <span class="text-xs text-muted-foreground w-5 text-right shrink-0">{i + 1}</span>
          <span class="flex-1 min-w-0 text-sm truncate">{ex.exerciseName}</span>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            disabled={ui.saving}
            onclick={() => void deleteExercise(ex.id)}
            aria-label="Remove {ex.exerciseName}"
          >
            <X class="h-3.5 w-3.5" />
          </Button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
