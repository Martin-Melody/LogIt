<script lang="ts">
  import { onMount } from "svelte";
  import { back } from "$lib/navigation";

  import { Button } from "$lib/components/ui/button";

  import type { WorkoutSplit, SplitDay, PlannedBlock, PlannedStrength, PlannedCardio, PlannedTargets } from "@logit/core/domain/WorkoutSplit";
  import { touchSplit, setPlannedTargets } from "@logit/core/domain/WorkoutSplit";
  import { createId } from "@logit/core/domain/ids";
  import { profile } from "$lib/stores/profile.store";
  import { formatWeight, toDisplayWeight, fromDisplayWeight, roundDisplayWeight } from "@logit/core/domain/units";
  import { reveal } from "$lib/transitions";
  import { fade } from "svelte/transition";

  import { getSplit } from "$lib/usecases/Splits/getSplit";
  import { saveSplit } from "$lib/usecases/Splits/saveSplit";
  import { getExerciseRepo } from "$lib/data/repoProvider";
  import { activeSplit } from "$lib/stores/activeSplit.store";

  import { ArrowLeft, Plus, Trash, Check, X, GripVertical, Dumbbell, Timer } from "lucide-svelte";
  import { startSplitDayTour } from "$lib/tour/index";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import ExerciseSearchInput from "$lib/components/ExerciseSearchInput.svelte";
  import AddCardioDialog from "$lib/features/session/ui/AddCardioDialog.svelte";

  const props = $props<{ params: { id: string; dayId: string } }>();
  const splitId = $derived(props.params.id);
  const dayId = $derived(props.params.dayId);

  const ui = $state({
    loading: true,
    saving: false,
    error: null as string | null,
    addMode: "none" as "none" | "picker" | "exercise" | "cardio",
    renamingDay: false,
    dayNameDraft: "",
  });

  let split = $state<WorkoutSplit | null>(null);
  let dayNameInput = $state<HTMLInputElement | null>(null);
  let listEl = $state<HTMLUListElement | null>(null);

  const day = $derived<SplitDay | null>(
    split ? ((split.days ?? []).find((x) => x.id === dayId) ?? null) : null,
  );

  // Drag-to-reorder state
  let dragId = $state<string | null>(null);
  let dragFromIdx = $state(-1);
  let dragToIdx = $state(-1);
  let dragStartY = $state(0);

  function sortBlocks(blocks: PlannedBlock[]): PlannedBlock[] {
    return [...blocks].sort((a, b) => a.orderIndex - b.orderIndex);
  }

  function liveOrder(sorted: PlannedBlock[]): PlannedBlock[] {
    if (dragId === null || dragFromIdx === dragToIdx) return sorted;
    const result = [...sorted];
    const [item] = result.splice(dragFromIdx, 1);
    result.splice(dragToIdx, 0, item!);
    return result;
  }

  function blockLabel(block: PlannedBlock): string {
    return block.type === "strength" ? block.exerciseName : block.activityName;
  }

  const weightUnit = $derived($profile.weightUnit);

  let expandedId = $state<string | null>(null);
  // Draft targets for the currently-expanded strength block, in display units.
  let targetDraft = $state<{ sets: number | null; reps: number | null; weight: number | null }>({
    sets: null, reps: null, weight: null,
  });

  function toggleExpanded(block: PlannedBlock) {
    if (block.type !== "strength") return;
    if (expandedId === block.id) {
      expandedId = null;
      return;
    }
    expandedId = block.id;
    const t = block.targets ?? {};
    targetDraft = {
      sets: t.sets ?? null,
      reps: t.reps ?? null,
      weight: t.weight != null ? roundDisplayWeight(toDisplayWeight(t.weight, weightUnit), weightUnit) : null,
    };
  }

  function targetSummary(t?: PlannedTargets): string | null {
    if (!t) return null;
    const parts: string[] = [];
    if (t.sets && t.reps) parts.push(`${t.sets}×${t.reps}`);
    else if (t.sets) parts.push(`${t.sets} sets`);
    else if (t.reps) parts.push(`${t.reps} reps`);
    if (t.weight) parts.push(formatWeight(t.weight, weightUnit));
    return parts.length ? parts.join(" · ") : null;
  }

  let targetQueue: Promise<void> = Promise.resolve();

  /** Persist the whole draft for the expanded block; serialized so rapid edits don't race. */
  function commitTargetDraft(blockId: string) {
    const snapshot = { ...targetDraft };
    targetQueue = targetQueue.then(async () => {
      if (!split || !day) return;
      await persist(
        setPlannedTargets(split, day.id, blockId, {
          sets: snapshot.sets ?? undefined,
          reps: snapshot.reps ?? undefined,
          weight: snapshot.weight != null ? fromDisplayWeight(snapshot.weight, weightUnit) : undefined,
        }),
      );
    });
  }

  function clearTargets(blockId: string) {
    targetDraft = { sets: null, reps: null, weight: null };
    commitTargetDraft(blockId);
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      let loaded = await getSplit(splitId);
      if (loaded) {
        const exerciseRepo = getExerciseRepo();
        let anyChanged = false;
        const resolvedDays = await Promise.all(
          loaded.days.map(async (d) => {
            const resolvedBlocks = await Promise.all(
              d.blocks.map(async (block) => {
                if (block.type === "strength" && block.exerciseId) {
                  const ex = await exerciseRepo.getById(block.exerciseId);
                  if (ex && ex.name !== block.exerciseName) {
                    anyChanged = true;
                    return { ...block, exerciseName: ex.name };
                  }
                }
                return block;
              }),
            );
            return { ...d, blocks: resolvedBlocks };
          }),
        );
        loaded = { ...loaded, days: resolvedDays };
        if (anyChanged) {
          const touched = touchSplit(loaded);
          await saveSplit(touched);
          split = touched;
        } else {
          split = loaded;
        }
      } else {
        split = loaded;
      }
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load";
      split = null;
    } finally {
      ui.loading = false;
    }
  }

  async function persist(next: WorkoutSplit) {
    ui.saving = true;
    ui.error = null;
    try {
      const touched = touchSplit(next);
      await saveSplit(touched);
      split = touched;
      await activeSplit.load();
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to save";
    } finally {
      ui.saving = false;
    }
  }

  function startRenameDay() {
    if (!day) return;
    ui.dayNameDraft = day.name ?? "";
    ui.renamingDay = true;
    queueMicrotask(() => dayNameInput?.focus());
  }

  async function commitRenameDay() {
    if (!split || !day) return;
    const name = ui.dayNameDraft.trim();
    ui.renamingDay = false;
    if (name === (day.name ?? "")) return;
    const next: WorkoutSplit = {
      ...split,
      days: split.days.map((d) => (d.id === day.id ? { ...d, name } : d)),
    };
    await persist(next);
  }

  function cancelRenameDay() {
    ui.renamingDay = false;
    ui.dayNameDraft = day?.name ?? "";
  }

  function nextOrder(): number {
    if (!day || day.blocks.length === 0) return 0;
    return Math.max(...day.blocks.map((b) => b.orderIndex)) + 1;
  }

  async function addExercise(selection: { name: string; exerciseId?: string }) {
    if (!split || !day) return;
    let exerciseId = selection.exerciseId;
    if (!exerciseId) {
      const ex = await getExerciseRepo().create(selection.name);
      exerciseId = ex.id;
    }
    const newBlock: PlannedStrength = {
      type: "strength",
      id: createId("pex"),
      orderIndex: nextOrder(),
      exerciseName: selection.name,
      exerciseId,
      targets: {},
    };
    const next: WorkoutSplit = {
      ...split,
      days: split.days.map((d) =>
        d.id === day.id ? { ...d, blocks: [...d.blocks, newBlock] } : d,
      ),
    };
    ui.addMode = "none";
    await persist(next);
  }

  async function addCardio(activityName: string) {
    if (!split || !day) return;
    const newBlock: PlannedCardio = {
      type: "cardio",
      id: createId("pcardio"),
      orderIndex: nextOrder(),
      activityName,
    };
    const next: WorkoutSplit = {
      ...split,
      days: split.days.map((d) =>
        d.id === day.id ? { ...d, blocks: [...d.blocks, newBlock] } : d,
      ),
    };
    await persist(next);
  }

  async function commitDragReorder() {
    const from = dragFromIdx;
    const to = dragToIdx;
    dragId = null;
    dragFromIdx = -1;
    dragToIdx = -1;

    if (!split || !day || from === to || from === -1) return;

    const sorted = sortBlocks(day.blocks);
    const reordered = [...sorted];
    const [item] = reordered.splice(from, 1);
    reordered.splice(to, 0, item!);

    const updatedBlocks = day.blocks.map((b) => {
      const newIdx = reordered.findIndex((r) => r.id === b.id);
      return newIdx !== -1 ? { ...b, orderIndex: newIdx } : b;
    });

    const next: WorkoutSplit = {
      ...split,
      days: split.days.map((d) =>
        d.id === day.id ? { ...d, blocks: updatedBlocks } : d,
      ),
    };
    await persist(next);
  }

  async function deleteBlock(blockId: string) {
    if (!split || !day) return;
    const next: WorkoutSplit = {
      ...split,
      days: split.days.map((d) => {
        if (d.id !== day.id) return d;
        return { ...d, blocks: d.blocks.filter((b) => b.id !== blockId) };
      }),
    };
    await persist(next);
  }

  async function deleteDay() {
    if (!split || !day) return;
    const next: WorkoutSplit = {
      ...split,
      days: split.days
        .filter((d) => d.id !== day.id)
        .map((d, i) => ({ ...d, orderIndex: i })),
    };
    await persist(next);
    back(`/splits/${splitId}`);
  }

  async function hapticLight() {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
  }

  function gripAction(node: HTMLElement, blockId: string) {
    function startDrag(clientY: number) {
      const sorted = sortBlocks(day?.blocks ?? []);
      const idx = sorted.findIndex((b) => b.id === blockId);
      if (idx === -1) return false;
      dragId = blockId;
      dragFromIdx = idx;
      dragToIdx = idx;
      dragStartY = clientY;
      void hapticLight();
      return true;
    }

    function moveDrag(clientY: number) {
      if (dragId !== blockId) return;
      const total = day?.blocks.length ?? 1;
      const rowH = listEl ? listEl.getBoundingClientRect().height / total : 48;
      const delta = clientY - dragStartY;
      const newIdx = Math.max(0, Math.min(total - 1, Math.round(dragFromIdx + delta / rowH)));
      if (newIdx !== dragToIdx) dragToIdx = newIdx;
    }

    function onTouchStart(e: TouchEvent) {
      if (ui.saving || e.touches.length !== 1) return;
      e.preventDefault();
      startDrag(e.touches[0]!.clientY);
    }
    function onTouchMove(e: TouchEvent) {
      if (dragId !== blockId) return;
      e.preventDefault();
      moveDrag(e.touches[0]!.clientY);
    }
    function onTouchEnd() {
      if (dragId !== blockId) return;
      void commitDragReorder();
    }
    function onMouseDown(e: MouseEvent) {
      if (ui.saving || e.button !== 0) return;
      e.preventDefault();
      if (!startDrag(e.clientY)) return;
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }
    function onMouseMove(e: MouseEvent) { moveDrag(e.clientY); }
    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (dragId !== blockId) return;
      void commitDragReorder();
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
  }

  onMount(() => {
    void load().then(() => startSplitDayTour());
  });
