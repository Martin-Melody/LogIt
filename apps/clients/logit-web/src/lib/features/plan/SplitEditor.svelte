<script lang="ts">
  import { Separator } from "$lib/components/ui/separator/index.js";
  import {
    addDay,
    renameSplit,
    touchSplit,
    type SplitDay,
    type WorkoutSplit,
  } from "@logit/core/domain/WorkoutSplit";
  import {
    addRestDay,
    duplicateDay,
    rotationSlots,
    setDayWeekday,
    setScheduleMode,
    sortedDays,
    splitDayName,
    suggestWeekdays,
  } from "@logit/core/domain/splitSchedule";
  import { LOW_WEEKLY_SETS, MAIN_MUSCLES, plannedSetsByMuscle } from "@logit/core/domain/splitVolume";
  import type { MuscleGroup } from "@logit/core/domain/exercise";
  import type { WeightUnit } from "@logit/core/domain/units";
  import type { ExerciseIndex } from "./exerciseIndex";
  import DayEditor from "./DayEditor.svelte";
  import { flip } from "svelte/animate";
  import { createReorder, SLIDE_MS } from "$lib/reorder.svelte";

  /**
   * A whole split: its name, how it falls on the calendar (weekdays or a rotation), the
   * week laid out in one view, hard sets per muscle, and the selected day's editor.
   */
  let {
    split,
    index,
    unit,
    onChange,
  }: {
    split: WorkoutSplit;
    index: ExerciseIndex;
    unit: WeightUnit;
    onChange: (next: WorkoutSplit) => void;
  } = $props();

  const byWeekday = $derived(split.schedule === "weekdays");
  const days = $derived(sortedDays(split));
  let selectedId = $state<string | null>(null);
  const selected = $derived(days.find((d) => d.id === selectedId) ?? days.find((d) => !d.rest) ?? days[0] ?? null);

  // A different split: start on its first workout.
  let lastSplitId = "";
  $effect(() => {
    if (split.id !== lastSplitId) {
      lastSplitId = split.id;
      selectedId = null;
    }
  });

  const COLUMNS = [
    { n: 1, label: "Mon" }, { n: 2, label: "Tue" }, { n: 3, label: "Wed" }, { n: 4, label: "Thu" },
    { n: 5, label: "Fri" }, { n: 6, label: "Sat" }, { n: 0, label: "Sun" },
  ];
  const workouts = $derived(days.filter((d) => !d.rest));
  const unplaced = $derived(workouts.filter((d) => d.weekday == null));

  function dayLine(d: SplitDay): string {
    const n = d.blocks.length;
    const sets = d.blocks.reduce((t, b) => {
      if (b.type === "cardio") return t;
      const g = b.groupId ? d.groups?.find((x) => x.id === b.groupId) : undefined;
      return t + (g?.rounds ?? b.targets?.sets ?? 0);
    }, 0);
    return n === 0 ? "Empty" : `${n} exercise${n === 1 ? "" : "s"} · ${sets} sets`;
  }

  // ── Schedule ────────────────────────────────────────────────────────────────
  function setMode(mode: "weekdays" | "rotation") {
    if ((mode === "weekdays") === byWeekday) return;
    // Like the phone: switching to weekdays places the days from Monday to adjust from.
    onChange(mode === "weekdays" ? suggestWeekdays(setScheduleMode(split, "weekdays")) : setScheduleMode(split, "rotation"));
  }

  function addWorkout(weekday?: number) {
    let next = addDay(split);
    const created = next.days.at(-1)!;
    if (weekday != null) next = setDayWeekday(next, created.id, weekday);
    onChange(next);
    selectedId = created.id;
  }

  // ── Drag: weekdays move a workout to another day (Alt copies); rotation reorders ──
  // Both show where it lands while it's held; nothing changes until it's let go.
  let dragId = $state<string | null>(null);
  let overWeekday = $state<number | null>(null);
  let copying = $state(false);
  const dragged = $derived(dragId ? workouts.find((d) => d.id === dragId) ?? null : null);
  /** The held workout is shown on another day than its own (as a move or a copy). */
  const previewing = $derived(dragged != null && overWeekday != null && overWeekday !== dragged.weekday);

  function overWeekdayColumn(e: DragEvent, weekday: number) {
    if (!dragId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = e.altKey ? "copy" : "move";
    overWeekday = weekday;
    copying = e.altKey;
  }

  function leaveWeek(e: DragEvent) {
    const to = e.relatedTarget as Node | null;
    if (!to || !(e.currentTarget as HTMLElement).contains(to)) overWeekday = null;
  }

  function endWeekdayDrag() {
    dragId = null;
    overWeekday = null;
    copying = false;
  }

  function dropOnWeekday(e: DragEvent, weekday: number) {
    e.preventDefault();
    const id = dragId;
    endWeekdayDrag();
    if (!id) return;
    if (e.altKey) {
      const { split: next, copy } = duplicateDay(split, id);
      if (!copy) return;
      onChange(setDayWeekday(next, copy.id, weekday));
      selectedId = copy.id;
    } else {
      onChange(setDayWeekday(split, id, weekday));
    }
  }

  /** The rotation's days in this order. */
  function inOrder(list: SplitDay[]): SplitDay[] {
    const reindexed = list.map((x, i) => ({ ...x, orderIndex: i }));
    // The new first day can't be "same day as the one before".
    if (reindexed[0]?.sameDayAsPrevious) reindexed[0] = { ...reindexed[0], sameDayAsPrevious: undefined };
    return reindexed;
  }

  function moveDay(fromId: string, toId: string) {
    if (fromId === toId) return;
    const list = [...days];
    const from = list.findIndex((d) => d.id === fromId);
    const to = list.findIndex((d) => d.id === toId);
    if (from === -1 || to === -1) return;
    const [d] = list.splice(from, 1);
    list.splice(to, 0, d!);
    onChange(touchSplit({ ...split, days: inOrder(list) }));
  }

  const rotationOrder = createReorder<string>("x");
  const rotationShown = $derived(
    rotationSlots(rotationOrder.active ? { ...split, days: inOrder(rotationOrder.arrange(days, (d) => d.id)) } : split),
  );

  function dropRotation(e: DragEvent) {
    const ids = rotationOrder.drop(e);
    if (!ids) return;
    const byId = new Map(days.map((d) => [d.id, d]));
    onChange(touchSplit({ ...split, days: inOrder(ids.map((id) => byId.get(id)!).filter(Boolean)) }));
  }

  function moveByKey(e: KeyboardEvent, d: SplitDay) {
    if (byWeekday) return;
    const i = days.findIndex((x) => x.id === d.id);
    const to = e.key === "ArrowLeft" ? i - 1 : e.key === "ArrowRight" ? i + 1 : null;
    if (to == null || to < 0 || to >= days.length) return;
    e.preventDefault();
    moveDay(d.id, days[to]!.id);
  }

  // ── Sets per muscle ─────────────────────────────────────────────────────────
  const MUSCLE_NAMES: Record<MuscleGroup, string> = {
    chest: "Chest", back: "Back", shoulders: "Shoulders", biceps: "Biceps", triceps: "Triceps", quads: "Quads",
    hamstrings: "Hamstrings", glutes: "Glutes", calves: "Calves", core: "Core", forearms: "Forearms",
  };
  const muscles = $derived.by(() => {
    const { byMuscle, uncounted } = plannedSetsByMuscle(split, (b) => index.get(b.exerciseName)?.primaryMuscles);
    const shown = new Set<MuscleGroup>([...MAIN_MUSCLES, ...byMuscle.keys()]);
    const list = [...shown].map((m) => ({ m, sets: byMuscle.get(m) ?? 0 }));
    return { list, uncounted, any: byMuscle.size > 0 };
  });

  const card = "flex flex-col gap-1 rounded-lg border p-2.5 text-left text-foreground transition-colors";
</script>

<div class="flex flex-col gap-5">
  <div class="flex flex-wrap items-end gap-3">
    <div class="flex flex-col gap-1.5">
      <label for="split-name" class="text-xs text-muted-foreground">Split name</label>
      <input id="split-name" value={split.name} onchange={(e) => onChange(renameSplit(split, e.currentTarget.value))}
        class="h-10 w-72 max-w-full rounded-lg border border-input bg-background px-3 text-base font-semibold focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
    </div>
  </div>

  <div class="flex flex-wrap items-center gap-3">
    <span id="schedule-label" class="text-[13px] font-medium">Schedule</span>
    <div role="radiogroup" aria-labelledby="schedule-label" class="flex gap-[3px] rounded-[9px] bg-muted p-[3px]">
      <button type="button" role="radio" aria-checked={byWeekday} onclick={() => setMode("weekdays")}
        class="h-[30px] rounded-[7px] px-3 text-[13px] {byWeekday ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground'}">On weekdays</button>
      <button type="button" role="radio" aria-checked={!byWeekday} onclick={() => setMode("rotation")}
        class="h-[30px] rounded-[7px] px-3 text-[13px] {!byWeekday ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground'}">In a rotation</button>
    </div>
    <span class="text-xs text-muted-foreground">
      {byWeekday ? "Each workout sits on a weekday. Empty days are rest days." : "One after another, whenever you train. A missed workout waits for you."}
    </span>
  </div>

  <!-- The week (or the rotation) -->
  <div class="flex flex-col gap-2">
    {#if byWeekday}
      <div class="overflow-x-auto">
        <div role="presentation" class="grid min-w-[700px] grid-cols-7 gap-2" ondragleave={leaveWeek}>
          {#each COLUMNS as col (col.n)}
            {@const here = workouts.filter((d) => d.weekday === col.n)}
            {@const shown = here.filter((d) => !(previewing && !copying && d.id === dragId)).length + (previewing && overWeekday === col.n ? 1 : 0)}
            <div
              role="group"
              aria-label={col.label}
              class="flex min-w-0 flex-col gap-1.5 rounded-lg p-0.5 {previewing && overWeekday === col.n ? 'bg-primary/10' : ''}"
              ondragenter={(e) => { if (dragId) e.preventDefault(); }}
              ondragover={(e) => overWeekdayColumn(e, col.n)}
              ondrop={(e) => dropOnWeekday(e, col.n)}
            >
              <span class="text-center text-[11px] font-semibold text-muted-foreground">{col.label}</span>
              {#each here as d (d.id)}
                <!-- While it's shown on another day, the original stays in the page (hidden) so the drag carries on. -->
                <button type="button" draggable="true" onclick={() => (selectedId = d.id)} aria-current={selected?.id === d.id ? "true" : undefined}
                  ondragstart={(e) => { dragId = d.id; if (e.dataTransfer) { e.dataTransfer.effectAllowed = "copyMove"; e.dataTransfer.setData("application/x-logit-reorder", d.id); } }}
                  ondragend={endWeekdayDrag}
                  class="{card} {selected?.id === d.id ? 'border-primary bg-primary/10' : 'border-transparent bg-muted hover:border-border'} {previewing && !copying && dragId === d.id ? 'hidden' : ''}">
                  <span class="truncate text-[13px] font-semibold">{splitDayName(split, d)}</span>
                  <span class="text-[11px] text-muted-foreground">{dayLine(d)}</span>
                </button>
              {/each}
              {#if previewing && overWeekday === col.n && dragged}
                <div class="{card} border-[1.5px] border-dashed border-primary bg-primary/5">
                  <span class="truncate text-[13px] font-semibold">{splitDayName(split, dragged)}</span>
                  <span class="text-[11px] text-primary">{copying ? "Copy" : "Move"} to {col.label}</span>
                </div>
              {/if}
              <button type="button" onclick={() => addWorkout(col.n)}
                class="flex items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground {shown ? 'h-8' : 'h-[62px]'}">
                {shown ? "+ second workout" : "Rest · + add"}
              </button>
            </div>
          {/each}
        </div>
      </div>
      {#if unplaced.length}
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="text-muted-foreground">Not on a day yet (drag onto one, or pick its day below):</span>
          {#each unplaced as d (d.id)}
            <button type="button" draggable="true" onclick={() => (selectedId = d.id)}
              ondragstart={(e) => { dragId = d.id; if (e.dataTransfer) { e.dataTransfer.effectAllowed = "copyMove"; e.dataTransfer.setData("application/x-logit-reorder", d.id); } }}
              ondragend={endWeekdayDrag}
              class="rounded-lg border border-border bg-muted px-2.5 py-1.5 font-medium {previewing && !copying && dragId === d.id ? 'hidden' : ''}">{splitDayName(split, d)}</button>
          {/each}
        </div>
      {/if}
      <p class="text-xs text-muted-foreground">Drag a workout to another day to move it. Hold Alt while dropping to copy it.</p>
    {:else}
      <ol class="flex flex-wrap gap-2" ondragenter={(e) => rotationOrder.allow(e)} ondragover={(e) => rotationOrder.allow(e)} ondrop={dropRotation}>
        {#each rotationShown as slot, si (slot[0]!.id)}
          <li class="flex flex-col gap-1" animate:flip={{ duration: SLIDE_MS }}>
            <span class="px-1 text-[11px] font-semibold text-muted-foreground">Day {si + 1}</span>
            <div class="flex gap-1">
              {#each slot as d (d.id)}
                <button type="button" draggable="true" onclick={() => (selectedId = d.id)} aria-current={selected?.id === d.id ? "true" : undefined}
                  aria-label="{d.rest ? 'Rest day' : splitDayName(split, d)}, move with the left and right arrow keys"
                  ondragstart={(e) => rotationOrder.start(days.map((x) => x.id), d.id, e)}
                  ondragend={() => rotationOrder.end()}
                  ondragover={(e) => rotationOrder.over(d.id, e)}
                  onkeydown={(e) => moveByKey(e, d)}
                  class="{card} w-32 {rotationOrder.held === d.id ? 'border-[1.5px] border-dashed border-primary bg-primary/5 [&>*]:invisible' : d.rest ? 'border-dashed border-border bg-transparent' : selected?.id === d.id ? 'border-primary bg-primary/10' : 'border-transparent bg-muted hover:border-border'} {selected?.id === d.id && d.rest ? 'border-primary' : ''}">
                  <span class="truncate text-[13px] {d.rest ? 'text-muted-foreground' : 'font-semibold'}">{d.rest ? "Rest" : splitDayName(split, d)}</span>
                  {#if !d.rest}<span class="text-[11px] text-muted-foreground">{dayLine(d)}</span>{/if}
                </button>
              {/each}
            </div>
          </li>
        {/each}
        <li class="flex items-end gap-1.5">
          <button type="button" onclick={() => addWorkout()} class="h-[62px] rounded-lg border border-dashed border-border px-3 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground">+ Workout</button>
          <button type="button" onclick={() => onChange(addRestDay(split))} class="h-[62px] rounded-lg border border-dashed border-border px-3 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground">+ Rest day</button>
        </li>
      </ol>
      <p class="text-xs text-muted-foreground">Drag a day to reorder (or focus it and use ← →). Two workouts on one day: tick "Same day as the one before" on the second.</p>
    {/if}
  </div>

  {#if muscles.any}
    <div class="flex flex-wrap items-center gap-1.5 text-xs">
      <span class="mr-1 text-muted-foreground" title="Each working set counts once for the exercise's main muscles.">Hard sets {byWeekday ? "a week" : "per rotation"}</span>
      {#each muscles.list as x (x.m)}
        {@const low = x.sets < LOW_WEEKLY_SETS}
        <span class="rounded-full px-2 py-0.5 {low ? 'bg-warning/12 font-semibold text-warning' : 'bg-muted text-foreground/85'}">{MUSCLE_NAMES[x.m]} {x.sets}{low ? " · low" : ""}</span>
      {/each}
      {#if muscles.uncounted > 0}<span class="text-muted-foreground">· {muscles.uncounted} sets not counted (exercise not in the list)</span>{/if}
    </div>
  {/if}

  <Separator />

  {#if selected}
    <DayEditor {split} dayId={selected.id} {index} {unit} {onChange} onSelectDay={(id) => (selectedId = id)} />
  {:else}
    <p class="text-[13px] text-muted-foreground">No days yet. {byWeekday ? "Pick a day above to add a workout." : "Add a workout above."}</p>
  {/if}
</div>
