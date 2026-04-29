<script lang="ts">
  import { goto } from "$app/navigation";
  import { get } from "svelte/store";
  import { Plus } from "lucide-svelte";
  import { toast } from "$lib/components/ui/sonner/index";

  import { getWorkoutRepo, getExerciseRepo } from "$lib/data/repoProvider";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { recentSessions } from "$lib/stores/recentSessions.store";
  import { getSuggestion, refreshProgressionState } from "$lib/usecases/progression/getSuggestion";
  import type { ProgressionOutput } from "$lib/domain/progression";

  import type { SetEntry, WorkoutSession } from "$lib/domain/workout";
  import { DEFAULT_REST_MS, addExercise, addSet, removeExercise, updateSet, updateExerciseName, removeSet, moveExercise, moveSet } from "$lib/domain/workout";

  import { Button } from "$lib/components/ui/button/index.js";

  import CurrentSessionHeader from "./CurrentSessionHeader.svelte";
  import EmptySessionCard from "./EmptySessionCard.svelte";
  import ExerciseCard from "$lib/features/session/ui/ExerciseCard.svelte";
  import SetRow from "$lib/features/session/ui/SetRow.svelte";
  import SetsTableHeader from "$lib/features/session/ui/SetsTableHeader.svelte";
  import FinishWorkoutCard from "./FinishWorkoutCard.svelte";
  import AddExerciseDialog from "$lib/features/session/ui/AddExerciseDialog.svelte";
  import SwipeRevealRow from "$lib/features/session/ui/SwipeRevealRow.svelte";
  import EditSetDialog from "$lib/features/session/ui/EditSetDialog.svelte";
  import RestProgressBar from "$lib/features/session/ui/RestProgressBar.svelte";
  import { keyboard } from "$lib/stores/keybaord.store";
  import { startSessionTour, destroyActiveTour } from "$lib/tour/index";
  import { onMount } from "svelte";

  onMount(() => {
    setTimeout(() => startSessionTour(), 600);
  });

  const suggestions = $state<Record<string, ProgressionOutput | null>>({});

  async function loadSuggestionForExercise(
    entryId: string,
    name: string,
    exerciseId?: string,
  ) {
    if (entryId in suggestions) return;
    suggestions[entryId] = null;
    try {
      suggestions[entryId] = await getSuggestion({ id: exerciseId, name });
    } catch {
      suggestions[entryId] = null;
    }
  }

  $effect(() => {
    const s = $currentSession;
    if (!s) return;
    for (const ex of s.exercises) {
      void loadSuggestionForExercise(ex.id, ex.exerciseName, ex.exerciseId);
    }
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
  let finishBarEl = $state<HTMLDivElement | null>(null);
  let addButtonBottom = $state(0);

  function updateAddButtonOffset() {
    addButtonBottom = (finishBarEl?.offsetHeight ?? 0) + 12;
  }

  onMount(() => {
    updateAddButtonOffset();

    const observer = new ResizeObserver(() => updateAddButtonOffset());
    if (finishBarEl) observer.observe(finishBarEl);

    window.addEventListener("resize", updateAddButtonOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateAddButtonOffset);
    };
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
      restDurationMs: set.restDurationMs ?? DEFAULT_REST_MS,
    };
  }

  async function addExerciseWithName(selection: { name: string; exerciseId?: string }) {
    const s = getSessionOrNull();
    if (!s) return;

    const trimmed = selection.name.trim();
    if (!trimmed) return;

    try {
      let exerciseId = selection.exerciseId;
      if (!exerciseId) {
        const ex = await getExerciseRepo().create(trimmed);
        exerciseId = ex.id;
      }

      const updated = addExercise(s, { exerciseName: trimmed, exerciseId });
      await persistDraft(updated);

      const newEntry = updated.exercises[updated.exercises.length - 1];
      if (newEntry) {
        void loadSuggestionForExercise(newEntry.id, newEntry.exerciseName, newEntry.exerciseId);
      }
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to add exercise";
      toast.error(ui.error);
    }
  }

  function onAddExercise() {
    if (ui.finishing) return;
    destroyActiveTour();
    addExerciseUi.open = true;
  }

  async function onAddSet(exerciseEntryId: string) {
    const s = getSessionOrNull();
    if (!s) return;

    const ex = s.exercises.find((e) => e.id === exerciseEntryId);
    const suggestion = suggestions[exerciseEntryId];
    const setIndex = ex?.sets.length ?? 0;
    const suggestedSet = suggestion?.sets[setIndex] ?? suggestion?.sets[0];

    const updated = addSet(s, exerciseEntryId, {
      reps: 0,
      weight: suggestedSet?.weight ?? 0,
    });
    await persistDraft(updated);
  }

  async function onMoveExercise(exerciseEntryId: string, direction: "up" | "down") {
    const s = getSessionOrNull();
    if (!s) return;
    const updated = moveExercise(s, exerciseEntryId, direction);
    await persistDraft(updated);
  }

  async function onMoveSet(exerciseEntryId: string, setId: string, direction: "up" | "down") {
    const s = getSessionOrNull();
    if (!s) return;
    const updated = moveSet(s, exerciseEntryId, setId, direction);
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
    patch: Partial<Pick<SetEntry, "reps" | "weight" | "setType" | "note" | "restDurationMs">>,
  ) {
    const s = getSessionOrNull();
    if (!s) return;

    const exId = editSetUi.exerciseEntryId;
    const setId = editSetUi.setId;
    if (!exId || !setId) return;

    const updated = updateSet(s, exId, setId, patch);
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

  function notifId(setId: string): number {
    let h = 5381;
    for (let i = 0; i < setId.length; i++) {
      h = ((h << 5) + h + setId.charCodeAt(i)) & 0x7fffffff;
    }
    return h || 1;
  }

  async function scheduleRestNotification(setId: string, restMs: number) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== "granted") return;
      await LocalNotifications.schedule({
        notifications: [{
          id: notifId(setId),
          title: "Rest complete",
          body: "Time to start your next set!",
          schedule: { at: new Date(Date.now() + restMs) },
          smallIcon: "ic_stat_icon_config_sample",
        }],
      });
    } catch {
      // Silently ignore on web / unsupported platforms
    }
  }

  async function cancelRestNotification(setId: string) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.cancel({ notifications: [{ id: notifId(setId) }] });
    } catch {}
  }

  async function triggerHaptic() {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch {}
  }

  async function onSetCompleted(exerciseEntryId: string, setId: string) {
    const s = getSessionOrNull();
    if (!s) return;

    const ex = s.exercises.find((e) => e.id === exerciseEntryId);
    const set = ex?.sets.find((t) => t.id === setId);
    if (!set) return;

    const wasCompleted = !!set.completed;
    const restMs = set.restDurationMs ?? DEFAULT_REST_MS;

    const updated = updateSet(s, exerciseEntryId, setId, {
      completed: !wasCompleted,
      restStartedAtMs: !wasCompleted ? Date.now() : null,
    });
    await persistDraft(updated);

    if (!wasCompleted) {
      void triggerHaptic();
      void scheduleRestNotification(setId, restMs);
    } else {
      void cancelRestNotification(setId);
    }
  }

  async function handleRestDone(exerciseEntryId: string, setId: string) {
    void cancelRestNotification(setId);
    toast("Rest complete — time for your next set!");
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
    const s = getSessionOrNull();
    if (!s) return;
    const updated = updateSet(s, exerciseEntryId, setId, { restStartedAtMs: null });
    await persistDraft(updated);
  }

  async function dismissRest(exerciseEntryId: string, setId: string) {
    void cancelRestNotification(setId);
    const s = getSessionOrNull();
    if (!s) return;
    const updated = updateSet(s, exerciseEntryId, setId, { restStartedAtMs: null });
    await persistDraft(updated);
  }

  async function finish() {
    if (ui.finishing) return;

    ui.finishing = true;
    ui.error = null;

    const sessionSnapshot = getSessionOrNull();

    currentSession.beginTransition();

    try {
      await goto("/");
      await currentSession.finish();
      void recentSessions.refresh(5);

      if (sessionSnapshot) {
        for (const ex of sessionSnapshot.exercises) {
          void refreshProgressionState({ id: ex.exerciseId, name: ex.exerciseName });
        }
      }
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to finish workout";
      ui.finishing = false;
      currentSession.endTransition();
    }
  }
