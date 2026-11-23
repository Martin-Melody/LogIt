<script lang="ts" module>
  import type { MobilityMetric } from "@logit/core/domain/workout";

  /** One thing picked in "Add to workout". */
  export type AddPick =
    | { kind: "strength"; name: string; exerciseId?: string }
    | { kind: "cardio"; name: string }
    | { kind: "mobility"; name: string; drillId?: string; metric: MobilityMetric; perSide: boolean }
    | { kind: "plugin"; name: string; type: string };
</script>

<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Check, Dumbbell, PersonStanding, Plus, Puzzle, Search, Timer } from "lucide-svelte";
  import type { CardioBlockData, MobilityBlockData, StrengthBlockData, WorkoutSession } from "@logit/core/domain/workout";
  import type { LibraryEntry } from "@logit/core/domain/library";
  import type { CardioActivity } from "@logit/core/domain/cardioActivity";
  import type { MobilityDrill } from "@logit/core/domain/mobilityDrill";
  import type { Exercise } from "@logit/core/domain/exercise";
  import { pluginBlockType } from "@logit/core/domain/blockPlugin";
  import { loadLibrary } from "$lib/data/library/library";
  import { getWorkoutRepo } from "$lib/data/repoProvider";
  import { listBlockDeclarations } from "$lib/plugins/blockPluginStore";
  import { chip } from "$lib/components/ui/choice";
  import { profile } from "$lib/stores/profile.store";
  import { setsLine } from "$lib/features/session/planFormat";

  // One sheet for every kind of block (design canvas S-add): search everything, filter by
  // kind, tick as many as you like, then add them or make them a superset. Replaces the
  // block-type picker and the three add dialogs.
  const {
    open,
    onOpenChange,
    session = null,
    saving = false,
    allowGroup = true,
    onAdd,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** What's in the workout already (left out of the suggestions). */
    session?: WorkoutSession | null;
    saving?: boolean;
    /** "As a superset" (off when adding to a group from its picker). */
    allowGroup?: boolean;
    onAdd: (picks: AddPick[], asGroup: boolean) => void | Promise<void>;
  } = $props();

  type Kind = "all" | "strength" | "cardio" | "mobility" | `plugin:${string}`;
  type Row = { key: string; pick: AddPick; detail: string };

  let query = $state("");
  let kind = $state<Kind>("all");
  let picked = $state<Row[]>([]);
  let entries = $state<LibraryEntry[]>([]);
  let recent = $state<Row[]>([]);
  let inputEl = $state<HTMLInputElement | null>(null);

  const plugins = $derived(listBlockDeclarations());

  $effect(() => {
    if (!open) {
      query = "";
      kind = "all";
      picked = [];
      return;
    }
    void loadLibrary().then((e) => (entries = e)).catch(() => (entries = []));
    void loadRecent();
  });

  function rowFor(e: LibraryEntry): Row {
    if (e.kind === "strength") {
      const ex = e.item as Exercise;
      return { key: `s:${ex.id}`, pick: { kind: "strength", name: ex.name, exerciseId: ex.id }, detail: [ex.primaryMuscles?.[0], ex.equipment].filter(Boolean).join(" · ") };
    }
    if (e.kind === "cardio") {
      const a = e.item as CardioActivity;
      return { key: `c:${a.name.toLowerCase()}`, pick: { kind: "cardio", name: a.name }, detail: "Cardio" };
    }
    const d = e.item as MobilityDrill;
    return {
      key: `m:${d.id}`,
      pick: { kind: "mobility", name: d.name, drillId: d.id, metric: d.defaultMetric, perSide: d.perSide },
      detail: `Mobility · ${d.defaultMetric === "hold" ? "hold" : "reps"}${d.perSide ? " each side" : ""}`,
    };
  }

  /** Things logged in the last few workouts, any kind, with what was done last time. */
  async function loadRecent() {
    try {
      const sessions = await getWorkoutRepo().listRecentSessions({ limit: 20 });
      const seen = new Set<string>();
      const out: Row[] = [];
      const unit = $profile.weightUnit;
      for (const s of sessions) {
        for (const b of [...s.blocks].sort((x, y) => x.orderIndex - y.orderIndex)) {
          let row: Row | null = null;
          if (b.type === "strength") {
            const d = b.data as StrengthBlockData;
            const done = d.sets.filter((x) => x.completed && x.setType !== "warmup" && x.reps > 0);
            row = { key: d.exerciseId ? `s:${d.exerciseId}` : `s:${d.exerciseName.toLowerCase()}`, pick: { kind: "strength", name: d.exerciseName, exerciseId: d.exerciseId },
              detail: done.length ? `Last time ${setsLine(done, unit)}` : "Strength" };
          } else if (b.type === "cardio") {
            const d = b.data as CardioBlockData;
            row = { key: `c:${d.activityName.toLowerCase()}`, pick: { kind: "cardio", name: d.activityName }, detail: "Cardio" };
          } else if (b.type === "mobility") {
            const d = b.data as MobilityBlockData;
            row = { key: d.drillId ? `m:${d.drillId}` : `m:${d.drillName.toLowerCase()}`, pick: { kind: "mobility", name: d.drillName, drillId: d.drillId, metric: d.metric, perSide: d.perSide },
              detail: `Mobility · ${d.metric === "hold" ? "hold" : "reps"}${d.perSide ? " each side" : ""}` };
          }
          if (row && !seen.has(row.key)) {
            seen.add(row.key);
            out.push(row);
          }
        }
      }
      recent = out;
    } catch {
      recent = [];
    }
  }

  // Already in today's workout: not suggested again (still found by search).
  const inWorkout = $derived(
    new Set(
      (session?.blocks ?? []).map((b) =>
        b.type === "strength"
          ? ((b.data as StrengthBlockData).exerciseId ? `s:${(b.data as StrengthBlockData).exerciseId}` : `s:${(b.data as StrengthBlockData).exerciseName.toLowerCase()}`)
          : b.type === "cardio" ? `c:${(b.data as CardioBlockData).activityName.toLowerCase()}` : b.type === "mobility" ? `m:${(b.data as MobilityBlockData).drillId ?? (b.data as MobilityBlockData).drillName.toLowerCase()}` : b.id,
      ),
    ),
  );

  const matchesKind = (r: Row) => kind === "all" || r.pick.kind === kind || (r.pick.kind === "plugin" && r.pick.type === kind);
  const pluginRows = $derived<Row[]>(plugins.map((d) => ({ key: `p:${d.id}`, pick: { kind: "plugin", name: d.name, type: pluginBlockType(d.id) }, detail: d.description ?? "Plugin" })));
  const q = $derived(query.trim().toLowerCase());
  const results = $derived.by<Row[]>(() => {
    if (!q) return [];
    const all = [...entries.map(rowFor), ...pluginRows].filter(matchesKind);
    const starts = all.filter((r) => r.pick.name.toLowerCase().startsWith(q));
    const contains = all.filter((r) => !r.pick.name.toLowerCase().startsWith(q) && r.pick.name.toLowerCase().includes(q));
    // Library rows get last time from recent, where there is one.
    const last = new Map(recent.map((r) => [r.key, r.detail]));
    return [...starts, ...contains].slice(0, 40).map((r) => ({ ...r, detail: last.get(r.key) ?? r.detail }));
  });
  const recentShown = $derived(recent.filter((r) => matchesKind(r) && !inWorkout.has(r.key)).slice(0, 10));
  const pluginsShown = $derived(kind === "all" || kind.startsWith("plugin:") ? pluginRows.filter(matchesKind) : []);
  const exact = $derived(!!q && results.some((r) => r.pick.name.toLowerCase() === q));
  const createKind = $derived<"strength" | "cardio" | "mobility">(kind === "cardio" || kind === "mobility" ? kind : "strength");

  const isPicked = (r: Row) => picked.some((p) => p.key === r.key);
  function toggle(r: Row) {
    picked = isPicked(r) ? picked.filter((p) => p.key !== r.key) : [...picked, r];
  }
  function createRow(): Row {
    const name = query.trim();
    if (createKind === "cardio") return { key: `c:${name.toLowerCase()}`, pick: { kind: "cardio", name }, detail: "New activity" };
    if (createKind === "mobility") return { key: `m:${name.toLowerCase()}`, pick: { kind: "mobility", name, metric: "reps", perSide: false }, detail: "New drill" };
    return { key: `s:${name.toLowerCase()}`, pick: { kind: "strength", name }, detail: "New exercise" };
  }
  async function add(asGroup: boolean) {
    const picks = picked.map((r) => r.pick);
    if (!picks.length) return;
    onOpenChange(false);
    await onAdd(picks, asGroup);
  }

  const ICON = { strength: Dumbbell, cardio: Timer, mobility: PersonStanding, plugin: Puzzle } as const;
