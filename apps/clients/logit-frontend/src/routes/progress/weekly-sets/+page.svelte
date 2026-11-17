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
        <li class="flex flex-col gap-1.5 px-4 py-3 {i > 0 ? 'border-t border-border' : ''}">
          <div class="flex items-baseline gap-2">
            <span class="flex-1 font-medium">{r.label}</span>
            {#if r.target.learned}<span class="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">Learned</span>{/if}
            <span class="text-[13px] tabular-nums">{fmt(r.done)} of {r.target.lo}–{r.target.hi}</span>
          </div>
          <div class="relative h-2 rounded-full bg-muted" role="img" aria-label="{fmt(r.done)} sets done; target {r.target.lo} to {r.target.hi}">
            <div class="absolute inset-y-0 rounded-full bg-primary/35" style="left: {pct(r.target.lo)}; width: calc({pct(r.target.hi)} - {pct(r.target.lo)})"></div>
            <div class="absolute inset-y-0 left-0 rounded-full bg-foreground" style="width: {pct(r.done)}"></div>
          </div>
          {#if r.note}<p class="text-xs leading-relaxed text-muted-foreground">{r.note}</p>{/if}
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
