<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowLeft, Trash2, RotateCcw } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import ExerciseProgressionPanel from "$lib/features/exercise/components/ExerciseProgressionPanel.svelte";
  import type { Exercise, ExercisePatch, ExerciseType } from "$lib/domain/exercise";
  import { getExerciseRepo } from "$lib/data/repoProvider";
  import { updateExercise } from "$lib/usecases/updateExercise";
  import { getExerciseStats, type ExerciseStats } from "$lib/usecases/progression/getExerciseStats";
  import { resetExerciseProgression } from "$lib/usecases/progression/resetExerciseProgression";
  import { pushDeletedExercise } from "$lib/sync/syncService";

  const props = $props<{ params: { id: string } }>();
  const id = $derived(props.params.id);

  const view = $state({
    loading: true,
    error: null as string | null,
    exercise: null as Exercise | null,
    saving: false,
    deleting: false,
    resetting: false,
    resetDone: false,
  });

  const stats = $state({
    loading: true,
    data: null as ExerciseStats | null,
  });

  let draftName = $state("");
  let draftNotes = $state("");
  let draftType = $state<ExerciseType>("normal");

  function formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  async function load() {
    view.loading = true;
    view.error = null;
    try {
      view.exercise = await getExerciseRepo().getById(id);
      if (view.exercise) {
        draftName = view.exercise.name;
        draftNotes = view.exercise.notes ?? "";
        draftType = view.exercise.exerciseType ?? "normal";
      }
    } catch (e) {
      view.error = e instanceof Error ? e.message : "Failed to load exercise";
    } finally {
      view.loading = false;
    }
  }

  async function loadStats() {
    if (!view.exercise) return;
    stats.loading = true;
    try {
      stats.data = await getExerciseStats({ id: view.exercise.id, name: view.exercise.name });
    } finally {
      stats.loading = false;
    }
  }

  async function save() {
    if (!view.exercise || !draftName.trim()) return;
    view.saving = true;
    try {
      const patch: ExercisePatch = {
        name: draftName.trim(),
        notes: draftNotes.trim() || null,
        exerciseType: draftType,
      };
      await updateExercise(view.exercise.id, patch);
      view.exercise = { ...view.exercise, ...patch };
    } finally {
      view.saving = false;
    }
  }

  async function doDelete() {
    if (!view.exercise) return;
    view.deleting = true;
    try {
      await getExerciseRepo().remove(view.exercise.id);
      pushDeletedExercise(view.exercise.id);
      back("/exercises");
    } finally {
      view.deleting = false;
    }
  }

  async function doReset() {
    if (!view.exercise) return;
    view.resetting = true;
    view.resetDone = false;
    try {
      await resetExerciseProgression({ id: view.exercise.id, name: view.exercise.name });
      view.resetDone = true;
    } finally {
      view.resetting = false;
    }
  }

  onMount(() => { void load().then(() => void loadStats()); });
  $effect(() => { id; void load().then(() => void loadStats()); });
</script>

