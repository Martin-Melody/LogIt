<script lang="ts">
  import { goto } from "$app/navigation";
  import { get } from "svelte/store";
  import { onMount } from "svelte";
  import { Plus } from "lucide-svelte";

  import { flip } from "svelte/animate";
  import type { DndEvent } from "svelte-dnd-action";
  import { dragHandleZone } from "svelte-dnd-action";

  import { getWorkoutRepo } from "$lib/data/repoProvider";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { recentSessions } from "$lib/stores/recentSessions.store";
  import { setTypesStore } from "$lib/stores/setTypeStore";

  import type { SetEntry, WorkoutSession } from "$lib/domain/workout";
  import {
    addExercise,
    addSet,
    removeExercise,
    updateSet,
    updateExerciseName,
    removeSet,
  } from "$lib/domain/workout";

  import { Button } from "$lib/components/ui/button/index.js";

  import CurrentSessionHeader from "./CurrentSessionHeader.svelte";
  import EmptySessionCard from "./EmptySessionCard.svelte";
  import ExerciseCard from "./ExerciseCard.svelte";
  import SetRow from "./SetRow.svelte";
  import SetsTableHeader from "./SetsTableHeader.svelte";
  import FinishWorkoutCard from "./FinishWorkoutCard.svelte";
  import AddExerciseDialog from "./AddExerciseDialog.svelte";
  import SwipeRevealRow from "./SwipeRevealRow.svelte";
  import EditSetDialog from "./EditSetDialog.svelte";

  import { keyboard } from "$lib/stores/keybaord.store";
  import { formatShortDate } from "$lib/utils";
  import { getSessionDate } from "$lib/domain/sessions/sessionDates";
  import { reorderSetsInExercise } from "$lib/domain/workout/reorderSets";

  onMount(() => {
    setTypesStore.load();
  });

  const ui = $state({
    saving: false,
    finishing: false,
    error: null as string | null,
  });

  const editSetUi = $state({
    open: false,
    exerciseEntryId: null as string | null,
    setId: null as string | null,
  });

  const addExerciseUi = $state({ open: false });

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
    if (ui.finishing) return;
    currentSession.setSession(next);

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

  function getEditableSet() {
    const s = getSessionOrNull();
    if (!s) return null;

    const exId = editSetUi.exerciseEntryId;
    const setId = editSetUi.setId;
    if (!exId || !setId) return null;

    const ex = s.exercises.find((x) => x.id === exId);
    const set = ex?.sets.find((t) => t.id === setId);
    if (!set) return null;

    return {
      reps: set.reps,
      weight: set.weight,
      setType: set.setType,
      note: set.note ?? null,
    };
  }

  async function addExerciseWithName(name: string) {
    const s = getSessionOrNull();
    if (!s) return;

    const trimmed = name.trim();
    if (!trimmed) return;

    const updated = addExercise(s, { exerciseName: trimmed });
    await persistDraft(updated);
  }

  function onAddExercise() {
    if (ui.finishing) return;
    addExerciseUi.open = true;
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

  async function onDeleteSet(exerciseId: string, setId: string) {
    const s = getSessionOrNull();
    if (!s) return;

    const deleted = removeSet(s, exerciseId, setId);
    await persistDraft(deleted);
  }

  function openEditSetDialog(exerciseEntryId: string, setId: string) {
    if (ui.finishing) return;
    editSetUi.exerciseEntryId = exerciseEntryId;
    editSetUi.setId = setId;
    editSetUi.open = true;
  }

  async function saveSetPatch(
    patch: Partial<
      Pick<SetEntry, "reps" | "weight" | "setType" | "note" | "completed">
    >,
  ) {
    const s = getSessionOrNull();
    if (!s) return;

    const exId = editSetUi.exerciseEntryId;
    const setId = editSetUi.setId;
    if (!exId || !setId) return;

    const updated = updateSet(s, exId, setId, patch);
    await persistDraft(updated);
  }

  async function setCompleted(
    exerciseEntryId: string,
    setId: string,
    v: boolean,
  ) {
    const s = getSessionOrNull();
    if (!s) return;

    const updated = updateSet(s, exerciseEntryId, setId, { completed: v });
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
    if (ui.finishing) return;

    ui.finishing = true;
    ui.error = null;

    currentSession.beginTransition();

    try {
      await goto("/");
      await currentSession.finish();
      void recentSessions.refresh(5);
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to finish workout";
      ui.finishing = false;
      currentSession.endTransition();
    }
  }

  const subtitle = $derived(() => $currentSession?.origin?.dayName ?? null);

  const description = $derived(() =>
    $currentSession?.origin
      ? "Follow the plan and log your sets."
      : "Log sets as you go.",
  );

  const flipDurationMs = 150;

  function applySetOrder(exerciseEntryId: string, e: CustomEvent<DndEvent>) {
    const s = getSessionOrNull();
    if (!s) return null;

    const nextSets = e.detail.items as SetEntry[];
    return reorderSetsInExercise(s, exerciseEntryId, nextSets);
  }

  function onSetsConsider(exerciseEntryId: string, e: CustomEvent<DndEvent>) {
    const next = applySetOrder(exerciseEntryId, e);
    if (!next) return;
    currentSession.setSession(next);
  }

  async function onSetsFinalize(
    exerciseEntryId: string,
    e: CustomEvent<DndEvent>,
  ) {
    const next = applySetOrder(exerciseEntryId, e);
    if (!next) return;
    await persistDraft(next);
  }
</script>

<div class="p-1 flex flex-col gap-3 pb-40">
  <CurrentSessionHeader
    date={$currentSession
      ? formatShortDate(getSessionDate($currentSession)!)
      : ""}
    subtitle={subtitle()}
    description={description()}
    error={ui.error}
  />

  {#if !ui.finishing}
    {#if !$currentSession}
      <EmptySessionCard {onAddExercise} />
    {:else if $currentSession.exercises.length === 0}
      <EmptySessionCard {onAddExercise} />
    {:else}
      {#each [...$currentSession.exercises].sort(sortByOrderIndex) as ex (ex.id)}
        <ExerciseCard
          exerciseName={ex.exerciseName}
          setCount={ex.sets.length}
          saving={ui.saving || ui.finishing}
          onAddSet={() => onAddSet(ex.id)}
          onDelete={() => onDeleteExercise(ex.id)}
          onRename={(name) => onRenameExercise(ex.id, name)}
        >
          {#if ex.sets.length > 0}
            <SetsTableHeader />
          {/if}

          <div
            class="
    flex flex-col gap-2
    outline-none
    focus:outline-none
    focus-visible:outline-none
    select-none
  "
            use:dragHandleZone={{
              items: ex.sets,
              flipDurationMs,
              dragDisabled: ui.saving || ui.finishing,
              dropTargetStyle: {},
            }}
            onconsider={(e) =>
              onSetsConsider(ex.id, e as CustomEvent<DndEvent>)}
            onfinalize={(e) =>
              void onSetsFinalize(ex.id, e as CustomEvent<DndEvent>)}
          >
            {#each ex.sets as set (set.id)}
              <div animate:flip={{ duration: flipDurationMs }}>
                <SwipeRevealRow
                  disabled={ui.saving || ui.finishing}
                  actionsWidth={80}
                  onDelete={() => onDeleteSet(ex.id, set.id)}
                  onEdit={() => openEditSetDialog(ex.id, set.id)}
                >
                  <SetRow
                    setType={set.orderIndex}
                    reps={set.reps}
                    weight={set.weight}
                    completed={set.completed ?? false}
                    onCompletedChange={(v: boolean) =>
                      setCompleted(ex.id, set.id, v)}
                    disabled={ui.saving || ui.finishing}
                    onRepsChange={(r: number) => onRepsChange(ex.id, set.id, r)}
                    onWeightChange={(w: number) =>
                      onWeightChange(ex.id, set.id, w)}
                  />
                </SwipeRevealRow>
              </div>
            {/each}
          </div>

          {#if ex.sets.length === 0}
            <p class="text-sm text-muted-foreground">No sets yet.</p>
          {/if}
        </ExerciseCard>
      {/each}
    {/if}
  {/if}

  <EditSetDialog
    open={editSetUi.open}
    disabled={ui.saving || ui.finishing}
    initial={getEditableSet()}
    setTypeOptions={$setTypesStore.options}
    setTypeLoading={$setTypesStore.loading}
    onOpenChange={(v: boolean) => (editSetUi.open = v)}
    onSave={saveSetPatch}
  />

  <AddExerciseDialog
    open={addExerciseUi.open}
    saving={ui.saving || ui.finishing}
    onOpenChange={(v: boolean) => (addExerciseUi.open = v)}
    onSubmit={addExerciseWithName}
  />

  {#if !ui.finishing && !$keyboard.visible}
    <div class="fixed left-0 right-0 bottom-35 px-3">
      <div class="flex justify-end">
        <Button
          size="icon"
          class="rounded-full shadow-lg"
          disabled={ui.saving || ui.finishing}
          aria-label="Add exercise"
          onclick={() => (addExerciseUi.open = true)}
        >
          <Plus />
        </Button>
      </div>
    </div>

    <div
      class="fixed left-0 right-0 bottom-15 px-3 pb-[env(safe-area-inset-bottom)]"
    >
      <FinishWorkoutCard
        canFinish={!!$currentSession && !$currentSession.endedAtMs}
        saving={ui.saving || ui.finishing}
        onFinish={finish}
      />
    </div>
  {/if}
</div>
