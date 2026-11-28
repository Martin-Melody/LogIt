<script lang="ts">
  import { openAllSignal } from "$lib/features/session/openAll";
  import { foldFor } from "$lib/features/session/stage";
  import { untrack } from "svelte";
  import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight, Timer, Hash, ArrowLeftRight, MoreHorizontal, Link2, Check, Ruler, Split, ArrowDownUp } from "lucide-svelte";
  import ActionSheet, { type ActionItem } from "$lib/components/ActionSheet.svelte";
  import RestPickerSheet from "$lib/features/session/ui/RestPickerSheet.svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { get } from "svelte/store";
  import { SvelteMap } from "svelte/reactivity";
  import { addButton } from "$lib/components/ui/choice";
  import { cn } from "$lib/utils.js";
  import { toast } from "$lib/components/ui/sonner/index";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import { profile } from "$lib/stores/profile.store";
  import { reveal } from "$lib/transitions";
  import type { WeightUnit } from "@logit/core/domain/units";
  import type { MobilityBlockData, MobilitySet, MobilitySetGroup, MobilitySide } from "@logit/core/domain/workout";
  import {
    addMobilitySet,
    mobilityRestMs,
    removeMobilitySet,
    updateMobilitySet,
    updateMobilityDrill,
    setMobilityMetric,
    setMobilityPerSide,
    setMobilityRestBetweenSets,
    setMobilityLeadSide,
    moveMobilitySetGroup,
    mobilitySetGroups,
    clearOtherRests,
  } from "@logit/core/domain/workout";
  import type { BlockBaseProps } from "$lib/features/session/blocks/types";
  import { answerMobilityNextStep, getMobilitySuggestion, resolveMobilityAlgorithmId, setMobilityDrillAlgorithm } from "@logit/core/usecases/progression/getMobilitySuggestion";
  import type { MobilityNextStep } from "@logit/core/domain/mobilityProgression";
  import { toDisplayWeight } from "@logit/core/domain/units";
  import MobilityNextCard from "./MobilityNextCard.svelte";
  import { swapPlannedMobilityDrill } from "@logit/core/domain/WorkoutSplit";
  import { getSplitRepo } from "$lib/data/repoProvider";
  import { saveSplit } from "$lib/usecases/Splits/saveSplit";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { SAME_EVERY_TIME_ID } from "@logit/core/progression/algorithms/sameEveryTime";
  import { DEFAULT_MOBILITY_ALGORITHM_ID } from "@logit/core/usecases/progression/getMobilityProgressionConfig";
  import { pushExerciseSetting } from "$lib/sync/syncService";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import MobilitySetRow from "$lib/features/session/ui/MobilitySetRow.svelte";
  import SwipeRevealRow from "$lib/features/session/ui/SwipeRevealRow.svelte";
  import EditMobilitySetDialog from "$lib/features/session/ui/EditMobilitySetDialog.svelte";
  import AddMobilityDialog from "$lib/features/session/ui/AddMobilityDialog.svelte";
  import MobilityDrillDetailSheet from "$lib/features/session/ui/MobilityDrillDetailSheet.svelte";
  import { justAdded } from "../justAdded";

  const {
    blockId,
    data,
    saving,
    grouped = false,
    groupRestMs,
    round,
    stage,
    onReorder,
    gripAction,
    onGroup,
    onDelete,
    onMutate,
  }: BlockBaseProps<MobilityBlockData> = $props();

  const freshlyAdded = untrack(() => justAdded.delete(blockId));
  let collapsed = $state(
    untrack(() => stage) ? !freshlyAdded && foldFor(untrack(() => stage)!, get(profile).blocksCollapsedByDefault) : get(profile).blocksCollapsedByDefault && !freshlyAdded,
  );

  // Done and upcoming blocks fold, the one you're on opens (stage.ts); a tap overrides until the stage changes.
  let seenStage = untrack(() => stage);
  $effect(() => {
    const st = stage;
    untrack(() => {
      if (!st || st === seenStage) return;
      seenStage = st;
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
  const weightUnit = $derived(($profile.weightUnit ?? "kg") as WeightUnit);

  const groups = $derived(mobilitySetGroups(data));
  const blockLead = $derived<MobilitySide>(data.leadSide ?? "left");

  function groupKey(g: MobilitySetGroup): string {
    return g.kind === "single" ? g.set.id : (g.left?.id ?? g.right?.id ?? String(g.setNumber));
  }

  // ── Suggestion / "last time" ────────────────────────────────────────────────
  type SuggestSet = { side?: "left" | "right"; durationSec?: number; reps?: number; loadKg?: number };
  let suggestionLabel = $state<string | null>(null);
  let suggestionNotes = $state<string | null>(null);
  let suggestedSets = $state<SuggestSet[]>([]);
  // Past the area's weekly time: the drill's next step (MobilityNextCard), until answered.
  let next = $state<MobilityNextStep | null>(null);
  let answered = $state(false);
  // A harder drill was just swapped in: its own goals replace the old drill's.
  let replaceTargetsNext = false;

  let lastFetchedKey = "";
  $effect(() => {
    const key = `${data.drillId ?? ""}|${data.drillName}|${data.metric}|${data.perSide}`;
    if (key === lastFetchedKey) return;
    lastFetchedKey = key;
    const drill = {
      id: data.drillId,
      name: data.drillName,
      metric: data.metric,
      perSide: data.perSide,
      ...(data.algorithmId ? { algorithmId: data.algorithmId } : {}),
    };
    void resolveMobilityAlgorithmId(drill, getProgressionDeps()).then((id) => (keepsSame = id === SAME_EVERY_TIME_ID)).catch(() => {});
    void getMobilitySuggestion(drill, getProgressionDeps())
      .then((out) => {
        if (!out) return;
        suggestionLabel = out.label ?? null;
        suggestionNotes = out.notes ?? null;
        suggestedSets = out.sets ?? [];
        next = out.next ?? null;
        answered = false;
        void maybePrefillTargets(out.sets ?? [], replaceTargetsNext);
        replaceTargetsNext = false;
      })
      .catch(() => {});
  });

  // Progress (the default) or the same holds every time, for this drill (Martin, 2026-11-20:
  // progressing is the default, and it must be obvious it can be just 30-second holds).
  let keepsSame = $state(false);
  let switching = $state(false);
  async function switchProgress() {
    switching = true;
    try {
      const deps = getProgressionDeps();
      const general = (await deps.progressionRepo.getMobilityConfig())?.algorithmId ?? DEFAULT_MOBILITY_ALGORITHM_ID;
      const want = keepsSame ? DEFAULT_MOBILITY_ALGORITHM_ID : SAME_EVERY_TIME_ID;
      const drill = { id: data.drillId, name: data.drillName };
      const row = await setMobilityDrillAlgorithm(drill, want === general ? null : want, deps);
      if (row) pushExerciseSetting(row);
      keepsSame = !keepsSame;
      lastFetchedKey = "";
      const out = await getMobilitySuggestion({ ...drill, metric: data.metric, perSide: data.perSide }, deps);
      suggestionLabel = out?.label ?? null;
      suggestionNotes = out?.notes ?? null;
      suggestedSets = out?.sets ?? [];
      await maybePrefillTargets(out?.sets ?? [], true);
      toast(keepsSame ? `${data.drillName}: the same holds every time` : `${data.drillName} progresses again`, {
        description: "Change it here, or for every drill in Settings › Mobility.",
      });
    } finally {
      switching = false;
    }
  }

  // ── The next step past the area's weekly time ──
  const drillRef = () => ({ id: data.drillId, name: data.drillName, ...(data.algorithmId ? { algorithmId: data.algorithmId } : {}) });
  async function refreshSuggestion() {
    const out = await getMobilitySuggestion({ ...drillRef(), metric: data.metric, perSide: data.perSide }, getProgressionDeps()).catch(() => null);
    suggestionLabel = out?.label ?? null;
    suggestionNotes = out?.notes ?? null;
  }
  async function nextAddLoad(kg: number) {
    answered = true;
    await onMutate((session) => {
      let n = session;
      for (const set of data.sets) if (!set.completed) n = updateMobilitySet(n, blockId, set.id, { loadKg: kg });
      return n;
    });
  }
  async function nextCue() {
    answered = true;
    await answerMobilityNextStep(drillRef(), { kind: "cue" }, getProgressionDeps()).catch(() => {});
    await refreshSuggestion();
  }
  async function nextNotYet() {
    answered = true;
    await answerMobilityNextStep(drillRef(), { kind: "notYet" }, getProgressionDeps()).catch(() => {});
    toast("Asked again next week");
  }
  async function nextHarder(d: { id?: string; name: string }) {
    const from = { drillId: data.drillId, drillName: data.drillName };
    const to = { drillId: d.id || undefined, drillName: d.name };
    replaceTargetsNext = true;
    await handleSwap(to);
    // The split day this workout came from gets it too, so next time starts there.
    const source = get(currentSession)?.source;
    if (source?.kind !== "split") return;
    try {
      const split = await getSplitRepo().getSplit(source.parentId);
      const swapped = split ? swapPlannedMobilityDrill(split, source.dayId, from, to) : null;
      if (!swapped) return;
      await saveSplit(swapped);
      toast(`${to.drillName} replaces ${from.drillName} on ${source.dayName ?? "this split day"} too`);
    } catch {}
  }
  let pickOpen = $state(false);
  async function nextPicked(sel: { drillName: string; drillId?: string }) {
    // Remembered on the drill it came from, as its next step from now on.
    await answerMobilityNextStep(drillRef(), { kind: "picked", drill: { id: sel.drillId, name: sel.drillName } }, getProgressionDeps()).catch(() => {});
    await nextHarder({ id: sel.drillId, name: sel.drillName });
  }
  const nextLoadInUnit = $derived(next?.load ? Math.round(toDisplayWeight(next.load.kg, $profile.weightUnit) * 2) / 2 : null);

  // Prefill hold targets on a fresh, untouched block so the timer has a goal.
  /** `replace`: the goals came from a suggestion that's just been swapped (Keep it the same). */
  async function maybePrefillTargets(sug: SuggestSet[], replace = false) {
    if (data.metric !== "hold") return;
    const untouched = data.sets.every(
      (s) => !s.durationSec && !s.reps && !s.completed && (replace || (s.targetSec ?? null) === null),
    );
    if (!untouched || sug.length === 0) return;
    await onMutate((session) => {
      let next = session;
      for (const set of data.sets) {
        const match = sug.find((x) => (data.perSide ? x.side === set.side : true));
        if (match?.durationSec) {
          next = updateMobilitySet(next, blockId, set.id, { targetSec: match.durationSec });
        }
      }
      return next;
    }, { auto: true });
  }

  function prevFor(set: MobilitySet): { durationSec?: number; reps?: number; loadKg?: number } | null {
    const m = suggestedSets.find((x) => (data.perSide ? x.side === set.side : true));
    return m ? { durationSec: m.durationSec, reps: m.reps, loadKg: m.loadKg } : null;
  }

  // ── Rest between sets ───────────────────────────────────────────────────────
  const REST_LADDER: (number | undefined)[] = [undefined, 30_000, 45_000, 60_000, 90_000];
  function cycleRest() {
    const i = REST_LADDER.findIndex((v) => v === (data.restBetweenSetsMs ?? undefined));
    const next = REST_LADDER[(i + 1) % REST_LADDER.length];
    void onMutate((s) => setMobilityRestBetweenSets(s, blockId, next));
  }
  function fmtRest(ms: number): string {
    const sec = Math.round(ms / 1000);
    return sec % 60 === 0 && sec >= 60 ? `${sec / 60}m` : `${sec}s`;
  }
  function effectiveRestMs(set: MobilitySet): number {
    return set.restDurationMs !== undefined ? set.restDurationMs : data.restBetweenSetsMs ?? 0;
  }

  // ── Mutations ───────────────────────────────────────────────────────────────
  async function addSet() {
    await onMutate((s) => addMobilitySet(s, blockId));
    if (collapsed) collapsed = false;
  }
  async function patchSet(setId: string, patch: Partial<MobilitySet>) {
    await onMutate((s) => updateMobilitySet(s, blockId, setId, patch));
  }
  async function deleteSet(setId: string) {
    await onMutate((s) => removeMobilitySet(s, blockId, setId));
  }
  async function toggleComplete(set: MobilitySet) {
    const wasCompleted = !!set.completed;
    // In a superset / circuit the group's rest wins (0 = straight on); see StrengthBlock.
    // There, the first side of an L/R pair goes straight on to the other side.
    const rest = groupRestMs !== undefined ? groupRestMs : effectiveRestMs(set);
    const pair = groups.find((g) => g.kind === "pair" && (g.left?.id === set.id || g.right?.id === set.id));
    const otherSide = pair?.kind === "pair" ? (pair.left?.id === set.id ? pair.right : pair.left) : undefined;
    const switchingSides = grouped && !!otherSide && !otherSide.completed;
    const startsRest = !wasCompleted && rest > 0 && !switchingSides;
    await onMutate((s) => {
      const next = updateMobilitySet(s, blockId, set.id, {
        ...(startsRest && groupRestMs ? { restDurationMs: groupRestMs } : {}),
        completed: !wasCompleted,
        restStartedAtMs: startsRest ? Date.now() : null,
      });
      // One rest at a time: a new rest replaces the previous set's.
      return startsRest ? clearOtherRests(next, set.id) : next;
    });
    // The rest service (restTimerService.ts) follows restStartedAtMs from here.
  }
  async function handleDismissRest(setId: string) {
    await patchSet(setId, { restStartedAtMs: null });
  }
  async function switchMetric(metric: "hold" | "reps") {
    if (metric === data.metric) return;
    await onMutate((s) => setMobilityMetric(s, blockId, metric));
  }
  async function togglePerSide() {
    await onMutate((s) => setMobilityPerSide(s, blockId, !data.perSide));
  }

  // ── Delete a set — always confirmed ────────────────────────────────────────
  const deleteConfirm = $state({ open: false, setNumber: null as number | null });
  function requestDeleteGroup(setNumber: number) {
    deleteConfirm.setNumber = setNumber;
    deleteConfirm.open = true;
  }
  async function confirmDeleteGroup() {
    const g = groups.find((x) => x.setNumber === deleteConfirm.setNumber);
    if (!g) return;
    const id = g.kind === "single" ? g.set.id : (g.left?.id ?? g.right?.id);
    if (id) await deleteSet(id);
  }

  // ── Swap drill ─────────────────────────────────────────────────────────────
  let swapOpen = $state(false);
  let confirmRemove = $state(false);
  let menuOpen = $state(false);
  let restPickOpen = $state(false);
  const doneSets = $derived(data.sets.filter((x) => x.completed).length);
  const allDone = $derived(data.sets.length > 0 && doneSets === data.sets.length);
  // The folded line: "2 × 8 each side", or "2 × 30 s" for holds.
  const foldedSummary = $derived.by(() => {
    if (!groups.length) return "";
    const first = data.sets[0];
    const each = data.metric === "hold" ? `${first?.durationSec ?? first?.targetSec ?? 0} s` : `${first?.reps ?? 0}`;
    return `${groups.length} × ${each}${data.perSide ? " each side" : ""}`;
  });
  const menuItems = $derived<ActionItem[]>([
    { icon: ArrowLeftRight, label: "Swap drill", onSelect: () => (swapOpen = true) },
    ...(onGroup ? [{ icon: Link2, label: "Superset or circuit with…", onSelect: () => onGroup() }] : []),
    { icon: Ruler, label: "Measure by", value: data.metric === "hold" ? "Hold" : "Reps", onSelect: () => void switchMetric(data.metric === "hold" ? "reps" : "hold") },
    { icon: Split, label: "Sides", value: data.perSide ? `Per side, ${blockLead === "right" ? "right" : "left"} first` : "Both together", onSelect: () => void togglePerSide() },
    { icon: Timer, label: "Rest after each set", value: data.restBetweenSetsMs ? fmtRest(data.restBetweenSetsMs) : "Off", onSelect: () => (restPickOpen = true) },
    ...(onReorder ? [{ icon: ArrowDownUp, label: "Change the order", onSelect: onReorder }] : []),
    { icon: Trash2, label: "Remove from this workout", destructive: true, onSelect: () => (confirmRemove = true) },
  ]);
  async function handleSwap(sel: { drillName: string; drillId?: string }) {
    const name = sel.drillName.trim();
    if (!name) return;
    try {
      await onMutate((s) => updateMobilityDrill(s, blockId, { drillName: name, drillId: sel.drillId }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't swap the drill");
    }
  }

  // ── Drill detail sheet (tap the name) — rename + per-drill lead side ──────
  let detailOpen = $state(false);
  async function handleRename(name: string) {
    await onMutate((s) => updateMobilityDrill(s, blockId, { drillName: name, drillId: data.drillId }));
  }
  async function handleLeadSideChange(side: MobilitySide | undefined) {
    await onMutate((s) => setMobilityLeadSide(s, blockId, side));
  }

  // ── Edit set sheet ─────────────────────────────────────────────────────────
  const editSet = $state({ open: false, setId: null as string | null, label: null as string | null });
  function openEdit(set: MobilitySet, label: string) {
    editSet.setId = set.id;
    editSet.label = label;
    editSet.open = true;
  }
  const editInitial = $derived.by(() => {
    const s = data.sets.find((x) => x.id === editSet.setId);
    if (!s) return null;
    return {
      side: s.side,
      durationSec: s.durationSec,
      reps: s.reps,
      loadKg: s.loadKg,
      targetSec: s.targetSec,
      depth: s.depth,
      note: s.note ?? null,
      restDurationMs: s.restDurationMs,
      leadSide: s.leadSide,
    };
  });
  async function saveEdit(patch: Partial<MobilitySet>) {
    if (!editSet.setId) return;
    await patchSet(editSet.setId, patch);
  }

  // ── Per-set-group collapse — tap "Set N" to expand/contract ────────────────
  // Keyed by the group's *stable* identity (groupKey), not its set number —
  // set number is a position, and reordering sets (or dragging the whole
  // block, which re-fetches session state) must not remap one set's
  // collapsed/expanded choice onto whichever set now sits at that position.
  //
  // SvelteMap, not a plain `$state(new Map())` — $state only deep-proxies
  // plain objects/arrays, so a raw Map's `.set()` mutates the data fine but
  // never tells the template to re-render; it only *looked* like it worked
  // once something unrelated (e.g. a reorder) forced a re-render anyway.
  const userCollapse = new SvelteMap<string, boolean>();
  function groupDone(g: MobilitySetGroup): boolean {
    return g.kind === "single" ? !!g.set.completed : !!g.left?.completed && !!g.right?.completed;
  }
  function groupResting(g: MobilitySetGroup): boolean {
    const sets = g.kind === "single" ? [g.set] : [g.left, g.right];
    return sets.some((s) => typeof s?.restStartedAtMs === "number");
  }
  // A done set folds away, but not while its rest is running: the rest bar lives inside it.
  function isGroupCollapsed(g: MobilitySetGroup): boolean {
    const explicit = userCollapse.get(groupKey(g));
    return explicit ?? (groupDone(g) && !groupResting(g));
  }
  function toggleGroup(g: MobilitySetGroup, current: boolean) {
    userCollapse.set(groupKey(g), !current);
  }

  const totalHoldSec = $derived(
    data.sets.reduce((n, s) => n + (s.completed ? s.durationSec ?? 0 : 0), 0),
  );
  const totalReps = $derived(
    data.sets.reduce((n, s) => n + (s.completed ? s.reps ?? 0 : 0), 0),
  );

  function fmtHold(s: number): string {
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
  }
  function sideSummary(set: MobilitySet | undefined): string {
    if (!set) return "–";
    if (data.metric === "hold") return set.durationSec ? `${set.durationSec}s` : "–";
    return set.reps ? `${set.reps}` : "–";
  }
  function singleSummary(set: MobilitySet): string {
    const val = sideSummary(set);
    return set.completed ? `${val} ✓` : val;
  }

  // ── Drag to reorder set groups — mirrors StrengthBlock's set drag ─────────
  let groupDragIdx = $state<number | null>(null);
  let groupDragFromIdx = $state(-1);
  let groupDragToIdx = $state(-1);
  let groupDragStartY = $state(0);
  let groupsListEl = $state<HTMLElement | null>(null);

  function liveGroupOrder(list: MobilitySetGroup[]): MobilitySetGroup[] {
    if (groupDragIdx === null || groupDragFromIdx === groupDragToIdx) return list;
    const result = [...list];
    const [item] = result.splice(groupDragFromIdx, 1);
    result.splice(groupDragToIdx, 0, item!);
    return result;
  }

  async function commitGroupDrag() {
    const from = groupDragFromIdx;
    const to = groupDragToIdx;
    groupDragIdx = null;
    groupDragFromIdx = -1;
    groupDragToIdx = -1;
    if (from === to || from === -1) return;
    await onMutate((s) => moveMobilitySetGroup(s, blockId, from, to));
  }

  // Keyed by the group's *stable* identity (not its position) — `groups` is
  // recomputed only when `data` changes (i.e. after the drag commits), so
  // looking the current index up against it stays correct through the whole
  // gesture even while the live preview below reorders the rendered list.
  function groupGripAction(node: HTMLElement, key: string) {
    let currentKey = key;

    function currentIndex(): number {
      return groups.findIndex((g) => groupKey(g) === currentKey);
    }

    function startDrag(clientY: number) {
      const idx = currentIndex();
      if (idx === -1) return false;
      groupDragIdx = idx;
      groupDragFromIdx = idx;
      groupDragToIdx = idx;
      groupDragStartY = clientY;
      return true;
    }
    function moveDrag(clientY: number) {
      if (groupDragIdx !== currentIndex()) return;
      const total = groups.length || 1;
      const rowH = groupsListEl ? groupsListEl.getBoundingClientRect().height / total : 60;
      const newIdx = Math.max(
        0,
        Math.min(total - 1, Math.round(groupDragFromIdx + (clientY - groupDragStartY) / rowH)),
      );
      if (newIdx !== groupDragToIdx) groupDragToIdx = newIdx;
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      startDrag(e.touches[0]!.clientY);
    }
    function onTouchMove(e: TouchEvent) {
      if (groupDragIdx !== currentIndex()) return;
      e.preventDefault();
      moveDrag(e.touches[0]!.clientY);
    }
    function onTouchEnd() {
      if (groupDragIdx !== currentIndex()) return;
      void commitGroupDrag();
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
      if (groupDragIdx !== currentIndex()) return;
      void commitGroupDrag();
    }

    node.addEventListener("touchstart", onTouchStart, { passive: false });
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    node.addEventListener("touchend", onTouchEnd, { passive: true });
    node.addEventListener("touchcancel", onTouchEnd, { passive: true });
    node.addEventListener("mousedown", onMouseDown);

    return {
      update(newKey: string) { currentKey = newKey; },
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

<div class={stage === "current" ? "" : round === undefined ? "border-t border-border bg-muted/20" : ""}>
  <!-- Same row as a strength exercise: every control a 44px target, swap, measuring,
       sides, rest and remove in the ⋯ sheet. -->
  <div class="flex items-center {round === undefined ? 'pl-1' : 'pl-3'} pr-1">
    {#if round === undefined}
      <button
        type="button"
        class="shrink-0 h-11 w-9 flex items-center justify-center rounded-md text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
        style="touch-action: none"
        use:gripAction
        aria-label={grouped ? "Drag to reorder within the group" : "Drag to reorder"}
        tabindex="-1"
        disabled={saving}
      >
        <GripVertical class="h-4 w-4" />
      </button>

      <button
        type="button"
        class="shrink-0 h-11 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        onclick={() => (collapsed = !collapsed)}
        disabled={saving}
        aria-label={collapsed ? "Expand" : "Collapse"}
      >
        {#if collapsed}<ChevronRight class="h-4 w-4" />{:else}<ChevronDown class="h-4 w-4" />{/if}
      </button>
    {/if}

    <button
      type="button"
      class="flex-1 min-w-0 h-11 pl-1 pr-2 text-left"
      onclick={() => (detailOpen = true)}
      disabled={saving}
      aria-label="{data.drillName} — open details"
    >
      <span class="block truncate font-semibold {stage === 'current' ? 'text-[17px]' : 'text-[15px]'}">{data.drillName}</span>
      {#if collapsed && foldedSummary}<span class="block truncate text-xs font-normal tabular-nums {allDone ? 'text-muted-foreground' : 'text-info'}">Mobility · {foldedSummary}</span>{/if}
    </button>

    <!--
      Reps used to show as a Repeat icon (⟲), which read as a second swap
      control next to ⇄. Hash (#) reads as "counted reps".
    -->
    {#if data.sets.length > 0}
      <span class="flex shrink-0 items-center gap-1 text-xs tabular-nums {allDone ? 'text-success' : 'text-muted-foreground'}">
        {#if allDone}<Check class="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />{/if}{doneSets} of {data.sets.length}
      </span>
    {/if}

    <button
      type="button"
      class="shrink-0 h-11 w-11 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-50"
      disabled={saving}
      aria-label="More actions for {data.drillName}"
      onclick={() => (menuOpen = true)}
    >
      <MoreHorizontal class="h-5 w-5" />
    </button>

    <ConfirmDialog
      title="Remove drill?"
      description="Removes this mobility drill and all its sets."
      confirmLabel="Remove"
      {saving}
      onConfirm={onDelete}
      open={confirmRemove}
      onOpenChange={(v: boolean) => (confirmRemove = v)}
    />
  </div>

  {#if !collapsed && round === undefined && suggestionLabel}
    <div class="flex items-center justify-between gap-2 px-3 pb-1 -mt-1">
      <p class="text-xs text-primary/90">{suggestionLabel}</p>
      <button type="button" class="min-h-10 shrink-0 rounded-md border border-border px-3 text-xs font-medium disabled:opacity-50"
        disabled={switching} onclick={() => void switchProgress()}>{keepsSame ? "Progress it" : "Keep it the same"}</button>
    </div>
  {/if}
  {#if !collapsed && round === undefined && next && !answered && !keepsSame}
    <MobilityNextCard {next} unitLabel={$profile.weightUnit === "lbs" ? "lb" : "kg"} loadInUnit={nextLoadInUnit}
      onAddLoad={(kg) => void nextAddLoad(kg)} onCue={() => void nextCue()} onNotYet={() => void nextNotYet()}
      onHarder={(d) => void nextHarder(d)} onPick={() => (pickOpen = true)} />
  {/if}
  {#if !collapsed && round === undefined && suggestionNotes}
    <p class="px-3 pb-1.5 text-xs text-muted-foreground">{suggestionNotes}</p>
  {/if}
  {#if !collapsed && round === undefined && (totalHoldSec > 0 || totalReps > 0)}
    <p class="px-3 pb-1.5 text-xs text-muted-foreground">
      {#if totalHoldSec > 0}Total hold {fmtHold(totalHoldSec)}{/if}
      {#if totalHoldSec > 0 && totalReps > 0}<span class="mx-1">·</span>{/if}
      {#if totalReps > 0}{totalReps} reps{/if}
    </p>
  {/if}
</div>

{#if round !== undefined}
  {@const roundGroup = groups[round]}
  {#if roundGroup}
    {@const rows = roundGroup.kind === "single"
      ? [{ s: roundGroup.set, l: undefined }]
      : roundGroup.lead === "right"
        ? [{ s: roundGroup.right, l: "R" }, { s: roundGroup.left, l: "L" }]
        : [{ s: roundGroup.left, l: "L" }, { s: roundGroup.right, l: "R" }]}
    {#each rows as row (row.l ?? "single")}
      {#if row.s}
        {@const rowSet = row.s}
        {@const rowLabel = row.l ? `Set ${roundGroup.setNumber} · ${row.l}` : `Set ${roundGroup.setNumber}`}
        <SwipeRevealRow
          disabled={saving}
          actionsWidth={80}
          onEdit={() => openEdit(rowSet, rowLabel)}
          onDelete={() => requestDeleteGroup(roundGroup.setNumber)}
        >
          <MobilitySetRow
            metric={data.metric}
            set={rowSet}
            label={row.l}
            prev={prevFor(rowSet)}
            {weightUnit}
            disabled={saving}
            onPatch={(p) => patchSet(rowSet.id, p)}
            onComplete={() => toggleComplete(rowSet)}
          />
        </SwipeRevealRow>
      {/if}
    {/each}
  {/if}
{:else if !collapsed}
  <div class="grid grid-cols-[2rem_minmax(0,1fr)_5.5rem_3.25rem_2.75rem] gap-1.5 border-t border-border/60 px-3 pb-1 pt-2 text-xs text-muted-foreground">
    <span class="text-center">#</span><span>Last</span><span class="text-center">{data.metric === "hold" ? "Seconds" : "Reps"}</span><span class="text-center">{$profile.weightUnit}</span><span></span>
  </div>
  {#if groups.length > 0}
    <div bind:this={groupsListEl}>
      {#each liveGroupOrder(groups) as group (groupKey(group))}
        {@const gc = isGroupCollapsed(group)}
        <div class="border-b border-border/60 last:border-b-0" transition:reveal>
          <div class="flex items-center gap-1 px-3 text-xs text-muted-foreground font-medium">
            <button
              type="button"
              class="shrink-0 flex items-center justify-center h-11 w-9 -ml-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
              style="touch-action: none"
              use:groupGripAction={groupKey(group)}
              aria-label="Drag to reorder set"
              data-testid="set-number"
              tabindex="-1"
              disabled={saving}
            >
              <GripVertical class="h-4 w-4" />
            </button>
            <!-- Big tap target — the whole label + collapsed summary toggles, not just the chevron. -->
            <button
              type="button"
              class="flex-1 min-w-0 min-h-11 flex items-center gap-1 hover:text-foreground text-left"
              onclick={() => toggleGroup(group, gc)}
              disabled={saving}
            >
              {#if gc}<ChevronRight class="h-3.5 w-3.5 shrink-0" />{:else}<ChevronDown class="h-3.5 w-3.5 shrink-0" />{/if}
              <span class="shrink-0">Set {group.setNumber}</span>
              {#if gc}
                <span class="normal-case tracking-normal text-foreground truncate">
                  {#if group.kind === "single"}
                    {singleSummary(group.set)}
                  {:else}
                    {group.lead === "right" ? "R" : "L"} {sideSummary(group.lead === "right" ? group.right : group.left)}
                    · {group.lead === "right" ? "L" : "R"} {sideSummary(group.lead === "right" ? group.left : group.right)}
                  {/if}
                </span>
              {/if}
            </button>
            <span class="shrink-0 flex items-center">
              <button type="button" class="h-11 w-11 -mr-2 flex items-center justify-center hover:text-destructive" disabled={saving} onclick={() => requestDeleteGroup(group.setNumber)} aria-label="Remove set"><Trash2 class="h-4 w-4" /></button>
            </span>
          </div>

          {#if !gc}
            <div transition:reveal>
              {#if group.kind === "single"}
                <SwipeRevealRow
                  disabled={saving}
                  actionsWidth={80}
                  onEdit={() => openEdit(group.set, `Set ${group.setNumber}`)}
                  onDelete={() => requestDeleteGroup(group.setNumber)}
                >
                  <MobilitySetRow
                    metric={data.metric}
                    set={group.set}
                    prev={prevFor(group.set)}
                    {weightUnit}
                    disabled={saving}
                    onPatch={(p) => patchSet(group.set.id, p)}
                    onComplete={() => toggleComplete(group.set)}
                  />
                </SwipeRevealRow>
              {:else}
                {@const ordered = group.lead === "right"
                  ? [{ s: group.right, l: "R" }, { s: group.left, l: "L" }]
                  : [{ s: group.left, l: "L" }, { s: group.right, l: "R" }]}
                {#each ordered as row (row.l)}
                  {#if row.s}
                    {@const rowSet = row.s}
                    <SwipeRevealRow
                      disabled={saving}
                      actionsWidth={80}
                      onEdit={() => openEdit(rowSet, `Set ${group.setNumber} · ${row.l}`)}
                      onDelete={() => requestDeleteGroup(group.setNumber)}
                    >
                      <MobilitySetRow
                        metric={data.metric}
                        set={rowSet}
                        label={row.l}
                        prev={prevFor(rowSet)}
                        {weightUnit}
                        disabled={saving}
                        onPatch={(p) => patchSet(rowSet.id, p)}
                        onComplete={() => toggleComplete(rowSet)}
                      />
                    </SwipeRevealRow>
                  {/if}
                {/each}
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
  <div class="flex flex-wrap gap-2 px-3 pt-2 pb-3">
    <button type="button" class={addButton} disabled={saving} onclick={addSet}>
      <Plus class="h-3.5 w-3.5" /> {groups.length ? "Add a set" : "Add first set"}
    </button>
  </div>
{/if}

<ActionSheet
  open={menuOpen}
  onOpenChange={(v) => (menuOpen = v)}
  title={data.drillName}
  subtitle="Mobility · {data.metric === 'hold' ? 'timed hold' : 'reps'}{data.perSide ? ' each side' : ''}"
  items={menuItems}
/>

<RestPickerSheet
  open={restPickOpen}
  onOpenChange={(v) => (restPickOpen = v)}
  title="Rest after each set"
  subtitle={data.drillName}
  valueMs={data.restBetweenSetsMs ?? 60_000}
  onSave={(ms) => void onMutate((s) => setMobilityRestBetweenSets(s, blockId, ms > 0 ? ms : undefined))}
/>

<EditMobilitySetDialog
  open={editSet.open}
  disabled={saving}
  metric={data.metric}
  perSide={data.perSide}
  {weightUnit}
  label={editSet.label}
  blockLeadSide={blockLead}
  blockRestMs={data.restBetweenSetsMs}
  initial={editInitial}
  onOpenChange={(v) => (editSet.open = v)}
  onSave={saveEdit}
/>

<AddMobilityDialog
  open={swapOpen}
  saving={saving}
  mode="swap"
  title="Swap drill"
  description="Pick a different drill — your logged sets stay."
  submitLabel="Swap"
  onOpenChange={(v) => (swapOpen = v)}
  onSubmit={handleSwap}
/>

<AddMobilityDialog
  open={pickOpen}
  saving={saving}
  mode="swap"
  title="What's next after {data.drillName}?"
  description="Pick what you'd do next. It's remembered as this drill's next step."
  submitLabel="Use this one"
  onOpenChange={(v) => (pickOpen = v)}
  onSubmit={nextPicked}
/>

<MobilityDrillDetailSheet
  target={detailOpen ? { drillName: data.drillName, drillId: data.drillId, metric: data.metric, perSide: data.perSide } : null}
  onClose={() => (detailOpen = false)}
  onRename={handleRename}
  onLeadSideChange={handleLeadSideChange}
/>

<ConfirmDialog
  open={deleteConfirm.open}
  onOpenChange={(v) => (deleteConfirm.open = v)}
  title="Remove set?"
  description={data.perSide ? "Removes this set — both sides — from the drill." : "Removes this set from the drill."}
  confirmLabel="Remove"
  {saving}
  onConfirm={confirmDeleteGroup}
/>
