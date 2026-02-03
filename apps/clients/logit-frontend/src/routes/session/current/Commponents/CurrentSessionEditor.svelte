<script lang="ts">
  import { goto } from "$app/navigation";
  import { get } from "svelte/store";

  import { getWorkoutRepo } from "$lib/data/repoProvider";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { recentSessions } from "$lib/stores/recentSessions.store";

  import type { WorkoutSession } from "$lib/domain/workout";
  import {
    addExercise,
    addSet,
    removeExercise,
    updateSet,
    updateExerciseName,
  } from "$lib/domain/workout";

  import CurrentSessionHeader from "./CurrentSessionHeader.svelte";
  import EmptySessionCard from "./EmptySessionCard.svelte";
  import ExerciseCard from "./ExerciseCard.svelte";
  import SetRow from "./SetRow.svelte";
  import SetsTableHeader from "./SetsTableHeader.svelte";
  import FinishWorkoutCard from "./FinishWorkoutCard.svelte";
  import AddExerciseDialog from "./AddExerciseDialog.svelte";

  const ui = $state({
    saving: false,
    error: null as string | null,
  });

  function sortByOrderIndex(
    a: { orderIndex: number },
    b: { orderIndex: number },
  ) {
    return a.orderIndex - b.orderIndex;
  }

  function getSessionOrNull(): WorkoutSession | null {
    return get(currentSession);
  }

  async function persistDraft(next: WorkoutSession) {
    // Update store first so UI feels instant
    currentSession.setSession(next);

    // Persist so "continue workout" survives reload/app close
    ui.saving = true;
    ui.error = null;
    try {
      await getWorkoutRepo().saveDraftSession(next);
    } catch (e) {
      ui.error =
        e instanceof Error ? e.message : "Failed to save draft session";
    } finally {
      ui.saving = false;
    }
  }

  async function addExerciseWithName(name: string) {
    const s = getSessionOrNull();
    if (!s) return;

    const trimmed = name.trim();
    if (!trimmed) return;

    const updated = addExercise(s, { exerciseName: trimmed });
    await persistDraft(updated);
  }

  async function onAddExercise() {
    const name = prompt("Exercise name?");
    if (!name?.trim()) return;
    await addExerciseWithName(name);
  }

  async function onAddSet(exerciseEntryId: string) {
    const s = getSessionOrNull();
    if (!s) return;

    const updated = addSet(s, exerciseEntryId, { reps: 0, weight: 0 });
    await persistDraft(updated);
  }

  async function onDeleteExercise(exerciseEntryId: string) {
    const s = getSessionOrNull();
    if (!s) return;

    const deleted = removeExercise(s, exerciseEntryId);
    await persistDraft(deleted);
  }

  async function onRenameExercise(exerciseEntryId: string, nextName: string) {
    const s = getSessionOrNull();
    if (!s) return;

    const updated = updateExerciseName(s, exerciseEntryId, nextName);
    await persistDraft(updated);
  }

  async function onRepsChange(
    exerciseEntryId: string,
    setId: string,
    reps: number,
  ) {
    const s = getSessionOrNull();
    if (!s) return;

    const safe = Number.isFinite(reps) ? Math.max(0, reps) : 0;
    const updated = updateSet(s, exerciseEntryId, setId, { reps: safe });
    await persistDraft(updated);
  }

  async function onWeightChange(
    exerciseEntryId: string,
    setId: string,
    weight: number,
  ) {
    const s = getSessionOrNull();
    if (!s) return;

    const safe = Number.isFinite(weight) ? Math.max(0, weight) : 0;
    const updated = updateSet(s, exerciseEntryId, setId, { weight: safe });
    await persistDraft(updated);
  }

  async function finish() {
    // Your store/usecase should: finish session, save finished, clear draft, clear store
    await currentSession.finish();

    // Make Home's recent card reflect the new finished session
    await recentSessions.refresh(5);

    await goto("/");
  }
</script>

<div class="p-3 flex flex-col gap-3 pb-40">
  <CurrentSessionHeader saving={ui.saving} error={ui.error} />

  {#if !$currentSession}
    <EmptySessionCard {onAddExercise} />
  {:else if $currentSession.exercises.length === 0}
    <EmptySessionCard {onAddExercise} />
  {:else}
    {#each [...$currentSession.exercises].sort(sortByOrderIndex) as ex (ex.id)}
      <ExerciseCard
        exerciseName={ex.exerciseName}
        setCount={ex.sets.length}
        saving={ui.saving}
        onAddSet={() => onAddSet(ex.id)}
        onDelete={() => onDeleteExercise(ex.id)}
        onRename={(name) => onRenameExercise(ex.id, name)}
      >
        {#if ex.sets.length > 0}
          <SetsTableHeader />
        {/if}

        {#each [...ex.sets].sort(sortByOrderIndex) as set (set.id)}
          <SetRow
            setType={set.setType}
            reps={set.reps}
            weight={set.weight}
            disabled={ui.saving}
            onRepsChange={(r) => onRepsChange(ex.id, set.id, r)}
            onWeightChange={(w) => onWeightChange(ex.id, set.id, w)}
          />
        {/each}

        {#if ex.sets.length === 0}
          <p class="text-sm text-muted-foreground">No sets yet.</p>
        {/if}
      </ExerciseCard>
    {/each}
  {/if}

  <!-- Floating “Add exercise” button (always visible) -->
  <div class="fixed left-0 right-0 bottom-35 px-3">
    <div class="flex justify-end">
      <AddExerciseDialog saving={ui.saving} onSubmit={addExerciseWithName} />
    </div>
  </div>
  <!-- Finish bar (always visible) -->
  <div
    class="fixed left-0 right-0 bottom-15 px-3 pb-[env(safe-area-inset-bottom)]"
  >
    <FinishWorkoutCard
      canFinish={!!$currentSession && !$currentSession.endedAtMs}
      saving={ui.saving}
      onFinish={finish}
    />
  </div>
</div>
