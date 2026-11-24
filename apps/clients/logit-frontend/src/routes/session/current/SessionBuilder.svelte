<script lang="ts">
  import { goto } from "$app/navigation";
  import { get } from "svelte/store";
  import { toast } from "$lib/components/ui/sonner/index";
  import { onMount, untrack } from "svelte";

  import { getWorkoutRepo, getExerciseRepo } from "$lib/data/repoProvider";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { recentSessions } from "$lib/stores/recentSessions.store";
  import { profile } from "$lib/stores/profile.store";
  import { refreshProgressionState } from "@logit/core/usecases/progression/getSuggestion";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import type { WorkoutSession, SessionBlock, MobilityBlockData, MobilityMetric } from "@logit/core/domain/workout";
  import { blockDisplayName, addExercise, addCardioBlock, addMobilityBlock, removeExercise, getExercises, setSessionNote, dropUnloggedPlannedSets, groupIntoSuperset, minGroupSize, type GroupKind } from "@logit/core/domain/workout";
  import { refreshMobilityProgressionState } from "@logit/core/usecases/progression/getMobilitySuggestion";
  import { mobilityDrillKey, getMobilityDrillLeadSide } from "$lib/data/mobilityDrillPrefs";

  import { keyboard } from "$lib/stores/keybaord.store";
  import { Plus } from "lucide-svelte";
  import { reveal } from "$lib/transitions";
  import { autoTour, destroyActiveTour } from "$lib/tour/index";

  import { listBlockDefs } from "$lib/features/session/blocks/index";
  import { getBlockDeclaration } from "$lib/plugins/blockPluginStore";
  import { addPluginBlock, isPluginBlockType, pluginBlockType, type PluginBlockData } from "@logit/core/domain/blockPlugin";
  import BlockHost from "$lib/features/session/blocks/BlockHost.svelte";
  import AddToWorkoutSheet, { type AddPick } from "$lib/features/session/ui/AddToWorkoutSheet.svelte";
  import EmptySessionCard from "$lib/features/session/ui/EmptySessionCard.svelte";
  import SupersetGroup from "$lib/features/session/ui/SupersetGroup.svelte";
  import CircuitOverlay from "$lib/features/session/circuit/CircuitOverlay.svelte";
  import WhereTodaySheet from "$lib/features/places/WhereTodaySheet.svelte";
  import { placesStore } from "$lib/features/places/places.svelte";
  import { circuitRunner } from "$lib/features/session/circuit/circuitRunner";
  import GroupPickerSheet from "$lib/features/session/ui/GroupPickerSheet.svelte";
  import {
    groupPickerModel,
    groupConfirmLabel,
    canConfirmGroup,
    pickerGroupKind,
    allowedDropIndices,
    nearestAllowed,
    type GroupPickerModel,
  } from "$lib/features/session/grouping";
  import WorkoutRecapScreen from "$lib/features/session/ui/WorkoutRecapScreen.svelte";
  import type { SessionPR } from "@logit/core/usecases/progression/getSessionPRs";
  import { localInbox, prNotifications, progressionNotification } from "$lib/features/inbox/localInbox";
  import { notifyGoalsReached } from "$lib/features/goals/goalProgress";
  import { afterWorkoutRoute, completesFirstWeek } from "$lib/features/onboarding/afterWorkout";
  import CreatePostSheet from "$lib/components/CreatePostSheet.svelte";
  import BodyweightPromptDialog from "$lib/features/bodyweight/BodyweightPromptDialog.svelte";
  import { shouldAskForBodyweight, dismissBodyweightPrompt } from "$lib/features/bodyweight/bodyweight";
  import type { ExerciseType } from "@logit/core/domain/exercise";

  import CurrentSessionHeader from "./Components/CurrentSessionHeader.svelte";
  import WorkoutDock from "$lib/features/session/ui/WorkoutDock.svelte";
  import WorkoutMenuSheet from "$lib/features/session/ui/WorkoutMenuSheet.svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import ReorderSheet from "$lib/features/session/ui/ReorderSheet.svelte";
  import { blockStages, blockProgress, type BlockStage } from "$lib/features/session/stage";
  import { openAllSignal } from "$lib/features/session/openAll";
  import { music } from "$lib/features/music/nowPlaying.svelte";
  import { addButton } from "$lib/components/ui/choice";
  import { onWorkoutFinished } from "$lib/features/music/sessionMusic";
  import { justAdded } from "$lib/features/session/blocks/justAdded";

  onMount(() => {
    // The tour waits for the first set row: on a slower phone it isn't drawn at 600 ms, and the
    // "Tick a set" step was left out. An empty workout starts it without that step.
    const opened = Date.now();
    const startTour = () => {
      if (document.querySelector("[data-guide='session-set-complete']") || Date.now() - opened > 4000) autoTour("app.session");
      else setTimeout(startTour, 200);
    };
    setTimeout(startTour, 600);
    // Machines kept on exercises move into a place (once per account).
    void placesStore.migrateExerciseMachines();
    void getWorkoutRepo()
      .listRecentSessions({ limit: 1 })
      .then((s) => (hasPreviousSession = s.length > 0))
      .catch(() => {});
  });

  async function repeatLast() {
    if (ui.finishing) return;
    destroyActiveTour();
    try {
      await currentSession.repeatLast();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't repeat the last workout");
    }
  }

  const ui = $state({
    saving: false,
    finishing: false,
    error: null as string | null,
  });

  const addBlockUi = $state({ sheetOpen: false });

  let recapSession = $state<WorkoutSession | null>(null);
  // Planned but not done, so left out of what's saved: named on the finish screen.
  let recapSkipped = $state<string[]>([]);
  // PRs the recap worked out, for the inbox once the session is saved.
  let recapPrs: SessionPR[] = [];
  let shareSession = $state<WorkoutSession | null>(null);
  let hasPreviousSession = $state(false);
  let noteOpen = $state(false);
  let reorderOpen = $state(false);
  // Set to the exercise's name while asking for bodyweight (see addExerciseWithName).
  let bodyweightPromptFor = $state<string | null>(null);

  async function saveNote(value: string) {
    await onMutate((s) => setSessionNote(s, value));
  }
  let blocksListEl = $state<HTMLElement | null>(null);
  // The bottom bar's height: the shrunk circuit timer sits just above it.
  let dockHeight = $state(0);
  const addButtonBottom = $derived(dockHeight + 12);
  let menuOpen = $state(false);
  let confirmDiscard = $state(false);
  let whereOpen = $state(false);
  let noteEl = $state<HTMLTextAreaElement | null>(null);

  function openNote() {
    noteOpen = true;
    setTimeout(() => {
      noteEl?.scrollIntoView({ block: "center", behavior: "smooth" });
      noteEl?.focus();
    }, 50);
  }

  function getSessionOrNull(): WorkoutSession | null {
    return get(currentSession);
  }

  // ── Undo / redo (design canvas 3c) ─────────────────────────────────────────────
  // Every tap is a step (currentSession.mutate); the ⋯ menu always has Undo and Redo. The
  // changes you'd regret (removing, swapping, reordering) also get a toast whose Undo flips to
  // Redo. The first few toasts point at ⋯ so the menu is found.
  const history = currentSession.history;
  const UNDO_TOAST = "workout-undo";
  const HINT_KEY = "logit:undoHint:v1";
  const HINT_TIMES = 3;
  let seenSteps = get(history).steps;

  function takeHint(): boolean {
    try {
      const n = Number(localStorage.getItem(HINT_KEY) ?? 0);
      if (n >= HINT_TIMES) return false;
      localStorage.setItem(HINT_KEY, String(n + 1));
      return true;
    } catch {
      return false;
    }
  }

  function undoToast(text: string, offer: "undo" | "redo") {
    const hint = offer === "undo" && takeHint();
    toast(text, {
      id: UNDO_TOAST,
      duration: 6000,
      ...(hint ? { description: "Undo and redo are also in the ⋯ menu." } : {}),
      action: offer === "undo"
        ? { label: "Undo", onClick: () => void undo() }
        : { label: "Redo", onClick: () => void redo() },
    });
  }

  // A new step: the toast for it if it's worth one; any other change closes an open one, so
  // its Undo can't undo something else.
  $effect(() => {
    const h = $history;
    untrack(() => {
      if (h.steps === seenSteps) return;
      seenSteps = h.steps;
      if (h.undo?.toast) undoToast(h.undo.toast.done, "undo");
      else toast.dismiss(UNDO_TOAST);
    });
  });

  async function undo() {
    const change = await currentSession.undo();
    if (change?.toast) undoToast(change.toast.undone, "redo");
    else toast.dismiss(UNDO_TOAST);
  }

  async function redo() {
    const change = await currentSession.redo();
    if (change?.toast) undoToast(change.toast.done, "undo");
    else toast.dismiss(UNDO_TOAST);
  }

  /** Every change to the workout goes through the store's queue (currentSession.mutate),
   * which applies it to the latest session; the rest timer writes through it too. */
  async function onMutate(updater: (s: WorkoutSession) => WorkoutSession, opts?: { auto?: boolean }) {
    if (ui.finishing) return;
    ui.saving = true;
    ui.error = null;
    try {
      await currentSession.mutate(updater, opts);
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to save draft session";
    } finally {
      ui.saving = false;
    }
  }

  async function addExerciseWithName(selection: { name: string; exerciseId?: string }) {
    const s = getSessionOrNull();
    if (!s) return;
    const trimmed = selection.name.trim();
    if (!trimmed) return;
    try {
      let exerciseId = selection.exerciseId;
      let exerciseType: ExerciseType | undefined;
      if (!exerciseId) {
        const ex = await getExerciseRepo().create(trimmed);
        exerciseId = ex.id;
        exerciseType = ex.exerciseType;
      } else {
        exerciseType = (await getExerciseRepo().getById(exerciseId).catch(() => null))?.exerciseType;
      }
      const forGroup = await addAndTick((cur) => addExercise(cur, { exerciseName: trimmed, exerciseId }));
      // Pull-ups, dips…: their volume needs a bodyweight. Asked after the add
      // dialog has closed so the two don't fight over focus — or, when added from
      // the group picker, once that's done.
      if (await shouldAskForBodyweight(trimmed, exerciseType).catch(() => false)) {
        if (forGroup) groupUi.bodyweightFor = trimmed;
        else setTimeout(() => (bodyweightPromptFor = trimmed), 250);
      }
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to add exercise";
      toast.error(ui.error ?? "Failed to add exercise");
    }
  }

  async function addCardioWithName(name: string) {
    const s = getSessionOrNull();
    if (!s) return;
    try {
      await addAndTick((cur) => addCardioBlock(cur, name));
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to add cardio activity";
      toast.error(ui.error ?? "Failed to add cardio activity");
    }
  }

  async function addMobilityWithDrill(drill: {
    drillName: string;
    drillId?: string;
    metric: MobilityMetric;
    perSide: boolean;
  }) {
    const s = getSessionOrNull();
    if (!s) return;
    try {
      const drillLead = await getMobilityDrillLeadSide(mobilityDrillKey(drill.drillId, drill.drillName));
      const leadSide = drillLead ?? get(profile).mobilityLeadSide;
      await addAndTick((cur) => addMobilityBlock(cur, { ...drill, leadSide }));
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to add mobility drill";
      toast.error(ui.error ?? "Failed to add mobility drill");
    }
  }

  function openAddBlock() {
    if (ui.finishing) return;
    destroyActiveTour();
    addBlockUi.sheetOpen = true;
  }

  /** "Add to workout": each pick in order; "As a superset" groups the new blocks. */
  async function addPicks(picks: AddPick[], asGroup: boolean) {
    const before = new Set((getSessionOrNull()?.blocks ?? []).map((b) => b.id));
    for (const p of picks) {
      if (p.kind === "strength") await addExerciseWithName({ name: p.name, exerciseId: p.exerciseId });
      else if (p.kind === "cardio") await addCardioWithName(p.name);
      else if (p.kind === "mobility") await addMobilityWithDrill({ drillName: p.name, drillId: p.drillId, metric: p.metric, perSide: p.perSide });
      else await addPluginBlockOfType(p.type);
    }
    if (asGroup) {
      const added = (getSessionOrNull()?.blocks ?? []).filter((b) => !before.has(b.id)).map((b) => b.id);
      if (added.length >= 2) await onMutate((s) => groupIntoSuperset(s, added, undefined, "superset"));
    }
    returnToGroupPicker();
  }

  /** A plugin block, remembering block fields and `remember` fields from the last one logged. */
  async function addPluginBlockOfType(type: string) {
    const decl = getBlockDeclaration(type.slice("plugin:".length));
    if (!decl) return;
    const sessions = await getWorkoutRepo().listAllSessions().catch(() => []);
    const previous = sessions
      .filter((s) => s.endedAtMs)
      .sort((a, b) => b.startedAtMs - a.startedAtMs)
      .flatMap((s) => s.blocks.filter((b) => b.type === pluginBlockType(decl.id)))[0]?.data as PluginBlockData | undefined;
    await addAndTick((cur) => addPluginBlock(cur, decl, previous));
  }

  // ── "Superset / circuit with…" ────────────────────────────────────────────
  // The picker lives here, not in the blocks, because "Add another exercise"
  // goes through this screen's add dialogs and comes back with the new block ticked.

  const groupUi = $state({
    open: false,
    anchorId: null as string | null,
    picked: [] as string[],
    /** Superset or circuit, when the user picked one; null = by count. */
    kind: null as GroupKind | null,
    /** Away in the add dialogs from "Add another exercise". */
    adding: false,
    /** A bodyweight question for an exercise added from the picker, asked once it's done. */
    bodyweightFor: null as string | null,
  });

  // Frozen while closed, so the sheet doesn't change (e.g. to "Add to superset")
  // as it animates out after grouping.
  let lastGroupModel: GroupPickerModel | null = null;
  const groupModel = $derived.by(() => {
    if (groupUi.open && $currentSession && groupUi.anchorId) {
      lastGroupModel = groupPickerModel($currentSession, groupUi.anchorId);
    }
    return lastGroupModel;
  });

  function openGroupPicker(anchorId: string) {
    if (ui.finishing) return;
    destroyActiveTour();
    groupUi.anchorId = anchorId;
    groupUi.picked = [];
    groupUi.kind = null;
    groupUi.adding = false;
    groupUi.open = true;
  }

  // Leaves anchorId set so the sheet can animate out; openGroupPicker resets it.
  function closeGroupPicker() {
    groupUi.open = false;
    groupUi.adding = false;
    const bw = groupUi.bodyweightFor;
    groupUi.bodyweightFor = null;
    if (bw) setTimeout(() => (bodyweightPromptFor = bw), 250);
  }

  function toggleGroupPick(id: string) {
    groupUi.picked = groupUi.picked.includes(id)
      ? groupUi.picked.filter((p) => p !== id)
      : [...groupUi.picked, id];
  }

  const groupKind = $derived(pickerGroupKind(groupUi.picked.length, groupUi.kind));

  async function confirmGroup() {
    const anchorId = groupUi.anchorId;
    const picked = [...groupUi.picked];
    const model = groupModel;
    // Store the kind when it was chosen, or when it's a circuit of one (which needs it);
    // otherwise the name follows the count as exercises are added.
    const kind = groupUi.kind || picked.length === 0 ? groupKind : undefined;
    closeGroupPicker();
    if (!anchorId || !model || !canConfirmGroup(model, picked.length, groupKind)) return;
    await onMutate((s) => groupIntoSuperset(s, [anchorId, ...picked], undefined, model.alreadyGrouped ? undefined : kind));
  }

  function addAnotherToGroup() {
    groupUi.adding = true;
    groupUi.open = false;
    // Let the picker close before the add sheet opens.
    setTimeout(() => openAddBlock(), 150);
  }

  /**
   * Adds a block. When it comes from the picker's "Add another exercise", it's
   * ticked there; returns the picker's anchor in that case.
   */
  async function addAndTick(updater: (s: WorkoutSession) => WorkoutSession): Promise<string | null> {
    const forGroup = groupUi.adding ? groupUi.anchorId : null;
    const before = new Set((getSessionOrNull()?.blocks ?? []).map((b) => b.id));
    await onMutate((cur) => {
      const next = updater(cur);
      // Marked inside the update, before the new block renders, so it opens on arrival.
      const had = new Set(cur.blocks.map((b) => b.id));
      for (const b of next.blocks) if (!had.has(b.id)) justAdded.add(b.id);
      return next;
    });
    if (!forGroup || groupUi.anchorId !== forGroup) return null;
    const added = (getSessionOrNull()?.blocks ?? [])
      .map((b) => b.id)
      .filter((id) => !before.has(id) && !groupUi.picked.includes(id));
    groupUi.picked = [...groupUi.picked, ...added];
    return forGroup;
  }

  /** Back to the picker once every add dialog has closed (added or cancelled). */
  function returnToGroupPicker() {
    if (!groupUi.adding) return;
    setTimeout(() => {
      if (!groupUi.adding) return;
      if (addBlockUi.sheetOpen) return;
      groupUi.adding = false;
      const anchorId = groupUi.anchorId;
      if (!anchorId || !getSessionOrNull()?.blocks.some((b) => b.id === anchorId)) {
        closeGroupPicker();
        return;
      }
      groupUi.open = true;
    }, 200);
  }

  async function onDeleteBlock(blockId: string) {
    await onMutate((s) => removeExercise(s, blockId));
  }

  function showRecap() {
    if (ui.finishing) return;
    const s = getSessionOrNull();
    if (!s) return;
    destroyActiveTour();
    // Recap what will actually be saved: planned sets nobody did aren't part of it.
    recapSkipped = sortedBlocks.flatMap((b) => {
      const p = blockProgress(b);
      if (p.total === 0 || p.done === p.total) return [];
      const name = blockDisplayName(b);
      if (p.done === 0) return [name];
      const left = p.total - p.done;
      return [`${left} set${left === 1 ? "" : "s"} of ${name}`];
    });
    recapSession = dropUnloggedPlannedSets(s);
  }

  async function confirmFinish() {
    if (ui.finishing) return;
    ui.finishing = true;
    ui.error = null;

    const sessionSnapshot = recapSession ?? getSessionOrNull();
    recapSession = null;
    currentSession.beginTransition();

    try {
      // The first workout of a plan from onboarding goes on to "When will you train?".
      const workoutsBefore = sessionSnapshot ? (await getWorkoutRepo().listAllSessions()).length : 0;
      const weekDone = sessionSnapshot ? await completesFirstWeek(sessionSnapshot).catch(() => false) : false;
      await goto(sessionSnapshot ? afterWorkoutRoute(sessionSnapshot.id, workoutsBefore, weekDone) : "/");
      await currentSession.finish();
      onWorkoutFinished();
      void recentSessions.refresh(5);

      if (sessionSnapshot) {
        const now = Date.now();
        localInbox.add(prNotifications(recapPrs, now));

        const deps = getProgressionDeps();
        // One per exercise, even when it's in the session twice.
        const strength = [
          ...new Map(
            getExercises(sessionSnapshot).map((ex) => [ex.exerciseId ?? ex.exerciseName, { id: ex.exerciseId, name: ex.exerciseName }]),
          ).values(),
        ];
        const mobility = sessionSnapshot.blocks
          .filter((b) => b.type === "mobility")
          .map((b) => b.data as MobilityBlockData);
        const [outputs] = await Promise.all([
          Promise.all(strength.map((ex) => refreshProgressionState(ex, deps))),
          Promise.all(
            mobility.map((d) =>
              refreshMobilityProgressionState(
                { id: d.drillId, name: d.drillName, metric: d.metric, perSide: d.perSide },
                deps,
              ),
            ),
          ),
        ]);
        localInbox.add(
          strength.flatMap((ex, i) => progressionNotification(ex, outputs[i]?.change, now, i) ?? []),
        );
        void notifyGoalsReached(sessionSnapshot.startedAtMs, now);
      }
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to finish workout";
      ui.finishing = false;
      recapSession = sessionSnapshot;
      currentSession.endTransition();
    }
  }

  async function discardSession() {
    if (ui.finishing) return;
    ui.finishing = true;
    currentSession.beginTransition();
    try {
      const draftId = getSessionOrNull()?.id;
      await goto("/");
      const repo = getWorkoutRepo();
      await repo.clearDraftSession();
      // On SQLite the draft is a row in the sessions table; clearing the pointer
      // alone left it behind, where progression read it as a real workout.
      if (draftId) await repo.deleteSession(draftId);
      currentSession.clear();
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to discard workout";
      ui.finishing = false;
      currentSession.endTransition();
    }
  }

  // ── Block-level drag-to-reorder ───────────────────────────────────────────

  let blockDragId = $state<string | null>(null);
  let blockDragFromIdx = $state(-1);
  let blockDragToIdx = $state(-1);
  let blockDragSpan = $state(1);
  let blockDragStartY = $state(0);
  // Where the dragged block may land, so supersets and circuits stay whole.
  let blockDragAllowed: number[] = [];

  function liveBlockOrder(sorted: SessionBlock[]): SessionBlock[] {
    if (!blockDragId || blockDragFromIdx === blockDragToIdx) return sorted;
    const result = [...sorted];
    const moving = result.splice(blockDragFromIdx, blockDragSpan);
    result.splice(blockDragToIdx, 0, ...moving);
    return result;
  }

  async function commitBlockDrag() {
    const from = blockDragFromIdx;
    const to = blockDragToIdx;
    const span = blockDragSpan;
    blockDragId = null;
    blockDragFromIdx = -1;
    blockDragToIdx = -1;
    blockDragSpan = 1;
    if (from === to || from === -1) return;

    await onMutate((s) => {
      const sorted = [...s.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
      const reordered = [...sorted];
      const moving = reordered.splice(from, span);
      reordered.splice(to, 0, ...moving);
      return {
        ...s,
        blocks: s.blocks.map((b) => {
          const newIdx = reordered.findIndex((r) => r.id === b.id);
          return newIdx !== -1 ? { ...b, orderIndex: newIdx } : b;
        }),
      };
    });
  }

  async function hapticLight() {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
  }

  function makeBlockGripAction(blockId: string, span = 1) {
    return (node: HTMLElement) => {
      function startDrag(clientY: number) {
        const s = get(currentSession);
        if (!s) return false;
        const sorted = [...s.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
        const idx = sorted.findIndex((b) => b.id === blockId);
        if (idx === -1) return false;
        blockDragId = blockId;
        blockDragFromIdx = idx;
        blockDragToIdx = idx;
        blockDragSpan = span;
        blockDragStartY = clientY;
        blockDragAllowed = allowedDropIndices(sorted, idx, span);
        void hapticLight();
        return true;
      }

      function moveDrag(clientY: number) {
        if (blockDragId !== blockId) return;
        const s = get(currentSession);
        const total = s?.blocks.length ?? 1;
        const rowH = blocksListEl
          ? blocksListEl.getBoundingClientRect().height / total
          : 64;
        const newIdx = nearestAllowed(
          blockDragAllowed,
          Math.round(blockDragFromIdx + (clientY - blockDragStartY) / rowH),
          blockDragFromIdx,
        );
        if (newIdx !== blockDragToIdx) blockDragToIdx = newIdx;
      }

      function onTouchStart(e: TouchEvent) {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        startDrag(e.touches[0]!.clientY);
      }
      function onTouchMove(e: TouchEvent) {
        if (blockDragId !== blockId) return;
        e.preventDefault();
        moveDrag(e.touches[0]!.clientY);
      }
      function onTouchEnd() {
        if (blockDragId !== blockId) return;
        void commitBlockDrag();
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
        if (blockDragId !== blockId) return;
        void commitBlockDrag();
      }

      node.addEventListener("touchstart", onTouchStart, { passive: false });
      node.addEventListener("touchmove", onTouchMove, { passive: false });
      node.addEventListener("touchend", onTouchEnd, { passive: true });
      node.addEventListener("touchcancel", onTouchEnd, { passive: true });
      node.addEventListener("mousedown", onMouseDown);

      return {
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
    };
  }

  // The shrunk circuit timer sits where the add button was; the button moves up.
  const CIRCUIT_BAR_SPACE = 84;
  const circuitBarShown = $derived(!!$circuitRunner.run && !$circuitRunner.expanded);

  const sessionExercises = $derived($currentSession ? getExercises($currentSession) : []);
  // "Where are you today?" (G9): once per workout, with two or more places, before any set is logged.
  const askWhere = $derived(
    !!$currentSession && !$currentSession.placeAsked && placesStore.shouldAsk
      && !getExercises($currentSession).some((e) => e.sets.some((x) => x.completed)),
  );
  const loggedSetCount = $derived(
    sessionExercises.reduce((n, ex) => n + ex.sets.filter((x) => x.completed).length, 0),
  );
  // Cardio and mobility blocks are loggable work too — a stretching-only session
  // should still be finishable.
  const nonStrengthBlockCount = $derived(
    $currentSession
      ? $currentSession.blocks.filter((b) => b.type === "cardio" || b.type === "mobility" || isPluginBlockType(b.type)).length
      : 0,
  );
  const hasLoggableWork = $derived(sessionExercises.length > 0 || nonStrengthBlockCount > 0);

  const sortedBlocks = $derived(
    $currentSession ? [...$currentSession.blocks].sort((a, b) => a.orderIndex - b.orderIndex) : [],
  );

  const liveOrderedBlocks = $derived(liveBlockOrder(sortedBlocks));

  // Done blocks fold to a line, the current one is lifted out as a card, the rest are "Up next".
  const stages = $derived($currentSession ? blockStages($currentSession) : new Map<string, BlockStage>());
  const setTotals = $derived(
    sortedBlocks.map(blockProgress).reduce((a, p) => ({ total: a.total + p.total, done: a.done + p.done }), { total: 0, done: 0 }),
  );
  const workoutTitle = $derived($currentSession?.name?.trim() || $currentSession?.source?.dayName || "Workout");
  const discardDescription = $derived.by(() => {
    const n = sessionExercises.length + nonStrengthBlockCount;
    if (n === 0) return "This empty workout will be discarded. This can't be undone.";
    return `${n} exercise${n === 1 ? "" : "s"}` + (loggedSetCount > 0 ? ` and ${loggedSetCount} logged set${loggedSetCount === 1 ? "" : "s"}` : "") + " will be permanently deleted. This can't be undone.";
  });
  const placeName = $derived($currentSession?.placeId ? placesStore.byId($currentSession.placeId)?.name ?? null : null);
  const restLabel = $derived.by(() => {
    const ms = $profile.restDefaults.normal;
    return ms ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}` : null;
  });

  // Fold runs of consecutive blocks that share a superset id into one group.
  type RenderItem =
    | { kind: "block"; block: SessionBlock }
    | { kind: "superset"; supersetId: string; blocks: SessionBlock[] };

  function supersetIdOf(b: SessionBlock): string | undefined {
    return (b.data as { superset?: { id: string } } | undefined)?.superset?.id;
  }
  function groupKindIn(b: SessionBlock): GroupKind | undefined {
    return (b.data as { superset?: { kind?: GroupKind } } | undefined)?.superset?.kind;
  }

  const renderItems = $derived.by<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    const blocks = liveOrderedBlocks;
    let i = 0;
    while (i < blocks.length) {
      const sid = supersetIdOf(blocks[i]!);
      if (sid) {
        const group: SessionBlock[] = [];
        while (i < blocks.length && supersetIdOf(blocks[i]!) === sid) group.push(blocks[i++]!);
        if (group.length >= minGroupSize(groupKindIn(group[0]!))) {
          items.push({ kind: "superset", supersetId: sid, blocks: group });
          continue;
        }
        items.push({ kind: "block", block: group[0]! });
        continue;
      }
      items.push({ kind: "block", block: blocks[i++]! });
    }
    return items;
  });
</script>

<div
  class="flex flex-col"
  style="padding-bottom: {dockHeight + (circuitBarShown ? CIRCUIT_BAR_SPACE : 0) + 16}px"
  onpointerdown={(e) => {
    if (!(e.target as HTMLElement).closest("input, textarea")) {
      const active = document.activeElement as HTMLElement | null;
      if (active?.tagName === "INPUT" || active?.tagName === "TEXTAREA") {
        active.blur();
      }
    }
  }}
>
  <CurrentSessionHeader
    title={workoutTitle}
    saving={ui.saving || ui.finishing}
    error={ui.error}
    startedAtMs={$currentSession?.startedAtMs ?? null}
    showActions={!ui.finishing}
    canFinish={!!$currentSession && !$currentSession.endedAtMs && hasLoggableWork}
    loggedSetCount={setTotals.done}
    totalSetCount={setTotals.total}
    onFinish={showRecap}
    onMenu={() => (menuOpen = true)}
  />

  {#if !ui.finishing}
    {#if liveOrderedBlocks.length === 0}
      <EmptySessionCard
        canRepeat={hasPreviousSession}
        busy={ui.saving || ui.finishing}
        onAddBlock={openAddBlock}
        onRepeatLast={repeatLast}
      />
    {:else}
      <div bind:this={blocksListEl}>
        {#each renderItems as item, idx (item.kind === "superset" ? item.supersetId : item.block.id)}
          {@const firstId = item.kind === "superset" ? item.blocks[0].id : item.block.id}
          {@const stage = stages.get(firstId)}
          {@const prevStage = idx > 0 ? stages.get(renderItems[idx - 1]!.kind === "superset" ? (renderItems[idx - 1] as { blocks: SessionBlock[] }).blocks[0]!.id : (renderItems[idx - 1] as { block: SessionBlock }).block.id) : undefined}
          {#if stage === "next" && prevStage !== "next" && [...stages.values()].includes("current")}
            <h2 class="mx-4 mt-3 mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground" transition:reveal>Up next</h2>
          {/if}
          <div
            class="transition-[margin,border-color,background-color] duration-200 motion-reduce:transition-none {stage === 'current' ? 'mx-2 my-2 overflow-hidden rounded-xl border border-input bg-card' : ''} {item.kind === 'block' && blockDragId === item.block.id ? 'opacity-50' : ''}"
            data-stage={stage}
            transition:reveal
          >
            {#if item.kind === "superset"}
              <SupersetGroup
                supersetId={item.supersetId}
                blocks={item.blocks}
                {stage}
                saving={ui.saving || ui.finishing}
                dragging={blockDragId === item.blocks[0].id && blockDragSpan > 1}
                draggingBlockId={blockDragSpan === 1 ? blockDragId : null}
                groupGripAction={makeBlockGripAction(item.blocks[0].id, item.blocks.length)}
                memberGripAction={(id) => makeBlockGripAction(id)}
                onGroupBlock={openGroupPicker}
                onDeleteBlock={onDeleteBlock}
                onReorder={() => (reorderOpen = true)}
                {onMutate}
              />
            {:else}
              <BlockHost
                type={item.block.type}
                blockId={item.block.id}
                data={item.block.data}
                {stage}
                saving={ui.saving || ui.finishing}
                gripAction={makeBlockGripAction(item.block.id)}
                onGroup={() => openGroupPicker(item.block.id)}
                onReorder={() => (reorderOpen = true)}
                onDelete={() => onDeleteBlock(item.block.id)}
                {onMutate}
              />
            {/if}
          </div>
        {/each}
      </div>

      <!-- Session note -->
      <div class="px-3 py-3">
        {#if noteOpen || $currentSession?.note}
          <textarea
            bind:this={noteEl}
            rows="2"
            placeholder="Session note — how it felt, sleep, anything…"
            transition:reveal
            class="w-full rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            value={$currentSession?.note ?? ""}
            disabled={ui.saving || ui.finishing}
            onblur={(e) => void saveNote((e.currentTarget as HTMLTextAreaElement).value)}
          ></textarea>
        {:else}
          <button type="button" class={addButton} onclick={() => (noteOpen = true)}>
            <Plus class="h-3.5 w-3.5" /> Session note
          </button>
        {/if}
      </div>
    {/if}
  {/if}

  {#if recapSession}
    <WorkoutRecapScreen
      session={recapSession}
      title={workoutTitle}
      skipped={recapSkipped}
      onNote={async (n) => { await saveNote(n); if (recapSession) recapSession = { ...recapSession, note: n || null }; }}
      onPrs={(prs) => (recapPrs = prs)}
      onDone={confirmFinish}
      onCancel={() => { recapSession = null; }}
      onShare={(s) => { shareSession = s; }}
    />
  {/if}

  <CreatePostSheet
    open={shareSession !== null}
    prefillSession={shareSession}
    onposted={() => { void confirmFinish(); }}
    onclose={() => { shareSession = null; }}
  />

  <AddToWorkoutSheet
    open={addBlockUi.sheetOpen}
    session={$currentSession}
    saving={ui.saving || ui.finishing}
    allowGroup={!groupUi.adding}
    onOpenChange={(v) => {
      addBlockUi.sheetOpen = v;
      if (!v) returnToGroupPicker();
    }}
    onAdd={addPicks}
  />

  {#if groupModel}
    <GroupPickerSheet
      open={groupUi.open}
      title={groupModel.title}
      sections={groupModel.sections}
      picked={groupUi.picked}
      confirmLabel={groupConfirmLabel(groupModel, groupUi.picked.length, groupUi.kind)}
      canConfirm={canConfirmGroup(groupModel, groupUi.picked.length, groupKind)}
      kind={groupModel.alreadyGrouped ? null : groupKind}
      onKindChange={(k) => (groupUi.kind = k)}
      showSizeHint={!groupModel.alreadyGrouped}
      saving={ui.saving || ui.finishing}
      onToggle={toggleGroupPick}
      onAddAnother={addAnotherToGroup}
      onConfirm={confirmGroup}
      onOpenChange={(v) => {
        if (!v) closeGroupPicker();
      }}
    />
  {/if}

  <BodyweightPromptDialog
    exerciseName={bodyweightPromptFor}
    onClose={(saved) => {
      if (!saved) dismissBodyweightPrompt();
      bodyweightPromptFor = null;
    }}
  />

  {#if !ui.finishing}
    <CircuitOverlay bottomOffset={addButtonBottom} />
  {/if}

  {#if !ui.finishing && !$keyboard.visible}
    <div class="fixed inset-x-0 bottom-0 z-20" bind:offsetHeight={dockHeight}>
      <WorkoutDock session={$currentSession} disabled={ui.saving || ui.finishing} onAdd={openAddBlock} {onMutate} />
    </div>
  {/if}
</div>

{#if reorderOpen && $currentSession}
  <ReorderSheet session={$currentSession} onClose={() => (reorderOpen = false)} onMutate={(u) => onMutate(u)} />
{/if}

<WorkoutMenuSheet
  open={menuOpen}
  onOpenChange={(v) => (menuOpen = v)}
  history={$history}
  saving={ui.saving || ui.finishing}
  onUndo={() => void undo()}
  onRedo={() => void redo()}
  onReorder={() => (reorderOpen = true)}
  onOpenAll={() => openAllSignal.update((n) => n + 1)}
  onNote={openNote}
  {placeName}
  onPlace={placesStore.active.length > 0 ? () => (whereOpen = true) : undefined}
  {restLabel}
  onRest={() => void goto("/settings/workout")}
  onMusic={music.supported ? () => void goto("/settings/music") : undefined}
  onDiscard={() => (confirmDiscard = true)}
/>

<ConfirmDialog
  open={confirmDiscard}
  onOpenChange={(v) => (confirmDiscard = v)}
  title="Discard this workout?"
  description={discardDescription}
  confirmLabel="Discard"
  cancelLabel="Keep going"
  saving={ui.saving || ui.finishing}
  onConfirm={discardSession}
/>

{#if whereOpen && $currentSession}
  <WhereTodaySheet session={$currentSession} changing
    onPick={(placeId) => { whereOpen = false; void onMutate((s) => ({ ...s, placeId, placeAsked: true })); }} />
{/if}

{#if askWhere && $currentSession}
  <WhereTodaySheet session={$currentSession} onPick={(placeId) => void onMutate((s) => ({ ...s, placeId, placeAsked: true }))} />
{/if}
