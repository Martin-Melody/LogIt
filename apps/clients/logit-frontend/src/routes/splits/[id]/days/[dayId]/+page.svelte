<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  // One day of a split: what to train, in order, with targets. Looks like the workout
  // screen: a ⋯ menu per row (Swap, Superset / circuit with…, Remove), supersets and
  // circuits as a band whose name opens the same edit sheet, and the same block picker.
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { onMount } from "svelte";
  import { back } from "$lib/navigation";

  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { segment, segmentTrack } from "$lib/components/ui/choice";

  import type {
    WorkoutSplit,
    SplitDay,
    PlannedBlock,
    PlannedGroup,
    PlannedMobility,
    PlannedMobilityTargets,
  } from "@logit/core/domain/WorkoutSplit";
  import {
    addPlannedCardio,
    addPlannedMobility,
    addPlannedStrength,
    groupPlannedBlocks,
    orderPlannedBlocks,
    plannedBlockName,
    plannedGroupMembers,
    plannedGroupOf,
    removePlannedBlock,
    removePlannedGroup,
    setPlannedGroupKind,
    setPlannedGroupRounds,
    setPlannedGroupSettings,
    setPlannedTargets,
    sortPlannedBlocks,
    touchSplit,
    ungroupPlanned,
    updatePlannedBlock,
    updateSplitDay,
    MAX_PLANNED_ROUNDS,
  } from "@logit/core/domain/WorkoutSplit";
  import { groupKindOf, type GroupKind, type GroupSettingsPatch } from "@logit/core/domain/workout";
  import { splitDaySession } from "@logit/core/domain/splitDaySession";
  import { estimateCircuitMs } from "@logit/core/domain/circuit";
  import { profile } from "$lib/stores/profile.store";
  import { fromDisplayWeight, roundDisplayWeight, toDisplayWeight } from "@logit/core/domain/units";
  import { reveal } from "$lib/transitions";

  import { getSplit } from "$lib/usecases/Splits/getSplit";
  import { saveSplit } from "$lib/usecases/Splits/saveSplit";
  import { getExerciseRepo } from "$lib/data/repoProvider";
  import { activeSplit } from "$lib/stores/activeSplit.store";

  import {
    ArrowLeftRight,
    Dumbbell,
    GripVertical,
    Link2,
    Link2Off,
    MoreHorizontal,
    PersonStanding,
    Plus,
    Repeat,
    Timer,
    Trash,
    Trash2,
    X,
    Check,
    Zap,
  } from "lucide-svelte";
  import { startSplitDayTour } from "$lib/tour/index";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import ExerciseSearchInput from "$lib/components/ExerciseSearchInput.svelte";
  import AddCardioDialog from "$lib/features/session/ui/AddCardioDialog.svelte";
  import AddMobilityDialog from "$lib/features/session/ui/AddMobilityDialog.svelte";
  import BlockPickerSheet from "$lib/features/session/ui/BlockPickerSheet.svelte";
  import GroupPickerSheet from "$lib/features/session/ui/GroupPickerSheet.svelte";
  import GroupSettingsSheet from "$lib/features/session/ui/GroupSettingsSheet.svelte";
  import { allowedDropIndices, canConfirmGroup, groupConfirmLabel, nearestAllowed, pickerGroupKind } from "$lib/features/session/grouping";
  import { circuitDefaultsFrom } from "$lib/features/session/circuit/circuitSettings";
  import {
    dayRuns,
    plannedGroupName,
    plannedGroupPickerModel,
    plannedGroupSummary,
    plannedSummary,
  } from "$lib/features/splits/splitDayView";

  const props = $props<{ params: { id: string; dayId: string } }>();
  const splitId = $derived(props.params.id);
  const dayId = $derived(props.params.dayId);

  const ui = $state({
    loading: true,
    saving: false,
    error: null as string | null,
    renamingDay: false,
    dayNameDraft: "",
  });

  let split = $state<WorkoutSplit | null>(null);
  let dayNameInput = $state<HTMLInputElement | null>(null);
  let listEl = $state<HTMLDivElement | null>(null);

  const day = $derived<SplitDay | null>(
    split ? ((split.days ?? []).find((x) => x.id === dayId) ?? null) : null,
  );
  const runs = $derived(day ? dayRuns(day) : []);
  const weightUnit = $derived($profile.weightUnit);

  // ── Adding and swapping ────────────────────────────────────────────────────
  let pickerOpen = $state(false);
  /** The exercise search: adding a new one, or swapping the exercise of a block. */
  let search = $state<{ swapId: string | null } | null>(null);
  let cardio = $state<{ swapId: string | null } | null>(null);
  let mobility = $state<{ swapId: string | null } | null>(null);

  function onPick(type: string) {
    if (type === "strength") search = { swapId: null };
    else if (type === "cardio") cardio = { swapId: null };
    else if (type === "mobility") mobility = { swapId: null };
  }

  function swap(block: PlannedBlock) {
    if (block.type === "strength") search = { swapId: block.id };
    else if (block.type === "cardio") cardio = { swapId: block.id };
    else mobility = { swapId: block.id };
  }

  // ── Loading and saving ─────────────────────────────────────────────────────

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      let loaded = await getSplit(splitId);
      if (loaded) {
        // Exercise names follow renames in the exercise library.
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

  let saveQueue: Promise<void> = Promise.resolve();

  /** Save a change; serialized so quick edits land in order, each on the latest split. */
  function persist(change: (s: WorkoutSplit) => WorkoutSplit): Promise<void> {
    saveQueue = saveQueue.then(async () => {
      if (!split) return;
      ui.saving = true;
      ui.error = null;
      try {
        const touched = touchSplit(change(split));
        await saveSplit(touched);
        split = touched;
        await activeSplit.load();
      } catch (e) {
        ui.error = e instanceof Error ? e.message : "Failed to save";
      } finally {
        ui.saving = false;
      }
    });
    return saveQueue;
  }

  function mutateDay(fn: (d: SplitDay) => SplitDay): Promise<void> {
    return persist((s) => updateSplitDay(s, dayId, fn));
  }

  // ── Day name ───────────────────────────────────────────────────────────────

  function startRenameDay() {
    if (!day) return;
    ui.dayNameDraft = day.name ?? "";
    ui.renamingDay = true;
    queueMicrotask(() => dayNameInput?.focus());
  }

  async function commitRenameDay() {
    if (!day) return;
    const name = ui.dayNameDraft.trim();
    ui.renamingDay = false;
    if (name === (day.name ?? "")) return;
    await mutateDay((d) => ({ ...d, name }));
  }

  function cancelRenameDay() {
    ui.renamingDay = false;
    ui.dayNameDraft = day?.name ?? "";
  }

  async function deleteDay() {
    await persist((s) => ({
      ...s,
      days: s.days.filter((d) => d.id !== dayId).map((d, i) => ({ ...d, orderIndex: i })),
    }));
    back(`/splits/${splitId}`);
  }

  // ── Blocks ─────────────────────────────────────────────────────────────────

  async function confirmExercise(selection: { name: string; exerciseId?: string }) {
    const swapId = search?.swapId ?? null;
    search = null;
    let exerciseId = selection.exerciseId;
    if (!exerciseId) exerciseId = (await getExerciseRepo().create(selection.name)).id;
    if (swapId) {
      await persist((s) => updatePlannedBlock(s, dayId, swapId, { exerciseName: selection.name, exerciseId }));
    } else {
      await persist((s) => addPlannedStrength(s, dayId, { exerciseName: selection.name, exerciseId, targets: {} }));
    }
  }

  async function confirmCardio(name: string) {
    const swapId = cardio?.swapId ?? null;
    if (swapId) await persist((s) => updatePlannedBlock(s, dayId, swapId, { activityName: name }));
    else await persist((s) => addPlannedCardio(s, dayId, name));
  }

  async function confirmMobility(drill: { drillName: string; drillId?: string; metric: "hold" | "reps"; perSide: boolean }) {
    const swapId = mobility?.swapId ?? null;
    mobility = null;
    if (swapId) {
      await persist((s) =>
        updatePlannedBlock(s, dayId, swapId, { drillName: drill.drillName, drillId: drill.drillId }),
      );
    } else {
      await persist((s) => addPlannedMobility(s, dayId, drill));
    }
  }

  async function removeBlock(blockId: string) {
    if (expandedId === blockId) expandedId = null;
    await mutateDay((d) => removePlannedBlock(d, blockId));
  }

  // ── Targets ────────────────────────────────────────────────────────────────

  let expandedId = $state<string | null>(null);
  // Draft for the open row, in display units: strength sets / reps / weight, drill
  // sets / hold seconds / reps.
  let draft = $state<{ sets: number | null; reps: number | null; weight: number | null; holdSec: number | null }>({
    sets: null, reps: null, weight: null, holdSec: null,
  });

  function toggleExpanded(block: PlannedBlock) {
    if (block.type === "cardio") return;
    if (expandedId === block.id) {
      expandedId = null;
      return;
    }
    expandedId = block.id;
    const t = block.targets ?? {};
    draft = {
      sets: t.sets ?? null,
      reps: t.reps ?? null,
      weight:
        block.type === "strength" && block.targets?.weight != null
          ? roundDisplayWeight(toDisplayWeight(block.targets.weight, weightUnit), weightUnit)
          : null,
      holdSec: block.type === "mobility" ? (block.targets?.holdSec ?? null) : null,
    };
  }

  function commitDraft(block: PlannedBlock) {
    const d = { ...draft };
    if (block.type === "strength") {
      void persist((s) =>
        setPlannedTargets(s, dayId, block.id, {
          sets: d.sets ?? undefined,
          reps: d.reps ?? undefined,
          weight: d.weight != null ? fromDisplayWeight(d.weight, weightUnit) : undefined,
        }),
      );
    } else if (block.type === "mobility") {
      const targets: PlannedMobilityTargets = {
        ...(d.sets && d.sets > 0 ? { sets: d.sets } : {}),
        ...(d.holdSec && d.holdSec > 0 ? { holdSec: d.holdSec } : {}),
        ...(d.reps && d.reps > 0 ? { reps: d.reps } : {}),
      };
      void persist((s) =>
        updatePlannedBlock(s, dayId, block.id, { targets: Object.keys(targets).length ? targets : undefined }),
      );
    }
  }

  function clearTargets(block: PlannedBlock) {
    draft = { sets: null, reps: null, weight: null, holdSec: null };
    commitDraft(block);
  }

  function setDrill(block: PlannedMobility, patch: Partial<Pick<PlannedMobility, "metric" | "perSide">>) {
    void persist((s) => updatePlannedBlock(s, dayId, block.id, patch));
  }

  type DraftKey = "sets" | "reps" | "weight" | "holdSec";

  /** The target fields a row edits. In a group the sets are the group's rounds. */
  function targetFields(block: PlannedBlock, inGroup: boolean): [string, DraftKey][] {
    const fields: [string, DraftKey][] =
      block.type === "strength"
        ? [["Sets", "sets"], ["Reps", "reps"], [`Weight (${weightUnit})`, "weight"]]
        : block.type === "mobility" && block.metric === "hold"
          ? [["Sets", "sets"], ["Hold (s)", "holdSec"]]
          : [["Sets", "sets"], ["Reps", "reps"]];
    return inGroup ? fields.filter(([, key]) => key !== "sets") : fields;
  }

  function hasTargets(block: PlannedBlock): boolean {
    return block.type !== "cardio" && !!block.targets && Object.values(block.targets).some((v) => v != null);
  }

  // ── Grouping ───────────────────────────────────────────────────────────────

  let groupPicker = $state<{ anchorId: string; picked: string[]; kind: GroupKind | null } | null>(null);
  const pickerModel = $derived(
    groupPicker && day ? plannedGroupPickerModel(day, groupPicker.anchorId, weightUnit) : null,
  );
  const pickerKind = $derived(
    groupPicker && pickerModel && !pickerModel.alreadyGrouped
      ? pickerGroupKind(groupPicker.picked.length, groupPicker.kind)
      : null,
  );

  function openGroupPicker(blockId: string) {
    groupPicker = { anchorId: blockId, picked: [], kind: null };
  }

  function togglePicked(id: string) {
    if (!groupPicker) return;
    const picked = groupPicker.picked.includes(id)
      ? groupPicker.picked.filter((x) => x !== id)
      : [...groupPicker.picked, id];
    groupPicker = { ...groupPicker, picked };
  }

  async function confirmGroup() {
    if (!groupPicker || !pickerModel) return;
    const { anchorId, picked } = groupPicker;
    const kind = pickerModel.alreadyGrouped ? undefined : pickerGroupKind(picked.length, groupPicker.kind);
    groupPicker = null;
    await mutateDay((d) => groupPlannedBlocks(d, [anchorId, ...picked], kind ? { kind } : {}));
  }

  let editGroupId = $state<string | null>(null);
  let removeGroupId = $state<string | null>(null);
  const editGroup = $derived(day && editGroupId ? (day.groups ?? []).find((g) => g.id === editGroupId) ?? null : null);
  const editMembers = $derived(day && editGroup ? plannedGroupMembers(day, editGroup.id) : []);
  const circuitDefaults = $derived(circuitDefaultsFrom($profile.restDefaults));
  const editEstimate = $derived.by(() => {
    if (!day || !editGroup || !editMembers.some((b) => b.type === "mobility")) return null;
    const built = splitDaySession(day);
    const supersetId = built.groupIdByPlannedId[editGroup.id];
    return supersetId ? estimateCircuitMs(built.session, supersetId, circuitDefaults) : null;
  });
  const removeGroup = $derived(day && removeGroupId ? (day.groups ?? []).find((g) => g.id === removeGroupId) ?? null : null);

  function groupWord(group: PlannedGroup, count: number): string {
    return groupKindOf(count, group.kind) === "circuit" ? "circuit" : "superset";
  }

  // ── Drag to reorder ────────────────────────────────────────────────────────
  // A row drags on its own; a member only within its group; a group's grip drags the
  // whole group. Nothing lands inside a group it isn't part of (the workout's rules).

  type Drag = { ids: string[]; fromIdx: number; allowed: number[]; dropIdx: number; memberOf: string | null };
  let drag = $state<Drag | null>(null);

  const restBlocks = $derived(
    day && drag ? sortPlannedBlocks(day.blocks).filter((b) => !drag!.ids.includes(b.id)) : [],
  );
  /** Where the drop line shows: before a block, at the end of a group, or at the end. */
  const indicator = $derived.by((): { before: string } | { groupEnd: string } | { end: true } | null => {
    if (!drag || drag.dropIdx === drag.fromIdx) return null;
    const next = restBlocks[drag.dropIdx];
    if (drag.memberOf) {
      if (next && next.groupId === drag.memberOf) return { before: next.id };
      return { groupEnd: drag.memberOf };
    }
    return next ? { before: next.id } : { end: true };
  });

  async function hapticLight() {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
  }

  function beginDrag(target: { blockId: string } | { groupId: string }): boolean {
    if (!day || ui.saving) return false;
    const sorted = sortPlannedBlocks(day.blocks);
    let ids: string[];
    let memberOf: string | null = null;
    if ("groupId" in target) {
      ids = sorted.filter((b) => b.groupId === target.groupId).map((b) => b.id);
    } else {
      const block = sorted.find((b) => b.id === target.blockId);
      if (!block) return false;
      ids = [block.id];
      memberOf = plannedGroupOf(day, block)?.id ?? null;
    }
    const fromIdx = sorted.findIndex((b) => b.id === ids[0]);
    if (fromIdx === -1) return false;
    const allowed = allowedDropIndices(sorted, fromIdx, ids.length, (b: PlannedBlock) => b.groupId);
    drag = { ids, fromIdx, allowed, dropIdx: fromIdx, memberOf };
    void hapticLight();
    return true;
  }

  function moveDrag(clientY: number) {
    if (!drag || !listEl) return;
    // Rows that aren't moving, top to bottom: the drop goes after every row whose middle
    // is above the pointer.
    const rows = [...listEl.querySelectorAll<HTMLElement>("[data-block-row]")].filter(
      (el) => !drag!.ids.includes(el.dataset.blockRow ?? ""),
    );
    let target = 0;
    for (const el of rows) {
      const r = el.getBoundingClientRect();
      if (r.top + r.height / 2 < clientY) target++;
    }
    const dropIdx = nearestAllowed(drag.allowed, target, drag.fromIdx);
    if (dropIdx !== drag.dropIdx) {
      drag = { ...drag, dropIdx };
      void hapticLight();
    }
  }

  async function endDrag() {
    const d = drag;
    drag = null;
    if (!d || !day || d.dropIdx === d.fromIdx) return;
    const rest = sortPlannedBlocks(day.blocks).filter((b) => !d.ids.includes(b.id)).map((b) => b.id);
    rest.splice(d.dropIdx, 0, ...d.ids);
    await mutateDay((x) => orderPlannedBlocks(x, rest));
  }

  function gripAction(node: HTMLElement, target: { blockId: string } | { groupId: string }) {
    let current = target;
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      beginDrag(current);
    }
    function onTouchMove(e: TouchEvent) {
      if (!drag) return;
      e.preventDefault();
      moveDrag(e.touches[0]!.clientY);
    }
    function onTouchEnd() {
      if (drag) void endDrag();
    }
    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      e.preventDefault();
      if (!beginDrag(current)) return;
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }
    function onMouseMove(e: MouseEvent) {
      moveDrag(e.clientY);
    }
    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (drag) void endDrag();
    }
    node.addEventListener("touchstart", onTouchStart, { passive: false });
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    node.addEventListener("touchend", onTouchEnd, { passive: true });
    node.addEventListener("touchcancel", onTouchEnd, { passive: true });
    node.addEventListener("mousedown", onMouseDown);
    return {
      update(next: { blockId: string } | { groupId: string }) {
        current = next;
      },
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
  <PageHeader>
    <BackButton onclick={() => back(`/splits/${splitId}`)} />

    {#if ui.renamingDay}
      <input
        bind:this={dayNameInput}
        class="flex-1 min-w-0 bg-transparent text-base font-semibold focus:outline-none border-b border-primary"
        bind:value={ui.dayNameDraft}
        placeholder="Day name (optional)"
        disabled={ui.saving}
        onkeydown={(e) => {
          if (e.key === "Enter") void commitRenameDay();
          if (e.key === "Escape") cancelRenameDay();
        }}
        onblur={() => void commitRenameDay()}
      />
      <Button variant="ghost" size="icon" class="shrink-0" onclick={cancelRenameDay}>
        <X class="h-3.5 w-3.5" />
      </Button>
      <Button size="icon" class="shrink-0" onclick={() => void commitRenameDay()}>
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
          disabled={!day || ui.saving}
          onclick={() => (pickerOpen = true)}
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
            <Button {...props} variant="ghost" size="icon" class="text-destructive" disabled={!day || ui.saving}>
              <Trash class="h-3.5 w-3.5" />
            </Button>
          {/snippet}
        </ConfirmDialog>
      </div>
    {/if}
  </PageHeader>

  {#if ui.error}
    <p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>
  {/if}

  <!-- Exercise search: adding, or swapping a row's exercise -->
  {#if search}
    <div class="px-3 py-2 border-b border-border bg-muted/30" transition:reveal>
      {#if search.swapId && day}
        {@const swapping = day.blocks.find((b) => b.id === search!.swapId)}
        {#if swapping}
          <p class="pb-1.5 text-xs text-muted-foreground">Swap {plannedBlockName(swapping)} for…</p>
        {/if}
      {/if}
      <ExerciseSearchInput
        placeholder="Search or add exercise…"
        disabled={ui.saving}
        autofocus={true}
        onConfirm={(sel) => void confirmExercise(sel)}
      />
      <Button variant="ghost" class="mt-1 h-7 px-2 text-xs text-muted-foreground" onclick={() => (search = null)}>
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
    <div class="px-3 py-12 flex flex-col items-center gap-3 text-center">
      <p class="text-sm text-muted-foreground">Nothing planned yet.</p>
      <Button variant="outline" onclick={() => (pickerOpen = true)}>Add first block</Button>
    </div>
  {:else}
    <div class="flex items-center justify-between px-3 py-2 border-b border-border">
      <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {day.blocks.length} item{day.blocks.length === 1 ? "" : "s"}
      </span>
    </div>

    <div bind:this={listEl} class="flex flex-col" data-testid="day-blocks">
      {#each runs as run (run.kind === "group" ? run.group.id : run.block.id)}
        {#if run.kind === "block"}
          {#if indicator && "before" in indicator && indicator.before === run.block.id}
            {@render dropLine()}
          {/if}
          {@render blockRow(run.block, run.idx, false)}
        {:else}
          {@const group = run.group}
          {@const count = run.members.length}
          {@const label = plannedGroupName(group, count)}
          {@const kind = groupKindOf(count, group.kind)}
          {@const movingGroup = !!drag && drag.ids.length > 1 && drag.ids.includes(run.members[0]!.block.id)}
          {#if indicator && "before" in indicator && indicator.before === run.members[0]!.block.id && drag?.memberOf !== group.id}
            {@render dropLine()}
          {/if}
          <div
            class="border-y border-primary/30 bg-primary/[0.03] transition-opacity {movingGroup ? 'opacity-50' : ''}"
            data-testid="planned-group"
          >
            <div class="flex items-center gap-1 pl-1 pr-1">
              <button
                type="button"
                class="shrink-0 h-11 w-9 flex items-center justify-center rounded-md text-primary/70 cursor-grab active:cursor-grabbing"
                style="touch-action: none"
                use:gripAction={{ groupId: group.id }}
                aria-label="Drag {label.toLowerCase()} to reorder"
                tabindex="-1"
                disabled={ui.saving}
              >
                <GripVertical class="h-4 w-4" />
              </button>
              <button
                type="button"
                class="flex-1 min-w-0 py-1.5 text-left rounded-md disabled:opacity-50"
                onclick={() => (editGroupId = group.id)}
                disabled={ui.saving}
                aria-label="Edit {label}"
              >
                <span class="block text-xs font-medium text-primary uppercase tracking-wide truncate">{label}</span>
                <span class="block text-xs text-muted-foreground truncate">{plannedGroupSummary(group, count)}</span>
              </button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger
                  class="shrink-0 h-11 w-11 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-50"
                  disabled={ui.saving}
                  aria-label="More actions for this {label.toLowerCase()}"
                >
                  <MoreHorizontal class="h-5 w-5" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end">
                  {#if kind === "superset"}
                    <DropdownMenu.Item onSelect={() => mutateDay((d) => setPlannedGroupKind(d, group.id, "circuit"))}>
                      <Repeat /> Make it a circuit
                    </DropdownMenu.Item>
                  {:else if count >= 2}
                    <DropdownMenu.Item onSelect={() => mutateDay((d) => setPlannedGroupKind(d, group.id, "superset"))}>
                      <Zap /> Make it a superset
                    </DropdownMenu.Item>
                  {/if}
                  <DropdownMenu.Item onSelect={() => mutateDay((d) => ungroupPlanned(d, group.id))}>
                    <Link2Off /> Ungroup
                  </DropdownMenu.Item>
                  <DropdownMenu.Item variant="destructive" onSelect={() => (removeGroupId = group.id)}>
                    <Trash2 /> Remove {label.toLowerCase()} and its exercises
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </div>
            <div class="ml-3 border-l-2 border-primary/30">
              {#each run.members as m (m.block.id)}
                {#if indicator && "before" in indicator && indicator.before === m.block.id && drag?.memberOf === group.id}
                  {@render dropLine()}
                {/if}
                {@render blockRow(m.block, m.idx, true)}
              {/each}
              {#if indicator && "groupEnd" in indicator && indicator.groupEnd === group.id}
                {@render dropLine()}
              {/if}
            </div>
          </div>
        {/if}
      {/each}
      {#if indicator && "end" in indicator}
        {@render dropLine()}
      {/if}
    </div>
  {/if}
</div>

{#snippet dropLine()}
  <div class="h-0.5 mx-3 rounded-full bg-primary" aria-hidden="true"></div>
{/snippet}

{#snippet blockRow(block: PlannedBlock, idx: number, inGroup: boolean)}
  {@const summary = day ? plannedSummary(day, block, weightUnit) : null}
  {@const isExpanded = expandedId === block.id}
  {@const isDragging = !!drag && drag.ids.length === 1 && drag.ids[0] === block.id}
  {@const name = plannedBlockName(block)}
  <div
    class="border-b border-border last:border-b-0 transition-colors {isDragging ? 'bg-primary/[0.06] opacity-60' : ''}"
    data-block-row={block.id}
    data-testid="planned-block"
  >
    <div class="flex items-center gap-1 py-1 pl-1 pr-1">
      <button
        type="button"
        class="shrink-0 h-11 flex items-center gap-1 px-2 cursor-grab active:cursor-grabbing text-primary/70"
        style="touch-action: none;"
        use:gripAction={{ blockId: block.id }}
        aria-label="Drag to reorder"
        tabindex="-1"
        disabled={ui.saving}
      >
        <GripVertical class="h-4 w-4" />
        <span class="text-xs w-4 text-right font-medium tabular-nums">{idx + 1}</span>
      </button>

      <button
        type="button"
        class="flex-1 min-w-0 flex items-center gap-2 py-1.5 text-left disabled:opacity-100"
        disabled={block.type === "cardio"}
        onclick={() => toggleExpanded(block)}
        aria-expanded={block.type === "cardio" ? undefined : isExpanded}
      >
        {#if block.type === "cardio"}
          <Timer class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {:else if block.type === "mobility"}
          <PersonStanding class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {:else}
          <Dumbbell class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {/if}
        <span class="min-w-0 flex flex-col">
          <span class="text-sm truncate" data-testid="planned-name">{name}</span>
          {#if summary}
            <span class="text-xs text-muted-foreground tabular-nums truncate">{summary}</span>
          {:else if block.type === "cardio"}
            <span class="text-xs text-muted-foreground">Cardio</span>
          {:else}
            <span class="text-xs text-muted-foreground">Add targets</span>
          {/if}
        </span>
      </button>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          class="shrink-0 h-11 w-11 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-50"
          disabled={ui.saving}
          aria-label="More actions for {name}"
        >
          <MoreHorizontal class="h-5 w-5" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end">
          <DropdownMenu.Item onSelect={() => swap(block)}>
            <ArrowLeftRight /> {block.type === "strength" ? "Swap exercise" : block.type === "mobility" ? "Swap drill" : "Rename activity"}
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => openGroupPicker(block.id)}>
            <Link2 /> {inGroup ? "Add to this group…" : "Superset / circuit with…"}
          </DropdownMenu.Item>
          <DropdownMenu.Item variant="destructive" onSelect={() => void removeBlock(block.id)}>
            <Trash2 /> Remove {block.type === "mobility" ? "drill" : block.type === "cardio" ? "activity" : "exercise"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>

    {#if isExpanded && block.type !== "cardio"}
      <div class="pl-11 pr-3 pb-3 pt-1 flex flex-col gap-2" transition:reveal>
        {#if block.type === "mobility"}
          <div class="flex items-center gap-2">
            <div class="{segmentTrack} flex-1" role="group" aria-label="Measured by">
              <button type="button" class={segment(block.metric === "hold")} aria-pressed={block.metric === "hold"} disabled={ui.saving} onclick={() => setDrill(block, { metric: "hold" })}>Hold</button>
              <button type="button" class={segment(block.metric === "reps")} aria-pressed={block.metric === "reps"} disabled={ui.saving} onclick={() => setDrill(block, { metric: "reps" })}>Reps</button>
            </div>
            <label class="flex h-10 shrink-0 items-center gap-2 rounded-md border border-border px-3 text-sm">
              <input type="checkbox" class="size-4 accent-primary" checked={block.perSide} disabled={ui.saving} onchange={() => setDrill(block, { perSide: !block.perSide })} />
              Each side
            </label>
          </div>
        {/if}
        <div class="grid gap-2 {targetFields(block, inGroup).length === 3 ? 'grid-cols-3' : 'grid-cols-2'}">
          {#each targetFields(block, inGroup) as [label, key] (key)}
            <label class="flex flex-col gap-1">
              <span class="text-[11px] text-muted-foreground">{label}</span>
              <input
                type="number"
                inputmode="decimal"
                min="0"
                placeholder="—"
                class="h-10 w-full rounded-md border bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                value={draft[key] ?? ""}
                disabled={ui.saving}
                oninput={(e) => {
                  const v = (e.currentTarget as HTMLInputElement).value;
                  draft[key] = v === "" ? null : Math.max(0, Number(v));
                  commitDraft(block);
                }}
              />
            </label>
          {/each}
        </div>
        {#if inGroup}
          <p class="text-xs text-muted-foreground">Sets come from the group's rounds.</p>
        {/if}
        {#if hasTargets(block)}
          <button
            type="button"
            class="self-start text-xs text-muted-foreground hover:text-destructive"
            onclick={() => clearTargets(block)}
          >
            Clear targets
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

<BlockPickerSheet
  open={pickerOpen}
  types={["strength", "cardio", "mobility"]}
  onOpenChange={(v) => (pickerOpen = v)}
  onSelect={onPick}
/>

<AddCardioDialog
  open={!!cardio}
  saving={ui.saving}
  title={cardio?.swapId ? "Rename activity" : undefined}
  submitLabel={cardio?.swapId ? "Save" : undefined}
  onOpenChange={(v) => { if (!v) cardio = null; }}
  onSubmit={(name) => confirmCardio(name)}
/>

<AddMobilityDialog
  open={!!mobility}
  saving={ui.saving}
  mode={mobility?.swapId ? "swap" : "add"}
  title={mobility?.swapId ? "Swap drill" : undefined}
  submitLabel={mobility?.swapId ? "Swap" : undefined}
  onOpenChange={(v) => { if (!v) mobility = null; }}
  onSubmit={(drill) => confirmMobility(drill)}
/>

{#if pickerModel && groupPicker}
  <GroupPickerSheet
    open={true}
    title={pickerModel.title}
    sections={pickerModel.sections}
    picked={groupPicker.picked}
    confirmLabel={groupConfirmLabel(pickerModel, groupPicker.picked.length, groupPicker.kind)}
    canConfirm={canConfirmGroup(pickerModel, groupPicker.picked.length, pickerKind ?? "superset")}
    kind={pickerKind}
    onKindChange={(k) => { if (groupPicker) groupPicker = { ...groupPicker, kind: k }; }}
    showSizeHint={!pickerModel.alreadyGrouped}
    saving={ui.saving}
    onToggle={togglePicked}
    onConfirm={confirmGroup}
    onOpenChange={(v) => { if (!v) groupPicker = null; }}
  />
{/if}

{#if editGroup}
  <GroupSettingsSheet
    open={true}
    info={editGroup}
    memberCount={editMembers.length}
    rounds={editGroup.rounds}
    hasDrills={editMembers.some((b) => b.type === "mobility")}
    canRemoveRound={editGroup.rounds > 1}
    roundsHint="Every exercise in it gets this many sets"
    estimate={editEstimate}
    saving={ui.saving}
    onClose={() => (editGroupId = null)}
    onPatch={(p: GroupSettingsPatch) => mutateDay((d) => setPlannedGroupSettings(d, editGroup!.id, p))}
    onKind={(k: GroupKind) => mutateDay((d) => setPlannedGroupKind(d, editGroup!.id, k))}
    onRoundsChange={(delta: 1 | -1) =>
      mutateDay((d) => setPlannedGroupRounds(d, editGroup!.id, Math.min(MAX_PLANNED_ROUNDS, editGroup!.rounds + delta)))}
    onUngroup={() => {
      const id = editGroup!.id;
      editGroupId = null;
      void mutateDay((d) => ungroupPlanned(d, id));
    }}
    onRemove={() => {
      removeGroupId = editGroup!.id;
      editGroupId = null;
    }}
  />
{/if}

<ConfirmDialog
  title="Remove {removeGroup && day ? groupWord(removeGroup, plannedGroupMembers(day, removeGroup.id).length) : 'group'}?"
  description={removeGroup && day
    ? `Removes it and its ${plannedGroupMembers(day, removeGroup.id).length} exercise${plannedGroupMembers(day, removeGroup.id).length === 1 ? "" : "s"} from this day.`
    : ""}
  confirmLabel="Remove"
  saving={ui.saving}
  open={!!removeGroup}
  onOpenChange={(v: boolean) => { if (!v) removeGroupId = null; }}
  onConfirm={async () => {
    const id = removeGroupId;
    removeGroupId = null;
    if (id) await mutateDay((d) => removePlannedGroup(d, id));
  }}
/>
