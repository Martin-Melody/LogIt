<script lang="ts">
  import GripVerticalIcon from "@lucide/svelte/icons/grip-vertical";
  import XIcon from "@lucide/svelte/icons/x";
  import {
    addPlannedCardio,
    addPlannedMobility,
    addPlannedStrength,
    groupPlannedBlocks,
    orderPlannedBlocks,
    plannedBlockName,
    plannedRuns,
    removePlannedBlock,
    setPlannedGroupRounds,
    setPlannedGroupKind,
    setPlannedGroupSettings,
    setPlannedTargets,
    ungroupPlanned,
    updatePlannedBlock,
    updateSplitDay,
    MAX_PLANNED_ROUNDS,
    type PlannedBlock,
    type PlannedRun,
    type SplitDay,
    type WorkoutSplit,
  } from "@logit/core/domain/WorkoutSplit";
  import {
    duplicateDay,
    removeDay,
    setDayWeekday,
    setSameDayAsPrevious,
    sortedDays,
    splitDayName,
  } from "@logit/core/domain/splitSchedule";
  import { groupKindOf, groupLabel } from "@logit/core/domain/workout";
  import { BUILTIN_MOBILITY_DRILLS, findBuiltinMobilityDrill } from "@logit/core/domain/mobilityDrill";
  import { fromDisplayWeight, toDisplayWeight, trimWeight, type WeightUnit } from "@logit/core/domain/units";
  import type { ExerciseIndex, ExerciseInfo } from "./exerciseIndex";
  import NamePicker, { type PickItem } from "./NamePicker.svelte";

  /**
   * One day of a split, as a table: what to train, in order, with targets. Supersets and
   * circuits are a framed group with their rounds. Same edits as the phone's day screen,
   * laid out for a keyboard and mouse. Every change goes up through `onChange`; nothing is
   * saved until the page's Save.
   */
  let {
    split,
    dayId,
    index,
    unit,
    onChange,
    onSelectDay,
  }: {
    split: WorkoutSplit;
    dayId: string;
    index: ExerciseIndex;
    unit: WeightUnit;
    onChange: (next: WorkoutSplit) => void;
    onSelectDay: (id: string | null) => void;
  } = $props();

  const day = $derived<SplitDay | null>(split.days.find((d) => d.id === dayId) ?? null);
  const runs = $derived<PlannedRun[]>(day ? plannedRuns(day) : []);
  const byWeekday = $derived(split.schedule === "weekdays");
  const ordered = $derived(sortedDays(split));
  const isFirst = $derived(ordered[0]?.id === dayId);

  const WEEKDAYS = [
    { n: 1, label: "Monday" }, { n: 2, label: "Tuesday" }, { n: 3, label: "Wednesday" }, { n: 4, label: "Thursday" },
    { n: 5, label: "Friday" }, { n: 6, label: "Saturday" }, { n: 0, label: "Sunday" },
  ];

  // ── Edits ──────────────────────────────────────────────────────────────────
  function editDay(fn: (d: SplitDay) => SplitDay) {
    onChange(updateSplitDay(split, dayId, fn));
  }

  function num(v: string): number | undefined {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  function setStrength(b: PlannedBlock, field: "sets" | "reps" | "weight", raw: string) {
    if (b.type !== "strength") return;
    const t = { ...(b.targets ?? {}) };
    const v = num(raw);
    if (field === "weight") t.weight = v == null ? undefined : Math.round(fromDisplayWeight(v, unit) * 1000) / 1000;
    else t[field] = v == null ? undefined : Math.round(v);
    onChange(setPlannedTargets(split, dayId, b.id, t));
  }

  function setMobility(b: PlannedBlock, field: "sets" | "reps" | "holdSec", raw: string) {
    if (b.type !== "mobility") return;
    const v = num(raw);
    const targets = { ...(b.targets ?? {}), [field]: v == null ? undefined : Math.round(v) };
    onChange(updatePlannedBlock(split, dayId, b.id, { targets }));
  }

  function remove(b: PlannedBlock) {
    editDay((d) => removePlannedBlock(d, b.id));
  }

  function shownWeight(kg: number | undefined): string {
    return kg == null ? "" : trimWeight(Math.round(toDisplayWeight(kg, unit) * 100) / 100);
  }

  // ── Order: whole rows (a group moves as one), or members inside their group ──
  type Drag = { kind: "run"; from: number } | { kind: "member"; groupId: string; from: number };
  let drag = $state<Drag | null>(null);
  let dropAt = $state<string | null>(null);

  function flatIds(rs: PlannedRun[]): string[] {
    return rs.flatMap((r) => (r.kind === "block" ? [r.block.id] : r.members.map((m) => m.id)));
  }

  function moveRun(from: number, to: number) {
    if (from === to || to < 0 || to >= runs.length) return;
    const next = [...runs];
    const [r] = next.splice(from, 1);
    next.splice(to, 0, r!);
    const ids = flatIds(next);
    editDay((d) => orderPlannedBlocks(d, ids));
  }

  function moveMember(groupId: string, from: number, to: number) {
    const next = runs.map((r) => {
      if (r.kind !== "group" || r.group.id !== groupId) return r;
      if (to < 0 || to >= r.members.length) return r;
      const members = [...r.members];
      const [m] = members.splice(from, 1);
      members.splice(to, 0, m!);
      return { ...r, members };
    });
    const ids = flatIds(next);
    editDay((d) => orderPlannedBlocks(d, ids));
  }

  function handleKeys(e: KeyboardEvent, move: (to: number) => void, at: number) {
    if (e.key === "ArrowUp") { e.preventDefault(); move(at - 1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); move(at + 1); }
  }

  function onDrop(target: Drag) {
    const d = drag;
    drag = null;
    dropAt = null;
    if (!d) return;
    if (d.kind === "run" && target.kind === "run") moveRun(d.from, target.from);
    else if (d.kind === "member" && target.kind === "member" && d.groupId === target.groupId) moveMember(d.groupId, d.from, target.from);
  }

  // ── Grouping ───────────────────────────────────────────────────────────────
  let grouping = $state(false);
  let picked = $state<string[]>([]);
  function startGrouping() {
    grouping = true;
    picked = [];
  }
  function togglePick(id: string) {
    picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
  }
  function confirmGroup() {
    const ids = picked;
    editDay((d) => groupPlannedBlocks(d, ids, { kind: ids.length === 2 ? "superset" : "circuit" }));
    grouping = false;
    picked = [];
  }

  // ── Adding ─────────────────────────────────────────────────────────────────
  let adding = $state<"strength" | "mobility" | "cardio">("strength");

  function lastText(info: ExerciseInfo | undefined): string {
    const last = info?.last;
    if (!last || last.sets.length === 0) return "";
    const sameWeight = last.sets.every((s) => s.weight === last.sets[0]!.weight);
    const w = (kg: number) => (kg > 0 ? trimWeight(Math.round(toDisplayWeight(kg, unit) * 100) / 100) : "BW");
    const body = sameWeight
      ? `${w(last.sets[0]!.weight)} × ${last.sets.map((s) => s.reps).join(", ")}`
      : last.sets.map((s) => `${w(s.weight)} × ${s.reps}`).join(", ");
    const daysAgo = (Date.now() - last.atMs) / 86_400_000;
    const when = new Date(last.atMs).toLocaleDateString(undefined, daysAgo < 6 ? { weekday: "short" } : { day: "numeric", month: "short" });
    return `${body} · ${when}`;
  }

  function topSet(info: ExerciseInfo | undefined): { weight: number; reps: number } | null {
    const sets = info?.last?.sets ?? [];
    if (sets.length === 0) return null;
    const top = Math.max(...sets.map((s) => s.weight));
    return { weight: top, reps: Math.max(...sets.filter((s) => s.weight === top).map((s) => s.reps)) };
  }

  function searchExercises(q: string): PickItem[] {
    return index.search(q).map((e) => {
      const t = topSet(e);
      return { name: e.name, detail: t ? `last ${t.weight > 0 ? `${shownWeight(t.weight)} ${unit} × ${t.reps}` : `${t.reps} reps`}` : "never done" };
    });
  }

  function addStrength(name: string) {
    const info = index.get(name);
    const t = topSet(info);
    // Filled in from last time, so most rows need no typing.
    const targets = t ? { sets: info!.last!.sets.length, reps: t.reps, ...(t.weight > 0 ? { weight: t.weight } : {}) } : { sets: 3 };
    onChange(addPlannedStrength(split, dayId, { exerciseName: info?.name ?? name, ...(info?.id ? { exerciseId: info.id } : {}), targets }));
  }

  function searchDrills(q: string): PickItem[] {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return BUILTIN_MOBILITY_DRILLS.filter((d) => d.name.toLowerCase().includes(s))
      .slice(0, 8)
      .map((d) => ({ name: d.name, detail: `${d.defaultMetric === "hold" ? "hold" : "reps"}${d.perSide ? " · each side" : ""}` }));
  }

  function addMobility(name: string) {
    const d = findBuiltinMobilityDrill(name);
    const metric = d?.defaultMetric ?? "reps";
    onChange(addPlannedMobility(split, dayId, {
      drillName: d?.name ?? name,
      ...(d ? { drillId: d.id } : {}),
      metric,
      perSide: d?.perSide ?? false,
      targets: metric === "hold" ? { sets: 2, holdSec: 30 } : { sets: 2, reps: 8 },
    }));
  }

  const ACTIVITIES = ["Run", "Bike", "Row", "Walk", "Incline walk", "Stairs", "Elliptical", "Swim", "Ski erg", "Jump rope"];
  function searchActivities(q: string): PickItem[] {
    const s = q.trim().toLowerCase();
    return s ? ACTIVITIES.filter((a) => a.toLowerCase().includes(s)).map((name) => ({ name })) : [];
  }

  // ── Day ────────────────────────────────────────────────────────────────────
  function rename(v: string) {
    editDay((d) => ({ ...d, name: v.trim() || undefined }));
  }
  function setWeekday(v: string) {
    onChange(setDayWeekday(split, dayId, Number(v)));
  }
  function duplicate() {
    const { split: next, copy } = duplicateDay(split, dayId);
    onChange(next);
    if (copy) onSelectDay(copy.id);
  }
  function deleteDay() {
    const i = ordered.findIndex((d) => d.id === dayId);
    const next = removeDay(split, dayId);
    onChange(next);
    const after = sortedDays(next);
    onSelectDay(after[Math.min(i, after.length - 1)]?.id ?? null);
  }

  const setCount = $derived(
    day ? runs.reduce((n, r) => n + (r.kind === "group" ? r.group.rounds * r.members.filter((m) => m.type !== "cardio").length : r.block.type === "cardio" ? 0 : (r.block.targets?.sets ?? 0)), 0) : 0,
  );
  const exerciseCount = $derived(day?.blocks.length ?? 0);
  const ungroupedIds = $derived(runs.filter((r) => r.kind === "block").map((r) => (r as { block: PlannedBlock }).block.id));

  const cell = "h-8 w-16 rounded-md border border-input bg-background px-2 text-right text-[13px] tabular-nums focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring";
</script>

{#if day}
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="flex flex-wrap items-end gap-2.5">
        {#if day.rest}
          <h3 class="text-base font-semibold">Rest day</h3>
        {:else}
          <div class="flex flex-col gap-1.5">
            <label for="day-name" class="text-xs text-muted-foreground">Workout name</label>
            <input id="day-name" value={day.name ?? ""} placeholder={splitDayName(split, day)}
              onchange={(e) => rename(e.currentTarget.value)}
              class="h-9 w-48 rounded-lg border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          {#if byWeekday}
            <div class="flex flex-col gap-1.5">
              <label for="day-weekday" class="text-xs text-muted-foreground">Day</label>
              <select id="day-weekday" value={String(day.weekday ?? "")} onchange={(e) => setWeekday(e.currentTarget.value)}
                class="h-9 w-36 rounded-lg border border-input bg-background px-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring">
                {#if day.weekday == null}<option value="" disabled>Pick a day</option>{/if}
                {#each WEEKDAYS as w (w.n)}<option value={String(w.n)}>{w.label}</option>{/each}
              </select>
            </div>
          {:else if !isFirst}
            <label class="flex h-9 items-center gap-2 text-[13px]">
              <input type="checkbox" checked={!!day.sameDayAsPrevious}
                onchange={(e) => onChange(setSameDayAsPrevious(split, dayId, e.currentTarget.checked))} />
              Same day as the one before (a second workout)
            </label>
          {/if}
          <span class="pb-2 text-xs text-muted-foreground">{exerciseCount} exercise{exerciseCount === 1 ? "" : "s"} · {setCount} sets</span>
        {/if}
      </div>
      <div class="flex gap-2">
        {#if !day.rest}
          <button type="button" onclick={duplicate} class="h-9 rounded-[10px] border border-border px-3 text-[13px] hover:bg-muted">Duplicate day</button>
        {/if}
        <button type="button" onclick={deleteDay} class="h-9 rounded-[10px] border border-border px-3 text-[13px] text-destructive hover:bg-destructive/10">Delete day</button>
      </div>
    </div>

    {#if !day.rest}
      {#if runs.length === 0}
        <p class="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">Nothing planned yet. Search below to add the first exercise.</p>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr class="text-left text-xs text-muted-foreground">
                <th class="w-7 px-1 py-2"><span class="sr-only">Order</span></th>
                <th class="px-2 py-2 font-medium">Exercise</th>
                <th class="px-2 py-2 font-medium">Sets</th>
                <th class="px-2 py-2 font-medium">Reps</th>
                <th class="px-2 py-2 font-medium">Weight</th>
                <th class="px-2 py-2 font-medium">Last time</th>
                <th class="w-9 px-1 py-2"><span class="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {#each runs as run, ri (run.kind === "block" ? run.block.id : run.group.id)}
                {@const key = run.kind === "block" ? run.block.id : run.group.id}
                <tr
                  class="border-t border-border {dropAt === key ? 'bg-primary/5' : ''} {drag?.kind === 'run' && drag.from === ri ? 'opacity-50' : ''}"
                  ondragover={(e) => { if (drag?.kind === "run") { e.preventDefault(); dropAt = key; } }}
                  ondragleave={() => { if (dropAt === key) dropAt = null; }}
                  ondrop={(e) => { e.preventDefault(); onDrop({ kind: "run", from: ri }); }}
                >
                  {#if run.kind === "block"}
                    {@const b = run.block}
                    {@const info = b.type === "strength" ? index.get(b.exerciseName) : undefined}
                    <td class="px-1 py-1.5 align-middle">
                      {#if grouping}
                        <input type="checkbox" aria-label="Pick {plannedBlockName(b)}" checked={picked.includes(b.id)} onchange={() => togglePick(b.id)} class="ml-1.5" />
                      {:else}
                        <button type="button" draggable="true" aria-label="Move {plannedBlockName(b)} (arrow keys)"
                          ondragstart={(e) => { drag = { kind: "run", from: ri }; e.dataTransfer?.setData("text/plain", b.id); }}
                          ondragend={() => { drag = null; dropAt = null; }}
                          onkeydown={(e) => handleKeys(e, (to) => moveRun(ri, to), ri)}
                          class="flex h-8 w-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                          <GripVerticalIcon class="size-4" />
                        </button>
                      {/if}
                    </td>
                    <td class="px-2 py-1.5 font-medium">
                      {plannedBlockName(b)}
                      {#if b.type === "mobility"}<span class="ml-1.5 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">Mobility</span>{/if}
                      {#if b.type === "cardio"}<span class="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Cardio</span>{/if}
                    </td>
                    {#if b.type === "strength"}
                      <td class="px-2 py-1.5"><input aria-label="{b.exerciseName} sets" inputmode="numeric" class={cell} value={b.targets?.sets ?? ""} onchange={(e) => setStrength(b, "sets", e.currentTarget.value)} /></td>
                      <td class="px-2 py-1.5"><input aria-label="{b.exerciseName} reps" inputmode="numeric" class={cell} value={b.targets?.reps ?? ""} onchange={(e) => setStrength(b, "reps", e.currentTarget.value)} /></td>
                      <td class="px-2 py-1.5 whitespace-nowrap"><input aria-label="{b.exerciseName} weight in {unit}" inputmode="decimal" class={cell} value={shownWeight(b.targets?.weight)} onchange={(e) => setStrength(b, "weight", e.currentTarget.value)} /> <span class="text-xs text-muted-foreground">{unit}</span></td>
                      <td class="px-2 py-1.5 text-muted-foreground">{lastText(info)}</td>
                    {:else if b.type === "mobility"}
                      <td class="px-2 py-1.5"><input aria-label="{b.drillName} sets" inputmode="numeric" class={cell} value={b.targets?.sets ?? ""} onchange={(e) => setMobility(b, "sets", e.currentTarget.value)} /></td>
                      <td class="px-2 py-1.5 whitespace-nowrap">
                        {#if b.metric === "hold"}
                          <input aria-label="{b.drillName} hold in seconds" inputmode="numeric" class={cell} value={b.targets?.holdSec ?? ""} onchange={(e) => setMobility(b, "holdSec", e.currentTarget.value)} /> <span class="text-xs text-muted-foreground">s{b.perSide ? " / side" : ""}</span>
                        {:else}
                          <input aria-label="{b.drillName} reps" inputmode="numeric" class={cell} value={b.targets?.reps ?? ""} onchange={(e) => setMobility(b, "reps", e.currentTarget.value)} />{#if b.perSide}{" "}<span class="text-xs text-muted-foreground">/ side</span>{/if}
                        {/if}
                      </td>
                      <td class="px-2 py-1.5 text-muted-foreground">–</td>
                      <td class="px-2 py-1.5"></td>
                    {:else}
                      <td class="px-2 py-1.5 text-muted-foreground" colspan="4">Timed on the day</td>
                    {/if}
                    <td class="px-1 py-1.5">
                      <button type="button" aria-label="Remove {plannedBlockName(b)}" onclick={() => remove(b)} class="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><XIcon class="size-4" /></button>
                    </td>
                  {:else}
                    {@const g = run.group}
                    {@const kind = groupKindOf(run.members.length, g.kind)}
                    <td colspan="7" class="py-2.5">
                      <div class="flex flex-col gap-2 rounded-[10px] border border-primary/35 bg-primary/5 px-3 py-2.5">
                        <div class="flex flex-wrap items-center gap-2.5 text-xs">
                          <button type="button" draggable="true" aria-label="Move {groupLabel(run.members.length, g.label, g.kind)} (arrow keys)"
                            ondragstart={(e) => { drag = { kind: "run", from: ri }; e.dataTransfer?.setData("text/plain", g.id); }}
                            ondragend={() => { drag = null; dropAt = null; }}
                            onkeydown={(e) => handleKeys(e, (to) => moveRun(ri, to), ri)}
                            class="flex h-7 w-5 cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                            <GripVerticalIcon class="size-4" />
                          </button>
                          <span class="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">{groupLabel(run.members.length, g.label, g.kind)}</span>
                          <label for="rounds-{g.id}" class="text-muted-foreground">Rounds</label>
                          <input id="rounds-{g.id}" inputmode="numeric" class="{cell} h-7 w-14" value={g.rounds}
                            onchange={(e) => { const n = num(e.currentTarget.value); if (n) editDay((d) => setPlannedGroupRounds(d, g.id, Math.min(MAX_PLANNED_ROUNDS, n))); }} />
                          <label for="rest-{g.id}" class="text-muted-foreground">Rest between rounds (s)</label>
                          <input id="rest-{g.id}" inputmode="numeric" class="{cell} h-7 w-16" value={g.roundRestMs ? Math.round(g.roundRestMs / 1000) : ""} placeholder="–"
                            onchange={(e) => { const n = num(e.currentTarget.value); editDay((d) => setPlannedGroupSettings(d, g.id, { roundRestMs: n == null ? null : n * 1000 })); }} />
                          {#if run.members.length === 2}
                            <label for="kind-{g.id}" class="sr-only">Kind</label>
                            <select id="kind-{g.id}" value={kind}
                              onchange={(e) => { const k = e.currentTarget.value as "superset" | "circuit"; editDay((d) => setPlannedGroupKind(d, g.id, k)); }}
                              class="h-7 rounded-md border border-input bg-background px-1.5 text-xs">
                              <option value="superset">Superset</option><option value="circuit">Circuit</option>
                            </select>
                          {/if}
                          <span class="flex-1"></span>
                          <button type="button" onclick={() => editDay((d) => ungroupPlanned(d, g.id))} class="h-7 rounded-lg border border-border px-2.5 text-xs hover:bg-muted">Ungroup</button>
                        </div>
                        {#each run.members as m, mi (m.id)}
                          {@const info = m.type === "strength" ? index.get(m.exerciseName) : undefined}
                          {@const mkey = `m-${m.id}`}
                          <div
                            role="group"
                            aria-label={plannedBlockName(m)}
                            class="grid grid-cols-[22px_minmax(140px,1fr)_70px_110px_minmax(120px,1fr)_34px] items-center gap-2 rounded-md {dropAt === mkey ? 'bg-primary/10' : ''}"
                            ondragover={(e) => { if (drag?.kind === "member" && drag.groupId === g.id) { e.preventDefault(); e.stopPropagation(); dropAt = mkey; } }}
                            ondrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop({ kind: "member", groupId: g.id, from: mi }); }}
                          >
                            <button type="button" draggable="true" aria-label="Move {plannedBlockName(m)} within the group (arrow keys)"
                              ondragstart={(e) => { e.stopPropagation(); drag = { kind: "member", groupId: g.id, from: mi }; e.dataTransfer?.setData("text/plain", m.id); }}
                              ondragend={() => { drag = null; dropAt = null; }}
                              onkeydown={(e) => handleKeys(e, (to) => moveMember(g.id, mi, to), mi)}
                              class="flex h-8 w-5 cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                              <GripVerticalIcon class="size-4" />
                            </button>
                            <span class="truncate font-medium">{plannedBlockName(m)}</span>
                            {#if m.type === "strength"}
                              <span><input aria-label="{m.exerciseName} reps" inputmode="numeric" class={cell} value={m.targets?.reps ?? ""} onchange={(e) => setStrength(m, "reps", e.currentTarget.value)} /></span>
                              <span class="whitespace-nowrap"><input aria-label="{m.exerciseName} weight in {unit}" inputmode="decimal" class={cell} value={shownWeight(m.targets?.weight)} onchange={(e) => setStrength(m, "weight", e.currentTarget.value)} /> <span class="text-xs text-muted-foreground">{unit}</span></span>
                              <span class="truncate text-muted-foreground">{lastText(info)}</span>
                            {:else if m.type === "mobility"}
                              {#if m.metric === "hold"}
                                <span class="whitespace-nowrap"><input aria-label="{m.drillName} hold in seconds" inputmode="numeric" class={cell} value={m.targets?.holdSec ?? ""} onchange={(e) => setMobility(m, "holdSec", e.currentTarget.value)} /> <span class="text-xs text-muted-foreground">s</span></span>
                              {:else}
                                <span><input aria-label="{m.drillName} reps" inputmode="numeric" class={cell} value={m.targets?.reps ?? ""} onchange={(e) => setMobility(m, "reps", e.currentTarget.value)} /></span>
                              {/if}
                              <span class="text-xs text-muted-foreground">{m.perSide ? "each side" : ""}</span><span></span>
                            {:else}
                              <span class="col-span-3 text-muted-foreground">Cardio, timed on the day</span>
                            {/if}
                            <button type="button" aria-label="Remove {plannedBlockName(m)}" onclick={() => remove(m)} class="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><XIcon class="size-4" /></button>
                          </div>
                        {/each}
                      </div>
                    </td>
                  {/if}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      {#if grouping}
        <div class="flex flex-wrap items-center gap-3 rounded-lg bg-muted px-3 py-2.5 text-[13px]">
          <span>{picked.length < 2 ? "Tick the exercises to do back to back." : `${picked.length} picked: a ${picked.length === 2 ? "superset" : "circuit"}.`}</span>
          <span class="flex-1"></span>
          <button type="button" onclick={() => (grouping = false)} class="h-8 rounded-lg border border-border px-3 hover:bg-background">Cancel</button>
          <button type="button" disabled={picked.length < 2} onclick={confirmGroup} class="h-8 rounded-lg bg-primary px-3 font-semibold text-primary-foreground disabled:opacity-50">Group them</button>
        </div>
      {:else}
        <div class="flex flex-wrap items-start gap-2">
          <div class="w-full max-w-sm flex-[1_1_280px]">
            {#if adding === "strength"}
              <NamePicker id="add-exercise-{dayId}" label="Add an exercise" placeholder="Add an exercise…" search={searchExercises} onPick={addStrength} />
            {:else if adding === "mobility"}
              <NamePicker id="add-drill-{dayId}" label="Add a mobility drill" placeholder="Add a mobility drill…" search={searchDrills} onPick={addMobility} autofocus onCancel={() => (adding = "strength")} />
            {:else}
              <NamePicker id="add-cardio-{dayId}" label="Add cardio" placeholder="Run, bike, row…" search={searchActivities} onPick={(n) => onChange(addPlannedCardio(split, dayId, n))} autofocus onCancel={() => (adding = "strength")} />
            {/if}
          </div>
          {#if ungroupedIds.length >= 2}
            <button type="button" onclick={startGrouping} class="h-9 rounded-[10px] border border-border px-3 text-[13px] hover:bg-muted">+ Superset or circuit</button>
          {/if}
          <button type="button" aria-pressed={adding === "mobility"} onclick={() => (adding = adding === "mobility" ? "strength" : "mobility")} class="h-9 rounded-[10px] border border-border px-3 text-[13px] hover:bg-muted {adding === 'mobility' ? 'bg-muted' : ''}">+ Mobility</button>
          <button type="button" aria-pressed={adding === "cardio"} onclick={() => (adding = adding === "cardio" ? "strength" : "cardio")} class="h-9 rounded-[10px] border border-border px-3 text-[13px] hover:bg-muted {adding === 'cardio' ? 'bg-muted' : ''}">+ Cardio</button>
        </div>
        <p class="text-xs text-muted-foreground">New exercises are filled in from the last time you did them. Drag the handle (or focus it and use the arrow keys) to reorder.</p>
      {/if}
    {/if}
  </div>
{/if}
