<script lang="ts">
  import { toast } from "$lib/components/ui/sonner/index";

  import type { ExerciseEntry, SetEntry, WorkoutSession } from "$lib/domain/workout";
  import {
    addSet,
    updateSet,
    removeSet,
    moveSet,
    updateExerciseName,
    DEFAULT_REST_MS,
  } from "$lib/domain/workout";
  import { getSuggestion } from "$lib/usecases/progression/getSuggestion";
  import type { ProgressionOutput } from "$lib/domain/progression";
  import type { BlockBaseProps } from "$lib/features/session/blocks/types";

  import ExerciseCard from "$lib/features/session/ui/ExerciseCard.svelte";
  import SetsTableHeader from "$lib/features/session/ui/SetsTableHeader.svelte";
  import SetRow from "$lib/features/session/ui/SetRow.svelte";
  import SwipeRevealRow from "$lib/features/session/ui/SwipeRevealRow.svelte";
  import EditSetDialog from "$lib/features/session/ui/EditSetDialog.svelte";
  import RestProgressBar from "$lib/features/session/ui/RestProgressBar.svelte";

  const {
    data,
    saving,
    canMoveUp,
    canMoveDown,
    onMoveUp,
    onMoveDown,
    onDelete,
    onMutate,
  } = $props<BlockBaseProps<ExerciseEntry>>();

  let suggestion = $state<ProgressionOutput | null>(null);
  let collapsed = $state(false);

  const editSet = $state({
    open: false,
    setId: null as string | null,
  });

  $effect(() => {
    const name = data.exerciseName;
    const id = data.exerciseId;
    void loadSuggestion(name, id);
  });

  async function loadSuggestion(name: string, exerciseId?: string) {
    try {
      suggestion = await getSuggestion({ id: exerciseId, name });
    } catch {
      suggestion = null;
    }
  }

  function sortByOrderIndex(a: { orderIndex: number }, b: { orderIndex: number }) {
    return a.orderIndex - b.orderIndex;
  }

  async function handleAddSet() {
    const setIndex = data.sets.length;
    const suggestedSet = suggestion?.sets[setIndex] ?? suggestion?.sets[0];
    await onMutate((s: WorkoutSession) =>
      addSet(s, data.id, { reps: 0, weight: suggestedSet?.weight ?? 0 }),
    );
    if (collapsed) collapsed = false;
  }

  async function handleRepsChange(setId: string, reps: number) {
    const safe = Number.isFinite(reps) ? Math.max(0, reps) : 0;
    await onMutate((s: WorkoutSession) => updateSet(s, data.id, setId, { reps: safe }));
  }

  async function handleWeightChange(setId: string, weight: number) {
    const safe = Number.isFinite(weight) ? Math.max(0, weight) : 0;
    await onMutate((s: WorkoutSession) => updateSet(s, data.id, setId, { weight: safe }));
  }

  async function handleMoveSet(setId: string, direction: "up" | "down") {
    await onMutate((s: WorkoutSession) => moveSet(s, data.id, setId, direction));
  }

  async function handleDeleteSet(setId: string) {
    await onMutate((s: WorkoutSession) => removeSet(s, data.id, setId));
  }

  function openEditSet(setId: string) {
    editSet.setId = setId;
    editSet.open = true;
  }

  function getEditableSet() {
    const set = data.sets.find((s) => s.id === editSet.setId);
    if (!set) return null;
    return {
      reps: set.reps,
      weight: set.weight,
      setType: set.setType,
      note: set.note ?? null,
      restDurationMs: set.restDurationMs ?? DEFAULT_REST_MS,
    };
  }

  async function saveSetPatch(
    patch: Partial<Pick<SetEntry, "reps" | "weight" | "setType" | "note" | "restDurationMs">>,
  ) {
    if (!editSet.setId) return;
    const setId = editSet.setId;
    await onMutate((s: WorkoutSession) => updateSet(s, data.id, setId, patch));
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
        notifications: [
          {
            id: notifId(setId),
            title: "Rest complete",
            body: "Time to start your next set!",
            schedule: { at: new Date(Date.now() + restMs) },
            smallIcon: "ic_stat_icon_config_sample",
          },
        ],
      });
    } catch {}
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

  async function handleComplete(setId: string) {
    const set = data.sets.find((s) => s.id === setId);
    if (!set) return;

    const wasCompleted = !!set.completed;
    const restMs = set.restDurationMs ?? DEFAULT_REST_MS;

    await onMutate((s: WorkoutSession) =>
      updateSet(s, data.id, setId, {
        completed: !wasCompleted,
        restStartedAtMs: !wasCompleted ? Date.now() : null,
      }),
    );

    if (!wasCompleted) {
      void triggerHaptic();
      void scheduleRestNotification(setId, restMs);
    } else {
      void cancelRestNotification(setId);
    }
  }

  async function handleRestDone(setId: string) {
    void cancelRestNotification(setId);
    toast("Rest complete — time for your next set!");
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
    await onMutate((s: WorkoutSession) =>
      updateSet(s, data.id, setId, { restStartedAtMs: null }),
    );
  }

  async function handleDismissRest(setId: string) {
    void cancelRestNotification(setId);
    await onMutate((s: WorkoutSession) =>
      updateSet(s, data.id, setId, { restStartedAtMs: null }),
    );
  }
</script>

<ExerciseCard
  exerciseName={data.exerciseName}
  setCount={data.sets.length}
  {saving}
  {canMoveUp}
  {canMoveDown}
  {suggestion}
  {collapsed}
  onToggleCollapse={() => (collapsed = !collapsed)}
  onAddSet={handleAddSet}
  onRename={(name) => onMutate((s: WorkoutSession) => updateExerciseName(s, data.id, name))}
  {onDelete}
  {onMoveUp}
  {onMoveDown}
>
  {#if data.sets.length > 0}
    <SetsTableHeader />
    {@const sortedSets = [...data.sets].sort(sortByOrderIndex)}
    {#each sortedSets as set, i (set.id)}
      <SwipeRevealRow
        disabled={saving}
        actionsWidth={80}
        onDelete={() => handleDeleteSet(set.id)}
        onEdit={() => openEditSet(set.id)}
      >
        <SetRow
          setNumber={i + 1}
          setType={set.setType}
          reps={set.reps}
          weight={set.weight}
          completed={set.completed ?? false}
          disabled={saving}
          canMoveUp={i > 0}
          canMoveDown={i < sortedSets.length - 1}
          onRepsChange={(r) => handleRepsChange(set.id, r)}
          onWeightChange={(w) => handleWeightChange(set.id, w)}
          onComplete={() => handleComplete(set.id)}
          onMoveUp={() => handleMoveSet(set.id, "up")}
          onMoveDown={() => handleMoveSet(set.id, "down")}
        />
      </SwipeRevealRow>
      {#if typeof set.restStartedAtMs === "number"}
        <RestProgressBar
          restStartedAtMs={set.restStartedAtMs}
          restDurationMs={set.restDurationMs ?? DEFAULT_REST_MS}
          onDone={() => handleRestDone(set.id)}
          onDismiss={() => handleDismissRest(set.id)}
        />
      {/if}
    {/each}
  {:else}
    <button
      type="button"
      class="w-full px-3 py-3 text-sm text-muted-foreground text-left hover:bg-muted/30"
      disabled={saving}
      onclick={handleAddSet}
    >
      + Add first set
    </button>
  {/if}
</ExerciseCard>

<EditSetDialog
  open={editSet.open}
  disabled={saving}
  initial={getEditableSet()}
  onOpenChange={(v) => (editSet.open = v)}
  onSave={saveSetPatch}
/>
