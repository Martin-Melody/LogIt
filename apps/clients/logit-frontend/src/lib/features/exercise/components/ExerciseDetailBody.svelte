<script lang="ts">
  import { Trash2, RotateCcw, Package } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import ExerciseProgressionPanel from "$lib/features/exercise/components/ExerciseProgressionPanel.svelte";
  import MachineWeightEditor from "$lib/features/exercise/components/MachineWeightEditor.svelte";
  import type { Exercise, ExercisePatch, ExerciseType, Machine } from "@logit/core/domain/exercise";
  import { getExerciseRepo } from "$lib/data/repoProvider";
  import { updateExercise } from "$lib/usecases/updateExercise";
  import { getExerciseStats, type ExerciseStats } from "@logit/core/usecases/progression/getExerciseStats";
  import { resetExerciseProgression } from "@logit/core/usecases/progression/resetExerciseProgression";
  import { pushDeletedExercise } from "$lib/sync/syncService";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import { createId } from "@logit/core/domain/ids";
  import { exportExercisesAsPack, isUserExercise } from "$lib/plugins";
  import { reveal } from "$lib/transitions";

  const {
    exerciseId,
    onExercise = (_ex: Exercise | null) => {},
    onDeleted = () => {},
  } = $props<{
    exerciseId: string;
    /** Reports the loaded exercise (or null) so host chrome can show a title. */
    onExercise?: (ex: Exercise | null) => void;
    /** Called after the exercise is deleted — host navigates away / closes. */
    onDeleted?: () => void;
  }>();

  const view = $state({
    loading: true,
    error: null as string | null,
    exercise: null as Exercise | null,
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
  let newMachineName = $state("");

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
      view.exercise = await getExerciseRepo().getById(exerciseId);
      if (view.exercise) {
        draftName = view.exercise.name;
        draftNotes = view.exercise.notes ?? "";
        draftType = view.exercise.exerciseType ?? "normal";
      }
      onExercise(view.exercise);
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
      stats.data = await getExerciseStats({ id: view.exercise.id, name: view.exercise.name }, getProgressionDeps());
    } finally {
      stats.loading = false;
    }
  }

  async function saveField(patch: ExercisePatch) {
    if (!view.exercise) return;
    await updateExercise(view.exercise.id, patch);
    view.exercise = { ...view.exercise, ...patch };
    onExercise(view.exercise);
  }

  function commitName() {
    if (!view.exercise) return;
    const trimmed = draftName.trim();
    if (!trimmed) {
      draftName = view.exercise.name;
      return;
    }
    if (trimmed === view.exercise.name) return;
    void saveField({ name: trimmed });
  }

  function commitNotes() {
    if (!view.exercise) return;
    const trimmed = draftNotes.trim() || null;
    if (trimmed === (view.exercise.notes ?? null)) return;
    void saveField({ notes: trimmed });
  }

  function selectType(type: ExerciseType) {
    draftType = type;
    if (!view.exercise || view.exercise.exerciseType === type) return;
    void saveField({ exerciseType: type });
  }

  async function doDelete() {
    if (!view.exercise) return;
    view.deleting = true;
    try {
      await getExerciseRepo().remove(view.exercise.id);
      pushDeletedExercise(view.exercise.id);
      onDeleted();
    } finally {
      view.deleting = false;
    }
  }

  let exportOpen = $state(false);
  let exportName = $state("");
  let exporting = $state(false);
  let exportError = $state<string | null>(null);

  function openExport() {
    exportName = view.exercise ? `${view.exercise.name} pack` : "";
    exportError = null;
    exportOpen = true;
  }

  async function doExport() {
    if (!view.exercise || !exportName.trim() || exporting) return;
    exporting = true;
    exportError = null;
    try {
      await exportExercisesAsPack(exportName, [view.exercise]);
      exportOpen = false;
    } catch (e) {
      exportError = e instanceof Error ? e.message : "Could not build the pack.";
    } finally {
      exporting = false;
    }
  }

  async function addMachine() {
    if (!view.exercise || !newMachineName.trim()) return;
    const machine: Machine = { id: createId("mach"), name: newMachineName.trim(), incrementKg: 2.5 };
    const patch: ExercisePatch = { machines: [...(view.exercise.machines ?? []), machine] };
    await updateExercise(view.exercise.id, patch);
    view.exercise = { ...view.exercise, ...patch };
    newMachineName = "";
  }

  async function removeMachine(machineId: string) {
    if (!view.exercise) return;
    const patch: ExercisePatch = { machines: (view.exercise.machines ?? []).filter((m) => m.id !== machineId) };
    if (view.exercise.defaultMachineId === machineId) patch.defaultMachineId = undefined;
    await updateExercise(view.exercise.id, patch);
    view.exercise = { ...view.exercise, ...patch };
  }

  async function updateMachine(machineId: string, machinePatch: Partial<Machine>) {
    if (!view.exercise) return;
    const patch: ExercisePatch = {
      machines: (view.exercise.machines ?? []).map((m) =>
        m.id === machineId ? { ...m, ...machinePatch } : m,
      ),
    };
    await updateExercise(view.exercise.id, patch);
    view.exercise = { ...view.exercise, ...patch };
  }

  async function setDefaultMachine(machineId: string) {
    if (!view.exercise) return;
    const patch: ExercisePatch = { defaultMachineId: machineId };
    await updateExercise(view.exercise.id, patch);
    view.exercise = { ...view.exercise, ...patch };
  }

  async function doReset() {
    if (!view.exercise) return;
    view.resetting = true;
    view.resetDone = false;
    try {
      await resetExerciseProgression({ id: view.exercise.id, name: view.exercise.name }, getProgressionDeps());
      view.resetDone = true;
    } finally {
      view.resetting = false;
    }
  }

  $effect(() => {
    exerciseId;
    void load().then(() => void loadStats());
  });
