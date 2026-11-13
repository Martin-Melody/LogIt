<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { back } from "$lib/navigation";

  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";

  import type { WorkoutSplit, SplitDay } from "@logit/core/domain/WorkoutSplit";
  import { touchSplit, plannedBlockName } from "@logit/core/domain/WorkoutSplit";

  import { splits } from "$lib/stores/splits.store";
  import { activeSplit } from "$lib/stores/activeSplit.store";

  import { getSplit } from "$lib/usecases/Splits/getSplit";
  import { saveSplit } from "$lib/usecases/Splits/saveSplit";
  import { deleteSplit } from "$lib/usecases/Splits/deleteSplit";
  import { createId } from "@logit/core/domain/ids";

  import { Trash, Check, X, Plus, GripVertical, Play, Ellipsis, Copy, Moon, CalendarPlus, Trash2 } from "lucide-svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { segment, segmentTrack } from "$lib/components/ui/choice";
  import { cn } from "$lib/utils.js";
  import {
    addRestDay,
    duplicateDay,
    removeDay,
    setDayWeekday,
    setSameDayAsPrevious,
    setScheduleMode,
    splitDayName,
    splitDayTitle,
    suggestWeekdays,
    WEEKDAY_SHORT,
  } from "@logit/core/domain/splitSchedule";
  import { startSplitDetailTour } from "$lib/tour/index";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import { reveal, popIn } from "$lib/transitions";
  import type { PlannedBlock } from "@logit/core/domain/WorkoutSplit";
  import { currentSession } from "$lib/stores/currentSession.store";

  let pendingStartDay = $state<SplitDay | null>(null);
  let pendingRemoveDay = $state<SplitDay | null>(null);

  async function startDay(d: SplitDay, replace = false) {
    if (d.blocks.length === 0) return;
    const params = new URLSearchParams({ split: splitId, day: d.id });
    if (replace) params.set("replace", "1");
    await goto(`/session/plan?${params}`);
  }

  function dayPreview(blocks: PlannedBlock[]): string {
    if (blocks.length === 0) return "Empty";
    const names = [...blocks]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(plannedBlockName);
    const shown = names.slice(0, 3).join(" · ");
    return names.length > 3 ? `${shown} +${names.length - 3}` : shown;
  }

  const props = $props<{ params: { id: string } }>();
  const splitId = $derived(props.params.id);

  const ui = $state({
    loading: true,
    saving: false,
    error: null as string | null,
    renaming: false,
    nameDraft: "",
  });

  let split = $state<WorkoutSplit | null>(null);
  let nameInput = $state<HTMLInputElement | null>(null);

  function sortDays(days: SplitDay[]): SplitDay[] {
    return [...days].sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      const s = await getSplit(splitId);
      split = s;
      ui.nameDraft = s?.name ?? "";
      await activeSplit.load();
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load split";
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
      await splits.refresh({ limit: 50, sortBy: "updated", order: "desc" });
      await activeSplit.load();
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to save";
    } finally {
      ui.saving = false;
    }
  }

  function startRename() {
    if (!split) return;
    ui.nameDraft = split.name;
    ui.renaming = true;
    queueMicrotask(() => nameInput?.focus());
  }

  async function commitRename() {
    if (!split) return;
    const name = ui.nameDraft.trim() || "New Split";
    ui.renaming = false;
    if (name === split.name) return;
    await persist({ ...split, name });
  }

  function cancelRename() {
    ui.renaming = false;
    ui.nameDraft = split?.name ?? "";
  }

  async function addDay() {
    if (!split) return;
    const nextOrder =
      split.days.length === 0
        ? 0
        : Math.max(...split.days.map((d) => d.orderIndex)) + 1;
    const workoutNo = split.days.filter((d) => !d.rest).length + 1;
    const next: WorkoutSplit = {
      ...split,
      days: [
        ...split.days,
        { id: createId("day"), orderIndex: nextOrder, name: `Day ${workoutNo}`, blocks: [] },
      ],
    };
    await persist(next);
  }

  async function addRest() {
    if (!split) return;
    await persist(addRestDay(split));
  }

  async function duplicate(d: SplitDay) {
    if (!split) return;
    await persist(duplicateDay(split, d.id).split);
  }

  async function remove(d: SplitDay) {
    if (!split) return;
    await persist(removeDay(split, d.id));
  }

  async function toggleSameDay(d: SplitDay) {
    if (!split) return;
    await persist(setSameDayAsPrevious(split, d.id, !d.sameDayAsPrevious));
  }

  async function pickWeekday(d: SplitDay, weekday: number | null) {
    if (!split) return;
    await persist(setDayWeekday(split, d.id, weekday));
  }

  async function setMode(mode: "rotation" | "weekdays") {
    if (!split || (split.schedule ?? "rotation") === mode) return;
    let next = setScheduleMode(split, mode);
    // First time on weekdays: a starting guess (Mon, Tue… skipping rest days) to adjust.
    if (mode === "weekdays" && !split.days.some((d) => d.weekday != null)) next = suggestWeekdays(next);
    await persist(next);
  }

  // Mon first, the way a training week reads.
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  /** The rows shown: by weekday, rest days are hidden (kept for switching back). */
  function visibleDays(s: WorkoutSplit): SplitDay[] {
    const sorted = sortDays(s.days);
    return s.schedule === "weekdays" ? sorted.filter((d) => !d.rest) : sorted;
  }

  /** "Mon Upper · Tue Lower · …" with the free days, for the weekday overview. */
  function weekOverview(days: SplitDay[]): { wd: number; names: string[] }[] {
    return WEEK_ORDER.map((wd) => ({
      wd,
      names: sortDays(days).filter((d) => !d.rest && d.weekday === wd).map((d) => splitDayName({ days }, d)),
    }));
  }

  async function setActive() {
    if (!split) return;
    ui.error = null;
    try {
      await splits.setActive(split.id);
      await activeSplit.load();
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to set active";
    }
  }

  async function deleteThisSplit() {
    if (!split) return;
    ui.saving = true;
    ui.error = null;
    try {
      await deleteSplit(split.id);
      await splits.refresh({ limit: 50, sortBy: "updated", order: "desc" });
      await activeSplit.load();
      back("/splits");
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to delete split";
    } finally {
      ui.saving = false;
    }
  }

  // ── Day drag-to-reorder ───────────────────────────────────────────────────

  let listEl = $state<HTMLUListElement | null>(null);
  let dragId = $state<string | null>(null);
  let dragFromIdx = $state(-1);
  let dragToIdx = $state(-1);
  let dragStartY = $state(0);

  function liveDayOrder(sorted: SplitDay[]): SplitDay[] {
    if (dragId === null || dragFromIdx === dragToIdx) return sorted;
    const result = [...sorted];
    const [item] = result.splice(dragFromIdx, 1);
    result.splice(dragToIdx, 0, item!);
    return result;
  }

  async function commitDayDrag() {
    const from = dragFromIdx;
    const to = dragToIdx;
    dragId = null;
    dragFromIdx = -1;
    dragToIdx = -1;
    if (!split || from === to || from === -1) return;

    // Reorder the visible rows, then put them back into the slots they held, so hidden
    // rest days (weekday mode) stay where they were.
    const sorted = sortDays(split.days);
    const visible = visibleDays(split);
    const moved = [...visible];
    const [item] = moved.splice(from, 1);
    moved.splice(to, 0, item!);
    const slots = sorted.map((d, i) => (visible.some((v) => v.id === d.id) ? i : -1)).filter((i) => i >= 0);
    const reordered = [...sorted];
    slots.forEach((slot, k) => (reordered[slot] = moved[k]!));

    const next: WorkoutSplit = {
      ...split,
      days: split.days.map((d) => {
        const newIdx = reordered.findIndex((r) => r.id === d.id);
        return newIdx !== -1 ? { ...d, orderIndex: newIdx } : d;
      }),
    };
    await persist(next);
  }

  async function hapticLight() {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
  }

  function dayGripAction(node: HTMLElement, dayId: string) {
    function startDrag(clientY: number) {
      const idx = split ? visibleDays(split).findIndex((d) => d.id === dayId) : -1;
      if (idx === -1) return false;
      dragId = dayId;
      dragFromIdx = idx;
      dragToIdx = idx;
      dragStartY = clientY;
      void hapticLight();
      return true;
    }

    function moveDrag(clientY: number) {
      if (dragId !== dayId) return;
      const total = split ? Math.max(1, visibleDays(split).length) : 1;
      const rowH = listEl ? listEl.getBoundingClientRect().height / total : 56;
      const newIdx = Math.max(0, Math.min(total - 1, Math.round(dragFromIdx + (clientY - dragStartY) / rowH)));
      if (newIdx !== dragToIdx) dragToIdx = newIdx;
    }

    function onTouchStart(e: TouchEvent) {
      if (ui.saving || e.touches.length !== 1) return;
      e.preventDefault();
      startDrag(e.touches[0]!.clientY);
    }
    function onTouchMove(e: TouchEvent) {
      if (dragId !== dayId) return;
      e.preventDefault();
      moveDrag(e.touches[0]!.clientY);
    }
    function onTouchEnd() {
      if (dragId !== dayId) return;
      void commitDayDrag();
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
      if (dragId !== dayId) return;
      void commitDayDrag();
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
    void load().then(() => startSplitDetailTour());
  });
