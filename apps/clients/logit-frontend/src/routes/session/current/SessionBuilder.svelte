<script lang="ts">
  import { goto } from "$app/navigation";
  import { get } from "svelte/store";
  import { Plus } from "lucide-svelte";
  import { toast } from "$lib/components/ui/sonner/index";
  import { onMount } from "svelte";

  import { getWorkoutRepo, getExerciseRepo } from "$lib/data/repoProvider";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { recentSessions } from "$lib/stores/recentSessions.store";
  import { refreshProgressionState } from "@logit/core/usecases/progression/getSuggestion";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import type { WorkoutSession, SessionBlock } from "@logit/core/domain/workout";
  import { addExercise, addCardioBlock, removeExercise, getExercises, setSessionNote } from "@logit/core/domain/workout";

  import { Button } from "$lib/components/ui/button/index.js";
  import { keyboard } from "$lib/stores/keybaord.store";
  import { reveal } from "$lib/transitions";
  import { startSessionTour, destroyActiveTour } from "$lib/tour/index";

  import { listBlockDefs } from "$lib/features/session/blocks/index";
  import BlockHost from "$lib/features/session/blocks/BlockHost.svelte";
  import AddExerciseDialog from "$lib/features/session/ui/AddExerciseDialog.svelte";
  import AddCardioDialog from "$lib/features/session/ui/AddCardioDialog.svelte";
  import BlockPickerSheet from "$lib/features/session/ui/BlockPickerSheet.svelte";
  import EmptySessionCard from "$lib/features/session/ui/EmptySessionCard.svelte";
  import SupersetGroup from "$lib/features/session/ui/SupersetGroup.svelte";
  import WorkoutRecapScreen from "$lib/features/session/ui/WorkoutRecapScreen.svelte";
  import CreatePostSheet from "$lib/components/CreatePostSheet.svelte";

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
  });

  let recapSession = $state<WorkoutSession | null>(null);
  let shareSession = $state<WorkoutSession | null>(null);
  let hasPreviousSession = $state(false);
  let noteOpen = $state(false);

  async function saveNote(value: string) {
    await onMutate((s) => setSessionNote(s, value));
  }
  let finishBarEl = $state<HTMLDivElement | null>(null);
  let blocksListEl = $state<HTMLElement | null>(null);
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
      ui.error = e instanceof Error ? e.message : "Failed to save draft session";
    } finally {
      ui.saving = false;
    }
  }

  let mutateQueue: Promise<void> = Promise.resolve();

  async function onMutate(updater: (s: WorkoutSession) => WorkoutSession) {
    const thisCall = mutateQueue.then(async () => {
      const s = getSessionOrNull();
      if (!s || ui.finishing) return;
      await persistDraft(updater(s));
    });
    // Advance the queue but swallow errors so later mutations still run.
    mutateQueue = thisCall.catch(() => {});
    // Propagate the error to the individual caller.
    await thisCall;
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
      await persistDraft(addExercise(s, { exerciseName: trimmed, exerciseId }));
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to add exercise";
      toast.error(ui.error ?? "Failed to add exercise");
    }
  }

  async function addCardioWithName(name: string) {
    const s = getSessionOrNull();
    if (!s) return;
    try {
      await persistDraft(addCardioBlock(s, name));
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to add cardio activity";
      toast.error(ui.error ?? "Failed to add cardio activity");
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
  }

  async function onDeleteBlock(blockId: string) {
    await onMutate((s) => removeExercise(s, blockId));
  }

  function showRecap() {
    if (ui.finishing) return;
    const s = getSessionOrNull();
    if (!s) return;
    destroyActiveTour();
    recapSession = s;
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
        await Promise.all(
          getExercises(sessionSnapshot).map((ex) =>
            refreshProgressionState({ id: ex.exerciseId, name: ex.exerciseName }, getProgressionDeps()),
          ),
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
      await goto("/");
      await getWorkoutRepo().clearDraftSession();
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
        const newIdx = Math.max(
          0,
          Math.min(total - blockDragSpan, Math.round(blockDragFromIdx + (clientY - blockDragStartY) / rowH)),
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

  const sessionExercises = $derived($currentSession ? getExercises($currentSession) : []);
  const loggedSetCount = $derived(
    sessionExercises.reduce((n, ex) => n + ex.sets.length, 0),
  );

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

  const renderItems = $derived.by<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    const blocks = liveOrderedBlocks;
    let i = 0;
    while (i < blocks.length) {
      const sid = supersetIdOf(blocks[i]!);
      if (sid) {
        const group: SessionBlock[] = [];
        while (i < blocks.length && supersetIdOf(blocks[i]!) === sid) group.push(blocks[i++]!);
        if (group.length >= 2) {
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
                dragging={blockDragId === item.blocks[0].id}
                groupGripAction={makeBlockGripAction(item.blocks[0].id, item.blocks.length)}
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
            class="w-full rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            value={$currentSession?.note ?? ""}
            disabled={ui.saving || ui.finishing}
            onblur={(e) => void saveNote((e.currentTarget as HTMLTextAreaElement).value)}
          ></textarea>
        {:else}
          <button
            type="button"
            class="text-xs text-muted-foreground hover:text-foreground"
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
    onOpenChange={(v) => (addBlockUi.pickerOpen = v)}
    onSelect={onBlockTypeSelected}
  />

  <AddExerciseDialog
    open={addBlockUi.strengthOpen}
    saving={ui.saving || ui.finishing}
    onOpenChange={(v) => (addBlockUi.strengthOpen = v)}
    onSubmit={addExerciseWithName}
  />

  <AddCardioDialog
    open={addBlockUi.cardioOpen}
    saving={ui.saving || ui.finishing}
    onOpenChange={(v) => (addBlockUi.cardioOpen = v)}
    onSubmit={addCardioWithName}
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
        aria-label="Add block"
        data-tour="session-add-exercise"
        onclick={openAddBlock}
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
        canFinish={!!$currentSession && !$currentSession.endedAtMs && sessionExercises.length > 0}
        saving={ui.saving || ui.finishing}
        exerciseCount={sessionExercises.length}
        {loggedSetCount}
        onFinish={showRecap}
        onDiscard={discardSession}
      />
    </div>
  {/if}
</div>
