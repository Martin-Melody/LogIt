<script lang="ts">
  import { goto } from "$app/navigation";
  import { get } from "svelte/store";
  import { Plus } from "lucide-svelte";
  import { toast } from "$lib/components/ui/sonner/index";
  import { onMount } from "svelte";

  import { getWorkoutRepo, getExerciseRepo } from "$lib/data/repoProvider";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { recentSessions } from "$lib/stores/recentSessions.store";
  import { profile } from "$lib/stores/profile.store";
  import { refreshProgressionState } from "@logit/core/usecases/progression/getSuggestion";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import type { WorkoutSession, SessionBlock, MobilityBlockData, MobilityMetric } from "@logit/core/domain/workout";
  import { addExercise, addCardioBlock, addMobilityBlock, removeExercise, getExercises, setSessionNote, dropUnloggedPlannedSets, groupIntoSuperset, minGroupSize, type GroupKind } from "@logit/core/domain/workout";
  import { refreshMobilityProgressionState } from "@logit/core/usecases/progression/getMobilitySuggestion";
  import { mobilityDrillKey, getMobilityDrillLeadSide } from "$lib/data/mobilityDrillPrefs";

  import { Button } from "$lib/components/ui/button/index.js";
  import { keyboard } from "$lib/stores/keybaord.store";
  import { bottomNavHeight } from "$lib/stores/bottomNav.store";
  import { reveal } from "$lib/transitions";
  import { startSessionTour, destroyActiveTour } from "$lib/tour/index";

  import { listBlockDefs } from "$lib/features/session/blocks/index";
  import BlockHost from "$lib/features/session/blocks/BlockHost.svelte";
  import AddExerciseDialog from "$lib/features/session/ui/AddExerciseDialog.svelte";
  import AddCardioDialog from "$lib/features/session/ui/AddCardioDialog.svelte";
  import AddMobilityDialog from "$lib/features/session/ui/AddMobilityDialog.svelte";
  import BlockPickerSheet from "$lib/features/session/ui/BlockPickerSheet.svelte";
  import EmptySessionCard from "$lib/features/session/ui/EmptySessionCard.svelte";
  import SupersetGroup from "$lib/features/session/ui/SupersetGroup.svelte";
  import CircuitOverlay from "$lib/features/session/circuit/CircuitOverlay.svelte";
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
  import CreatePostSheet from "$lib/components/CreatePostSheet.svelte";
  import BodyweightPromptDialog from "$lib/features/bodyweight/BodyweightPromptDialog.svelte";
  import { shouldAskForBodyweight, dismissBodyweightPrompt } from "$lib/features/bodyweight/bodyweight";
  import type { ExerciseType } from "@logit/core/domain/exercise";

  import CurrentSessionHeader from "./Components/CurrentSessionHeader.svelte";
  import FinishWorkoutCard from "./Components/FinishWorkoutCard.svelte";

  onMount(() => {
    setTimeout(() => startSessionTour(), 600);
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

  const addBlockUi = $state({
    pickerOpen: false,
    strengthOpen: false,
    cardioOpen: false,
    mobilityOpen: false,
  });

  let recapSession = $state<WorkoutSession | null>(null);
  // PRs the recap worked out, for the inbox once the session is saved.
  let recapPrs: SessionPR[] = [];
  let shareSession = $state<WorkoutSession | null>(null);
  let hasPreviousSession = $state(false);
  let noteOpen = $state(false);
  // Set to the exercise's name while asking for bodyweight (see addExerciseWithName).
  let bodyweightPromptFor = $state<string | null>(null);

  async function saveNote(value: string) {
    await onMutate((s) => setSessionNote(s, value));
  }
  let finishBarEl = $state<HTMLDivElement | null>(null);
  let blocksListEl = $state<HTMLElement | null>(null);
  let finishBarHeight = $state(0);
  // The finish bar sits on top of the bottom nav, and the add button just above the bar.
  const addButtonBottom = $derived(finishBarHeight > 0 ? $bottomNavHeight + finishBarHeight + 12 : 0);

  // The add button (and the shrunk circuit timer) sit just above the finish bar. The bar is
  // taken out and put back (e.g. while the keyboard is open), so follow whichever bar is on
  // screen, and keep the last good offset while there is none: measuring a missing bar used
  // to drop the button to the very bottom, where it stayed.
  function updateAddButtonOffset() {
    const h = finishBarEl?.offsetHeight ?? 0;
    if (h > 0) finishBarHeight = h;
  }

  $effect(() => {
    const el = finishBarEl;
    if (!el) return;
    updateAddButtonOffset();
    const observer = new ResizeObserver(() => updateAddButtonOffset());
    observer.observe(el);
    window.addEventListener("resize", updateAddButtonOffset);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateAddButtonOffset);
    };
  });

  function getSessionOrNull(): WorkoutSession | null {
    return get(currentSession);
  }

  /** Every change to the workout goes through the store's queue (currentSession.mutate),
   * which applies it to the latest session; the rest timer writes through it too. */
  async function onMutate(updater: (s: WorkoutSession) => WorkoutSession) {
    if (ui.finishing) return;
    ui.saving = true;
    ui.error = null;
    try {
      await currentSession.mutate(updater);
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
    const defs = listBlockDefs();
    if (defs.length === 1) {
      addBlockUi.strengthOpen = true;
    } else {
      addBlockUi.pickerOpen = true;
    }
  }

  function onBlockTypeSelected(type: string) {
    if (type === "strength") addBlockUi.strengthOpen = true;
    else if (type === "cardio") addBlockUi.cardioOpen = true;
    else if (type === "mobility") addBlockUi.mobilityOpen = true;
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
    await onMutate(updater);
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
      if (addBlockUi.pickerOpen || addBlockUi.strengthOpen || addBlockUi.cardioOpen || addBlockUi.mobilityOpen) return;
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
      await goto("/");
      await currentSession.finish();
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
  const loggedSetCount = $derived(
    sessionExercises.reduce((n, ex) => n + ex.sets.length, 0),
  );
  // Cardio and mobility blocks are loggable work too — a stretching-only session
  // should still be finishable.
  const nonStrengthBlockCount = $derived(
    $currentSession
      ? $currentSession.blocks.filter((b) => b.type === "cardio" || b.type === "mobility").length
      : 0,
  );
  const hasLoggableWork = $derived(sessionExercises.length > 0 || nonStrengthBlockCount > 0);

  const sortedBlocks = $derived(
    $currentSession ? [...$currentSession.blocks].sort((a, b) => a.orderIndex - b.orderIndex) : [],
  );

  const liveOrderedBlocks = $derived(liveBlockOrder(sortedBlocks));

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
  class="flex flex-col {circuitBarShown ? 'pb-72' : 'pb-48'}"
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
    saving={ui.saving || ui.finishing}
    error={ui.error}
    startedAtMs={$currentSession?.startedAtMs ?? null}
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
        {#each renderItems as item (item.kind === "superset" ? item.supersetId : item.block.id)}
          {#if item.kind === "superset"}
            <div transition:reveal>
              <SupersetGroup
                supersetId={item.supersetId}
                blocks={item.blocks}
                saving={ui.saving || ui.finishing}
                dragging={blockDragId === item.blocks[0].id && blockDragSpan > 1}
                draggingBlockId={blockDragSpan === 1 ? blockDragId : null}
                groupGripAction={makeBlockGripAction(item.blocks[0].id, item.blocks.length)}
                memberGripAction={(id) => makeBlockGripAction(id)}
                onGroupBlock={openGroupPicker}
                onDeleteBlock={onDeleteBlock}
                {onMutate}
              />
            </div>
          {:else}
            <div
              class="transition-opacity {blockDragId === item.block.id ? 'opacity-50' : ''}"
              transition:reveal
            >
              <BlockHost
                type={item.block.type}
                blockId={item.block.id}
                data={item.block.data}
                saving={ui.saving || ui.finishing}
                gripAction={makeBlockGripAction(item.block.id)}
                onGroup={() => openGroupPicker(item.block.id)}
                onDelete={() => onDeleteBlock(item.block.id)}
                {onMutate}
              />
            </div>
          {/if}
        {/each}
      </div>

      <!-- Session note -->
      <div class="px-3 py-3 border-t border-border/50">
        {#if noteOpen || $currentSession?.note}
          <textarea
            rows="2"
            placeholder="Session note — how it felt, sleep, anything…"
            transition:reveal
            class="w-full rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            value={$currentSession?.note ?? ""}
            disabled={ui.saving || ui.finishing}
            onblur={(e) => void saveNote((e.currentTarget as HTMLTextAreaElement).value)}
          ></textarea>
        {:else}
          <button
            type="button"
            class="-mx-2 h-11 px-2 text-xs text-muted-foreground hover:text-foreground"
            onclick={() => (noteOpen = true)}
          >
            + Session note
          </button>
        {/if}
      </div>
    {/if}
  {/if}

  {#if recapSession}
    <WorkoutRecapScreen
      session={recapSession}
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

  <BlockPickerSheet
    open={addBlockUi.pickerOpen}
    onOpenChange={(v) => {
      addBlockUi.pickerOpen = v;
      if (!v) returnToGroupPicker();
    }}
    onSelect={onBlockTypeSelected}
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

  <AddExerciseDialog
    open={addBlockUi.strengthOpen}
    saving={ui.saving || ui.finishing}
    onOpenChange={(v) => {
      addBlockUi.strengthOpen = v;
      if (!v) returnToGroupPicker();
    }}
    onSubmit={addExerciseWithName}
  />

  <BodyweightPromptDialog
    exerciseName={bodyweightPromptFor}
    onClose={(saved) => {
      if (!saved) dismissBodyweightPrompt();
      bodyweightPromptFor = null;
    }}
  />

  <AddCardioDialog
    open={addBlockUi.cardioOpen}
    saving={ui.saving || ui.finishing}
    onOpenChange={(v) => {
      addBlockUi.cardioOpen = v;
      if (!v) returnToGroupPicker();
    }}
    onSubmit={addCardioWithName}
  />

  <AddMobilityDialog
    open={addBlockUi.mobilityOpen}
    saving={ui.saving || ui.finishing}
    onOpenChange={(v) => {
      addBlockUi.mobilityOpen = v;
      if (!v) returnToGroupPicker();
    }}
    onSubmit={addMobilityWithDrill}
  />

  {#if !ui.finishing}
    <CircuitOverlay bottomOffset={addButtonBottom} />
  {/if}

  {#if !ui.finishing && !$keyboard.visible}
    <div
      class="fixed right-3 z-20"
      style={`bottom: ${addButtonBottom + (circuitBarShown ? CIRCUIT_BAR_SPACE : 0)}px;`}
    >
      <Button
        size="icon"
        class="size-12 rounded-full shadow-lg"
        disabled={ui.saving || ui.finishing}
        aria-label="Add block"
        data-tour="session-add-exercise"
        onclick={openAddBlock}
      >
        <Plus class="size-5" />
      </Button>
    </div>

    <div
      bind:this={finishBarEl}
      data-tour="session-finish"
      class="fixed left-0 right-0 z-10 border-t border-border bg-background px-3 py-3"
      style="bottom: {$bottomNavHeight}px"
    >
      <FinishWorkoutCard
        canFinish={!!$currentSession && !$currentSession.endedAtMs && hasLoggableWork}
        saving={ui.saving || ui.finishing}
        exerciseCount={sessionExercises.length + nonStrengthBlockCount}
        {loggedSetCount}
        onFinish={showRecap}
        onDiscard={discardSession}
      />
    </div>
  {/if}
</div>
