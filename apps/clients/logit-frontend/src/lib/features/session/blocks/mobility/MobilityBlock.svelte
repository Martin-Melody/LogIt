<script lang="ts">
  import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight, Timer, Hash, ArrowLeftRight } from "lucide-svelte";
  import { get } from "svelte/store";
  import { SvelteMap } from "svelte/reactivity";
  import { Button } from "$lib/components/ui/button";
  import { toast } from "$lib/components/ui/sonner/index";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import { profile } from "$lib/stores/profile.store";
  import { reveal } from "$lib/transitions";
  import { startRestTimer, cancelRestTimer, hasRestTimerFired } from "$lib/services/restTimerService";
  import type { WeightUnit } from "@logit/core/domain/units";
  import type { MobilityBlockData, MobilitySet, MobilitySetGroup, MobilitySide } from "@logit/core/domain/workout";
  import {
    addMobilitySet,
    removeMobilitySet,
    updateMobilitySet,
    updateMobilityDrill,
    setMobilityMetric,
    setMobilityPerSide,
    setMobilityRestBetweenSets,
    setMobilityLeadSide,
    moveMobilitySetGroup,
    mobilitySetGroups,
  } from "@logit/core/domain/workout";
  import type { BlockBaseProps } from "$lib/features/session/blocks/types";
  import { getMobilitySuggestion } from "@logit/core/usecases/progression/getMobilitySuggestion";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import MobilitySetRow from "$lib/features/session/ui/MobilitySetRow.svelte";
  import SwipeRevealRow from "$lib/features/session/ui/SwipeRevealRow.svelte";
  import RestProgressBar from "$lib/features/session/ui/RestProgressBar.svelte";
  import EditMobilitySetDialog from "$lib/features/session/ui/EditMobilitySetDialog.svelte";
  import AddMobilityDialog from "$lib/features/session/ui/AddMobilityDialog.svelte";
  import MobilityDrillDetailSheet from "$lib/features/session/ui/MobilityDrillDetailSheet.svelte";

  const { blockId, data, saving, gripAction, onDelete, onMutate }: BlockBaseProps<MobilityBlockData> =
    $props();

  let collapsed = $state(get(profile).blocksCollapsedByDefault);
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
    };
    void getMobilitySuggestion(drill, getProgressionDeps())
      .then((out) => {
        if (!out) return;
        suggestionLabel = out.label ?? null;
        suggestionNotes = out.notes ?? null;
        suggestedSets = out.sets ?? [];
        void maybePrefillTargets(out.sets ?? []);
      })
      .catch(() => {});
  });

  // Prefill hold targets on a fresh, untouched block so the timer has a goal.
  async function maybePrefillTargets(sug: SuggestSet[]) {
    if (data.metric !== "hold") return;
    const untouched = data.sets.every(
      (s) => !s.durationSec && !s.reps && !s.completed && (s.targetSec ?? null) === null,
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
    });
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
    cancelRestTimer(setId);
    await onMutate((s) => removeMobilitySet(s, blockId, setId));
  }
  async function toggleComplete(set: MobilitySet) {
    const wasCompleted = !!set.completed;
    const rest = effectiveRestMs(set);
    const startsRest = !wasCompleted && rest > 0;
    await onMutate((s) =>
      updateMobilitySet(s, blockId, set.id, {
        completed: !wasCompleted,
        restStartedAtMs: startsRest ? Date.now() : null,
      }),
    );
    if (startsRest) startRestTimer(set.id, rest);
    else cancelRestTimer(set.id);
  }
  async function handleRestDone(setId: string) {
    const alreadyToasted = hasRestTimerFired(setId);
    cancelRestTimer(setId);
    if (!alreadyToasted) toast("Rest complete — next set!");
    await patchSet(setId, { restStartedAtMs: null });
  }
  async function handleDismissRest(setId: string) {
    cancelRestTimer(setId);
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
  function isGroupCollapsed(g: MobilitySetGroup): boolean {
    const explicit = userCollapse.get(groupKey(g));
    return explicit ?? groupDone(g);
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

<div class="border-t border-border bg-muted/20">
  <div class="flex items-center gap-2 px-3 py-2">
    <button
      type="button"
      class="shrink-0 h-7 w-7 flex items-center justify-center rounded text-muted-foreground cursor-grab active:cursor-grabbing"
      style="touch-action: none"
      use:gripAction
      aria-label="Drag to reorder"
      tabindex="-1"
      disabled={saving}
    >
      <GripVertical class="h-3.5 w-3.5" />
    </button>

    <button
      type="button"
      class="shrink-0 h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
      onclick={() => (collapsed = !collapsed)}
      disabled={saving}
      aria-label={collapsed ? "Expand" : "Collapse"}
    >
      {#if collapsed}<ChevronRight class="h-3.5 w-3.5" />{:else}<ChevronDown class="h-3.5 w-3.5" />{/if}
    </button>

    <button
      type="button"
      class="flex-1 min-w-0 text-left"
      onclick={() => (detailOpen = true)}
      disabled={saving}
      aria-label="{data.drillName} — open details"
    >
      <span class="text-sm font-semibold truncate block">{data.drillName}</span>
    </button>

    <!--
      Reps used to show as a Repeat icon (⟲) here — right next to the swap
      button's ArrowLeftRight (⇄), two "double arrow" glyphs read as two swap
      controls at a glance. Hash (#) reads unambiguously as "counted reps"
      instead, and doesn't fight with the swap icon beside it.
    -->
    <span class="shrink-0 text-muted-foreground" title={data.metric === "hold" ? "Timed hold" : "Reps"}>
      {#if data.metric === "hold"}<Timer class="h-3.5 w-3.5" />{:else}<Hash class="h-3.5 w-3.5" />{/if}
    </span>

    <button
      type="button"
      class="shrink-0 h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
      onclick={() => (swapOpen = true)}
      disabled={saving}
      aria-label="Swap drill"
      title="Swap drill"
    >
      <ArrowLeftRight class="h-3.5 w-3.5" />
    </button>

    {#if !collapsed}
      <Button size="icon" class="h-7 w-7 shrink-0" onclick={addSet} disabled={saving} aria-label="Add set">
        <Plus class="h-3.5 w-3.5" />
      </Button>
    {/if}

    <ConfirmDialog
      title="Remove drill?"
      description="Removes this mobility drill and all its sets."
      confirmLabel="Remove"
      {saving}
      onConfirm={onDelete}
    >
      {#snippet child({ props })}
        <Button {...props} size="icon" variant="ghost" class="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" disabled={saving} aria-label="Delete">
          <Trash2 class="h-3.5 w-3.5" />
        </Button>
      {/snippet}
    </ConfirmDialog>
  </div>

  {#if !collapsed && suggestionLabel}
    <p class="px-3 pb-1 -mt-1 text-xs text-primary/90">{suggestionLabel}</p>
  {/if}
  {#if !collapsed && suggestionNotes}
    <p class="px-3 pb-1.5 text-xs text-muted-foreground">{suggestionNotes}</p>
  {/if}
  {#if !collapsed && (totalHoldSec > 0 || totalReps > 0)}
    <p class="px-3 pb-1.5 text-xs text-muted-foreground">
      {#if totalHoldSec > 0}Total hold {fmtHold(totalHoldSec)}{/if}
      {#if totalHoldSec > 0 && totalReps > 0}<span class="mx-1">·</span>{/if}
      {#if totalReps > 0}{totalReps} reps{/if}
    </p>
  {/if}
</div>

{#if !collapsed}
  <div class="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-border text-xs">
    <div class="flex rounded border border-border overflow-hidden">
      <button type="button" class="px-2 py-0.5 {data.metric === 'hold' ? 'bg-primary/10 text-foreground' : 'text-muted-foreground'}" disabled={saving} onclick={() => switchMetric("hold")}>Hold</button>
      <button type="button" class="px-2 py-0.5 border-l border-border {data.metric === 'reps' ? 'bg-primary/10 text-foreground' : 'text-muted-foreground'}" disabled={saving} onclick={() => switchMetric("reps")}>Reps</button>
    </div>
    <button
      type="button"
      class="rounded border px-2 py-0.5 {data.perSide ? 'border-primary text-primary' : 'border-border text-muted-foreground'}"
      disabled={saving}
      onclick={togglePerSide}
    >
      {data.perSide ? `Per side: ${blockLead === "right" ? "R / L" : "L / R"}` : "Both sides together"}
    </button>
    <button
      type="button"
      class="rounded border px-2 py-0.5 {data.restBetweenSetsMs ? 'border-primary text-primary' : 'border-border text-muted-foreground'}"
      disabled={saving}
      onclick={cycleRest}
      title="Rest after each set / side"
    >
      Rest {data.restBetweenSetsMs ? fmtRest(data.restBetweenSetsMs) : "off"}
    </button>
  </div>

  {#if groups.length > 0}
    <div bind:this={groupsListEl}>
      {#each liveGroupOrder(groups) as group (groupKey(group))}
        {@const gc = isGroupCollapsed(group)}
        <div class="border-b border-border/60 last:border-b-0" transition:reveal>
          <div class="flex items-center gap-1 px-3 text-[10px] uppercase tracking-wide text-muted-foreground">
            <button
              type="button"
              class="shrink-0 flex items-center justify-center h-8 w-6 -ml-1 cursor-grab active:cursor-grabbing text-muted-foreground/70 hover:text-foreground"
              style="touch-action: none"
              use:groupGripAction={groupKey(group)}
              aria-label="Drag to reorder set"
              tabindex="-1"
              disabled={saving}
            >
              <GripVertical class="h-3 w-3" />
            </button>
            <!-- Big tap target — the whole label + collapsed summary toggles, not just the chevron. -->
            <button
              type="button"
              class="flex-1 min-w-0 flex items-center gap-1 py-2 hover:text-foreground text-left"
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
              <button type="button" class="h-8 px-1.5 flex items-center hover:text-destructive" disabled={saving} onclick={() => requestDeleteGroup(group.setNumber)} aria-label="Remove set"><Trash2 class="h-3.5 w-3.5" /></button>
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
                {#if typeof group.set.restStartedAtMs === "number"}
                  <div transition:reveal>
                    <RestProgressBar
                      restStartedAtMs={group.set.restStartedAtMs}
                      restDurationMs={effectiveRestMs(group.set) || 60_000}
                      onDone={() => handleRestDone(group.set.id)}
                      onDismiss={() => handleDismissRest(group.set.id)}
                    />
                  </div>
                {/if}
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
                    {#if typeof rowSet.restStartedAtMs === "number"}
                      <div transition:reveal>
                        <RestProgressBar
                          restStartedAtMs={rowSet.restStartedAtMs}
                          restDurationMs={effectiveRestMs(rowSet) || 60_000}
                          onDone={() => handleRestDone(rowSet.id)}
                          onDismiss={() => handleDismissRest(rowSet.id)}
                        />
                      </div>
                    {/if}
                  {/if}
                {/each}
              {/if}
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
      onclick={addSet}
    >
      + Add first set
    </button>
  {/if}
{/if}

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
