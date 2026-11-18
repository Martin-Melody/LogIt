<script lang="ts" module>
  // Blocks re-planned onto the place's machine this run (see replanForMachine), so going back to
  // the workout screen doesn't re-plan over weights typed since.
  const replanned = new Set<string>();
</script>

<script lang="ts">
  import { toast } from "$lib/components/ui/sonner/index";

  import type { StrengthBlockData, SetEntry, SessionBlock, WorkoutSession } from "@logit/core/domain/workout";
  import {
    addSet,
    addWarmupSets,
    updateSet,
    removeSet,
    swapExercise,
    isContinuationSet,
    setTypeMeta,
    applySetPlan,
    strengthRestMs,
    clearOtherRests,
    planRestFromFirstSet,
  } from "@logit/core/domain/workout";
  import { suggestionToPlan } from "@logit/core/domain/progression";
  import { warmupSets } from "@logit/core/domain/warmup";
  import { platesPerSide } from "@logit/core/domain/plates";
  import { machineWeightsKg, snapToMachine } from "@logit/core/domain/machine";
  import { equipment } from "$lib/stores/equipment.store";
  import { createId } from "@logit/core/domain/ids";
  import { getSuggestion } from "@logit/core/usecases/progression/getSuggestion";
  import { dismissProgressionNudge } from "@logit/core/usecases/progression/dismissProgressionNudge";
  import { acceptRepRangeExperiment } from "@logit/core/usecases/progression/acceptRepRangeExperiment";
  import { getExerciseHistory } from "@logit/core/usecases/progression/getExerciseHistory";
  import { getExerciseProgressionSettings } from "@logit/core/usecases/progression/exerciseProgressionSettings";
  import { playSound } from "$lib/features/sound/sounds";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import { currentSession } from "$lib/stores/currentSession.store";
  import type { ProgressionOutput } from "@logit/core/domain/progression";
  import type { BlockBaseProps, GripAction } from "$lib/features/session/blocks/types";
  import { getExerciseRepo } from "$lib/data/repoProvider";
  import type { Exercise, ExerciseType, Machine } from "@logit/core/domain/exercise";
  import { chosenMachine, dumbbellWeightsKg, effectiveMachine, machinesFor, type ExtraLoad, type Place, type PlaceMachine } from "@logit/core/domain/place";
  import { placesStore } from "$lib/features/places/places.svelte";
  import { goto } from "$app/navigation";
  import { formatLoad } from "@logit/core/domain/units";
  import MachinePickerSheet from "$lib/features/places/MachinePickerSheet.svelte";
  import WeightPickerSheet from "$lib/features/places/WeightPickerSheet.svelte";
  import AtTheTopCard from "$lib/features/places/AtTheTopCard.svelte";
  import type { WeightSource } from "$lib/features/places/weightSource";
  import ExerciseInfoSheet from "$lib/features/session/ui/ExerciseInfoSheet.svelte";
  import { usesBodyweightLoad } from "@logit/core/domain/exercise";
  import { getLoadMode, effectiveLoadKg } from "@logit/core/domain/bodyweight";
  import { repsAtLoad } from "@logit/core/domain/oneRepMax";
  import { profileBodyweightKg } from "$lib/features/bodyweight/bodyweight";

  import { get } from "svelte/store";
  import { untrack } from "svelte";
  import { profile } from "$lib/stores/profile.store";
  import { reveal } from "$lib/transitions";
  import ExerciseCard from "$lib/features/session/ui/ExerciseCard.svelte";
  import SetsTableHeader from "$lib/features/session/ui/SetsTableHeader.svelte";
  import SetRow from "$lib/features/session/ui/SetRow.svelte";
  import SwipeRevealRow from "$lib/features/session/ui/SwipeRevealRow.svelte";
  import EditSetDialog from "$lib/features/session/ui/EditSetDialog.svelte";
  import RestProgressBar from "$lib/features/session/ui/RestProgressBar.svelte";
  import AddExerciseDialog from "$lib/features/session/ui/AddExerciseDialog.svelte";
  import CoachSwapSheet from "$lib/features/session/ui/CoachSwapSheet.svelte";
  import { swapTargetFor, type SwapTarget } from "@logit/core/domain/swaps";
  import { coachFor, type CachedCoach } from "$lib/features/coaching/coachCache";
  import ExerciseDetailSheet from "$lib/features/exercise/components/ExerciseDetailSheet.svelte";

  const {
    blockId,
    data,
    saving,
    grouped = false,
    groupRestMs,
    round,
    gripAction,
    onGroup,
    onDelete,
    onMutate,
  }: BlockBaseProps<StrengthBlockData> = $props();

  let suggestion = $state<ProgressionOutput | null>(null);
  let collapsed = $state(get(profile).blocksCollapsedByDefault);
  // Plan this block's sets once the suggestion arrives: on first load if it has
  // none yet, and after a swap (replacing only the planned, not-yet-done sets).
  let planPending = $state(untrack(() => data.sets.length === 0));
  let exerciseData = $state<{ id: string; machines: Machine[]; defaultMachineId?: string; exerciseType?: ExerciseType } | null>(null);
  let exercise = $state<Exercise | null>(null);
  // The workout's place (My gym): set when it started or by "Where are you today?". Sessions
  // from before places have none set, so they use today's usual place.
  const placeId = $derived($currentSession?.placeId);
  const place = $derived(placeId === undefined ? placesStore.defaultFor() : placesStore.byId(placeId));
  const placeMachines = $derived(place && exercise ? machinesFor(place, exercise.id) : []);
  const chosen = $derived(place && exercise ? chosenMachine(place, exercise.id) : null);
  let machinePickerOpen = $state(false);
  // Last time this exercise was performed — shown as a "prev" hint per set row.
  let prevSets = $state<SetEntry[] | null>(null);
  // An exercise never done before (design canvas O4): its first set is the starting point
  // the plan works from, so it says how heavy to go instead of asking for a max.
  let prevLoaded = $state(false);
  let firstTimeReps = $state(8);
  let firstTimeMin = $state(1);
  const firstEver = $derived(prevLoaded && prevSets === null);
  const showFirstSetHint = $derived(firstEver && !data.sets.some((s) => s.completed));
  // The hint says how heavy to go and the first set plans the rest, so the algorithm's own
  // "First time" line would only repeat it, before and after that set.
  const cardSuggestion = $derived(
    firstEver && suggestion?.change?.kind === "first" ? { ...suggestion, change: undefined, label: undefined } : suggestion,
  );

  /** The first working set of a never-done exercise plans the empty sets after it. */
  function withFirstSetPlan(s: WorkoutSession, setId: string): WorkoutSession {
    if (!firstEver || data.sets.some((x) => x.completed && x.id !== setId)) return s;
    return planRestFromFirstSet(s, blockId, setId, firstTimeMin);
  }

  const prevLeadSets = $derived(
    prevSets ? prevSets.filter((s) => s.setType !== "warmup" && !isContinuationSet(s.setType)) : [],
  );

  const editSet = $state({
    open: false,
    setId: null as string | null,
    // Working-set number for the card's title and "last time"; none for drop sets.
    setNumber: null as number | null,
  });

  // Weights relative to bodyweight (0 = BW, −25 = assisted): shown as BW / BW−25.
  const bodyweight = $derived(
    !!suggestion?.bodyweightLoad ||
      usesBodyweightLoad(exerciseData?.exerciseType, [
        ...data.sets.map((s) => s.weight),
        ...(prevSets ?? []).map((s) => s.weight),
      ]),
  );

  let swapOpen = $state(false);
  // Set when this exercise is from a coach's program: their rule and alternatives apply.
  let coachSwap = $state<{ target: SwapTarget; coach: CachedCoach } | null>(null);

  function openSwap() {
    const s = get(currentSession);
    const target = s ? swapTargetFor(s, blockId) : null;
    // Only coach programs record their coach (built-in programs are "program" workouts too).
    const coach = target && s?.source?.coachId ? coachFor(s.source.coachId) : undefined;
    coachSwap = target && coach ? { target, coach } : null;
    swapOpen = true;
  }
  let detailExerciseId = $state<string | null>(null);
  /** The name opens the read-first info sheet (X5); editing is a link inside it. */
  let infoOpen = $state(false);

  function openDetail() {
    infoOpen = true;
  }

  function openEditor() {
    if (data.exerciseId) detailExerciseId = data.exerciseId;
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
      // Re-plan for the new exercise once its suggestion loads; logged sets stay.
      planPending = true;
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
    void loadPrevSets(name, exId);
  });

  // Again when the workout's place, or the machine picked there, changes.
  $effect(() => {
    const exId = data.exerciseId;
    const name = data.exerciseName;
    const at = place;
    void at?.updatedAtMs;
    untrack(() => void loadExerciseData(exId, name, at));
  });

  async function loadPrevSets(name: string, exerciseId?: string) {
    try {
      const { history } = await getExerciseHistory({ id: exerciseId, name }, getProgressionDeps(), {
        excludeSessionId: get(currentSession)?.id,
      });
      const last = history.at(-1);
      prevSets = last
        ? [...last.sets].sort((a, b) => a.orderIndex - b.orderIndex)
        : null;
      if (!last) {
        const settings = await getExerciseProgressionSettings({ id: exerciseId, name }, getProgressionDeps()).catch(() => null);
        firstTimeReps = settings?.repRange?.[1] ?? 8;
        firstTimeMin = settings?.repRange?.[0] ?? 1;
        // The workout's first exercise opens so the first-set hint is seen.
        if (get(currentSession)?.blocks[0]?.id === blockId && !data.sets.some((s) => s.completed)) collapsed = false;
      }
    } catch {
      prevSets = null;
    } finally {
      prevLoaded = true;
    }
  }

  async function loadExerciseData(exerciseId?: string, name?: string, at: Place | null = place) {
    try {
      const ex = exerciseId
        ? await getExerciseRepo().getById(exerciseId)
        : name ? await getExerciseRepo().getByName(name) : null;
      exercise = ex;
      // Machines come from the workout's place when there is one (My gym): the one picked for
      // this exercise there, else the first that's in. Without places, the exercise's own machines.
      const here = ex && at ? machinesFor(at, ex.id) : [];
      const chosen = ex && at ? chosenMachine(at, ex.id) : null;
      exerciseData = ex
        ? here.length
          ? { id: ex.id, machines: here.map(effectiveMachine), defaultMachineId: chosen?.id, exerciseType: ex.exerciseType }
          : { id: ex.id, machines: ex.machines ?? [], defaultMachineId: ex.defaultMachineId, exerciseType: ex.exerciseType }
        : null;
      await replanForMachine(at, chosen);
    } catch {
      exerciseData = null;
    }
  }

  // Plans made before the place was known (a planned split day, a changed machine) move onto
  // the machine picked here: rounded to its settings, starting from the last time on it. Once
  // per workout, block and machine, and only while nothing has been logged.
  async function replanForMachine(at: Place | null, chosen: PlaceMachine | null) {
    if (!at || !chosen) return;
    const s = get(currentSession);
    const key = `${s?.id}|${blockId}|${at.id}|${chosen.id}`;
    if (!s || replanned.has(key) || data.sets.some((x) => x.completed)) return;
    replanned.add(key);
    await loadSuggestion(data.exerciseName, data.exerciseId);
    if (suggestion && suggestion.sets.length > 0) await applyPlan(suggestion);
  }

  async function loadSuggestion(name: string, exerciseId?: string) {
    try {
      const session = get(currentSession) ?? undefined;
      const machine = place ? exerciseData?.machines.find((m) => m.id === exerciseData?.defaultMachineId) : undefined;
      suggestion = await getSuggestion({ id: exerciseId, name }, getProgressionDeps(), undefined, session, undefined, undefined, { machine });
    } catch {
      suggestion = null;
    }
    if (planPending && suggestion && suggestion.sets.length > 0 && name === data.exerciseName) {
      planPending = false;
      await applyPlan(suggestion);
    }
  }

  async function applyPlan(output: ProgressionOutput) {
    const plan = suggestionToPlan(output, exerciseData?.defaultMachineId);
    await onMutate((s: WorkoutSession) => applySetPlan(s, blockId, plan));
  }

  async function handleDismissNudge(nudgeId: string) {
    await dismissProgressionNudge(
      { id: data.exerciseId, name: data.exerciseName },
      nudgeId,
      getProgressionDeps(),
    );
    await loadSuggestion(data.exerciseName, data.exerciseId);
  }

  async function handleAcceptNudge(nudgeId: string) {
    await acceptRepRangeExperiment(
      { id: data.exerciseId, name: data.exerciseName },
      nudgeId,
      getProgressionDeps(),
    );
    await loadSuggestion(data.exerciseName, data.exerciseId);
  }

  function sortByOrderIndex(a: { orderIndex: number }, b: { orderIndex: number }) {
    return a.orderIndex - b.orderIndex;
  }

  async function handleAddSet() {
    const working = data.sets.filter((s) => s.setType !== "warmup" && !isContinuationSet(s.setType));
    const planned = suggestion ? suggestionToPlan(suggestion)[working.length] : undefined;
    const lastWeight = [...data.sets].sort(sortByOrderIndex).at(-1)?.weight;
    const before = new Set(data.sets.map((s) => s.id));
    await onMutate((s: WorkoutSession) =>
      addSet(s, blockId, {
        reps: 0,
        weight: planned?.weight ?? lastWeight ?? suggestion?.sets[0]?.weight ?? 0,
        machineId: exerciseData?.defaultMachineId,
        ...(planned ? { target: { reps: planned.reps, weight: planned.weight, ...(planned.repsMax !== undefined ? { repsMax: planned.repsMax } : {}) } } : {}),
      }),
    );
    if (collapsed) collapsed = false;
    // A set beyond the plan has nothing to show yet — open its card for entry.
    if (!planned) {
      const block = get(currentSession)?.blocks.find((b) => b.id === blockId);
      const added = (block?.data as StrengthBlockData | undefined)?.sets.find((x) => !before.has(x.id));
      if (added) openEditSet(added.id, working.length + 1);
    }
  }

  const hasWarmup = $derived(data.sets.some((s) => s.setType === "warmup"));
  const warmupWorkingKg = $derived.by(() => {
    const logged = data.sets.find((s) => s.setType !== "warmup" && s.weight > 0)?.weight;
    return logged ?? suggestion?.sets.find((s) => (s.weight ?? 0) > 0)?.weight ?? 0;
  });
  // No ramp for bodyweight work: "BW+2.5" isn't a bar to build up to.
  const canWarmup = $derived(!hasWarmup && warmupWorkingKg > 0 && !bodyweight);

  async function handleAddWarmup() {
    const workingKg = warmupWorkingKg;
    if (workingKg <= 0) return;
    const machine = exerciseData?.machines.find((m) => m.id === exerciseData?.defaultMachineId);
    const bar = get(equipment).barbell;
    const snap =
      machine && machineWeightsKg(machine)
        ? (kg: number) => snapToMachine(machine, kg).kg
        : (kg: number) => platesPerSide(kg, bar).achievableKg;
    const ramp = warmupSets(workingKg, { minKg: machine ? 0 : bar.barKg, snap });
    if (ramp.length === 0) return;
    await onMutate((s: WorkoutSession) => addWarmupSets(s, blockId, ramp));
    if (collapsed) collapsed = false;
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

  function openEditSet(setId: string, setNumber: number | null = null) {
    editSet.setId = setId;
    editSet.setNumber = setNumber;
    editSet.open = true;
  }

  const editedSet = $derived(editSet.setId ? (data.sets.find((s) => s.id === editSet.setId) ?? null) : null);

  /** The group's rest when it sets one (a positive number), else undefined. */
  function groupRest(): number | undefined {
    return groupRestMs && groupRestMs > 0 ? groupRestMs : undefined;
  }

  /** The set card's "Log": save what's in the card and tick the set off, in one change. */
  async function logFromCard(
    patch: Partial<Pick<SetEntry, "reps" | "weight" | "setType" | "note" | "restDurationMs" | "machineId" | "rpe">>,
  ) {
    const set = editedSet;
    if (!set) return;
    const setId = set.id;
    const setType = patch.setType ?? set.setType;
    const effectiveRest = patch.restDurationMs ?? groupRest() ?? set.restDurationMs ?? get(profile).restDefaults[setType];
    const startsRest = groupRestMs !== 0 && effectiveRest !== undefined;
    await onMutate((s: WorkoutSession) => {
      const next = updateSet(s, blockId, setId, {
        ...patch,
        ...(startsRest && groupRest() !== undefined && patch.restDurationMs === undefined ? { restDurationMs: groupRest() } : {}),
        completed: true,
        restStartedAtMs: startsRest ? Date.now() : null,
      });
      const planned = withFirstSetPlan(next, setId);
      return startsRest ? clearOtherRests(planned, setId) : planned;
    });
    void triggerHaptic();
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
    // Set logged: a vibration, and the tap sound when Settings › Sounds › Taps is on.
    playSound("tap");
  }

  async function handleComplete(setId: string) {
    const set = data.sets.find((s) => s.id === setId);
    if (!set) return;

    const wasCompleted = !!set.completed;

    // Ticking an untouched set logs it. A planned set takes its planned reps; a
    // set with nothing planned and nothing entered opens for entry instead of
    // being logged as 0 reps.
    let fill: { reps: number; weight?: number } | null = null;
    if (!wasCompleted && set.reps === 0) {
      if (set.target) {
        fill = { reps: set.target.reps, ...(set.weight === 0 ? { weight: set.target.weight } : {}) };
      } else if (!setTypeMeta(set.setType).repsPlaceholder) {
        const lead = workingSets.findIndex((w) => w.id === set.id);
        openEditSet(set.id, lead === -1 ? null : lead + 1);
        return;
      }
    }
    // In a superset / circuit the group's rest wins; else the set's own override,
    // else the per-type default. A group rest of 0 goes straight on.
    const effectiveRest = groupRest() ?? set.restDurationMs ?? get(profile).restDefaults[set.setType];
    const startsRest = groupRestMs !== 0 && effectiveRest !== undefined;

    await onMutate((s: WorkoutSession) => {
      const next = updateSet(s, blockId, setId, {
        ...(fill ?? {}),
        // The rest bar reads the set's rest, so a group rest is written onto the set.
        ...(!wasCompleted && startsRest && groupRest() !== undefined ? { restDurationMs: groupRest() } : {}),
        completed: !wasCompleted,
        restStartedAtMs: !wasCompleted && startsRest ? Date.now() : null,
      });
      const planned = wasCompleted ? next : withFirstSetPlan(next, setId);
      // One rest at a time: a new rest replaces the previous set's.
      return !wasCompleted && startsRest ? clearOtherRests(planned, setId) : planned;
    });

    // The rest service (restTimerService.ts) sees restStartedAtMs change and schedules or
    // cancels the alert itself.
    if (!wasCompleted) void triggerHaptic();
  }

  async function handleDismissRest(setId: string) {
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

  const workingSets = $derived(
    [...data.sets]
      .sort(sortByOrderIndex)
      .filter((s) => s.setType !== "warmup" && !isContinuationSet(s.setType)),
  );
  const doneCount = $derived(workingSets.filter((s) => s.completed).length);
  // For the reps-to-next-weight meter: what each working set got, or is aiming for.
  // A set done at a different weight from the plan is worked out as reps at the
  // planned weight, so 5 at +2.5 kg isn't drawn as a 5 at the planned weight.
  const loadMode = $derived(
    getLoadMode(exerciseData?.exerciseType, data.sets.map((s) => s.weight), data.exerciseName),
  );
  const meter = $derived.by(() => {
    const bw = loadMode === "external" ? null : profileBodyweightKg();
    return workingSets.map((s) => {
      const done = s.completed || s.reps > 0 ? s.reps : 0;
      const target = s.target?.reps ?? 0;
      const plannedKg = s.target?.weight;
      if (done === 0 || target === 0 || plannedKg === undefined || Math.abs(s.weight - plannedKg) < 0.01) {
        return { done, target };
      }
      // Bodyweight work needs a bodyweight to compare BW+2.5 with BW.
      if (loadMode !== "external" && bw == null) return { done, target };
      const eq = repsAtLoad(
        done,
        effectiveLoadKg(s.weight, loadMode, bw),
        effectiveLoadKg(plannedKg, loadMode, bw),
      );
      return eq === null ? { done, target } : { done: Math.round(eq), target, logged: done };
    });
  });

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

  // ── Weights from what's real (X2/X3) ──────────────────────────────────────────────
  // A machine's own settings, the plates on this place's bar, or its dumbbells. Without a
  // place (or for other kit), the weight is typed as before.
  const weightSource = $derived.by((): WeightSource | null => {
    if (bodyweight) return null;
    const machine = exerciseData?.machines.find((m) => m.id === exerciseData?.defaultMachineId);
    if (machine && machineWeightsKg(machine)?.length) return { kind: "machine", machine, placeName: place?.name };
    if (!place || !exercise) return null;
    if (exercise.equipment === "barbell" && place.barbell) return { kind: "bar", barbell: place.barbell, placeName: place.name };
    if (exercise.equipment === "dumbbell" && place.dumbbells) return { kind: "dumbbells", weightsKg: dumbbellWeightsKg(place.dumbbells), placeName: place.name };
    return null;
  });

  let weightPick = $state<{ setId: string; number: number; weight: number; planned: number | null; last: number | null } | null>(null);

  function openWeightPicker(set: SetEntry, number: number) {
    weightPick = {
      setId: set.id,
      number,
      weight: set.reps > 0 || set.completed ? set.weight : 0,
      planned: set.target?.weight ?? null,
      last: number ? (prevLeadSets[number - 1]?.weight ?? null) : null,
    };
  }

  // ── At the heaviest weight here ──────────────────────────────────────────────────
  const topRung = $derived.by(() => {
    if (!weightSource || weightSource.kind === "bar") return null;
    const rungs = weightSource.kind === "machine" ? (machineWeightsKg(weightSource.machine) ?? []) : weightSource.weightsKg;
    return rungs.length ? rungs[rungs.length - 1]! : null;
  });
  const plannedTop = $derived(
    Math.max(0, ...data.sets.filter((x) => !x.completed && x.setType !== "warmup").map((x) => x.target?.weight ?? x.weight)),
  );
  const atTheTop = $derived(topRung !== null && plannedTop > 0 && plannedTop >= topRung - 0.01);
  const extraLoadAnswer = $derived.by((): ExtraLoad[] | undefined => {
    if (!place || !weightSource) return undefined;
    if (weightSource.kind === "machine") return chosen?.extraLoad;
    return place.extraLoad?.dumbbells;
  });
  const topLabel = $derived(
    topRung === null || !weightSource ? "" :
      `${formatLoad(topRung, $profile.weightUnit, false)} is the heaviest ${weightSource.kind === "machine" ? `on ${weightSource.machine.name}` : "dumbbell"}${place ? ` at ${place.name}` : ""}`,
  );

  function answerExtraLoad(extra: ExtraLoad[]) {
    const p = place ? placesStore.byId(place.id) : null;
    if (!p || !weightSource) return;
    if (weightSource.kind === "machine" && chosen) {
      placesStore.save({ ...p, machines: p.machines.map((m) => (m.id === chosen.id ? { ...m, extraLoad: extra } : m)) });
    } else {
      placesStore.save({ ...p, extraLoad: { ...(p.extraLoad ?? {}), dumbbells: extra } });
    }
  }

  // "Last time 59 × 10, 10, 9" under the name (X1).
  const lastTime = $derived.by(() => {
    const done = (prevSets ?? []).filter((x) => x.setType !== "warmup" && x.reps > 0 && x.completed !== false);
    if (!done.length) return "";
    const w = $profile.weightUnit;
    const same = done.every((x) => Math.abs(x.weight - done[0]!.weight) < 0.01);
    return same
      ? `Last time ${formatLoad(done[0]!.weight, w, bodyweight, { withUnit: !bodyweight })} × ${done.map((x) => x.reps).join(", ")}`
      : `Last time ${done.map((x) => `${formatLoad(x.weight, w, bodyweight, { withUnit: false })} × ${x.reps}`).join(" · ")}`;
  });

  function machineDetail(m: PlaceMachine): string {
    const u = m.unit === "lbs" ? "lb" : "kg";
    if (m.weights?.kind === "stack" && m.weights.values.length) return `stack ${m.weights.values[0]}–${m.weights.values.at(-1)} ${u}`;
    if (m.weights?.kind === "linear") return `stack ${m.weights.min}–${m.weights.max ?? "?"} ${u}`;
    return m.loading === "plates" ? "plates" : m.loading === "assisted" ? "assisted" : "";
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

    // The set number is also a button (the set's options): a touch that didn't move is a tap.
    let touchStartY = 0;
    let touchMoved = false;
    // Dragging starts only once the finger or pointer has moved, so a plain tap stays a tap.
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      touchStartY = e.touches[0]!.clientY;
      touchMoved = false;
    }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      const y = e.touches[0]!.clientY;
      if (!touchMoved && Math.abs(y - touchStartY) > 8) {
        touchMoved = true;
        startDrag(touchStartY);
      }
      if (setDragId === currentId) moveDrag(y);
    }
    function onTouchEnd() {
      if (!touchMoved) { node.click(); return; }
      if (setDragId === currentId) void commitSetDrag();
    }
    let mouseStartY = 0;
    let mouseDragging = false;
    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      e.preventDefault();
      mouseStartY = e.clientY;
      mouseDragging = false;
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }
    function onMouseMove(e: MouseEvent) {
      if (!mouseDragging) {
        if (Math.abs(e.clientY - mouseStartY) <= 6) return;
        mouseDragging = startDrag(mouseStartY);
      }
      moveDrag(e.clientY);
    }
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
  {doneCount}
  {meter}
  {saving}
  suggestion={cardSuggestion}
  collapsed={round === undefined ? collapsed : false}
  roundView={round !== undefined}
  {hasActiveTimer}
  weightUnit={$profile.weightUnit}
  {bodyweight}
  {grouped}
  canSuperset={!!onGroup}
  {gripAction}
  onToggleCollapse={() => (collapsed = !collapsed)}
  onAddSet={handleAddSet}
  onOpenDetail={openDetail}
  onSwap={openSwap}
  onSuperset={onGroup}
  {onDelete}
  onDismissNudge={handleDismissNudge}
  onAcceptNudge={handleAcceptNudge}
  {lastTime}