<div class="flex flex-col pb-24">
  <!-- Header -->
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={() => back("/exercises")}>
      <ArrowLeft class="h-4 w-4" />
    </Button>

    <div class="flex-1 min-w-0">
      <span class="text-sm font-semibold truncate block">{view.exercise?.name ?? "Exercise"}</span>
    </div>

    {#if view.exercise && !view.exercise.isCore}
      <ConfirmDialog
        title={`Delete "${view.exercise.name}"?`}
        description="Removes the exercise. Workout history referencing it is not affected."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        saving={view.deleting}
        onConfirm={doDelete}
      >
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-muted-foreground hover:text-destructive"
            disabled={view.loading || view.deleting}
            aria-label="Delete exercise"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </Button>
        {/snippet}
      </ConfirmDialog>
    {/if}
  </div>

  {#if view.error}
    <p class="px-3 py-2 text-sm text-destructive border-b border-border">{view.error}</p>
  {/if}

  {#if view.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if !view.exercise}
    <p class="px-3 py-4 text-sm text-muted-foreground">Exercise not found.</p>
  {:else}
    <!-- Edit form -->
    <div class="flex flex-col gap-4 px-3 py-4 border-b border-border">
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="ex-name">Name</label>
        <input
          id="ex-name"
          type="text"
          class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          bind:value={draftName}
          disabled={view.exercise.isCore}
        />
        {#if view.exercise.isCore}
          <p class="text-xs text-muted-foreground">Built-in exercises cannot be renamed.</p>
        {/if}
      </div>

      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="ex-notes">
          Notes <span class="text-muted-foreground font-normal">(optional)</span>
        </label>
        <textarea
          id="ex-notes"
          rows="3"
          class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          bind:value={draftNotes}
        ></textarea>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">Type</span>
        <div class="flex gap-2">
          {#each ([["normal", "Normal"], ["assisted", "Assisted"], ["bodyweight", "Bodyweight"]] as [ExerciseType, string][]) as [type, label] (type)}
            <button
              type="button"
              class="flex-1 py-1.5 rounded border text-xs font-medium transition-colors {draftType === type ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}"
              onclick={() => (draftType = type)}
            >
              {label}
            </button>
          {/each}
        </div>
        {#if draftType === "assisted"}
          <p class="text-xs text-muted-foreground">Weight = assistance amount. Progression reduces assistance each session.</p>
        {:else if draftType === "bodyweight"}
          <p class="text-xs text-muted-foreground">Enter 0 for pure bodyweight, or extra load on top (e.g. 25 = BW+25kg).</p>
        {/if}
      </div>

      {#if view.exercise.primaryMuscles.length > 0 || view.exercise.secondaryMuscles.length > 0}
        <div class="flex flex-col gap-1 text-xs text-muted-foreground">
          {#if view.exercise.primaryMuscles.length > 0}
            <p>Primary: {view.exercise.primaryMuscles.map(capitalize).join(", ")}</p>
          {/if}
          {#if view.exercise.secondaryMuscles.length > 0}
            <p>Secondary: {view.exercise.secondaryMuscles.map(capitalize).join(", ")}</p>
          {/if}
        </div>
      {/if}

      <button
        type="button"
        class="w-full py-2.5 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        disabled={!draftName.trim() || view.saving}
        onclick={() => void save()}
      >
        {view.saving ? "Saving…" : "Save changes"}
      </button>
    </div>

    <!-- Core stats -->
    <div class="px-3 py-4 border-b border-border">
      {#if stats.loading}
        <p class="text-sm text-muted-foreground text-center py-2">Loading stats…</p>
      {:else if stats.data}
        <div class="grid grid-cols-3 gap-2">
          <div class="text-center">
            <p class="text-base font-semibold tabular-nums">
              {stats.data.bestSet ? `${stats.data.bestSet.weight}kg × ${stats.data.bestSet.reps}` : "—"}
            </p>
            <p class="text-xs text-muted-foreground mt-0.5">Best set</p>
          </div>
          <div class="text-center">
            <p class="text-base font-semibold tabular-nums">{stats.data.totalSessions}</p>
            <p class="text-xs text-muted-foreground mt-0.5">Sessions</p>
          </div>
          <div class="text-center">
            <p class="text-base font-semibold tabular-nums">
              {stats.data.lastPerformedMs ? formatDate(stats.data.lastPerformedMs) : "Never"}
            </p>
            <p class="text-xs text-muted-foreground mt-0.5">Last performed</p>
          </div>
        </div>
      {/if}
    </div>

    <!-- Progression -->
    <div class="px-3 py-4 border-b border-border">
      <ExerciseProgressionPanel exercise={{ id: view.exercise.id, name: view.exercise.name }} />
    </div>

    <!-- Reset progression -->
    <div class="px-3 py-4 flex flex-col gap-2">
      <ConfirmDialog
        title="Reset progression for this exercise?"
        description="Clears the saved progression state so the algorithm restarts from scratch next time this exercise appears in a session. Your workout history is not affected."
        confirmLabel="Reset"
        cancelLabel="Cancel"
        saving={view.resetting}
        onConfirm={doReset}
      >
        {#snippet child({ props })}
          <Button
            {...props}
            variant="outline"
            class="w-full border-destructive/50 text-destructive"
          >
            <RotateCcw class="h-4 w-4" /> Reset progression
          </Button>
        {/snippet}
      </ConfirmDialog>
      {#if view.resetDone}
        <p class="text-xs text-muted-foreground text-center">Progression reset.</p>
      {/if}
    </div>
  {/if}
</div>
