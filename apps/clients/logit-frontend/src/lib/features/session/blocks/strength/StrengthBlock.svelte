<script lang="ts">
  import { toast } from "$lib/components/ui/sonner/index";
  import { goto } from "$app/navigation";

  import type { StrengthBlockData, SetEntry, SessionBlock, WorkoutSession } from "@logit/core/domain/workout";
  import {
    addSet,
    updateSet,
    removeSet,
    swapExercise,
    groupIntoSuperset,
    isContinuationSet,
    DEFAULT_REST_MS,
  } from "@logit/core/domain/workout";
  import { createId } from "@logit/core/domain/ids";
  import { getSuggestion } from "@logit/core/usecases/progression/getSuggestion";
  import { getExerciseHistory } from "@logit/core/usecases/progression/getExerciseHistory";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import { currentSession } from "$lib/stores/currentSession.store";
  import type { ProgressionOutput } from "@logit/core/domain/progression";
  import type { BlockBaseProps, GripAction } from "$lib/features/session/blocks/types";
  import { getExerciseRepo } from "$lib/data/repoProvider";
  import type { Machine } from "@logit/core/domain/exercise";

  import { get } from "svelte/store";
  import { profile } from "$lib/stores/profile.store";
  import { startRestTimer, cancelRestTimer, hasRestTimerFired } from "$lib/services/restTimerService";
  import ExerciseCard from "$lib/features/session/ui/ExerciseCard.svelte";
  import SetsTableHeader from "$lib/features/session/ui/SetsTableHeader.svelte";
  import SetRow from "$lib/features/session/ui/SetRow.svelte";
  import SwipeRevealRow from "$lib/features/session/ui/SwipeRevealRow.svelte";
  import EditSetDialog from "$lib/features/session/ui/EditSetDialog.svelte";
  import RestProgressBar from "$lib/features/session/ui/RestProgressBar.svelte";
  import AddExerciseDialog from "$lib/features/session/ui/AddExerciseDialog.svelte";

  const {
    blockId,
    data,
    saving,
    grouped = false,
    gripAction,
    onDelete,
    onMutate,
  }: BlockBaseProps<StrengthBlockData> = $props();

  let suggestion = $state<ProgressionOutput | null>(null);
  let collapsed = $state(get(profile).blocksCollapsedByDefault);
  let blockAutoApplied = $state(false);
  let exerciseData = $state<{ id: string; machines: Machine[]; defaultMachineId?: string } | null>(null);
  // Last time this exercise was performed — shown as a "prev" hint per set row.
  let prevSets = $state<SetEntry[] | null>(null);

  const prevLeadSets = $derived(
    prevSets ? prevSets.filter((s) => s.setType !== "warmup" && !isContinuationSet(s.setType)) : [],
  );

  const editSet = $state({
    open: false,
    setId: null as string | null,
  });

  let swapOpen = $state(false);

  async function openDetail() {
    if (data.exerciseId) await goto(`/exercises/${data.exerciseId}`);
  }

  // "Link with next" — starts (or extends) a superset with the block below.
  const canSuperset = $derived.by(() => {
    if (grouped) return false;
    const s = $currentSession;
    if (!s) return false;
    const sorted = [...s.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
    const idx = sorted.findIndex((b) => b.id === blockId);
    return idx !== -1 && idx < sorted.length - 1;
  });

  async function linkWithNext() {
    await onMutate((s: WorkoutSession) => {
      const sorted = [...s.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
      const idx = sorted.findIndex((b) => b.id === blockId);
      const next = sorted[idx + 1];
      return next ? groupIntoSuperset(s, [blockId, next.id]) : s;
    });
  }

  async function handleSwap(selection: { name: string; exerciseId?: string }) {
    const trimmed = selection.name.trim();
    if (!trimmed) return;
    try {
      let exerciseId = selection.exerciseId;
      if (!exerciseId) {
        const ex = await getExerciseRepo().create(trimmed);
        exerciseId = ex.id;
      }
      // Let a block-mode suggestion for the new exercise auto-apply if empty.
      blockAutoApplied = false;
      await onMutate((s: WorkoutSession) =>
        swapExercise(s, blockId, { exerciseName: trimmed, exerciseId }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't swap the exercise");
    }
  }

  $effect(() => {
    const name = data.exerciseName;
    const id = data.exerciseId;
    void loadSuggestion(name, id);
  });

  $effect(() => {
    const exId = data.exerciseId;
    const name = data.exerciseName;
    void loadExerciseData(exId, name);
    void loadPrevSets(name, exId);
  });

  async function loadPrevSets(name: string, exerciseId?: string) {
    try {
      const { history } = await getExerciseHistory({ id: exerciseId, name }, getProgressionDeps());
      const last = history.at(-1);
      prevSets = last
        ? [...last.sets].sort((a, b) => a.orderIndex - b.orderIndex)
        : null;
    } catch {
      prevSets = null;
    }
  }

  async function loadExerciseData(exerciseId?: string, name?: string) {
    try {
      const ex = exerciseId
        ? await getExerciseRepo().getById(exerciseId)
        : name ? await getExerciseRepo().getByName(name) : null;
      exerciseData = ex ? { id: ex.id, machines: ex.machines ?? [], defaultMachineId: ex.defaultMachineId } : null;
    } catch {
      exerciseData = null;
    }
  }

  $effect(() => {
    if (
      suggestion?.displayMode === "block" &&
      suggestion.sets.length > 0 &&
      data.sets.length === 0 &&
      !blockAutoApplied
    ) {
      blockAutoApplied = true;
      void handleApplySuggestion();
    }
  });

  async function loadSuggestion(name: string, exerciseId?: string) {
    try {
      const session = get(currentSession) ?? undefined;
      suggestion = await getSuggestion({ id: exerciseId, name }, getProgressionDeps(), undefined, session);
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
      addSet(s, blockId, { reps: 0, weight: suggestedSet?.weight ?? 0, machineId: exerciseData?.defaultMachineId }),
    );
    if (collapsed) collapsed = false;
  }

  async function handleApplySuggestion() {
    if (!suggestion?.sets.length) return;
    const sets = suggestion.sets;
    await onMutate((s: WorkoutSession) => {
      let result = s;
      for (const sugSet of sets) {
        result = addSet(result, blockId, {
          reps: 0,
          weight: sugSet.weight,
          setType: sugSet.setType ?? "normal",
          note: sugSet.note,
          machineId: exerciseData?.defaultMachineId,
        });
      }
      return result;
    });
  }

  async function handleRepsChange(setId: string, reps: number) {
    const safe = Number.isFinite(reps) ? Math.max(0, reps) : 0;
    await onMutate((s: WorkoutSession) => updateSet(s, blockId, setId, { reps: safe }));
  }

  async function handleWeightChange(setId: string, weight: number) {
    // Negative weight is meaningful: net assistance on a bodyweight / assisted-machine
    // movement (e.g. −25 = bodyweight minus 25 kg on the assisted dip machine).
    const safe = Number.isFinite(weight) ? weight : 0;
    await onMutate((s: WorkoutSession) => updateSet(s, blockId, setId, { weight: safe }));
  }

  async function handleDeleteSet(setId: string) {
    await onMutate((s: WorkoutSession) => removeSet(s, blockId, setId));
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
      // Resolve effective rest so the dialog shows what will actually fire,
      // not just the raw per-set override (which is undefined until explicitly edited).
      restDurationMs: set.restDurationMs ?? get(profile).restDefaults[set.setType],
      machineId: set.machineId ?? undefined,
      rpe: set.rpe ?? null,
    };
  }

  async function saveSetPatch(
    patch: Partial<Pick<SetEntry, "reps" | "weight" | "setType" | "note" | "restDurationMs" | "machineId" | "rpe">>,
  ) {
    if (!editSet.setId) return;
    const setId = editSet.setId;
    await onMutate((s: WorkoutSession) => updateSet(s, blockId, setId, patch));
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
    // Explicit per-set override takes priority; fall back to per-type default.
    const effectiveRest = set.restDurationMs ?? get(profile).restDefaults[set.setType];
    const hasTimer = effectiveRest !== undefined;

    await onMutate((s: WorkoutSession) =>
      updateSet(s, blockId, setId, {
        completed: !wasCompleted,
        restStartedAtMs: !wasCompleted && hasTimer ? Date.now() : null,
      }),
    );

    if (!wasCompleted) {
      void triggerHaptic();
      if (hasTimer) startRestTimer(setId, effectiveRest!);
    } else {
      cancelRestTimer(setId);
    }
  }

  async function handleRestDone(setId: string) {
    // The global in-app timer may have already fired and shown its own toast.
    // Only show the toast here if the RestProgressBar caught it first.
    const alreadyToasted = hasRestTimerFired(setId);
    cancelRestTimer(setId);

    if (!alreadyToasted) {
      toast("Rest complete — time for your next set!");
      try {
        const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch {}
    }

    await onMutate((s: WorkoutSession) =>
      updateSet(s, blockId, setId, { restStartedAtMs: null }),
    );
  }

  async function handleDismissRest(setId: string) {
    cancelRestTimer(setId);
    await onMutate((s: WorkoutSession) =>
      updateSet(s, blockId, setId, { restStartedAtMs: null }),
    );
  }

  // ── Drop set grouping ──────────────────────────────────────────────────────

  type SetGroup = { lead: SetEntry | null; leadNum: number; drops: SetEntry[] };

  function buildSetGroups(sorted: SetEntry[]): SetGroup[] {
    const groups: SetGroup[] = [];
    let leadCount = 0;
    let i = 0;
    while (i < sorted.length) {
      const set = sorted[i]!;
      if (isContinuationSet(set.setType) && groups.length > 0) {
        groups[groups.length - 1]!.drops.push(set);
        i++;
      } else if (isContinuationSet(set.setType)) {
        groups.push({ lead: null, leadNum: 0, drops: [set] });
        i++;
      } else {
        leadCount++;
        const drops: SetEntry[] = [];
        i++;
        while (i < sorted.length && isContinuationSet(sorted[i]!.setType)) {
          drops.push(sorted[i]!);
          i++;
        }
        groups.push({ lead: set, leadNum: leadCount, drops });
      }
    }
    return groups;
  }

  async function handleAddDrop(afterSetId: string) {
    await onMutate((s: WorkoutSession) => {
      const idx = s.blocks.findIndex((b) => b.id === blockId);
      if (idx === -1) return s;
      const block = s.blocks[idx] as SessionBlock<StrengthBlockData>;
      const afterSet = block.data.sets.find((set) => set.id === afterSetId);
      if (!afterSet) return s;
      const insertAt = afterSet.orderIndex + 1;
      const newDrop: SetEntry = {
        id: createId("set"),
        setType: "dropset",
        reps: 0,
        weight: afterSet.weight,
        orderIndex: insertAt,
      };
      const shifted = block.data.sets.map((set) =>
        set.orderIndex >= insertAt ? { ...set, orderIndex: set.orderIndex + 1 } : set,
      );
      const updated = { ...block, data: { ...block.data, sets: [...shifted, newDrop] } };
      return { ...s, blocks: s.blocks.map((b, i) => (i === idx ? updated : b)) };
    });
  }

  const noopGripAction: GripAction = (_node) => ({ destroy() {} });

  const workingSetCount = $derived(
    data.sets.filter((s) => s.setType !== "warmup" && !isContinuationSet(s.setType)).length,
  );
  const hasActiveTimer = $derived(data.sets.some((s) => typeof s.restStartedAtMs === "number"));

  // ── Set-level drag-to-reorder ─────────────────────────────────────────────

  let setDragId = $state<string | null>(null);
  let setDragFromIdx = $state(-1);
  let setDragToIdx = $state(-1);
  let setDragStartY = $state(0);
  let setsListEl = $state<HTMLElement | null>(null);

  function liveSetOrder(sorted: SetEntry[]): SetEntry[] {
    if (!setDragId || setDragFromIdx === setDragToIdx) return sorted;
    const result = [...sorted];
    const [item] = result.splice(setDragFromIdx, 1);
    result.splice(setDragToIdx, 0, item!);
    return result;
  }

  async function commitSetDrag() {
    const from = setDragFromIdx;
    const to = setDragToIdx;
    setDragId = null;
    setDragFromIdx = -1;
    setDragToIdx = -1;
    if (from === to || from === -1) return;

    await onMutate((s: WorkoutSession) => {
      const idx = s.blocks.findIndex((b) => b.id === blockId);
      if (idx === -1) return s;
      const block = s.blocks[idx] as SessionBlock<StrengthBlockData>;
      const sorted = [...block.data.sets].sort(sortByOrderIndex);
      const reordered = [...sorted];
      const [item] = reordered.splice(from, 1);
      reordered.splice(to, 0, item!);
      const updatedSets = block.data.sets.map((set) => {
        const newIdx = reordered.findIndex((r) => r.id === set.id);
        return newIdx !== -1 ? { ...set, orderIndex: newIdx } : set;
      });
      const updated = { ...block, data: { ...block.data, sets: updatedSets } };
      return { ...s, blocks: s.blocks.map((b, i) => (i === idx ? updated : b)) };
    });
  }

  function setGripAction(node: HTMLElement, setId: string) {
    let currentId = setId;

    function startDrag(clientY: number) {
      const sorted = [...data.sets].sort(sortByOrderIndex);
      const idx = sorted.findIndex((s) => s.id === currentId);
      if (idx === -1) return false;
      setDragId = currentId;
      setDragFromIdx = idx;
      setDragToIdx = idx;
      setDragStartY = clientY;
      return true;
    }

    function moveDrag(clientY: number) {
      if (setDragId !== currentId) return;
      const total = data.sets.length || 1;
      const rowH = setsListEl ? setsListEl.getBoundingClientRect().height / total : 44;
      const newIdx = Math.max(
        0,
        Math.min(total - 1, Math.round(setDragFromIdx + (clientY - setDragStartY) / rowH)),
      );
      if (newIdx !== setDragToIdx) setDragToIdx = newIdx;
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      startDrag(e.touches[0]!.clientY);
    }
    function onTouchMove(e: TouchEvent) {
      if (setDragId !== currentId) return;
      e.preventDefault();
      moveDrag(e.touches[0]!.clientY);
    }
    function onTouchEnd() {
      if (setDragId !== currentId) return;
      void commitSetDrag();
    }
    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      e.preventDefault();
      if (!startDrag(e.clientY)) return;
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }
    function onMouseMove(e: MouseEvent) { moveDrag(e.clientY); }
    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (setDragId !== currentId) return;
      void commitSetDrag();
    }

    node.addEventListener("touchstart", onTouchStart, { passive: false });
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    node.addEventListener("touchend", onTouchEnd, { passive: true });
    node.addEventListener("touchcancel", onTouchEnd, { passive: true });
    node.addEventListener("mousedown", onMouseDown);

    return {
      update(newId: string) { currentId = newId; },
      destroy() {
        node.removeEventListener("touchstart", onTouchStart);
        node.removeEventListener("touchmove", onTouchMove);
        node.removeEventListener("touchend", onTouchEnd);
        node.removeEventListener("touchcancel", onTouchEnd);
        node.removeEventListener("mousedown", onMouseDown);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      },
    };
  }
</script>

<ExerciseCard
  exerciseName={data.exerciseName}
  setCount={workingSetCount}
  {saving}
  {suggestion}
  {collapsed}
  {hasActiveTimer}
  weightUnit={$profile.weightUnit}
  {grouped}
  {canSuperset}
  {gripAction}
  onToggleCollapse={() => (collapsed = !collapsed)}
  onAddSet={handleAddSet}
  onOpenDetail={openDetail}
  onSwap={() => (swapOpen = true)}
  onSuperset={linkWithNext}
  {onDelete}
>
  {#if data.sets.length > 0}
    <SetsTableHeader weightUnit={$profile.weightUnit} />
    {@const sortedSets = [...data.sets].sort(sortByOrderIndex)}
    {@const liveSets = liveSetOrder(sortedSets)}
    {@const liveGroups = buildSetGroups(liveSets)}
    <div bind:this={setsListEl}>
      {#each liveGroups as group (group.lead?.id ?? group.drops[0]?.id)}
        {#if group.lead}
          {@const lead = group.lead}
          <SwipeRevealRow
            disabled={saving}
            actionsWidth={80}
            onDelete={() => handleDeleteSet(lead.id)}
            onEdit={() => openEditSet(lead.id)}
          >
            <SetRow
              setNumber={group.leadNum}
              setType={lead.setType}
              reps={lead.reps}
              weight={lead.weight}
              weightUnit={$profile.weightUnit}
              rpe={lead.rpe ?? null}
              prev={prevLeadSets[group.leadNum - 1] ?? null}
              completed={lead.completed ?? false}
              disabled={saving || setDragId !== null}
              gripAction={(node) => setGripAction(node, lead.id)}
              onRepsChange={(r) => handleRepsChange(lead.id, r)}
              onWeightChange={(w) => handleWeightChange(lead.id, w)}
              onComplete={() => handleComplete(lead.id)}
            />
          </SwipeRevealRow>
          {#if typeof lead.restStartedAtMs === "number"}
            <RestProgressBar
              restStartedAtMs={lead.restStartedAtMs}
              restDurationMs={lead.restDurationMs ?? $profile.restDefaults[lead.setType] ?? DEFAULT_REST_MS}
              onDone={() => handleRestDone(lead.id)}
              onDismiss={() => handleDismissRest(lead.id)}
            />
          {/if}
        {/if}

        {#if group.drops.length > 0}
          <div class="ml-3 border-l-2 border-primary/30 bg-muted/20">
            {#each group.drops as drop (drop.id)}
              <SwipeRevealRow
                disabled={saving}
                actionsWidth={80}
                onDelete={() => handleDeleteSet(drop.id)}
                onEdit={() => openEditSet(drop.id)}
              >
                <SetRow
                  setNumber={0}
                  setType={drop.setType}
                  reps={drop.reps}
                  weight={drop.weight}
                  weightUnit={$profile.weightUnit}
                  rpe={drop.rpe ?? null}
                  completed={drop.completed ?? false}
                  disabled={saving || setDragId !== null}
                  gripAction={noopGripAction}
                  onRepsChange={(r) => handleRepsChange(drop.id, r)}
                  onWeightChange={(w) => handleWeightChange(drop.id, w)}
                  onComplete={() => handleComplete(drop.id)}
                />
              </SwipeRevealRow>
              {#if typeof drop.restStartedAtMs === "number"}
                <RestProgressBar
                  restStartedAtMs={drop.restStartedAtMs}
                  restDurationMs={drop.restDurationMs ?? $profile.restDefaults[drop.setType] ?? DEFAULT_REST_MS}
                  onDone={() => handleRestDone(drop.id)}
                  onDismiss={() => handleDismissRest(drop.id)}
                />
              {/if}
            {/each}
            <button
              type="button"
              class="w-full pl-3 py-1.5 text-xs text-primary text-left hover:bg-primary/5 disabled:opacity-40"
              disabled={saving}
              onclick={() => handleAddDrop(group.drops[group.drops.length - 1]!.id)}
            >
              + Add drop
            </button>
          </div>
        {/if}
      {/each}
    </div>
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

<AddExerciseDialog
  open={swapOpen}
  saving={saving}
  title="Swap exercise"
  description="Pick a different exercise — your logged sets stay."
  onOpenChange={(v) => (swapOpen = v)}
  onSubmit={handleSwap}
/>

<EditSetDialog
  open={editSet.open}
  disabled={saving}
  initial={getEditableSet()}
  machines={exerciseData?.machines ?? []}
  defaultMachineId={exerciseData?.defaultMachineId}
  exerciseId={exerciseData?.id}
  weightUnit={$profile.weightUnit}
  onOpenChange={(v) => (editSet.open = v)}
  onSave={saveSetPatch}
/>
