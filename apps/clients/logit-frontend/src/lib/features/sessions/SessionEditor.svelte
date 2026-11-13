<script lang="ts">
  import { Plus, MoreHorizontal, X, ArrowUp, ArrowDown, ArrowLeftRight, Trash2, Link2 } from "lucide-svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import SetRow from "$lib/features/session/ui/SetRow.svelte";
  import EditSetDialog from "$lib/features/session/ui/EditSetDialog.svelte";
  import AddExerciseDialog from "$lib/features/session/ui/AddExerciseDialog.svelte";
  import AddCardioDialog from "$lib/features/session/ui/AddCardioDialog.svelte";
  import AddMobilityDialog from "$lib/features/session/ui/AddMobilityDialog.svelte";
  import BlockPickerSheet from "$lib/features/session/ui/BlockPickerSheet.svelte";
  import { getExerciseRepo } from "$lib/data/repoProvider";
  import type { WeightUnit } from "@logit/core/domain/units";
  import { trimWeight } from "@logit/core/domain/units";
  import { usesBodyweightLoad, type Machine } from "@logit/core/domain/exercise";
  import {
    addCardioBlock,
    addExercise,
    addMobilityBlock,
    addMobilitySet,
    addSet,
    blockGroup,
    groupLabel,
    mobilitySetGroups,
    removeExercise,
    removeMobilitySet,
    removeSet,
    supersetMembers,
    swapExercise,
    updateMobilitySet,
    updateSet,
    type CardioBlockData,
    type CardioInterval,
    type MobilityBlockData,
    type MobilityMetric,
    type MobilitySet,
    type SessionBlock,
    type SetEntry,
    type StrengthBlockData,
    type WorkoutSession,
  } from "@logit/core/domain/workout";
  import type { SessionComparison } from "@logit/core/domain/sessionHistory";
  import { createId } from "@logit/core/domain/ids";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import type { VolumeContext } from "$lib/features/bodyweight/bodyweight";

  // A past workout with the same set rows as logging one: change weights and reps, add or
  // take out sets, exercises, drills and cardio, move them, and fix the name, times and
  // note. Works on a copy; the page saves it.
  let {
    draft = $bindable(),
    autoTitle,
    comparison,
    unit,
    volumeCtx,
    saving = false,
    onDelete,
  }: {
    draft: WorkoutSession;
    /** What it's called when no name is typed. */
    autoTitle: string;
    comparison: SessionComparison | undefined;
    unit: WeightUnit;
    volumeCtx: VolumeContext | null;
    saving?: boolean;
    onDelete: () => void | Promise<void>;
  } = $props();

  function apply(fn: (s: WorkoutSession) => WorkoutSession) {
    draft = fn(draft);
  }

  const blocks = $derived([...draft.blocks].sort((a, b) => a.orderIndex - b.orderIndex));

  // ── Name, day, times, note ──────────────────────────────────────────────
  const pad = (n: number) => String(n).padStart(2, "0");
  const hhmm = (ms: number) => {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const dayValue = $derived(localDateIso(new Date(draft.startedAtMs)));
  const fromValue = $derived(hhmm(draft.startedAtMs));
  const toValue = $derived(draft.endedAtMs ? hhmm(draft.endedAtMs) : "");

  function at(dayIso: string, time: string): number {
    const [y, m, d] = dayIso.split("-").map(Number);
    const [h, min] = time.split(":").map(Number);
    return new Date(y!, m! - 1, d!, h ?? 0, min ?? 0).getTime();
  }

  /** Keeps the length when the day or start moves; an end before the start is the next day. */
  function setTimes(dayIso: string, from: string, to: string) {
    if (!dayIso || !from) return;
    const start = at(dayIso, from);
    let end = to ? at(dayIso, to) : undefined;
    if (end !== undefined && end <= start) end += 86_400_000;
    draft = { ...draft, startedAtMs: start, ...(end !== undefined ? { endedAtMs: end } : {}) };
  }

  // ── Moving: a group moves as one, and nothing moves into the middle of one ──
  function units(): SessionBlock[][] {
    const out: SessionBlock[][] = [];
    for (const b of blocks) {
      const g = blockGroup(b)?.id;
      const last = out.at(-1);
      if (g && last && blockGroup(last[0]!)?.id === g) last.push(b);
      else out.push([b]);
    }
    return out;
  }

  function move(blockId: string, dir: -1 | 1) {
    const us = units();
    const b = blocks.find((x) => x.id === blockId);
    if (!b) return;
    const g = blockGroup(b)?.id;
    const i = us.findIndex((u) => u.some((x) => x.id === blockId));
    const unit = us[i]!;
    if (g && unit.length > 1) {
      // Inside a group: swap with the neighbouring member.
      const j = unit.findIndex((x) => x.id === blockId) + dir;
      if (j < 0 || j >= unit.length) return;
      [unit[j - dir], unit[j]] = [unit[j]!, unit[j - dir]!];
    } else {
      const k = i + dir;
      if (k < 0 || k >= us.length) return;
      [us[i], us[k]] = [us[k]!, us[i]!];
    }
    const order = new Map(us.flat().map((x, idx) => [x.id, idx]));
    draft = { ...draft, blocks: draft.blocks.map((x) => ({ ...x, orderIndex: order.get(x.id) ?? x.orderIndex })) };
  }

  function canMove(blockId: string, dir: -1 | 1): boolean {
    const us = units();
    const i = us.findIndex((u) => u.some((x) => x.id === blockId));
    const unit = us[i];
    if (!unit) return false;
    if (unit.length > 1) {
      const j = unit.findIndex((x) => x.id === blockId) + dir;
      return j >= 0 && j < unit.length;
    }
    const k = i + dir;
    return k >= 0 && k < us.length;
  }

  // ── Strength ────────────────────────────────────────────────────────────
  function workingNumber(sets: SetEntry[], id: string): number {
    let n = 0;
    for (const s of sets) {
      if (s.setType !== "warmup") n++;
      if (s.id === id) return s.setType === "warmup" ? 0 : n;
    }
    return 0;
  }

  function bodyweightOf(d: StrengthBlockData): boolean {
    return usesBodyweightLoad(d.exerciseId ? volumeCtx?.typeById.get(d.exerciseId) : undefined, d.sets.map((s) => s.weight));
  }

  function prevFor(blockId: string, index: number): { reps: number; weight: number } | null {
    const p = comparison?.byBlockId[blockId]?.previousSets?.[index];
    return p ? { reps: p.reps, weight: p.weight } : null;
  }

  function addSetTo(blockId: string, d: StrengthBlockData) {
    const last = [...d.sets].sort((a, b) => a.orderIndex - b.orderIndex).at(-1);
    apply((s) => addSet(s, blockId, { reps: 0, weight: last?.weight ?? 0, setType: "normal" }));
  }

  const noGrip = () => ({ destroy() {} });

  // The set card (type, RPE, note, machine), opened from the "Last" cell like when logging.
  const setCard = $state({ open: false, blockId: null as string | null, setId: null as string | null });
  let machines = $state<Machine[]>([]);
  let defaultMachineId = $state<string | undefined>(undefined);
  let cardExerciseId = $state<string | undefined>(undefined);

  async function openSetCard(blockId: string, setId: string) {
    setCard.blockId = blockId;
    setCard.setId = setId;
    setCard.open = true;
    const d = draft.blocks.find((x) => x.id === blockId)?.data as StrengthBlockData | undefined;
    let ex = null;
    try {
      if (d) ex = d.exerciseId ? await getExerciseRepo().getById(d.exerciseId) : await getExerciseRepo().getByName(d.exerciseName);
    } catch {
      ex = null;
    }
    machines = ex?.machines ?? [];
    defaultMachineId = ex?.defaultMachineId;
    cardExerciseId = ex?.id;
  }

  const cardSet = $derived.by(() => {
    if (!setCard.blockId || !setCard.setId) return null;
    const b = draft.blocks.find((x) => x.id === setCard.blockId);
    return (b?.data as StrengthBlockData | undefined)?.sets.find((s) => s.id === setCard.setId) ?? null;
  });

  // ── Mobility ────────────────────────────────────────────────────────────
  function mobValue(s: MobilitySet | undefined, metric: MobilityMetric): string {
    const v = metric === "hold" ? s?.durationSec : s?.reps;
    return v ? String(v) : "";
  }

  function setMob(blockId: string, s: MobilitySet | undefined, metric: MobilityMetric, raw: string) {
    if (!s) return;
    const v = Math.max(0, Math.round(Number(raw) || 0));
    const patch = metric === "hold" ? { durationSec: v || undefined, completed: v > 0 } : { reps: v || undefined, completed: v > 0 };
    apply((x) => updateMobilitySet(x, blockId, s.id, patch));
  }

  // ── Cardio ──────────────────────────────────────────────────────────────
  function updateCardio(blockId: string, fn: (d: CardioBlockData) => CardioBlockData) {
    draft = { ...draft, blocks: draft.blocks.map((b) => (b.id === blockId ? { ...b, data: fn(b.data as CardioBlockData) } : b)) };
  }

  function setCardioInterval(blockId: string, id: string, patch: Partial<CardioInterval>) {
    updateCardio(blockId, (d) => ({ ...d, intervals: d.intervals.map((iv) => (iv.id === id ? { ...iv, ...patch } : iv)) }));
  }

  function addInterval(blockId: string) {
    updateCardio(blockId, (d) => ({
      ...d,
      intervals: [...d.intervals, { id: createId("interval"), orderIndex: d.intervals.length, durationMs: null, distanceM: null, note: null }],
    }));
  }

  function removeInterval(blockId: string, id: string) {
    updateCardio(blockId, (d) => ({
      ...d,
      intervals: d.intervals.filter((iv) => iv.id !== id).map((iv, i) => ({ ...iv, orderIndex: i })),
    }));
  }

  // ── Adding and swapping ─────────────────────────────────────────────────
  const adding = $state({ picker: false, strength: false, cardio: false, mobility: false, swapFor: null as string | null });

  async function addStrength(sel: { name: string; exerciseId?: string }) {
    const name = sel.name.trim();
    if (!name) return;
    let exerciseId = sel.exerciseId;
    if (!exerciseId) exerciseId = (await getExerciseRepo().create(name)).id;
    if (adding.swapFor) {
      const id = adding.swapFor;
      adding.swapFor = null;
      apply((s) => swapExercise(s, id, { exerciseName: name, exerciseId }));
      return;
    }
    apply((s) => {
      const next = addExercise(s, { exerciseName: name, exerciseId });
      const added = next.blocks.at(-1)!;
      return addSet(next, added.id, { reps: 0, weight: 0 });
    });
  }

  let confirmDelete = $state(false);

  const inputBox =
    "h-10 w-full min-w-0 rounded-md border border-border bg-background px-2 text-center text-[15px] font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
  const field = "h-10 w-full min-w-0 rounded-md border border-border bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
</script>

{#snippet blockMenu(b: SessionBlock, swappable: boolean)}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      aria-label="More for this exercise"
      disabled={saving}
    >
      <MoreHorizontal class="h-5 w-5" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end">
      {#if swappable}
        <DropdownMenu.Item onSelect={() => { adding.swapFor = b.id; adding.strength = true; }}>
          <ArrowLeftRight /> Swap exercise
        </DropdownMenu.Item>
      {/if}
      <DropdownMenu.Item disabled={!canMove(b.id, -1)} onSelect={() => move(b.id, -1)}><ArrowUp /> Move up</DropdownMenu.Item>
      <DropdownMenu.Item disabled={!canMove(b.id, 1)} onSelect={() => move(b.id, 1)}><ArrowDown /> Move down</DropdownMenu.Item>
      <div class="my-1 h-px bg-border" role="separator"></div>
      <DropdownMenu.Item variant="destructive" onSelect={() => apply((s) => removeExercise(s, b.id))}>
        <Trash2 /> Remove
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/snippet}

<div class="flex flex-col gap-3">
  <!-- Details -->
  <section class="flex flex-col gap-3 rounded-xl border bg-card px-3.5 py-3">
    <label class="flex flex-col gap-1">
      <span class="text-xs font-medium text-muted-foreground">Name</span>
      <input
        type="text"
        class="{field} text-[15px] font-medium"
        placeholder={autoTitle}
        value={draft.name ?? ""}
        disabled={saving}
        oninput={(e) => apply((s) => ({ ...s, name: e.currentTarget.value }))}
      />
    </label>
    <div class="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
      <label class="flex min-w-0 flex-col gap-1">
        <span class="text-xs font-medium text-muted-foreground">Day</span>
        <input type="date" class={field} value={dayValue} disabled={saving} onchange={(e) => setTimes(e.currentTarget.value, fromValue, toValue)} />
      </label>
      <label class="flex min-w-0 flex-col gap-1">
        <span class="text-xs font-medium text-muted-foreground">From</span>
        <input type="time" class={field} value={fromValue} disabled={saving} onchange={(e) => setTimes(dayValue, e.currentTarget.value, toValue)} />
      </label>
      <label class="flex min-w-0 flex-col gap-1">
        <span class="text-xs font-medium text-muted-foreground">To</span>
        <input type="time" class={field} value={toValue} disabled={saving} onchange={(e) => setTimes(dayValue, fromValue, e.currentTarget.value)} />
      </label>
    </div>
    <label class="flex flex-col gap-1">
      <span class="text-xs font-medium text-muted-foreground">Note</span>
      <textarea
        rows="2"
        class="w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        placeholder="How it felt, sleep, anything…"
        value={draft.note ?? ""}
        disabled={saving}
        oninput={(e) => apply((s) => ({ ...s, note: e.currentTarget.value }))}
      ></textarea>
    </label>
    <div class="flex items-center justify-between gap-3">
      <div class="flex flex-col">
        <span class="text-sm font-medium">Leave out of progression</span>
        <span class="text-xs text-muted-foreground">It won't change future weights.</span>
      </div>
      <Switch
        checked={draft.excludeFromProgression ?? false}
        label="Leave out of progression"
        disabled={saving}
        onchange={(v) => apply((s) => ({ ...s, excludeFromProgression: v || undefined }))}
      />
    </div>
  </section>

  <!-- Exercises, drills, cardio -->
  {#each blocks as b (b.id)}
    {@const group = blockGroup(b)}
    {@const firstInGroup = group && blocks.find((x) => blockGroup(x)?.id === group.id)?.id === b.id}
    {#if group && firstInGroup}
      {@const members = supersetMembers(draft, group.id)}
      <p class="-mb-1.5 flex items-center gap-1.5 px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Link2 class="h-3.5 w-3.5" /> {groupLabel(members.length, group.label, group.kind)}
      </p>
    {/if}
    <section class="overflow-hidden rounded-xl border bg-card {group ? 'ml-3' : ''}">
      {#if b.type === "strength"}
        {@const d = b.data as StrengthBlockData}
        {@const sets = [...d.sets].sort((x, y) => x.orderIndex - y.orderIndex)}
        {@const bw = bodyweightOf(d)}
        <div class="flex items-center border-b border-border bg-muted/30 pl-3.5 pr-1">
          <span class="min-w-0 flex-1 truncate text-sm font-semibold">{d.exerciseName}</span>
          <span class="shrink-0 text-xs text-muted-foreground tabular-nums">{sets.length} set{sets.length === 1 ? "" : "s"}</span>
          <button
            type="button"
            class="ml-1 flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-50"
            aria-label="Add a set to {d.exerciseName}"
            disabled={saving}
            onclick={() => addSetTo(b.id, d)}
          >
            <span class="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground"><Plus class="h-4 w-4" /></span>
          </button>
          {@render blockMenu(b, true)}
        </div>
        <div class="grid grid-cols-[1.5rem_minmax(0,1fr)_5.5rem_3.25rem_2.75rem] gap-1.5 px-3 pb-1 pt-2 text-xs text-muted-foreground">
          <span class="text-center">#</span><span>Last</span><span class="text-center">{unit}</span><span class="text-center">Reps</span><span></span>
        </div>
        <div class="pb-1.5">
          {#each sets as s, i (s.id)}
            <SetRow
              setNumber={workingNumber(sets, s.id)}
              setType={s.setType}
              reps={s.reps}
              weight={s.weight}
              weightUnit={unit}
              bodyweight={bw}
              rpe={s.rpe ?? null}
              prev={prevFor(b.id, i)}
              completed={false}
              disabled={saving}
              gripAction={noGrip}
              onWeightChange={(w) => apply((x) => updateSet(x, b.id, s.id, { weight: w }))}
              onRepsChange={(r) => apply((x) => updateSet(x, b.id, s.id, { reps: r, completed: r > 0 }))}
              onOpenDetails={() => void openSetCard(b.id, s.id)}
              onRemove={() => apply((x) => removeSet(x, b.id, s.id))}
            />
          {:else}
            <p class="px-3.5 py-2 text-xs text-muted-foreground">No sets. Add one with +.</p>
          {/each}
        </div>
      {:else if b.type === "mobility"}
        {@const d = b.data as MobilityBlockData}
        <div class="flex items-center border-b border-border bg-muted/30 pl-3.5 pr-1">
          <span class="min-w-0 flex-1 truncate text-sm font-semibold">{d.drillName}</span>
          <span class="shrink-0 text-xs text-muted-foreground">{d.metric === "hold" ? "Hold, s" : "Reps"}{d.perSide ? " · each side" : ""}</span>
          <button
            type="button"
            class="ml-1 flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-50"
            aria-label="Add a round to {d.drillName}"
            disabled={saving}
            onclick={() => apply((x) => addMobilitySet(x, b.id))}
          >
            <span class="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground"><Plus class="h-4 w-4" /></span>
          </button>
          {@render blockMenu(b, false)}
        </div>
        <div class="flex flex-col gap-1 px-3 py-2">
          {#each mobilitySetGroups(d) as g (g.setNumber)}
            {@const first = g.kind === "single" ? g.set : (g.left ?? g.right)}
            <div class="grid {g.kind === 'pair' ? 'grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_2.75rem]' : 'grid-cols-[1.5rem_minmax(0,1fr)_2.75rem]'} items-center gap-1.5">
              <span class="text-center text-xs text-muted-foreground tabular-nums">{g.setNumber}</span>
              {#if g.kind === "single"}
                <input type="number" inputmode="numeric" min="0" class={inputBox} aria-label="Round {g.setNumber}" placeholder={g.set.targetSec ? String(g.set.targetSec) : "0"} value={mobValue(g.set, d.metric)} disabled={saving} onchange={(e) => setMob(b.id, g.set, d.metric, e.currentTarget.value)} />
              {:else}
                <label class="relative">
                  <span class="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs font-semibold text-muted-foreground">L</span>
                  <input type="number" inputmode="numeric" min="0" class="{inputBox} pl-6" aria-label="Round {g.setNumber} left" value={mobValue(g.left, d.metric)} disabled={saving || !g.left} onchange={(e) => setMob(b.id, g.left, d.metric, e.currentTarget.value)} />
                </label>
                <label class="relative">
                  <span class="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs font-semibold text-muted-foreground">R</span>
                  <input type="number" inputmode="numeric" min="0" class="{inputBox} pl-6" aria-label="Round {g.setNumber} right" value={mobValue(g.right, d.metric)} disabled={saving || !g.right} onchange={(e) => setMob(b.id, g.right, d.metric, e.currentTarget.value)} />
                </label>
              {/if}
              <button
                type="button"
                class="flex h-11 w-11 items-center justify-center justify-self-center text-muted-foreground hover:text-destructive"
                aria-label="Remove round {g.setNumber}"
                disabled={saving || !first}
                onclick={() => first && apply((x) => removeMobilitySet(x, b.id, first.id))}
              >
                <X class="h-4 w-4" />
              </button>
            </div>
          {/each}
        </div>
      {:else if b.type === "cardio"}
        {@const d = b.data as CardioBlockData}
        <div class="flex items-center border-b border-border bg-muted/30 pl-3.5 pr-1">
          <span class="min-w-0 flex-1 truncate text-sm font-semibold">{d.activityName}</span>
          <button
            type="button"
            class="ml-1 flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-50"
            aria-label="Add an interval to {d.activityName}"
            disabled={saving}
            onclick={() => addInterval(b.id)}
          >
            <span class="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground"><Plus class="h-4 w-4" /></span>
          </button>
          {@render blockMenu(b, false)}
        </div>
        <div class="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_2.75rem] gap-1.5 px-3 pt-2 pb-1 text-xs text-muted-foreground">
          <span class="text-center">#</span><span class="text-center">Minutes</span><span class="text-center">{unit === "lbs" ? "Miles" : "Km"}</span><span></span>
        </div>
        <div class="flex flex-col gap-1 px-3 pb-2">
          {#each [...d.intervals].sort((x, y) => x.orderIndex - y.orderIndex) as iv, i (iv.id)}
            <div class="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_2.75rem] items-center gap-1.5">
              <span class="text-center text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <input
                type="number" inputmode="decimal" min="0" step="0.5" class={inputBox} aria-label="Interval {i + 1} minutes"
                value={iv.durationMs ? trimWeight(iv.durationMs / 60_000) : ""}
                disabled={saving}
                onchange={(e) => { const v = Number(e.currentTarget.value); setCardioInterval(b.id, iv.id, { durationMs: v > 0 ? Math.round(v * 60_000) : null }); }}
              />
              <input
                type="number" inputmode="decimal" min="0" step="0.1" class={inputBox} aria-label="Interval {i + 1} distance"
                value={iv.distanceM ? trimWeight(unit === "lbs" ? iv.distanceM / 1609.344 : iv.distanceM / 1000) : ""}
                disabled={saving}
                onchange={(e) => { const v = Number(e.currentTarget.value); setCardioInterval(b.id, iv.id, { distanceM: v > 0 ? Math.round(unit === "lbs" ? v * 1609.344 : v * 1000) : null }); }}
              />
              <button type="button" class="flex h-11 w-11 items-center justify-center justify-self-center text-muted-foreground hover:text-destructive" aria-label="Remove interval {i + 1}" disabled={saving} onclick={() => removeInterval(b.id, iv.id)}>
                <X class="h-4 w-4" />
              </button>
            </div>
          {:else}
            <p class="py-1 text-xs text-muted-foreground">Nothing logged. Add an interval with +.</p>
          {/each}
        </div>
      {/if}
    </section>
  {/each}

  <button
    type="button"
    class="flex h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-muted-foreground/50 text-sm font-medium hover:bg-muted/40 disabled:opacity-50"
    disabled={saving}
    onclick={() => (adding.picker = true)}
  >
    <Plus class="h-4 w-4" /> Add exercise, drill or cardio
  </button>

  <button
    type="button"
    class="flex h-11 items-center justify-center gap-2 text-sm font-medium text-destructive disabled:opacity-50"
    disabled={saving}
    onclick={() => (confirmDelete = true)}
  >
    <Trash2 class="h-4 w-4" /> Delete session
  </button>
</div>

<ConfirmDialog
  open={confirmDelete}
  onOpenChange={(v) => (confirmDelete = v)}
  title="Delete this session?"
  description="It's removed for good, and progression stops counting it."
  confirmLabel="Delete"
  {saving}
  onConfirm={onDelete}
/>

<EditSetDialog
  open={setCard.open}
  disabled={saving}
  initial={cardSet}
  {machines}
  {defaultMachineId}
  exerciseId={cardExerciseId}
  weightUnit={unit}
  onOpenChange={(v) => (setCard.open = v)}
  onSave={(patch) => {
    if (!setCard.blockId || !setCard.setId) return;
    const blockId = setCard.blockId;
    const setId = setCard.setId;
    apply((x) => updateSet(x, blockId, setId, patch as Parameters<typeof updateSet>[3]));
  }}
/>

<BlockPickerSheet
  open={adding.picker}
  onOpenChange={(v) => (adding.picker = v)}
  onSelect={(type) => {
    adding.picker = false;
    setTimeout(() => {
      if (type === "strength") adding.strength = true;
      else if (type === "cardio") adding.cardio = true;
      else if (type === "mobility") adding.mobility = true;
    }, 150);
  }}
/>

<AddExerciseDialog
  open={adding.strength}
  saving={saving}
  title={adding.swapFor ? "Swap exercise" : undefined}
  onOpenChange={(v) => { adding.strength = v; if (!v) adding.swapFor = null; }}
  onSubmit={(sel) => void addStrength(sel)}
/>

<AddCardioDialog
  open={adding.cardio}
  saving={saving}
  onOpenChange={(v) => (adding.cardio = v)}
  onSubmit={(name: string) => apply((s) => addCardioBlock(s, name))}
/>

<AddMobilityDialog
  open={adding.mobility}
  saving={saving}
  onOpenChange={(v) => (adding.mobility = v)}
  onSubmit={(drill: { drillName: string; drillId?: string; metric: MobilityMetric; perSide: boolean }) =>
    apply((s) => addMobilityBlock(s, drill))}
/>
