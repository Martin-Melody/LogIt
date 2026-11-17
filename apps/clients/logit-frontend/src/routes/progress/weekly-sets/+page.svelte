<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { back } from "$lib/navigation";
  import { getSplitRepo } from "$lib/data/repoProvider";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import { goalsStore } from "$lib/features/goals/goalsStore";
  import { getWeeklySets, type WeeklySetsView } from "@logit/core/usecases/progression/getWeeklySets";
  import { MUSCLE_LABELS } from "@logit/core/domain/weeklySets";
  import type { WeeklySetsRow } from "@logit/core/usecases/progression/getWeeklySets";
  import { saveMuscleSetTarget } from "@logit/core/usecases/progression/exerciseProgressionSettings";
  import { pushExerciseSetting } from "$lib/sync/syncService";
  import { bumpProgression } from "$lib/progression/store";
  import { Minus, Plus } from "lucide-svelte";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";

  // Sets this week: hard sets per muscle against each muscle's target, then the active
  // split scored against the same targets, with a fix for anything it leaves short.
  let view = $state<WeeklySetsView | null>(null);
  let splitId = $state<string | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(() => void load());

  async function load() {
    loading = true;
    try {
      splitId = await getSplitRepo().getActiveSplitId().catch(() => null);
      const split = splitId ? await getSplitRepo().getSplit(splitId) : null;
      view = await getWeeklySets(getProgressionDeps(), { split, workoutsPerWeek: get(goalsStore).streak.weeklyTarget });
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load your sets";
    } finally {
      loading = false;
    }
  }

  // The bar runs to 20 sets, or further when a target or this week goes past it.
  const scale = $derived(
    Math.max(20, ...(view?.rows.map((r) => Math.max(r.target.hi, r.done)) ?? []), ...(view?.split?.rows.map((r) => r.planned) ?? [])),
  );
  const pct = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;

  // ── Editing a muscle's target ──
  let editing = $state<WeeklySetsRow | null>(null);
  let lo = $state(0);
  let hi = $state(0);
  function edit(r: WeeklySetsRow) {
    editing = r;
    lo = r.target.lo;
    hi = r.target.hi;
  }
  function nudge(which: "lo" | "hi", by: number) {
    if (which === "lo") {
      lo = Math.max(0, Math.min(40, lo + by));
      if (hi < lo) hi = lo;
    } else {
      hi = Math.max(0, Math.min(40, hi + by));
      if (lo > hi) lo = hi;
    }
  }
  async function saveTarget(target: { lo: number; hi: number } | null) {
    if (!editing) return;
    const row = await saveMuscleSetTarget(editing.muscle, target, getProgressionDeps());
    if (row) pushExerciseSetting(row);
    editing = null;
    bumpProgression();
    await load();
  }
  const editScale = 30;
  const ePct = (n: number) => `${Math.min(100, (n / editScale) * 100)}%`;
  const fmt = (n: number) => String(Math.round(n * 10) / 10);

  const weekLabel = $derived.by(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const f = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return `${f(monday)} – ${f(sunday)}`;
  });
  const short = $derived(view?.split?.rows.filter((r) => r.fix) ?? []);
</script>

<PageHeader>
  <BackButton onclick={() => back("/progress")} />
  <div class="min-w-0 flex-1">
    <h1 class="page-title leading-tight">Sets this week</h1>
    <p class="text-xs text-muted-foreground">{weekLabel} · hard sets per muscle</p>
  </div>
</PageHeader>