</script>

<div class="flex flex-col pb-24">
  <!-- Header -->
  <PageHeader>
    <BackButton onclick={() => back("/splits")} />

    {#if ui.renaming}
      <input
        bind:this={nameInput}
        class="flex-1 min-w-0 bg-transparent text-base font-semibold focus:outline-none border-b border-primary"
        bind:value={ui.nameDraft}
        disabled={ui.saving}
        onkeydown={(e) => {
          if (e.key === "Enter") void commitRename();
          if (e.key === "Escape") cancelRename();
        }}
        onblur={() => void commitRename()}
      />
      <Button variant="ghost" size="icon" class="shrink-0" onclick={cancelRename}>
        <X class="h-3.5 w-3.5" />
      </Button>
      <Button size="icon" class="shrink-0" onclick={() => void commitRename()}>
        <Check class="h-3.5 w-3.5" />
      </Button>
    {:else}
      <button
        type="button"
        class="flex-1 min-w-0 flex items-center gap-2 text-left"
        onclick={startRename}
        disabled={ui.loading || ui.saving}
        data-tour="split-detail-name"
      >
        <span class="text-sm font-semibold truncate">
          {split?.name ?? "Split"}
        </span>
        {#if split && $activeSplit?.id === split.id}
          <Badge variant="secondary" class="text-xs px-1.5 py-0 shrink-0">Active</Badge>
        {/if}
      </button>

      <div class="flex items-center gap-1 shrink-0">
        {#if split && $activeSplit?.id !== split.id}
          <Button
            variant="outline"
            class="h-7 px-2 text-xs"
            disabled={ui.saving}
            onclick={() => void setActive()}
            data-tour="split-detail-set-active"
          >
            Set active
          </Button>
        {/if}

        <ConfirmDialog
          title="Delete this split?"
          description="Permanently removes the split and all its days. Cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          saving={ui.saving}
          onConfirm={deleteThisSplit}
        >
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon" class="text-destructive" disabled={!split || ui.saving}>
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

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if !split}
    <p class="px-3 py-4 text-sm text-muted-foreground">Split not found.</p>
  {:else}
    {@const byWeekday = split.schedule === "weekdays"}
    <!-- How the days fall on the calendar -->
    <div class="flex flex-col gap-2 px-3 pt-3 pb-2">
      <div class={cn(segmentTrack, "w-full")}>
        <button type="button" class={segment(!byWeekday)} aria-pressed={!byWeekday} disabled={ui.saving} onclick={() => void setMode("rotation")}>In order</button>
        <button type="button" class={segment(byWeekday)} aria-pressed={byWeekday} disabled={ui.saving} onclick={() => void setMode("weekdays")}>By weekday</button>
      </div>
      <p class="text-xs text-muted-foreground">
        {#if byWeekday}
          Each day has a weekday. Days with nothing on them are rest days.
        {:else}
          One day after another, whenever you train. Add rest days to space them out.
        {/if}
      </p>
      {#if byWeekday && split.days.length > 0}
        <div class="grid grid-cols-7 gap-1 pt-1">
          {#each weekOverview(split.days) as w (w.wd)}
            <div class="flex min-w-0 flex-col items-center gap-0.5 rounded-md px-0.5 py-1.5 {w.names.length ? 'bg-info/10' : 'bg-muted/60'}">
              <span class="text-[10px] font-semibold {w.names.length ? 'text-info' : 'text-muted-foreground'}">{WEEKDAY_SHORT[w.wd]}</span>
              <span class="w-full text-center text-[10px] leading-tight break-words {w.names.length ? 'text-foreground' : 'text-muted-foreground'}">
                {w.names.length ? w.names.join(" + ") : "Rest"}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Days section header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-border" data-tour="split-detail-days">
      <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Days · {split.days.filter((d) => !d.rest).length}
      </span>
      <div class="flex items-center gap-1">
        {#if !byWeekday}
          <Button
            variant="ghost"
            class="h-7 px-2 text-xs gap-1"
            disabled={ui.saving}
            onclick={() => void addRest()}
          >
            <Moon class="h-3 w-3" />
            Add rest day
          </Button>
        {/if}
        <Button
          variant="ghost"
          class="h-7 px-2 text-xs gap-1"
          disabled={ui.saving}
          onclick={() => void addDay()}
          data-tour="split-detail-add-day"
        >
          <Plus class="h-3 w-3" />
          Add day
        </Button>
      </div>
    </div>

    {#if split.days.length === 0}
      <div class="px-3 py-12 flex flex-col items-center gap-3 text-center">
        <p class="text-sm text-muted-foreground">No days yet.</p>
        <Button variant="outline" onclick={() => void addDay()}>Add first day</Button>
      </div>
    {:else}
      {@const ordered = liveDayOrder(visibleDays(split))}
      <ul bind:this={listEl} class="divide-y divide-border">
        {#each ordered as d, i (d.id)}
          {@const isDragging = dragId === d.id}
          {@const prevDay = i > 0 ? ordered[i - 1] : null}
          {@const title = byWeekday ? splitDayName(split, d) : splitDayTitle(split, d)}
          {@const sameDay = !byWeekday && !!d.sameDayAsPrevious && !d.rest}
          <li
            class="relative flex items-center transition-colors {isDragging ? 'opacity-50' : ''} {d.rest ? 'bg-muted/40' : ''}"
            in:popIn={{ duration: 200, delay: Math.min(i * 30, 200) }}
          >
            <button
              type="button"
              class="shrink-0 flex items-center gap-1 pl-3 pr-2 self-stretch cursor-grab active:cursor-grabbing"
              style="touch-action: none;"
              use:dayGripAction={d.id}
              aria-label="Drag to reorder"
              tabindex="-1"
              disabled={ui.saving}
            >
              <GripVertical class="h-4 w-4 text-muted-foreground" />
            </button>

            {#if d.rest}
              <div class="flex-1 min-w-0 flex items-center gap-2 py-3 pr-3 text-muted-foreground">
                <Moon class="h-4 w-4" />
                <p class="text-sm">Rest day</p>
              </div>
            {:else}
              {#if byWeekday}
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger
                    class="shrink-0 mr-2.5 h-8 w-12 rounded-full border text-xs font-semibold {d.weekday != null ? 'border-info/40 bg-info/10 text-info' : 'border-dashed border-border text-muted-foreground'}"
                    disabled={ui.saving}
                    aria-label="Weekday for {title}: {d.weekday != null ? WEEKDAY_LONG[d.weekday] : 'not set'}"
                  >
                    {d.weekday != null ? WEEKDAY_SHORT[d.weekday] : "Day?"}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="start" class="w-[300px] p-3">
                    <p class="pb-2 text-xs font-semibold text-muted-foreground">{title} is on</p>
                    <div class="grid grid-cols-7 gap-1">
                      {#each WEEK_ORDER as wd (wd)}
                        <DropdownMenu.Item
                          class="h-10 justify-center rounded-md border px-0 text-xs {d.weekday === wd ? 'border-transparent bg-primary font-semibold text-primary-foreground data-highlighted:bg-primary data-highlighted:text-primary-foreground' : 'border-border font-medium'}"
                          onSelect={() => void pickWeekday(d, wd)}
                        >
                          {WEEKDAY_SHORT[wd]}
                        </DropdownMenu.Item>
                      {/each}
                    </div>
                    <p class="pt-2 text-[11px] text-muted-foreground">Two days on the same weekday = two workouts that day.</p>
                    <DropdownMenu.Item class="mt-1 h-9 px-0 text-muted-foreground" onSelect={() => void pickWeekday(d, null)}>
                      No set day
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              {/if}
              <button
                type="button"
                class="flex-1 min-w-0 flex items-center gap-3 py-3 pr-2 text-left hover:bg-muted/40 active:bg-muted/60 transition-colors {sameDay ? 'ml-1 pl-3 border-l-2 border-border' : ''}"
                onclick={() => void goto(`/splits/${splitId}/days/${d.id}`)}
              >
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium">{title}</p>
                  <p class="text-xs text-muted-foreground mt-0.5 truncate">
                    {#if sameDay && prevDay}<span class="font-medium text-info">Same day as {splitDayName(split, prevDay)}</span>{" · "}{/if}{dayPreview(d.blocks)}
                  </p>
                </div>
              </button>
              {#if d.blocks.length > 0}
                <button
                  type="button"
                  class="shrink-0 flex items-center gap-1 rounded-full border border-primary/40 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                  disabled={ui.saving}
                  aria-label="Start a workout from {title}"
                  onclick={() => {
                    if ($currentSession) pendingStartDay = d;
                    else void startDay(d);
                  }}
                >
                  <Play class="h-3 w-3" fill="currentColor" /> Start
                </button>
              {/if}
            {/if}

            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                class="shrink-0 mx-1 h-11 w-10 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground data-[state=open]:bg-muted disabled:opacity-50"
                disabled={ui.saving}
                aria-label="More for {title}"
              >
                <Ellipsis class="h-4 w-4" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content class="w-[240px]">
                {#if !d.rest}
                  <DropdownMenu.Item onSelect={() => void duplicate(d)}>
                    <Copy /> Duplicate day
                  </DropdownMenu.Item>
                  {#if !byWeekday && prevDay}
                    <DropdownMenu.Item class="h-auto min-h-11 py-1.5" disabled={!!prevDay.rest} onSelect={() => void toggleSameDay(d)}>
                      <CalendarPlus />
                      <span class="flex flex-col">
                        <span>{d.sameDayAsPrevious ? "Make it its own day" : "Same day as the one above"}</span>
                        {#if prevDay.rest}<span class="text-[11px] text-muted-foreground">Not after a rest day</span>{/if}
                      </span>
                    </DropdownMenu.Item>
                  {/if}
                  <div class="my-1 h-px bg-border"></div>
                {/if}
                <DropdownMenu.Item variant="destructive" onSelect={() => (pendingRemoveDay = d)}>
                  <Trash2 /> {d.rest ? "Remove rest day" : "Delete day"}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<ConfirmDialog
  open={pendingStartDay !== null}
  onOpenChange={(v) => { if (!v) pendingStartDay = null; }}
  title="Replace your current workout?"
  description="You have an unfinished workout. Starting this day will discard it."
  confirmLabel="Start this day"
  cancelLabel="Keep current"
  onConfirm={async () => {
    const d = pendingStartDay;
    pendingStartDay = null;
    if (d) await startDay(d, true);
  }}
/>

<ConfirmDialog
  open={pendingRemoveDay !== null}
  onOpenChange={(v) => { if (!v) pendingRemoveDay = null; }}
  title={pendingRemoveDay?.rest ? "Remove this rest day?" : "Delete this day?"}
  description={pendingRemoveDay?.rest ? "The days after it move up one." : "Removes the day and its exercises from the split. Past workouts stay."}
  confirmLabel={pendingRemoveDay?.rest ? "Remove" : "Delete"}
  cancelLabel="Cancel"
  onConfirm={async () => {
    const d = pendingRemoveDay;
    pendingRemoveDay = null;
    if (d) await remove(d);
  }}
/>