</script>

<div class="flex flex-col pb-24">
  <!-- Header -->
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={() => back(`/splits/${splitId}`)}>
      <ArrowLeft class="h-4 w-4" />
    </Button>

    {#if ui.renamingDay}
      <input
        bind:this={dayNameInput}
        class="flex-1 min-w-0 bg-transparent text-sm font-semibold focus:outline-none border-b border-primary"
        bind:value={ui.dayNameDraft}
        placeholder="Day name (optional)"
        disabled={ui.saving}
        onkeydown={(e) => {
          if (e.key === "Enter") void commitRenameDay();
          if (e.key === "Escape") cancelRenameDay();
        }}
        onblur={() => void commitRenameDay()}
      />
      <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" onclick={cancelRenameDay}>
        <X class="h-3.5 w-3.5" />
      </Button>
      <Button size="icon" class="h-7 w-7 shrink-0" onclick={() => void commitRenameDay()}>
        <Check class="h-3.5 w-3.5" />
      </Button>
    {:else}
      <button
        type="button"
        class="flex-1 min-w-0 text-left"
        onclick={startRenameDay}
        disabled={ui.loading || ui.saving || !day}
        data-tour="split-day-name"
      >
        <span class="text-sm font-semibold">
          {#if day}
            Day {day.orderIndex + 1}{day.name ? ` — ${day.name}` : ""}
          {:else}
            Day
          {/if}
        </span>
      </button>

      <div class="flex items-center gap-1 shrink-0">
        <Button
          size="icon"
          class="h-7 w-7"
          disabled={!day || ui.saving}
          onclick={() => (ui.addMode = ui.addMode === "none" ? "picker" : "none")}
          aria-label="Add block"
          data-tour="split-day-add-block"
        >
          <Plus class="h-3.5 w-3.5" />
        </Button>

        <ConfirmDialog
          title="Delete this day?"
          description="Removes the day and all its blocks. Cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          saving={ui.saving}
          onConfirm={deleteDay}
        >
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon" class="h-7 w-7 text-destructive" disabled={!day || ui.saving}>
              <Trash class="h-3.5 w-3.5" />
            </Button>
          {/snippet}
        </ConfirmDialog>
      </div>
    {/if}
  </div>

  {#if ui.error}
    <p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>
  {/if}

  <!-- Block type picker -->
  {#if ui.addMode === "picker"}
    <div class="flex gap-2 px-3 py-2 border-b border-border bg-muted/30" transition:reveal>
      <button
        type="button"
        class="flex-1 flex items-center gap-2 rounded border border-border px-3 py-2 text-sm hover:bg-muted/50"
        onclick={() => (ui.addMode = "exercise")}
      >
        <Dumbbell class="h-4 w-4 text-muted-foreground shrink-0" />
        Exercise
      </button>
      <button
        type="button"
        class="flex-1 flex items-center gap-2 rounded border border-border px-3 py-2 text-sm hover:bg-muted/50"
        onclick={() => (ui.addMode = "cardio")}
      >
        <Timer class="h-4 w-4 text-muted-foreground shrink-0" />
        Cardio
      </button>
      <Button variant="ghost" class="h-9 px-2 text-xs text-muted-foreground" onclick={() => (ui.addMode = "none")}>
        Cancel
      </Button>
    </div>
  {/if}

  <!-- Exercise search -->
  {#if ui.addMode === "exercise"}
    <div class="px-3 py-2 border-b border-border bg-muted/30" transition:reveal>
      <ExerciseSearchInput
        placeholder="Search or add exercise…"
        disabled={ui.saving}
        autofocus={true}
        onConfirm={(sel) => void addExercise(sel)}
      />
      <Button
        variant="ghost"
        class="mt-1 h-7 px-2 text-xs text-muted-foreground"
        onclick={() => (ui.addMode = "none")}
      >
        Cancel
      </Button>
    </div>
  {/if}

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if !split}
    <p class="px-3 py-4 text-sm text-muted-foreground">Split not found.</p>
  {:else if !day}
    <p class="px-3 py-4 text-sm text-muted-foreground">Day not found.</p>
  {:else if day.blocks.length === 0}
    <div class="px-3 py-6 flex flex-col items-center gap-2 text-center">
      <p class="text-sm text-muted-foreground">Nothing planned yet.</p>
      <Button variant="outline" size="sm" onclick={() => (ui.addMode = "picker")}>
        Add first block
      </Button>
    </div>
  {:else}
    <div class="flex items-center justify-between px-3 py-2 border-b border-border">
      <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {day.blocks.length} item{day.blocks.length === 1 ? "" : "s"}
      </span>
    </div>

    {@const sorted = sortBlocks(day.blocks)}
    {@const ordered = liveOrder(sorted)}

    <ul bind:this={listEl} class="divide-y divide-border">
      {#each ordered as block, i (block.id)}
        {@const isDragging = dragId === block.id}
        {@const summary = block.type === "strength" ? targetSummary(block.targets) : null}
        {@const isExpanded = expandedId === block.id}
        <li class="transition-colors {isDragging ? 'bg-primary/[0.06]' : ''}">
          <div class="relative flex items-center py-2.5 pr-2">
            <button
              type="button"
              class="absolute left-0 top-0 bottom-0 flex items-center gap-1 px-3 cursor-grab active:cursor-grabbing bg-primary/[0.06] border-r border-primary/20 text-primary/70"
              style="touch-action: none;"
              use:gripAction={block.id}
              aria-label="Drag to reorder"
              tabindex="-1"
              disabled={ui.saving}
            >
              <GripVertical class="h-4 w-4" />
              <span class="text-xs w-4 text-right font-medium tabular-nums">{i + 1}</span>
            </button>

            <button
              type="button"
              class="flex-1 min-w-0 pl-[4.25rem] pr-2 flex items-center gap-2 text-left disabled:opacity-100"
              disabled={block.type !== "strength"}
              onclick={() => toggleExpanded(block)}
            >
              {#if block.type === "cardio"}
                <Timer class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {:else}
                <Dumbbell class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {/if}
              <span class="text-sm truncate">{blockLabel(block)}</span>
              {#if summary}
                <span class="text-xs text-muted-foreground tabular-nums shrink-0">· {summary}</span>
              {:else if block.type === "strength"}
                <span class="text-xs text-muted-foreground/60 shrink-0">· add targets</span>
              {/if}
            </button>

            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
              disabled={ui.saving}
              onclick={() => void deleteBlock(block.id)}
              aria-label="Remove {blockLabel(block)}"
            >
              <X class="h-3.5 w-3.5" />
            </Button>
          </div>

          {#if isExpanded && block.type === "strength"}
            <div class="pl-[4.25rem] pr-3 pb-3 pt-1" transition:reveal>
              <div class="grid grid-cols-3 gap-2">
                {#each [["Sets", "sets"], ["Reps", "reps"], [`Weight (${weightUnit})`, "weight"]] as [label, key] (key)}
                  <label class="flex flex-col gap-1">
                    <span class="text-[11px] text-muted-foreground">{label}</span>
                    <input
                      type="number"
                      inputmode="decimal"
                      min="0"
                      placeholder="—"
                      class="w-full rounded border bg-background px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                      value={targetDraft[key as "sets" | "reps" | "weight"] ?? ""}
                      disabled={ui.saving}
                      oninput={(e) => {
                        const v = (e.currentTarget as HTMLInputElement).value;
                        targetDraft[key as "sets" | "reps" | "weight"] = v === "" ? null : Math.max(0, Number(v));
                        commitTargetDraft(block.id);
                      }}
                    />
                  </label>
                {/each}
              </div>
              {#if summary}
                <button
                  type="button"
                  class="mt-2 text-xs text-muted-foreground hover:text-destructive"
                  onclick={() => clearTargets(block.id)}
                >
                  Clear targets
                </button>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<!-- Cardio dialog -->
<AddCardioDialog
  open={ui.addMode === "cardio"}
  saving={ui.saving}
  onOpenChange={(v) => { if (!v) ui.addMode = "none"; }}
  onSubmit={(name) => void addCardio(name)}
/>