<div class="flex flex-col gap-4 px-3 pb-10 pt-2">
  {#if loading}
    <p class="px-1 py-6 text-sm text-muted-foreground">Loading…</p>
  {:else if error}
    <p class="px-1 py-6 text-sm text-destructive">{error}</p>
  {:else if view}
    <div class="flex gap-4 px-1 text-xs text-muted-foreground" aria-hidden="true">
      <span class="flex items-center gap-1.5"><span class="h-2 w-3.5 rounded-full bg-foreground"></span>Done</span>
      <span class="flex items-center gap-1.5"><span class="h-2 w-3.5 rounded-full bg-primary/35"></span>Target</span>
    </div>

    <ul class="overflow-hidden rounded-2xl bg-card" data-testid="weekly-sets">
      {#each view.rows as r, i (r.muscle)}
        <li class={i > 0 ? "border-t border-border" : ""}>
          <button type="button" class="flex w-full flex-col gap-1.5 px-4 py-3 text-left" onclick={() => edit(r)} aria-label="{r.label}: {fmt(r.done)} sets of {r.target.lo} to {r.target.hi}. Change the target">
          <div class="flex items-baseline gap-2">
            <span class="flex-1 font-medium">{r.label}</span>
            {#if r.target.custom}<span class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Yours</span>
            {:else if r.target.learned}<span class="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">Learned</span>{/if}
            <span class="text-[13px] tabular-nums">{fmt(r.done)} of {r.target.lo}–{r.target.hi}</span>
          </div>
          <div class="relative h-2 rounded-full bg-muted" role="img" aria-label="{fmt(r.done)} sets done; target {r.target.lo} to {r.target.hi}">
            <div class="absolute inset-y-0 rounded-full bg-primary/35" style="left: {pct(r.target.lo)}; width: calc({pct(r.target.hi)} - {pct(r.target.lo)})"></div>
            <div class="absolute inset-y-0 left-0 rounded-full bg-foreground" style="width: {pct(r.done)}"></div>
          </div>
          {#if r.note && !r.target.custom}<p class="text-xs leading-relaxed text-muted-foreground">{r.note}</p>{/if}
          </button>
        </li>
      {/each}
    </ul>

    {#if view.split}
      <section class="flex flex-col gap-2 rounded-2xl bg-card p-4" data-testid="split-score" aria-labelledby="split-score-title">
        <h2 id="split-score-title" class="font-semibold">Your split, scored</h2>
        <p class="text-[13px] leading-relaxed text-muted-foreground">
          {view.split.name} plans, per week{view.split.workoutsPerWeek ? ` (at ${view.split.workoutsPerWeek} workouts a week)` : ""}:
          {#if short.length === 0}every muscle lands in its range.{/if}
        </p>
        <ul class="flex flex-col gap-1">
          {#each view.split.rows.filter((r) => r.planned > 0 || r.status === "under") as r (r.muscle)}
            <li class="flex items-baseline gap-2 text-[13px]">
              <span class="flex-1">{MUSCLE_LABELS[r.muscle]}</span>
              <span class="tabular-nums {r.status === 'under' ? 'text-warning' : r.status === 'over' ? 'text-muted-foreground' : ''}">
                {fmt(r.planned)} of {r.target.lo}–{r.target.hi}
              </span>
            </li>
          {/each}
        </ul>
        {#each short as r (r.muscle)}
          <p class="text-[13px] leading-relaxed"><span class="font-medium">{MUSCLE_LABELS[r.muscle]}:</span> {r.fix}</p>
        {/each}
        {#if splitId && short.length > 0}
          <a href="/splits/{splitId}" class="mt-1 inline-flex h-10 items-center self-start rounded-lg bg-muted px-3.5 text-[13px] font-medium">Open the split</a>
        {/if}
      </section>
    {:else}
      <p class="px-1 text-xs text-muted-foreground">Pick a split and it gets scored here against these targets.</p>
    {/if}

    <p class="px-1 text-xs leading-relaxed text-muted-foreground">
      A set counts fully for the muscles an exercise mainly works and 40% for the ones it also works. Most muscles grow well
      somewhere around 10–20 hard sets a week; smaller ones also get work from bigger lifts, so their range starts lower. Once
      LogIt has enough of your weeks, a muscle's range moves to what has worked for you.
    </p>
  {/if}
</div>

{#if editing}
  {@const r = editing}
  <BottomSheet label="{r.label} weekly target" onclose={() => (editing = null)}>
    <div class="px-5 pt-1">
      <h2 class="text-lg font-bold">{r.label}</h2>
      <p class="text-xs text-muted-foreground tabular-nums">{fmt(r.done)} hard sets so far this week</p>
    </div>
    <div class="grid grid-cols-2 gap-3 px-5 pt-5" data-testid="target-editor">
      {#each [["lo", "At least", lo], ["hi", "At most", hi]] as [key, label, value] (key)}
        <div class="flex flex-col items-center gap-2">
          <span class="text-xs text-muted-foreground">{label}</span>
          <div class="flex items-center gap-3">
            <button type="button" class="flex size-12 items-center justify-center rounded-full bg-muted" aria-label="{label}: fewer" onclick={() => nudge(key as "lo" | "hi", -1)}><Minus class="size-5" /></button>
            <span class="min-w-11 text-center text-[34px] font-bold tabular-nums" data-testid="target-{key}">{value}</span>
            <button type="button" class="flex size-12 items-center justify-center rounded-full bg-muted" aria-label="{label}: more" onclick={() => nudge(key as "lo" | "hi", 1)}><Plus class="size-5" /></button>
          </div>
        </div>
      {/each}
    </div>
    <div class="px-5 pt-4">
      <div class="relative h-2.5 rounded-full bg-muted" aria-hidden="true">
        <div class="absolute inset-y-0 rounded-full bg-primary/40" style="left: {ePct(lo)}; width: calc({ePct(hi)} - {ePct(lo)})"></div>
        <div class="absolute inset-y-0 left-0 rounded-full bg-foreground" style="width: {ePct(r.done)}"></div>
      </div>
      <div class="mt-1.5 flex justify-between text-[11px] text-muted-foreground tabular-nums"><span>0</span><span>10</span><span>20</span><span>30 sets</span></div>
    </div>
    <div class="mx-4 mt-4 flex flex-col gap-1.5 rounded-xl bg-muted/60 px-3.5 py-3 text-xs leading-relaxed dark:bg-background">
      <p><span class="text-muted-foreground">Default:</span> {r.defaultTarget.lo}–{r.defaultTarget.hi}. Most muscles grow well around 10–20 hard sets a week.</p>
      {#if r.learnedTarget}<p><span class="text-muted-foreground">Learned:</span> {r.learnedTarget.lo}–{r.learnedTarget.hi}. {r.note}</p>{/if}
      <p class="text-muted-foreground">Yours is used here, to score your split, and by any algorithm set to adjust its sets to weekly targets.</p>
    </div>
    {#snippet footer()}
      <div class="flex gap-2">
        <button type="button" class="h-12 flex-1 rounded-xl border border-border font-medium" onclick={() => void saveTarget(null)}>Back to default</button>
        <button type="button" class="h-12 flex-[1.4] rounded-xl bg-primary font-semibold text-primary-foreground" onclick={() => void saveTarget({ lo, hi })}>Save</button>
      </div>
    {/snippet}
  </BottomSheet>
{/if}