</script>

<div
  class="flex flex-col pb-48"
  onpointerdown={(e) => {
    if (!(e.target as HTMLElement).closest("input, textarea")) {
      const active = document.activeElement as HTMLElement | null;
      if (active?.tagName === "INPUT" || active?.tagName === "TEXTAREA") {
        active.blur();
      }
    }
  }}
>
  <CurrentSessionHeader saving={ui.saving || ui.finishing} error={ui.error} />

  {#if !ui.finishing}
    {#if !$currentSession || $currentSession.exercises.length === 0}
      <EmptySessionCard {onAddExercise} />
    {:else}
      {@const sortedExercises = [...$currentSession.exercises].sort(sortByOrderIndex)}
      {#each sortedExercises as ex, exIdx (ex.id)}
        <ExerciseCard
          exerciseName={ex.exerciseName}
          setCount={ex.sets.length}
          saving={ui.saving || ui.finishing}
          canMoveUp={exIdx > 0}
          canMoveDown={exIdx < sortedExercises.length - 1}
          suggestion={suggestions[ex.id] ?? null}
          onAddSet={() => onAddSet(ex.id)}
          onDelete={() => onDeleteExercise(ex.id)}
          onRename={(name) => onRenameExercise(ex.id, name)}
          onMoveUp={() => onMoveExercise(ex.id, "up")}
          onMoveDown={() => onMoveExercise(ex.id, "down")}
        >
          {#if ex.sets.length > 0}
            <SetsTableHeader />
            {@const sortedSets = [...ex.sets].sort(sortByOrderIndex)}
            {#each sortedSets as set, i (set.id)}
              <SwipeRevealRow
                disabled={ui.saving || ui.finishing}
                actionsWidth={80}
                onDelete={() => onDeleteSet(ex.id, set.id)}
                onEdit={() => openEditSetDialog(ex.id, set.id)}
              >
                <SetRow
                  setNumber={i + 1}
                  setType={set.setType}
                  reps={set.reps}
                  weight={set.weight}
                  completed={set.completed ?? false}
                  disabled={ui.saving || ui.finishing}
                  canMoveUp={i > 0}
                  canMoveDown={i < sortedSets.length - 1}
                  onRepsChange={(r) => onRepsChange(ex.id, set.id, r)}
                  onWeightChange={(w) => onWeightChange(ex.id, set.id, w)}
                  onComplete={() => onSetCompleted(ex.id, set.id)}
                  onMoveUp={() => onMoveSet(ex.id, set.id, "up")}
                  onMoveDown={() => onMoveSet(ex.id, set.id, "down")}
                />
              </SwipeRevealRow>
              {#if typeof set.restStartedAtMs === "number"}
                <RestProgressBar
                  restStartedAtMs={set.restStartedAtMs}
                  restDurationMs={set.restDurationMs ?? DEFAULT_REST_MS}
                  onDone={() => handleRestDone(ex.id, set.id)}
                  onDismiss={() => dismissRest(ex.id, set.id)}
                />
              {/if}
            {/each}
          {:else}
            <button
              type="button"
              class="w-full px-3 py-3 text-sm text-muted-foreground text-left hover:bg-muted/30"
              disabled={ui.saving || ui.finishing}
              onclick={() => onAddSet(ex.id)}
            >
              + Add first set
            </button>
          {/if}
        </ExerciseCard>
      {/each}
    {/if}
  {/if}

  <EditSetDialog
    open={editSetUi.open}
    disabled={ui.saving || ui.finishing}
    initial={getEditableSet()}
    onOpenChange={(v) => (editSetUi.open = v)}
    onSave={saveSetPatch}
  />

  <AddExerciseDialog
    open={addExerciseUi.open}
    saving={ui.saving || ui.finishing}
    onOpenChange={(v: boolean) => (addExerciseUi.open = v)}
    onSubmit={addExerciseWithName}
  />

  {#if !ui.finishing && !$keyboard.visible}
    <div
      class="fixed right-3 z-20"
      style={`bottom: ${addButtonBottom}px;`}
    >
      <Button
        size="icon"
        class="rounded-full shadow-lg"
        disabled={ui.saving || ui.finishing}
        aria-label="Add exercise"
        data-tour="session-add-exercise"
        onclick={() => { destroyActiveTour(); addExerciseUi.open = true; }}
      >
        <Plus />
      </Button>
    </div>

    <div
      bind:this={finishBarEl}
      data-tour="session-finish"
      class="fixed left-0 right-0 bottom-0 border-t border-border bg-background px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
    >
      <FinishWorkoutCard
        canFinish={!!$currentSession && !$currentSession.endedAtMs}
        saving={ui.saving || ui.finishing}
        onFinish={finish}
      />
    </div>
  {/if}
</div>