</script>

{#snippet rowButton(r: Row)}
  {@const on = isPicked(r)}
  {@const Icon = ICON[r.pick.kind]}
  <button type="button" class="flex min-h-14 w-full items-center gap-3 border-t border-border px-1 text-left first:border-t-0" aria-pressed={on} onclick={() => toggle(r)}>
    <span class="flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors {on ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}">
      {#if on}<Check class="h-3.5 w-3.5" strokeWidth={3} />{/if}
    </span>
    <span class="flex min-w-0 flex-1 flex-col py-1.5">
      <span class="truncate text-[15px]">{r.pick.name}</span>
      {#if r.detail}<span class="truncate text-xs text-muted-foreground tabular-nums">{r.detail}</span>{/if}
    </span>
    {#if r.pick.kind !== "strength"}
      <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon class="h-4 w-4" /></span>
    {/if}
  </button>
{/snippet}

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content sheet class="top-14 flex max-h-none flex-col gap-3 bg-card" onOpenAutoFocus={(e) => { e.preventDefault(); }}>
    <Dialog.Title class="text-[19px] font-semibold">Add to workout</Dialog.Title>
    <Dialog.Description class="sr-only">Search exercises, cardio, drills and plugin blocks, tick what to add.</Dialog.Description>

    <label class="flex h-12 shrink-0 items-center gap-2.5 rounded-xl border border-input bg-background px-3.5 text-muted-foreground focus-within:ring-1 focus-within:ring-ring">
      <Search class="h-4 w-4 shrink-0" />
      <input bind:this={inputEl} bind:value={query} type="search" placeholder="Search exercises, cardio, drills…" aria-label="Search"
        class="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none" />
    </label>

    <div class="-mx-4 flex shrink-0 gap-2 overflow-x-auto px-4 pb-0.5" role="group" aria-label="Kind" data-no-tab-swipe>
      {#each [["all", "All"], ["strength", "Strength"], ["cardio", "Cardio"], ["mobility", "Mobility"]] as [k, label] (k)}
        <button type="button" class={chip(kind === k)} aria-pressed={kind === k} onclick={() => (kind = k as Kind)}>{label}</button>
      {/each}
      {#each plugins as d (d.id)}
        <button type="button" class={chip(kind === pluginBlockType(d.id))} aria-pressed={kind === pluginBlockType(d.id)} onclick={() => (kind = pluginBlockType(d.id) as Kind)}>
          <Puzzle class="h-3.5 w-3.5" />{d.name}
        </button>
      {/each}
    </div>

    <div class="-mx-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
      {#if q}
        <div class="flex flex-col">
          {#each results as r (r.key)}{@render rowButton(r)}{/each}
          {#if !exact}
            <button type="button" class="flex min-h-14 w-full items-center gap-3 border-t border-border px-1 text-left" onclick={() => { const r = createRow(); if (!isPicked(r)) toggle(r); query = ""; }}>
              <span class="flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-input"><Plus class="h-3.5 w-3.5" /></span>
              <span class="flex min-w-0 flex-1 flex-col"><span class="truncate text-[15px]">Add “{query.trim()}”</span><span class="text-xs text-muted-foreground">New {createKind === "strength" ? "exercise" : createKind === "cardio" ? "activity" : "drill"}</span></span>
            </button>
          {/if}
        </div>
      {:else}
        {#if picked.length && picked.some((p) => !recentShown.some((r) => r.key === p.key))}
          <h3 class="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Picked</h3>
          <div class="mb-3 flex flex-col">{#each picked.filter((p) => !recentShown.some((r) => r.key === p.key)) as r (r.key)}{@render rowButton(r)}{/each}</div>
        {/if}
        {#if recentShown.length}
          <h3 class="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Recent</h3>
          <div class="mb-3 flex flex-col">{#each recentShown as r (r.key)}{@render rowButton(r)}{/each}</div>
        {/if}
        {#if pluginsShown.length}
          <h3 class="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Plugin blocks</h3>
          <div class="mb-3 flex flex-col">{#each pluginsShown as r (r.key)}{@render rowButton(r)}{/each}</div>
        {/if}
        {#if !recentShown.length && !pluginsShown.length}
          <p class="py-6 text-center text-sm text-muted-foreground">Search for an exercise, cardio or a drill.</p>
        {/if}
      {/if}
    </div>

    <div class="flex shrink-0 gap-2 pt-1">
      {#if allowGroup}
        <button type="button" class="h-12 flex-1 rounded-xl border border-input text-[15px] font-medium disabled:opacity-40" disabled={picked.length < 2 || saving} onclick={() => void add(true)}>As a superset</button>
      {/if}
      <button type="button" class="h-12 flex-[1.3] rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-40" disabled={!picked.length || saving}
        data-testid="add-picked" onclick={() => void add(false)}>
        {picked.length ? `Add ${picked.length}` : "Add"}
      </button>
    </div>
  </Dialog.Content>
</Dialog.Root>