>
  {#snippet chip()}
    {#if place && chosen}
      <button type="button" onclick={() => (machinePickerOpen = true)}
        class="flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-muted px-3 text-left text-[13px]"
        aria-label="Machine: {chosen.name} at {place.name}. Change">
        <span class="truncate"><strong class="font-semibold">{chosen.name}</strong> · {place.name}{machineDetail(chosen) ? ` · ${machineDetail(chosen)}` : ""}</span>
        {#if chosen.status === "out"}<span class="shrink-0 rounded bg-warning/15 px-1 text-[11px] text-warning">Out of order</span>{/if}
        <span aria-hidden="true" class="shrink-0 text-muted-foreground">▾</span>
      </button>
    {:else if place && exercise && (exercise.equipment === "machine" || exercise.equipment === "cable" || exercise.equipment === "smith")}
      <button type="button" onclick={() => goto(`/settings/places/${place.id}/machine/new`)}
        class="flex min-h-9 items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-[13px] text-muted-foreground">
        Which machine at {place.name}? Add it
      </button>
    {/if}
  {/snippet}
  {#snippet notice()}
    {#if atTheTop && topLabel}
      <AtTheTopCard heaviestLabel={topLabel} kind={weightSource?.kind === "machine" ? "machine" : "dumbbells"} answer={extraLoadAnswer} onAnswer={answerExtraLoad} />
    {/if}
  {/snippet}
  {#if round !== undefined}
    <!-- One round of a group: only this exercise's set for that round. -->
    {@const roundSet = [...data.sets].sort(sortByOrderIndex)[round]}
    {#if roundSet}
      {@const workingIdx = workingSets.findIndex((w) => w.id === roundSet.id)}
      {@const roundNum = workingIdx === -1 ? 0 : workingIdx + 1}
      <SwipeRevealRow
        disabled={saving}
        actionsWidth={80}
        onDelete={() => handleDeleteSet(roundSet.id)}
        onEdit={() => openEditSet(roundSet.id, roundNum || null)}
      >
        <SetRow
          setNumber={roundNum}
          setType={roundSet.setType}
          reps={roundSet.reps}
          weight={roundSet.weight}
          weightUnit={$profile.weightUnit}
          {bodyweight}
          rpe={roundSet.rpe ?? null}
          prev={roundNum ? (prevLeadSets[roundNum - 1] ?? null) : null}
          target={roundSet.target ?? null}
          onOpenDetails={() => openEditSet(roundSet.id, roundNum || null)}
          onPickWeight={weightSource ? () => openWeightPicker(roundSet, roundNum) : undefined}
          completed={roundSet.completed ?? false}
          disabled={saving}
          gripAction={noopGripAction}
          onRepsChange={(r) => handleRepsChange(roundSet.id, r)}
          onWeightChange={(w) => handleWeightChange(roundSet.id, w)}
          onComplete={() => handleComplete(roundSet.id)}
        />
      </SwipeRevealRow>
      {#if typeof roundSet.restStartedAtMs === "number"}
        <div transition:reveal>
          <RestProgressBar
            restStartedAtMs={roundSet.restStartedAtMs}
            restDurationMs={strengthRestMs(roundSet, $profile.restDefaults)}
            onDismiss={() => handleDismissRest(roundSet.id)}
          />
        </div>
      {/if}
    {/if}
  {:else if data.sets.length > 0}
    {#if canWarmup}
      <button
        type="button"
        class="w-full h-10 px-3 text-xs font-medium text-primary text-left hover:bg-primary/5 disabled:opacity-40 border-b border-border/50"
        disabled={saving}
        onclick={handleAddWarmup}
        transition:reveal
      >
        + Warm-up ramp
      </button>
    {/if}
    {#if showFirstSetHint}
      <div class="mx-3 my-2 flex flex-col gap-1 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
        <p class="text-sm font-semibold">First time? Pick a weight you could lift about {firstTimeReps} times.</p>
        <p class="text-xs text-muted-foreground">Logit plans every set after this one from it. No need to know your max.</p>
      </div>
    {/if}
    <SetsTableHeader weightUnit={$profile.weightUnit} />
    {@const sortedSets = [...data.sets].sort(sortByOrderIndex)}
    {@const liveSets = liveSetOrder(sortedSets)}
    {@const liveGroups = buildSetGroups(liveSets)}
    <div bind:this={setsListEl}>
      {#each liveGroups as group (group.lead?.id ?? group.drops[0]?.id)}
        <div transition:reveal>
        {#if group.lead}
          {@const lead = group.lead}
          <SwipeRevealRow
            disabled={saving}
            actionsWidth={80}
            onDelete={() => handleDeleteSet(lead.id)}
            onEdit={() => openEditSet(lead.id, group.leadNum)}
          >
            <SetRow
              setNumber={group.leadNum}
              setType={lead.setType}
              reps={lead.reps}
              weight={lead.weight}
              weightUnit={$profile.weightUnit}
              {bodyweight}
              rpe={lead.rpe ?? null}
              prev={prevLeadSets[group.leadNum - 1] ?? null}
              target={lead.target ?? null}
              onOpenDetails={() => openEditSet(lead.id, group.leadNum)}
              onPickWeight={weightSource ? () => openWeightPicker(lead, group.leadNum) : undefined}
              completed={lead.completed ?? false}
              disabled={saving || setDragId !== null}
              gripAction={(node) => setGripAction(node, lead.id)}
              onRepsChange={(r) => handleRepsChange(lead.id, r)}
              onWeightChange={(w) => handleWeightChange(lead.id, w)}
              onComplete={() => handleComplete(lead.id)}
            />
          </SwipeRevealRow>
          {#if typeof lead.restStartedAtMs === "number"}
            <div transition:reveal>
              <RestProgressBar
                restStartedAtMs={lead.restStartedAtMs}
                restDurationMs={strengthRestMs(lead, $profile.restDefaults)}
                onDismiss={() => handleDismissRest(lead.id)}
              />
            </div>
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
                  {bodyweight}
                  rpe={drop.rpe ?? null}
                  target={drop.target ?? null}
                  onOpenDetails={() => openEditSet(drop.id)}
                  onPickWeight={weightSource ? () => openWeightPicker(drop, 0) : undefined}
                  completed={drop.completed ?? false}
                  disabled={saving || setDragId !== null}
                  gripAction={noopGripAction}
                  onRepsChange={(r) => handleRepsChange(drop.id, r)}
                  onWeightChange={(w) => handleWeightChange(drop.id, w)}
                  onComplete={() => handleComplete(drop.id)}
                />
              </SwipeRevealRow>
              {#if typeof drop.restStartedAtMs === "number"}
                <div transition:reveal>
                  <RestProgressBar
                    restStartedAtMs={drop.restStartedAtMs}
                    restDurationMs={strengthRestMs(drop, $profile.restDefaults)}
                    onDismiss={() => handleDismissRest(drop.id)}
                  />
                </div>
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
        </div>
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
    {#if canWarmup}
      <button
        type="button"
        class="w-full h-10 px-3 -mt-1 mb-1 text-xs font-medium text-primary text-left hover:bg-primary/5 disabled:opacity-40"
        disabled={saving}
        onclick={handleAddWarmup}
        transition:reveal
      >
        + Warm-up ramp
      </button>
    {/if}
  {/if}
</ExerciseCard>

{#if coachSwap}
  <CoachSwapSheet
    open={swapOpen}
    target={coachSwap.target}
    coach={coachSwap.coach}
    onOpenChange={(v) => (swapOpen = v)}
    onPick={handleSwap}
  />
{:else}
  <AddExerciseDialog
    open={swapOpen}
    saving={saving}
    title="Swap exercise"
    description="Pick a different exercise — your logged sets stay."
    onOpenChange={(v) => (swapOpen = v)}
    onSubmit={handleSwap}
  />
{/if}

<EditSetDialog
  open={editSet.open}
  disabled={saving}
  initial={getEditableSet()}
  machines={exerciseData?.machines ?? []}
  defaultMachineId={exerciseData?.defaultMachineId}
  exerciseId={exerciseData?.id}
  weightUnit={$profile.weightUnit}
  setNumber={editSet.setNumber}
  target={editedSet?.target ?? null}
  completed={editedSet?.completed ?? false}
  prev={editSet.setNumber ? (prevLeadSets[editSet.setNumber - 1] ?? null) : null}
  {bodyweight}
  onOpenChange={(v) => (editSet.open = v)}
  onSave={saveSetPatch}
  onLog={logFromCard}
/>

<ExerciseDetailSheet
  exerciseId={detailExerciseId}
  onClose={() => {
    detailExerciseId = null;
    // Pick up any edits (machines, name) made in the sheet.
    void loadExerciseData(data.exerciseId, data.exerciseName);
    void loadSuggestion(data.exerciseName, data.exerciseId);
  }}
/>

<ExerciseInfoSheet
  open={infoOpen}
  {exercise}
  name={data.exerciseName}
  lastSets={prevSets}
  weightUnit={$profile.weightUnit}
  {bodyweight}
  onOpenChange={(v) => (infoOpen = v)}
  onEdit={openEditor}
  onSwap={openSwap}
/>

{#if place && exercise && placeMachines.length}
  <MachinePickerSheet
    open={machinePickerOpen}
    {place}
    exerciseId={exercise.id}
    exerciseName={data.exerciseName}
    machines={placeMachines}
    currentId={chosen?.id ?? null}
    onOpenChange={(v) => (machinePickerOpen = v)}
    onPick={() => {}}
  />
{/if}

{#if weightSource && weightPick}
  <WeightPickerSheet
    open={!!weightPick}
    source={weightSource}
    title="Set {weightPick.number || ''} · {data.exerciseName}"
    weightKg={weightPick.weight}
    plannedKg={weightPick.planned}
    lastKg={weightPick.last}
    unit={$profile.weightUnit}
    onOpenChange={(v) => { if (!v) weightPick = null; }}
    onPick={(kg) => { const id = weightPick?.setId; if (id) void handleWeightChange(id, kg); }}
  />
{/if}
