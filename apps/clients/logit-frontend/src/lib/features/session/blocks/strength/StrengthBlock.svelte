<script lang="ts" module>
  // Blocks re-planned onto the place's machine this run (see replanForMachine), so going back to
  // the workout screen doesn't re-plan over weights typed since.
  const replanned = new Set<string>();
</script>

<script lang="ts">
  import { carriedWeight } from "./carryWeight";
  import { openAllSignal } from "$lib/features/session/openAll";
  import { effortOpenIn, foldFor } from "$lib/features/session/stage";
  import FinishSetupCard from "$lib/features/exercise/FinishSetupCard.svelte";
  import { needsSetup } from "@logit/core/domain/exerciseGuess";
  import { hasStartingLift } from "$lib/features/onboarding/startingLifts";
  import { ChevronDown, MapPin, Plus, Rows3 } from "lucide-svelte";
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
    replanAfterSet,
    replanForOrder,
    useReplan,
    shortBy,
    isUntouchedPlannedSet,
    getExercises,
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
  import { barbellFor, chosenMachine, dumbbellWeightsKg, effectiveMachine, machinesFor, usesMachine, type ExtraLoad, type Place, type PlaceMachine } from "@logit/core/domain/place";
  import { placesStore } from "$lib/features/places/places.svelte";
  import { goto } from "$app/navigation";
  import { formatLoad, formatWeight } from "@logit/core/domain/units";
  import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
  import MachinePickerSheet from "$lib/features/places/MachinePickerSheet.svelte";
  import MachineEditorSheet from "$lib/features/places/MachineEditorSheet.svelte";
  import WhereTodaySheet from "$lib/features/places/WhereTodaySheet.svelte";
  import WeightPickerSheet from "$lib/features/places/WeightPickerSheet.svelte";
  import AtTheTopCard from "$lib/features/places/AtTheTopCard.svelte";
  import { loadsFor, type WeightSource } from "$lib/features/places/weightSource";
  import { usesBodyweightLoad } from "@logit/core/domain/exercise";
  import { getLoadMode, effectiveLoadKg } from "@logit/core/domain/bodyweight";
  import { repsAtLoad } from "@logit/core/domain/oneRepMax";
  import { profileBodyweightKg } from "$lib/features/bodyweight/bodyweight";

  import { get } from "svelte/store";
  import { onDestroy, untrack } from "svelte";
  import { profile } from "$lib/stores/profile.store";
  import { reveal, popIn } from "$lib/transitions";
  import ExerciseCard from "$lib/features/session/ui/ExerciseCard.svelte";
  import SetsTableHeader from "$lib/features/session/ui/SetsTableHeader.svelte";
  import SetRow from "$lib/features/session/ui/SetRow.svelte";
  import SwipeRevealRow from "$lib/features/session/ui/SwipeRevealRow.svelte";
  import SetOptionsSheet from "$lib/features/session/ui/SetOptionsSheet.svelte";
  import EffortPrompt from "$lib/features/session/ui/EffortPrompt.svelte";
  import ActionSheet, { type ActionItem } from "$lib/components/ActionSheet.svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import RestPickerSheet from "$lib/features/session/ui/RestPickerSheet.svelte";
  import { setsLine } from "$lib/features/session/planFormat";
  import { addButton } from "$lib/components/ui/choice";
  import { ArrowDownUp, ArrowLeftRight, ChartLine, Flame, Link2, Rows3 as MachineIcon, Timer, Trash2 } from "lucide-svelte";
  import SwapSheet from "$lib/features/session/ui/SwapSheet.svelte";
  import { getSplit } from "$lib/usecases/Splits/getSplit";
  import { saveSplit } from "$lib/usecases/Splits/saveSplit";
  import CoachSwapSheet from "$lib/features/session/ui/CoachSwapSheet.svelte";
  import { swapTargetFor, type SwapTarget } from "@logit/core/domain/swaps";
  import { coachFor, type CachedCoach } from "$lib/features/coaching/coachCache";
  import ExerciseDetailSheet from "$lib/features/exercise/components/ExerciseDetailSheet.svelte";
  import { justAdded } from "../justAdded";

  const {
    blockId,
    data,
    saving,
    grouped = false,
    groupRestMs,
    round,
    roundLabel,
    stage,
    gripAction,
    onGroup,
    onReorder,
    onDelete,
    onMutate,
  }: BlockBaseProps<StrengthBlockData> = $props();

  let suggestion = $state<ProgressionOutput | null>(null);
  // Back in a workout after the app was closed: the exercise you were on is open, not hidden.
  const resumingHere = untrack(() => {
    const s = get(currentSession);
    const exercises = s ? getExercises(s) : [];
    const current = exercises.find((e) => e.sets.some((x) => !x.completed && x.setType !== "warmup"));
    return current?.id === blockId && exercises.some((e) => e.sets.some((x) => x.completed));
  });
  const freshlyAdded = untrack(() => justAdded.delete(blockId));
  let collapsed = $state(
    untrack(() => stage)
      ? !freshlyAdded && foldFor(untrack(() => stage)!, get(profile).blocksCollapsedByDefault)
      : get(profile).blocksCollapsedByDefault && !resumingHere && !freshlyAdded,
  );

  // Done and upcoming blocks fold, the one you're on opens (stage.ts); a tap overrides until the stage changes.
  // Done waits while the last set's effort question is open.
  let seenStage = untrack(() => stage);
  let foldPending = false;
  $effect(() => {
    const st = stage;
    const asking = $effortOpenIn === blockId;
    untrack(() => {
      if (st && st !== seenStage) { seenStage = st; foldPending = true; }
      if (!st || !foldPending || (st === "done" && asking)) return;
      foldPending = false;
      collapsed = foldFor(st, get(profile).blocksCollapsedByDefault);
    });
  });

  // "Open every exercise" in the workout menu.
  let seenOpenAll = get(openAllSignal);
  $effect(() => {
    const n = $openAllSignal;
    untrack(() => {
      if (n === seenOpenAll) return;
      seenOpenAll = n;
      collapsed = false;
    });
  });
  // Plan this block's sets once the suggestion arrives: on first load if it has
  // none yet, and after a swap (replacing only the planned, not-yet-done sets).
  let planPending = $state(untrack(() => data.sets.length === 0));
  let exerciseData = $state<{ id: string; machines: Machine[]; defaultMachineId?: string; exerciseType?: ExerciseType } | null>(null);
  let exercise = $state<Exercise | null>(null);
  // The workout's place (My gym): set when it started or by "Where are you today?". Sessions
  // from before places have none set, so they use today's usual place.
  const placeId = $derived($currentSession?.placeId);
  const place = $derived(placeId === undefined ? placesStore.defaultFor() : placesStore.byId(placeId));
  // Only exercises whose number comes from a machine use one (bench press is the bar and its
  // plates on any bench; Martin 2026-11-18).
  const onMachine = $derived(!!exercise && usesMachine(exercise.equipment));
  const placeMachines = $derived(place && exercise && onMachine ? machinesFor(place, exercise.id) : []);
  const chosen = $derived(place && exercise && onMachine ? chosenMachine(place, exercise.id) : null);
  let machinePickerOpen = $state(false);
  // The machine editor over the workout (M2): a new machine (machineId null) or fixing one.
  let machineEditor = $state<{ open: boolean; machineId: string | null }>({ open: false, machineId: null });
  // Where the editor was opened from, so closing it steps back there (Martin: back goes to
  // the previous screen): "Which machine?", the exercise's "Where you do it", or the card.
  let editorFrom = $state<"picker" | "exercise" | "card">("card");
  let detailTab = $state<"auto" | "howto" | "settings">("auto");
  // "Where are you today?" asked again from the card (M1's "Not at … today?", or no place yet).
  let whereOpen = $state(false);
  // The first machine made "My gym" (M3): said once, on this card.
  let myGymNote = $state<Place | null>(null);
  // A machine picked by hand moves the sets not done yet onto it, even after some are logged.
  let forceReplan = false;
  // The last time on each machine, "59 × 10", for "Which machine?".
  let lastOnMachine = $state<Map<string, string>>(new Map());
  const machineKinds = ["machine", "cable", "smith"];
  // Last time this exercise was performed — shown as a "prev" hint per set row.
  let prevSets = $state<SetEntry[] | null>(null);
  // An exercise never done before (design canvas O4): its first set is the starting point
  // the plan works from, so it says how heavy to go instead of asking for a max.
  let prevLoaded = $state(false);
  let firstTimeReps = $state(8);
  let firstTimeMin = $state(1);
  // Planned from a best lift typed in at onboarding: not a first time, no "pick a weight".
  let fromBestLift = $state(false);
  $effect(() => {
    const ex = { id: data.exerciseId, name: data.exerciseName };
    void hasStartingLift(ex).then((has) => (fromBestLift = has)).catch(() => (fromBestLift = false));
  });
  const firstEver = $derived(prevLoaded && prevSets === null && !fromBestLift);
  const showFirstSetHint = $derived(firstEver && !data.sets.some((s) => s.completed));
  // A beginner's first barbell lift is planned on the empty bar (decision D3): say so plainly
  // instead of "pick a weight you could lift 8 times", which means nothing on day one.
  const emptyBarKg = $derived($equipment.barbell.barKg);
  const emptyBarStart = $derived(
    exercise?.equipment === "barbell" &&
      data.sets.some((s) => s.setType !== "warmup" && s.target?.weight != null && Math.abs(s.target.weight - emptyBarKg) < 0.6),
  );
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

  /** Correcting that first set (825 typed for 82.5) re-plans the sets it planned. */
  function withFirstSetFix(s: WorkoutSession, setId: string): WorkoutSession {
    const set = data.sets.find((x) => x.id === setId);
    if (!firstEver || !set?.completed || data.sets.some((x) => x.completed && x.id !== setId)) return s;
    return planRestFromFirstSet(s, blockId, setId, firstTimeMin, true);
  }

  /** A set 2+ reps short of its aim re-plans the untouched sets after it lighter, 2+ over
   * heavier. Weights on top of bodyweight aren't a load the 1RM maths can scale, so those are left. */
  function withSetReplan(s: WorkoutSession, setId: string): WorkoutSession {
    return bodyweight ? s : replanAfterSet(s, blockId, setId, loadsFor(weightSource, get(profile).weightUnit));
  }

  // The exercises before this one: when they change (dragged, one removed), an exercise not
  // started yet re-plans for its new place, since how tired the muscles are has changed.
  const exercisesBefore = $derived.by(() => {
    const sorted = [...($currentSession?.blocks ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
    const i = sorted.findIndex((b) => b.id === blockId);
    return i < 0 ? null : sorted.slice(0, i).map((b) => b.id).join(",");
  });
  let seenBefore: string | null = null;
  $effect(() => {
    const key = exercisesBefore;
    untrack(() => {
      const prev = seenBefore;
      if (key !== null) seenBefore = key;
      if (prev !== null && key !== null && prev !== key) void replanForNewPlace();
    });
  });

  async function replanForNewPlace() {
    const working = data.sets.filter((x) => x.setType !== "warmup" && !isContinuationSet(x.setType));
    if (bodyweight || working.length === 0 || !working.every(isUntouchedPlannedSet)) return;
    await loadSuggestion(data.exerciseName, data.exerciseId);
    if (!suggestion || suggestion.sets.length === 0) return;
    const plan = suggestionToPlan(suggestion, exerciseData?.defaultMachineId);
    // Follows the move, which was the step: undoing the move puts the old plan back too.
    await onMutate((s: WorkoutSession) => replanForOrder(s, blockId, plan), { auto: true });
  }

  // The line under the plan while re-planned sets are still to do: why, and a button that
  // swaps between the re-plan and the original plan as often as wanted.
  const replanLine = $derived.by(() => {
    const working = [...data.sets]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .filter((x) => x.setType !== "warmup" && !isContinuationSet(x.setType));
    const affected = working.filter((x) => isUntouchedPlannedSet(x) && x.target?.planned && x.target.replanned);
    if (affected.length === 0) return null;
    const pairs = affected.map((x) => ({ was: x.target!.planned!, now: x.target!.replanned! }));
    const kept = affected.every((x) => x.target!.weight === x.target!.planned!.weight && x.target!.reps === x.target!.planned!.reps);
    const lighter = pairs.every((p) => p.now.weight < p.was.weight || (p.now.weight === p.was.weight && p.now.reps < p.was.reps));
    const heavier = pairs.every((p) => p.now.weight > p.was.weight || (p.now.weight === p.was.weight && p.now.reps > p.was.reps));
    const dir = lighter ? "lighter" : heavier ? "heavier" : null;
    const nums = affected.map((x) => working.indexOf(x) + 1);
    const sets = nums.length === 1 ? `set ${nums[0]}` : `sets ${nums.slice(0, -1).join(", ")} and ${nums.at(-1)}`;
    const why = affected[0]!.target!.replanned!.why;
    let text: string;
    if (kept) {
      text = `Kept your plan for ${sets}.`;
    } else if (why === "short") {
      const first = working.indexOf(affected[0]!);
      const shortIdx = working.slice(0, first).findLastIndex((x) => x.completed && (shortBy(x) ?? 0) >= 1.99);
      const by = shortIdx >= 0 ? Math.round(shortBy(working[shortIdx]!)!) : null;
      const verb = `${nums.length === 1 ? "is" : "are"} ${dir ?? "re-planned"}`;
      text = by ? `Set ${shortIdx + 1} was ${by} reps short, so ${sets} ${verb}.` : `${sets[0]!.toUpperCase()}${sets.slice(1)} ${verb}.`;
    } else if (why === "over") {
      // Up from the plan it had just before, which may still be under the first plan.
      const first = working.indexOf(affected[0]!);
      const overIdx = working.slice(0, first).findLastIndex((x) => x.completed && (shortBy(x) ?? 0) <= -1.99);
      const by = overIdx >= 0 ? Math.round(-shortBy(working[overIdx]!)!) : null;
      const verb = nums.length === 1 ? "goes up" : "go up";
      text = by ? `Set ${overIdx + 1} beat its aim by ${by} reps, so ${sets} ${verb}.` : `${sets[0]!.toUpperCase()}${sets.slice(1)} ${verb}.`;
    } else {
      text = `Re-planned ${dir ? `${dir} ` : ""}for its new place in the workout.`;
    }
    return { text, kept, action: kept ? (dir ? `Use ${dir}` : "Use the re-plan") : "Keep the plan" };
  });

  async function toggleReplan() {
    const kept = replanLine?.kept;
    await onMutate((s: WorkoutSession) => useReplan(s, blockId, kept ? "replan" : "plan"));
  }

  const prevLeadSets = $derived(
    prevSets ? prevSets.filter((s) => s.setType !== "warmup" && !isContinuationSet(s.setType)) : [],
  );

  // The set whose options are open in its row (S-C), the one just ticked that asks how hard
  // it was (S-D), and one waiting for its reps to be typed.
  let optionsSetId = $state<string | null>(null);
  let effortSetId = $state<string | null>(null);
  $effect(() => {
    if (!effortSetId) untrack(() => { if (get(effortOpenIn) === blockId) effortOpenIn.set(null); });
  });
  onDestroy(() => { if (get(effortOpenIn) === blockId) effortOpenIn.set(null); });
  let effortTimer: ReturnType<typeof setTimeout> | null = null;
  let focusSetId = $state<string | null>(null);

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
  // The name opens the exercise over the workout (E1–E3): How to the first time, else Progress.
  let detailExerciseId = $state<string | null>(null);
  // A machine opened from the exercise's "Where you do it" (any place, not only today's).
  let editorPlace = $state<Place | null | undefined>(undefined);

  function openHowTo() {
    const id = data.exerciseId ?? exercise?.id;
    if (id) {
      detailTab = "howto";
      detailExerciseId = id;
    }
  }

  function openDetail() {
    const id = data.exerciseId ?? exercise?.id;
    if (id) {
      detailTab = "auto";
      detailExerciseId = id;
    }
  }

  /** A machine added or fixed from the card (M2): it's at the workout's place from now on. */
  let editorSaved = false;
  async function machineSaved(r: { machine: PlaceMachine; place: Place; createdPlace: boolean }) {
    editorSaved = true;
    if (r.createdPlace) myGymNote = r.place;
    if (!machineEditor.machineId) forceReplan = true;
    if (editorPlace === undefined && get(currentSession)?.placeId !== r.place.id) {
      await onMutate((s: WorkoutSession) => ({ ...s, placeId: r.place.id, placeAsked: true }));
    }
  }

  /** "Change the plan too": the split day this workout came from gets the new exercise. */
  async function swapInPlan(from: { name: string; id?: string }, to: { name: string; exerciseId?: string }) {
    const src = get(currentSession)?.source;
    if (!src || src.kind !== "split") return;
    try {
      const split = await getSplit(src.parentId);
      if (!split) return;
      let changed = false;
      const days = split.days.map((d) => {
        if (d.id !== src.dayId) return d;
        return {
          ...d,
          blocks: d.blocks.map((b) => {
            if (changed || b.type !== "strength") return b;
            const same = (from.id && b.exerciseId === from.id) || b.exerciseName.toLowerCase() === from.name.toLowerCase();
            if (!same) return b;
            changed = true;
            return { ...b, exerciseName: to.name, exerciseId: to.exerciseId };
          }),
        };
      });
      if (changed) {
        await saveSplit({ ...split, days });
        toast(`${split.name}: ${from.name} is now ${to.name}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change the plan");
    }
  }

  async function handleSwap(selection: { name: string; exerciseId?: string }, changePlan = false) {
    const from = { name: data.exerciseName, id: data.exerciseId };
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
      if (changePlan) await swapInPlan(from, { name: trimmed, exerciseId });
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
      const onMachine = new Map<string, string>();
      for (let i = history.length - 1; i >= 0; i--) {
        for (const x of history[i]!.sets) {
          if (!x.machineId || onMachine.has(x.machineId) || x.setType === "warmup" || !(x.reps > 0) || x.completed === false) continue;
          onMachine.set(x.machineId, `${formatLoad(x.weight, get(profile).weightUnit, false, { withUnit: false })} × ${x.reps}`);
        }
      }
      lastOnMachine = onMachine;
      prevSets = last
        ? [...last.sets].sort((a, b) => a.orderIndex - b.orderIndex)
        : null;
      if (!last) {
        const settings = await getExerciseProgressionSettings({ id: exerciseId, name }, getProgressionDeps()).catch(() => null);
        firstTimeReps = settings?.repRange?.[1] ?? 8;
        firstTimeMin = settings?.repRange?.[0] ?? 1;
      }
      // A new workout's first exercise opens (and with it the first-set hint), so there's
      // somewhere to start rather than a list of closed cards.
      if (get(currentSession)?.blocks[0]?.id === blockId && !data.sets.some((s) => s.completed)) collapsed = false;
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
      // Machines come only from the workout's place (Martin, 2026-11-18): the one picked for
      // this exercise there, else the first that's in. No place, no machines: weights are typed.
      const machineWork = !!ex && usesMachine(ex.equipment);
      const here = ex && at && machineWork ? machinesFor(at, ex.id) : [];
      const chosen = ex && at && machineWork ? chosenMachine(at, ex.id) : null;
      exerciseData = ex
        ? { id: ex.id, machines: here.map(effectiveMachine), defaultMachineId: chosen?.id, exerciseType: ex.exerciseType }
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
    const forced = forceReplan;
    forceReplan = false;
    if (forced) replanned.delete(key);
    if (!s || replanned.has(key) || (!forced && data.sets.some((x) => x.completed))) return;
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
    // The app filling in its plan isn't something to undo.
    await onMutate((s: WorkoutSession) => applySetPlan(s, blockId, plan), { auto: true });
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
    // A set beyond the plan has nothing to show yet: straight into its reps.
    if (!planned) {
      const block = get(currentSession)?.blocks.find((b) => b.id === blockId);
      const added = (block?.data as StrengthBlockData | undefined)?.sets.find((x) => !before.has(x.id));
      if (added) focusSetId = added.id;
    }
  }

  const hasWarmup = $derived(data.sets.some((s) => s.setType === "warmup"));
  const warmupWorkingKg = $derived.by(() => {
    const logged = data.sets.find((s) => s.setType !== "warmup" && s.weight > 0)?.weight;
    return logged ?? suggestion?.sets.find((s) => (s.weight ?? 0) > 0)?.weight ?? 0;
  });
  // No ramp for bodyweight work: "BW+2.5" isn't a bar to build up to.
  // Shown before a weight is typed too (greyed): appearing on the first weight pushed the tick
  // away from under the finger.
  const canWarmup = $derived(!hasWarmup && !bodyweight);

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
    await onMutate((s: WorkoutSession) => withFirstSetFix(updateSet(s, blockId, setId, { reps: safe }), setId));
  }

  async function handleWeightChange(setId: string, weight: number) {
    // Negative weight is meaningful: net assistance on a bodyweight / assisted-machine
    // movement (e.g. −25 = bodyweight minus 25 kg on the assisted dip machine).
    const safe = Number.isFinite(weight) ? weight : 0;
    await onMutate((s: WorkoutSession) => withFirstSetFix(updateSet(s, blockId, setId, { weight: safe }), setId));
    if (!bodyweight) warnIfTypo(setId, safe);
  }

  /** 3× the plan, the other sets or last time is almost always a typo (825 for 82.5): say so,
   * with a one-tap fix when dropping a digit lands near it. Nothing is blocked. */
  function warnIfTypo(setId: string, kg: number) {
    const set = data.sets.find((x) => x.id === setId);
    const others = data.sets.filter((x) => x.id !== setId && x.weight > 0).map((x) => x.weight);
    const ref = set?.target?.weight || Math.max(0, ...others, ...(prevSets ?? []).map((x) => x.weight));
    if (!(ref > 0) || kg < ref * 3) return;
    const unit = get(profile).weightUnit;
    const fixed = kg / 10;
    const fix = fixed >= ref / 2 && fixed <= ref * 2
      ? { action: { label: `Make it ${formatLoad(fixed, unit, false)}`, onClick: () => void handleWeightChange(setId, fixed) } }
      : {};
    toast.warning(`${formatLoad(kg, unit, false)}? That's ${Math.round(kg / ref)}× ${formatLoad(ref, unit, false)}.`, fix);
  }

  async function handleDeleteSet(setId: string) {
    if (optionsSetId === setId) optionsSetId = null;
    if (effortSetId === setId) effortSetId = null;
    await onMutate((s: WorkoutSession) => removeSet(s, blockId, setId));
  }

  /** The swipe's edit button opens the set's details under its row; again closes them (S-C). */
  function openEditSet(setId: string, _setNumber: number | null = null) {
    optionsSetId = optionsSetId === setId ? null : setId;
    if (effortSetId === setId) effortSetId = null;
  }

  /** The group's rest when it sets one (a positive number), else undefined. */
  function groupRest(): number | undefined {
    return groupRestMs && groupRestMs > 0 ? groupRestMs : undefined;
  }

  /** The rest that runs after this set: the group's, else its own, else its kind's default. */
  function restFor(set: SetEntry): number | undefined {
    return groupRest() ?? set.restDurationMs ?? get(profile).restDefaults[set.setType];
  }

  async function patchSet(
    setId: string,
    patch: Partial<Pick<SetEntry, "setType" | "note" | "restDurationMs" | "rpe">>,
  ) {
    await onMutate((s: WorkoutSession) => updateSet(s, blockId, setId, patch));
  }

  /** "How many more could you have done?" after a tick (S-D), until answered, the next set, or the rest ends. */
  function askEffort(set: SetEntry) {
    if (effortTimer) clearTimeout(effortTimer);
    effortSetId = null;
    if (!get(profile).askEffortAfterSet || set.setType === "warmup" || set.rpe != null) return;
    effortSetId = set.id;
    effortOpenIn.set(blockId);
    effortTimer = setTimeout(() => { if (effortSetId === set.id) effortSetId = null; }, restFor(set) ?? 90_000);
  }

  async function triggerHaptic() {
    // Set logged: a vibration, and the tap sound when Settings › Sounds › Taps is on.
    playSound("tap");
  }

  const AS_PLANNED_KEY = "logit:hint:logged-as-planned";
  function loggedAsPlanned(setId: string, kg: number, reps: number) {
    const shown = Number(getAccountItem(AS_PLANNED_KEY) ?? 0) || 0;
    // The effort question after the tick already asks this (decision: one question per set).
    if (shown >= 3 || get(profile).askEffortAfterSet) return;
    setAccountItem(AS_PLANNED_KEY, String(shown + 1));
    const load = bodyweight ? formatLoad(kg, get(profile).weightUnit, true) : formatWeight(kg, get(profile).weightUnit);
    toast(`Logged ${load} × ${reps}. Did more?`, { id: "logged-as-planned", action: { label: "Change", onClick: () => openEditSet(setId) } });
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
        focusSetId = null;
        queueMicrotask(() => (focusSetId = set.id));
        return;
      }
    }
    // No weight and none planned: carry the set before it rather than logging 0 kg.
    const before = !wasCompleted && !fill?.weight ? carriedWeight(data.sets, set) : undefined;
    if (before !== undefined) fill = { reps: fill?.reps ?? set.reps, weight: before };
    // In a superset / circuit the group's rest wins; else the set's own override,
    // else the per-type default. A group rest of 0 goes straight on.
    const effectiveRest = groupRest() ?? set.restDurationMs ?? get(profile).restDefaults[set.setType];
    const startsRest = groupRestMs !== 0 && effectiveRest !== undefined;
    // Before the save: ticking the last set makes the exercise "done", and it stays open for this.
    if (!wasCompleted) askEffort(set);

    await onMutate((s: WorkoutSession) => {
      const next = updateSet(s, blockId, setId, {
        ...(fill ?? {}),
        // The rest bar reads the set's rest, so a group rest is written onto the set.
        ...(!wasCompleted && startsRest && groupRest() !== undefined ? { restDurationMs: groupRest() } : {}),
        completed: !wasCompleted,
        restStartedAtMs: !wasCompleted && startsRest ? Date.now() : null,
      });
      const planned = wasCompleted ? next : withSetReplan(withFirstSetPlan(next, setId), setId);
      // One rest at a time: a new rest replaces the previous set's.
      return !wasCompleted && startsRest ? clearOtherRests(planned, setId) : planned;
    });

    // The rest service (restTimerService.ts) sees restStartedAtMs change and schedules or
    // cancels the alert itself.
    if (!wasCompleted) {
      void triggerHaptic();
      if (optionsSetId === setId) optionsSetId = null;
      // An empty reps box logged the plan's reps (bug hunt 3.12): say so the first few times,
      // so someone who did 12 learns they can change it.
      if (fill && set.target && fill.reps === set.target.reps) loggedAsPlanned(setId, fill.weight ?? set.weight, fill.reps);
    } else if (effortSetId === setId) {
      effortSetId = null;
    }
  }

  async function handleDismissRest(setId: string) {
    // Rests aren't undo steps (like the timer ending one).
    await onMutate((s: WorkoutSession) =>
      updateSet(s, blockId, setId, { restStartedAtMs: null }),
    { auto: true });
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
        // Warm-ups show "W" and aren't counted: working sets are 1, 2, 3 like the plan, and line up with last time's.
        const warmup = set.setType === "warmup";
        if (!warmup) leadCount++;
        const drops: SetEntry[] = [];
        i++;
        while (i < sorted.length && isContinuationSet(sorted[i]!.setType)) {
          drops.push(sorted[i]!);
          i++;
        }
        groups.push({ lead: set, leadNum: warmup ? 0 : leadCount, drops });
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

  /** Move up / Move down in the set's options: swaps it with its neighbour. */
  async function moveSet(setId: string, dir: -1 | 1) {
    await onMutate((s: WorkoutSession) => {
      const idx = s.blocks.findIndex((b) => b.id === blockId);
      if (idx === -1) return s;
      const block = s.blocks[idx] as SessionBlock<StrengthBlockData>;
      const sorted = [...block.data.sets].sort(sortByOrderIndex);
      const from = sorted.findIndex((x) => x.id === setId);
      const to = from + dir;
      if (from === -1 || to < 0 || to >= sorted.length) return s;
      [sorted[from], sorted[to]] = [sorted[to]!, sorted[from]!];
      const order = new Map(sorted.map((x, i) => [x.id, i]));
      const updated = { ...block, data: { ...block.data, sets: block.data.sets.map((x) => ({ ...x, orderIndex: order.get(x.id) ?? x.orderIndex })) } };
      return { ...s, blocks: s.blocks.map((b, i) => (i === idx ? updated : b)) };
    });
  }
  const optionsSet = $derived(optionsSetId ? data.sets.find((x) => x.id === optionsSetId) ?? null : null);
  const optionsIndex = $derived(optionsSet ? [...data.sets].sort(sortByOrderIndex).findIndex((x) => x.id === optionsSet.id) : -1);
  const optionsNumber = $derived(optionsSet && optionsSet.setType !== "warmup" ? workingSets.findIndex((x) => x.id === optionsSet.id) + 1 : 0);

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
    const barbell = exercise.equipment === "barbell" ? barbellFor(place, exercise.name) : undefined;
    if (barbell) return { kind: "bar", barbell, placeName: place.name };
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

  // The folded lines (merged design): done sets, or the plan still to do (shown blue).
  const foldedSummary = $derived.by(() => {
    const unit = $profile.weightUnit;
    const done = workingSets.filter((x) => x.completed);
    if (workingSets.length && done.length === workingSets.length) return setsLine(done, unit, bodyweight);
    const todo = workingSets.filter((x) => !x.completed).map((x) => ({
      weight: x.weight || x.target?.weight || 0,
      reps: x.reps || x.target?.reps || 0,
    }));
    return todo.length ? setsLine(todo, unit, bodyweight) : "";
  });
  // Every working set hit the goal's reps: next time goes up to the goal's weight.
  const nextTime = $derived.by(() => {
    const goal = suggestion?.progressGoal;
    if (!goal || goal.weight === undefined || !workingSets.length) return null;
    const hit = workingSets.every((x) => x.completed && x.reps >= goal.reps);
    return hit ? formatLoad(goal.weight, $profile.weightUnit, bodyweight) : null;
  });

  let menuOpen = $state(false);
  let confirmRemove = $state(false);
  let restPickOpen = $state(false);
  const restNowMs = $derived(
    groupRest() ?? workingSets.find((x) => !x.completed)?.restDurationMs ?? $profile.restDefaults.normal ?? 120_000,
  );
  function restLabel(ms: number): string {
    return `${Math.floor(ms / 60_000)}:${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")}`;
  }
  /** "Rest between sets": the sets still to do take it. */
  async function setRestForRemaining(ms: number) {
    await onMutate((s: WorkoutSession) => {
      let next = s;
      for (const x of data.sets) if (!x.completed) next = updateSet(next, blockId, x.id, { restDurationMs: ms });
      return next;
    });
  }
  function openSettings() {
    const id = data.exerciseId ?? exercise?.id;
    if (id) {
      detailTab = "settings";
      detailExerciseId = id;
    }
  }
  const machineValue = $derived(
    chosen ? chosen.name : place && exercise && !onMachine && exercise.equipment === "barbell"
      ? (() => { const bar = barbellFor(place, exercise.name); return bar ? `${formatLoad(bar.barKg, $profile.weightUnit, false)} bar` : null; })()
      : null,
  );
  function openMachine() {
    if (place && placeMachines.length) machinePickerOpen = true;
    else if (onMachine) { editorFrom = "card"; machineEditor = { open: true, machineId: null }; }
    else openHowTo();
  }
  const menuItems = $derived<ActionItem[]>([
    { icon: ChartLine, label: "Progress and history", onSelect: openDetail },
    { icon: ArrowLeftRight, label: "Swap for another exercise", onSelect: openSwap },
    ...(onGroup ? [{ icon: Link2, label: "Superset or circuit with…", onSelect: () => onGroup() }] : []),
    ...(canWarmup && round === undefined
      ? [{ icon: Flame, label: "Add warm-up sets", value: warmupWorkingKg > 0 ? `up to ${formatLoad(warmupWorkingKg, $profile.weightUnit, false)}` : null, disabled: warmupWorkingKg <= 0, onSelect: () => void handleAddWarmup() }]
      : []),
    { icon: Timer, label: "Rest between sets", value: restLabel(restNowMs), onSelect: () => (restPickOpen = true) },
    { icon: MachineIcon, label: onMachine ? "Machine" : "Machine or bar", value: machineValue, onSelect: openMachine },
    ...(onReorder ? [{ icon: ArrowDownUp, label: "Change the order", onSelect: onReorder }] : []),
    { icon: Trash2, label: "Remove from this workout", destructive: true, onSelect: () => (confirmRemove = true) },
  ]);

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
  {saving}
  suggestion={cardSuggestion}
  collapsed={round === undefined ? collapsed : false}
  roundView={round !== undefined}
  {hasActiveTimer}
  weightUnit={$profile.weightUnit}
  {bodyweight}
  {grouped}
  {gripAction}
  {stage}
  summary={foldedSummary}
  {nextTime}
  canWarmup={canWarmup && data.sets.length > 0}
  warmupDisabled={warmupWorkingKg <= 0}
  onAddWarmup={handleAddWarmup}
  onMenu={() => (menuOpen = true)}
  onSettings={openSettings}
  onToggleCollapse={() => (collapsed = !collapsed)}
  onAddSet={handleAddSet}
  onOpenDetail={openDetail}
  onDismissNudge={handleDismissNudge}
  onAcceptNudge={handleAcceptNudge}
  {lastTime}
  replan={replanLine}
  onToggleReplan={toggleReplan}
>
  {#snippet chip()}
    {#if place && chosen}
      <button type="button" onclick={() => (machinePickerOpen = true)} in:popIn
        class="flex h-9 max-w-full items-center gap-2 rounded-full bg-muted pl-2.5 pr-2 text-left text-[13px] transition-colors active:bg-muted/70"
        aria-label="Machine: {chosen.name} at {place.name}. Change">
        <Rows3 class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span class="min-w-0 truncate"><span class="font-semibold">{chosen.name}</span><span class="text-muted-foreground">{` at ${place.name}`}</span></span>
        {#if chosen.status === "out"}<span class="shrink-0 rounded-md bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning">Out of order</span>{/if}
        <ChevronDown class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    {:else if exercise && machineKinds.includes(exercise.equipment ?? "")}
      {#if !place && placesStore.active.length > 0}
        <button type="button" onclick={() => (whereOpen = true)} in:popIn
          class="flex h-9 max-w-full items-center gap-2 rounded-full border border-dashed border-border pl-2.5 pr-3 text-[13px] text-muted-foreground">
          <MapPin class="h-4 w-4 shrink-0" aria-hidden="true" /><span class="truncate">Which gym are you at?</span>
        </button>
      {:else}
        <button type="button" onclick={() => { editorFrom = "card"; machineEditor = { open: true, machineId: null }; }} in:popIn
          class="flex h-9 max-w-full items-center gap-2 rounded-full border border-dashed border-border pl-2.5 pr-3 text-[13px] text-muted-foreground">
          <Plus class="h-4 w-4 shrink-0" aria-hidden="true" /><span class="truncate">{place ? `Add the machine you use at ${place.name}` : "Add the machine you use"}</span>
        </button>
      {/if}
    {/if}
    {#if myGymNote}
      <div role="status" transition:reveal class="mt-2 flex flex-col gap-1 rounded-lg bg-success/10 px-3 py-2.5 text-success">
        <span class="text-sm font-semibold">Saved to {myGymNote.name}</span>
        <span class="text-[13px] leading-snug text-foreground/80">Your machines now live in a place, so the next exercise that uses this one finds it too. Train somewhere else as well? Add it whenever you like.</span>
        <span class="mt-1 flex gap-2">
          <button type="button" class="min-h-9 rounded-lg border border-success/40 bg-background px-3 text-[13px] font-semibold" onclick={() => { const id = myGymNote?.id; myGymNote = null; if (id) void goto(`/settings/places/${id}`); }}>Rename {myGymNote.name}</button>
          <button type="button" class="min-h-9 rounded-lg px-3 text-[13px] text-foreground/80" onclick={() => (myGymNote = null)}>Got it</button>
        </span>
      </div>
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
        onSwipeRight={() => { if (optionsSetId === roundSet.id) optionsSetId = null; }}
        onEdit={() => openEditSet(roundSet.id, roundNum || null)}
      >
        <SetRow
          setNumber={roundNum}
          label={roundLabel ?? null}
          lastPrefix={roundLabel ? data.exerciseName : ""}
          setType={roundSet.setType}
          reps={roundSet.reps}
          weight={roundSet.weight}
          weightUnit={$profile.weightUnit}
          {bodyweight}
          rpe={roundSet.rpe ?? null}
          prev={roundNum ? (prevLeadSets[roundNum - 1] ?? null) : null}
          target={roundSet.target ?? null}
          optionsOpen={optionsSetId === roundSet.id}
          focusReps={focusSetId === roundSet.id}
          onPickWeight={weightSource ? () => openWeightPicker(roundSet, roundNum) : undefined}
          completed={roundSet.completed ?? false}
          disabled={saving}
          gripAction={noopGripAction}
          onRepsChange={(r) => handleRepsChange(roundSet.id, r)}
          onWeightChange={(w) => handleWeightChange(roundSet.id, w)}
          onComplete={() => handleComplete(roundSet.id)}
        />
      </SwipeRevealRow>
      {@render setExtras(roundSet, roundNum || null)}
    {/if}
  {:else if data.sets.length > 0}
    {#if exercise && needsSetup(exercise)}
      {#key exercise.id}
        <FinishSetupCard {exercise} onsaved={(updated) => (exercise = updated)} onmerged={(into) => (exercise = into)} />
      {/key}
    {/if}
    {#if showFirstSetHint}
      <div class="mx-3 my-2 flex flex-col gap-1 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
        {#if bodyweight}
          <p class="text-sm font-semibold">First time? Do as many good reps as you can.</p>
          <p class="text-xs text-muted-foreground">LogIt plans every set after this one from it.</p>
        {:else if emptyBarStart}
          <p class="text-sm font-semibold">Start with the empty bar: {formatWeight(emptyBarKg, $profile.weightUnit)}</p>
          <p class="text-xs text-muted-foreground">Do {firstTimeMin > 1 && firstTimeMin < firstTimeReps ? `${firstTimeMin}–${firstTimeReps}` : firstTimeReps} slow reps. If they felt easy, put {$profile.weightUnit === "lbs" ? "5 lb" : "2.5 kg"} on each side for the next set. LogIt plans next time from what you do today.</p>
          <button type="button" class="mt-1 h-11 w-fit rounded-[10px] border border-border px-3.5 text-sm font-medium" onclick={openHowTo}>How to</button>
        {:else}
          <p class="text-sm font-semibold">First time? Pick a weight you could lift about {firstTimeReps} times.</p>
          <p class="text-xs text-muted-foreground">LogIt plans every set after this one from it. No need to know your max.</p>
        {/if}
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
        onSwipeRight={() => { if (optionsSetId === lead.id) optionsSetId = null; }}
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
              optionsOpen={optionsSetId === lead.id}
              focusReps={focusSetId === lead.id}
              onPickWeight={weightSource ? () => openWeightPicker(lead, group.leadNum) : undefined}
              completed={lead.completed ?? false}
              disabled={saving || setDragId !== null}
              gripAction={(node) => setGripAction(node, lead.id)}
              onRepsChange={(r) => handleRepsChange(lead.id, r)}
              onWeightChange={(w) => handleWeightChange(lead.id, w)}
              onComplete={() => handleComplete(lead.id)}
            />
          </SwipeRevealRow>
          {@render setExtras(lead, group.leadNum)}
        {/if}

        {#if group.drops.length > 0}
          <div class="ml-3 border-l-2 border-primary/30 bg-muted/20">
            {#each group.drops as drop (drop.id)}
              <SwipeRevealRow
                disabled={saving}
                actionsWidth={80}
                onDelete={() => handleDeleteSet(drop.id)}
        onSwipeRight={() => { if (optionsSetId === drop.id) optionsSetId = null; }}
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
                  optionsOpen={optionsSetId === drop.id}
                  focusReps={focusSetId === drop.id}
                  onPickWeight={weightSource ? () => openWeightPicker(drop, 0) : undefined}
                  completed={drop.completed ?? false}
                  disabled={saving || setDragId !== null}
                  gripAction={noopGripAction}
                  onRepsChange={(r) => handleRepsChange(drop.id, r)}
                  onWeightChange={(w) => handleWeightChange(drop.id, w)}
                  onComplete={() => handleComplete(drop.id)}
                />
              </SwipeRevealRow>
              {@render setExtras(drop, null)}
            {/each}
            <div class="px-3 py-1.5">
              <button type="button" class={addButton} disabled={saving} onclick={() => handleAddDrop(group.drops[group.drops.length - 1]!.id)}>
                <Plus class="h-3.5 w-3.5" /> Add drop
              </button>
            </div>
          </div>
        {/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="flex flex-wrap gap-2 px-3 pt-1 pb-3">
      <button type="button" class={addButton} disabled={saving} onclick={handleAddSet}>
        <Plus class="h-3.5 w-3.5" /> Add first set
      </button>
      {#if canWarmup}
        <button type="button" class={addButton} disabled={saving || warmupWorkingKg <= 0} onclick={handleAddWarmup} transition:reveal>
          <Plus class="h-3.5 w-3.5" /> Warm-up ramp
        </button>
      {/if}
    </div>
  {/if}
</ExerciseCard>

{#if optionsSet}
  <SetOptionsSheet
    open={!!optionsSet}
    onOpenChange={(v) => { if (!v) optionsSetId = null; }}
    title="{optionsNumber ? `Set ${optionsNumber}` : setTypeMeta(optionsSet.setType).label} · {data.exerciseName}"
    subtitle={optionsSet.target ? `Planned ${formatLoad(optionsSet.target.weight, $profile.weightUnit, bodyweight)} × ${optionsSet.target.reps}` : null}
    setType={optionsSet.setType}
    rpe={optionsSet.rpe}
    note={optionsSet.note}
    restMs={restFor(optionsSet)}
    disabled={saving}
    canMoveUp={optionsIndex > 0}
    canMoveDown={optionsIndex !== -1 && optionsIndex < data.sets.length - 1}
    onChange={(patch) => patchSet(optionsSet.id, patch)}
    onMoveUp={() => void moveSet(optionsSet.id, -1)}
    onMoveDown={() => void moveSet(optionsSet.id, 1)}
    onDelete={() => void handleDeleteSet(optionsSet.id)}
  />
{/if}

<ActionSheet
  open={menuOpen}
  onOpenChange={(v) => (menuOpen = v)}
  title={data.exerciseName}
  subtitle={[exercise?.primaryMuscles?.[0], exercise?.equipment].filter(Boolean).join(" · ") || null}
  items={menuItems}
/>

<ConfirmDialog
  title="Remove {data.exerciseName}?"
  description="Removes this exercise and all its sets from the workout."
  confirmLabel="Remove"
  {saving}
  onConfirm={onDelete}
  open={confirmRemove}
  onOpenChange={(v: boolean) => (confirmRemove = v)}
/>

<RestPickerSheet
  open={restPickOpen}
  onOpenChange={(v) => (restPickOpen = v)}
  title="Rest between sets"
  subtitle="{data.exerciseName} · the sets still to do"
  valueMs={restNowMs}
  onSave={(ms) => void setRestForRemaining(ms)}
/>

{#if coachSwap}
  <CoachSwapSheet
    open={swapOpen}
    target={coachSwap.target}
    coach={coachSwap.coach}
    onOpenChange={(v) => (swapOpen = v)}
    onPick={handleSwap}
  />
{:else}
  <SwapSheet
    open={swapOpen}
    onOpenChange={(v) => (swapOpen = v)}
    exerciseName={data.exerciseName}
    exerciseId={data.exerciseId}
    {doneCount}
    totalCount={workingSetCount}
    canChangePlan={$currentSession?.source?.kind === "split"}
    onPick={(sel, changePlan) => handleSwap(sel, changePlan)}
  />
{/if}

{#snippet setExtras(set: SetEntry, num: number | null)}
  {#if effortSetId === set.id && optionsSetId !== set.id}
    <div transition:reveal>
      <EffortPrompt setNumber={num} onAnswer={(rpe) => { effortSetId = null; void patchSet(set.id, { rpe }); }} />
    </div>
  {/if}
{/snippet}

<ExerciseDetailSheet
  exerciseId={detailExerciseId}
  excludeSessionId={$currentSession?.id}
  onClose={() => {
    detailExerciseId = null;
    // Pick up any edits (name, how it progresses) made in the sheet.
    void loadExerciseData(data.exerciseId, data.exerciseName);
    void loadSuggestion(data.exerciseName, data.exerciseId);
  }}
  tab={detailTab}
  onMachine={(p, machineId) => {
    detailExerciseId = null;
    editorPlace = p;
    editorFrom = "exercise";
    machineEditor = { open: true, machineId };
  }}
>
  {#snippet today()}
    {#if cardSuggestion && cardSuggestion.sets.length}
      <div class="flex flex-col gap-1 rounded-xl bg-info/10 px-3.5 py-3 text-sm text-info">
        <span>Today: {cardSuggestion.label ?? `${cardSuggestion.sets.length} sets`}</span>
        {#if cardSuggestion.change?.detail}<span class="text-[13px]">{cardSuggestion.change.detail}</span>{/if}
      </div>
    {/if}
  {/snippet}
</ExerciseDetailSheet>

{#if place && exercise && placeMachines.length}
  <MachinePickerSheet
    open={machinePickerOpen}
    {place}
    exerciseId={exercise.id}
    exerciseName={data.exerciseName}
    machines={placeMachines}
    currentId={chosen?.id ?? null}
    lastTimeOn={(id) => lastOnMachine.get(id) ?? null}
    onOpenChange={(v) => (machinePickerOpen = v)}
    onPick={() => (forceReplan = true)}
    onEdit={(m) => { machinePickerOpen = false; editorFrom = "picker"; machineEditor = { open: true, machineId: m.id }; }}
    onAdd={() => { machinePickerOpen = false; editorFrom = "picker"; machineEditor = { open: true, machineId: null }; }}
    onChangePlace={placesStore.active.length > 1 ? () => (whereOpen = true) : undefined}
  />
{/if}

{#if exercise}
  <MachineEditorSheet
    open={machineEditor.open}
    place={editorPlace === undefined ? place : editorPlace}
    machineId={machineEditor.machineId}
    forExercise={machineEditor.machineId ? null : { id: exercise.id, name: data.exerciseName }}
    backLabel={editorFrom === "picker" ? "Which machine?" : editorFrom === "exercise" ? data.exerciseName : "Back to the workout"}
    onOpenChange={(v) => {
      machineEditor = { ...machineEditor, open: v };
      if (v) return;
      editorPlace = undefined;
      // Closed without saving: back to where it was opened from.
      if (!editorSaved) {
        if (editorFrom === "picker") machinePickerOpen = true;
        else if (editorFrom === "exercise" && exercise) { detailTab = "howto"; detailExerciseId = exercise.id; }
      }
      editorSaved = false;
      editorFrom = "card";
    }}
    onSaved={(r) => void machineSaved(r)}
  />
{/if}

{#if whereOpen && $currentSession}
  <WhereTodaySheet session={$currentSession} changing
    onPick={(placeId) => { whereOpen = false; void onMutate((s: WorkoutSession) => ({ ...s, placeId, placeAsked: true })); }} />
{/if}

{#if weightSource && weightPick}
  <WeightPickerSheet
    open={!!weightPick}
    source={weightSource}
    title="{weightPick.number ? `Set ${weightPick.number}` : 'Warm-up'} · {data.exerciseName}"
    weightKg={weightPick.weight}
    plannedKg={weightPick.planned}
    lastKg={weightPick.last}
    unit={$profile.weightUnit}
    onOpenChange={(v) => { if (!v) weightPick = null; }}
    onPick={(kg) => { const id = weightPick?.setId; if (id) void handleWeightChange(id, kg); }}
  />
{/if}