</script>

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
        onblur={commitName}
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
        onblur={commitNotes}
      ></textarea>
    </div>

    <div class="flex flex-col gap-1.5">
      <span class="text-sm font-medium">Type</span>
      <div class="flex gap-2">
        {#each ([["normal", "Normal"], ["assisted", "Assisted"], ["bodyweight", "Bodyweight"]] as [ExerciseType, string][]) as [type, label] (type)}
          <button
            type="button"
            class="flex-1 py-1.5 rounded border text-xs font-medium transition-colors {draftType === type ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}"
            onclick={() => selectType(type)}
          >
            {label}
          </button>
        {/each}
      </div>
      {#if draftType === "assisted"}
        <p class="text-xs text-muted-foreground" transition:reveal>Weight = assistance amount. Progression reduces assistance each session.</p>
      {:else if draftType === "bodyweight"}
        <p class="text-xs text-muted-foreground" transition:reveal>Enter 0 for pure bodyweight, or extra load on top (e.g. 25 = BW+25kg).</p>
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

  <!-- Machines -->
  <div class="px-3 py-4 border-b border-border flex flex-col gap-3">
    <div>
      <span class="text-sm font-medium">Machines</span>
      <p class="text-xs text-muted-foreground">
        Set each machine's real weight settings so suggestions land on numbers
        you can actually select.
      </p>
    </div>

    {#each view.exercise.machines ?? [] as m (m.id)}
      <div transition:reveal>
        <MachineWeightEditor
          machine={m}
          isDefault={view.exercise.defaultMachineId === m.id}
          onChange={(patch) => void updateMachine(m.id, patch)}
          onDelete={() => void removeMachine(m.id)}
          onMakeDefault={() => void setDefaultMachine(m.id)}
        />
      </div>
    {/each}

    <div class="flex gap-2 min-w-0">
      <input
        type="text"
        placeholder="Add a machine…"
        class="flex-1 min-w-0 rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        bind:value={newMachineName}
        onkeydown={(e) => { if (e.key === "Enter") void addMachine(); }}
      />
      <button
        type="button"
        class="shrink-0 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
        disabled={!newMachineName.trim()}
        onclick={() => void addMachine()}
      >
        Add
      </button>
    </div>
  </div>

  <!-- Export as pack (custom exercises only) -->
  {#if isUserExercise(view.exercise)}
    <div class="px-3 py-4 border-b border-border flex flex-col gap-2">
      {#if exportOpen}
        <div class="flex flex-col gap-2" transition:reveal>
          <span class="text-sm font-medium">Export as pack</span>
          <p class="text-xs text-muted-foreground">
            Saves this exercise as a <code>.logit-pack.json</code> file. Anyone can
            install it from Plugins → Add → File.
          </p>
          <input
            type="text"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Pack name"
            bind:value={exportName}
          />
          {#if exportError}
            <p class="text-xs text-destructive">{exportError}</p>
          {/if}
          <div class="flex gap-2">
            <Button size="sm" disabled={!exportName.trim() || exporting} onclick={() => void doExport()}>
              {exporting ? "Exporting…" : "Download"}
            </Button>
            <Button size="sm" variant="outline" onclick={() => (exportOpen = false)}>Cancel</Button>
          </div>
        </div>
      {:else}
        <Button variant="outline" class="w-full" onclick={openExport}>
          <Package class="h-4 w-4" /> Export as pack
        </Button>
      {/if}
    </div>
  {/if}

  <!-- Reset progression -->
  <div class="px-3 py-4 flex flex-col gap-2 {view.exercise.isCore ? '' : 'border-b border-border'}">
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
      <p class="text-xs text-muted-foreground text-center" transition:reveal>Progression reset.</p>
    {/if}
  </div>

  <!-- Delete (custom exercises only) -->
  {#if !view.exercise.isCore}
    <div class="px-3 py-4">
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
            variant="outline"
            class="w-full border-destructive/50 text-destructive"
            disabled={view.loading || view.deleting}
            aria-label="Delete exercise"
          >
            <Trash2 class="h-4 w-4" /> Delete exercise
          </Button>
        {/snippet}
      </ConfirmDialog>
    </div>
  {/if}
{/if}
