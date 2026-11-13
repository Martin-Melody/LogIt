<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { back } from "$lib/navigation";
  import { Trophy, Pencil, Trash2 } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { profile } from "$lib/stores/profile.store";
  import type { WeightUnit } from "@logit/core/domain/units";
  import GoalChart from "$lib/features/goals/GoalChart.svelte";
  import { goalsStore, activeGoals } from "$lib/features/goals/goalsStore";
  import {
    BODYWEIGHT_GOAL_KEY,
    goalTitle,
    loadBodyweightGoalView,
    loadGoalView,
    type GoalView,
  } from "$lib/features/goals/goalProgress";
  import { goalFormat, goalStatusText, deadlineText, fmtDate } from "$lib/features/goals/goalText";

  const id = $derived(page.params.id ?? "");
  const unit = $derived(($profile.weightUnit ?? "kg") as WeightUnit);
  const goal = $derived(activeGoals($goalsStore).find((g) => g.id === id) ?? null);
  const isBodyweight = $derived(id === BODYWEIGHT_GOAL_KEY);

  let view = $state<GoalView | null>(null);
  let loaded = $state(false);
  let confirmDelete = $state(false);

  $effect(() => {
    const g = goal;
    const u = unit;
    const bw = isBodyweight;
    loaded = false;
    const p = bw
      ? loadBodyweightGoalView()
      : g
        ? loadGoalView(g).then((v) => ({ ...v, title: goalTitle(g, u) }))
        : Promise.resolve(null);
    void p.then((v) => {
      view = v;
      loaded = true;
    }).catch(() => (loaded = true));
  });

  const f = $derived(view ? goalFormat(view, unit) : null);
  const p = $derived(view?.projection ?? null);
  // Once reached, show the best (the set that did it), not the smoothed trend.
  const reachedBest = $derived(
    view && p?.status === "achieved" && view.goal && view.goal.target.type !== "count" && view.points.length
      ? Math.max(...view.points.map((q) => q.value))
      : null,
  );
  const nowValue = $derived(
    view
      ? (reachedBest ??
          (view.goal?.target.type === "count" ? view.points.at(-1)?.value : (p?.current ?? view.points.at(-1)?.value)))
      : null,
  );

  function remove() {
    if (!goal) return;
    goalsStore.remove(goal.id);
    void goto("/progress", { replaceState: true });
  }
</script>

<div class="flex flex-col gap-3 p-3 pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/progress")} />
    <h1 class="page-title truncate">{view?.title ?? "Goal"}</h1>
  </PageHeader>

  {#if !loaded && !view}
    <p class="py-6 text-center text-sm text-muted-foreground">Loading…</p>
  {:else if !view || !f || !p}
    <Card.Root>
      <Card.Content class="py-6 text-center text-sm text-muted-foreground">
        {isBodyweight ? "No target weight set on your nutrition goal." : "This goal no longer exists."}
      </Card.Content>
    </Card.Root>
  {:else}
    {#if p.status === "achieved"}
      <div class="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3">
        <Trophy class="h-5 w-5 shrink-0 text-amber-500" />
        <p class="text-sm font-medium">{goalStatusText(view, unit)}</p>
      </div>
    {/if}

    <Card.Root>
      <Card.Content class="flex flex-col gap-3 pt-4">
        <div class="grid grid-cols-3 divide-x divide-border text-center">
          <div class="px-1">
            <p class="text-base font-semibold tabular-nums">{nowValue != null ? f.fmt(nowValue) : "–"}</p>
            <p class="text-[11px] text-muted-foreground">{reachedBest != null ? "Best" : "Now"}</p>
          </div>
          <div class="px-1">
            <p class="text-base font-semibold tabular-nums">{f.fmt(view.target)}</p>
            <p class="text-[11px] text-muted-foreground">Goal</p>
          </div>
          <div class="px-1">
            <p class="text-base font-semibold tabular-nums">{p.ratePerWeek != null ? f.fmtRate(p.ratePerWeek) : "–"}</p>
            <p class="text-[11px] text-muted-foreground">Pace</p>
          </div>
        </div>

        <GoalChart {view} toDisplay={f.toDisplay} unitLabel={f.unitLabel} />

        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-primary"></span>{view.unit === "bodyweight" ? "Weekly trend" : "Sessions"}</span>
          {#if p.line.length}<span class="flex items-center gap-1"><span class="w-3 border-t-2 border-dashed border-primary"></span>At this pace</span>{/if}
          {#if p.band.length}<span class="flex items-center gap-1"><span class="h-2 w-3 rounded-sm bg-primary/15"></span>Likely range</span>{/if}
          <span class="flex items-center gap-1"><span class="w-3 border-t-2 border-dashed border-amber-500"></span>Goal</span>
          {#if view.deadlineMs}<span class="flex items-center gap-1"><span class="h-3 border-l-2 border-dashed border-destructive/60"></span>Deadline</span>{/if}
        </div>

        {#if p.status !== "achieved"}
          <div class="flex flex-col gap-1 border-t border-border pt-3">
            <p class="text-sm {p.status === 'ready' ? 'font-medium text-amber-600 dark:text-amber-400' : ''}">{goalStatusText(view, unit)}</p>
            {#if deadlineText(view, unit)}
              <p class="text-xs text-muted-foreground">{deadlineText(view, unit)}</p>
            {/if}
            {#if p.status === "on_track" && p.eta && view.goal?.target.type === "count"}
              <p class="text-xs text-muted-foreground">
                Most likely {fmtDate(p.eta.likelyMs)}, at the pace of your last 8 weeks.
              </p>
            {:else if p.status === "on_track" && p.eta}
              <p class="text-xs text-muted-foreground">
                Most likely {fmtDate(p.eta.likelyMs)}. The range comes from the faster and slower stretches of your last few months; gains usually slow down as you get closer to a limit, so treat the later end as more likely the further out it is.
              </p>
            {:else if p.status === "stalled"}
              <p class="text-xs text-muted-foreground">
                The trend over your recent sessions is flat or going the other way, so there's no date to give. A change of rep range, more volume or more food usually gets it moving.
              </p>
            {/if}
          </div>
        {/if}
        <p class="text-[11px] text-muted-foreground">{view.measure}.</p>
      </Card.Content>
    </Card.Root>

    {#if isBodyweight}
      <Button variant="outline" href="/nutrition/goal">Change target weight</Button>
    {:else if goal}
      <div class="flex gap-2">
        <Button variant="outline" class="flex-1 gap-1.5" href="/progress/goals/{goal.id}/edit"><Pencil class="h-4 w-4" /> Edit</Button>
        {#if confirmDelete}
          <Button variant="destructive" class="flex-1" onclick={remove}>Delete goal</Button>
        {:else}
          <Button variant="outline" class="flex-1 gap-1.5 text-destructive" onclick={() => (confirmDelete = true)}><Trash2 class="h-4 w-4" /> Delete</Button>
        {/if}
      </div>
      {#if view.exerciseId}
        <a href="/exercises/{view.exerciseId}" class="text-center text-xs text-muted-foreground underline underline-offset-2">Exercise history</a>
      {/if}
      <p class="text-center text-[11px] text-muted-foreground">Set {fmtDate(goal.createdAtMs)}</p>
    {/if}
  {/if}
</div>
