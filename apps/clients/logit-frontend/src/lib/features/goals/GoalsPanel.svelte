<script lang="ts">
  import { Plus, Target, Trophy, ChevronRight } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { profile } from "$lib/stores/profile.store";
  import { popIn } from "$lib/transitions";
  import type { WeightUnit } from "@logit/core/domain/units";
  import { goalsStore, activeGoals } from "./goalsStore";
  import { loadGoalViews, type GoalView } from "./goalProgress";
  import { goalFormat, goalStatusText, deadlineText } from "./goalText";
  import StreakCard from "./StreakCard.svelte";

  const unit = $derived(($profile.weightUnit ?? "kg") as WeightUnit);

  let views = $state<GoalView[] | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    const goals = activeGoals($goalsStore);
    const u = unit;
    loadGoalViews(goals, u)
      .then((v) => (views = v))
      .catch((e) => (error = e instanceof Error ? e.message : "Couldn't load goals"));
  });

  // Reached goals go to the bottom; the rest keep the order they were set in.
  const open = $derived((views ?? []).filter((v) => v.projection.status !== "achieved"));
  const reached = $derived((views ?? []).filter((v) => v.projection.status === "achieved"));

  function currentText(v: GoalView): string {
    const { fmt } = goalFormat(v, unit);
    const now = v.goal?.target.type === "count" ? v.points.at(-1)?.value : (v.projection.current ?? v.points.at(-1)?.value);
    return now != null ? `${fmt(now)} → ${fmt(v.target)}` : `Goal ${fmt(v.target)}`;
  }

  function href(v: GoalView) {
    return `/progress/goals/${v.key}`;
  }
</script>

<div class="flex flex-col gap-3">
  <StreakCard />

  <div class="flex items-center justify-between px-1 pt-1">
    <h2 class="text-sm font-semibold">Goals</h2>
    <Button size="sm" variant="ghost" href="/progress/goals/new" class="h-9 gap-1">
      <Plus class="h-4 w-4" /> Add goal
    </Button>
  </div>

  {#if error}
    <p class="px-1 text-sm text-destructive">{error}</p>
  {:else if views === null}
    <p class="px-1 text-sm text-muted-foreground">Loading…</p>
  {:else if views.length === 0}
    <Card.Root>
      <Card.Content class="flex flex-col items-center gap-2 py-8 text-center">
        <Target class="h-6 w-6 text-muted-foreground/60" />
        <p class="text-sm font-medium">No goals yet</p>
        <p class="max-w-64 text-xs text-muted-foreground">
          Set one, like bench 100 kg or 20 pull-ups, and see when you'll get there at the pace you're going.
        </p>
        <Button size="sm" href="/progress/goals/new" class="mt-2">Set a goal</Button>
      </Card.Content>
    </Card.Root>
  {:else}
    {#each [...open, ...reached] as v, i (v.key)}
      {@const done = v.projection.status === "achieved"}
      {@const dl = deadlineText(v, unit)}
      <a href={href(v)} in:popIn={{ duration: 200, delay: Math.min(i * 30, 200) }} class="block">
        <Card.Root class="transition-colors hover:bg-muted/30 {done ? 'opacity-80' : ''}">
          <Card.Content class="flex flex-col gap-2 py-3">
            <div class="flex items-center justify-between gap-2">
              <div class="flex min-w-0 items-center gap-2">
                {#if done}<Trophy class="h-4 w-4 shrink-0 text-amber-500" />{/if}
                <p class="truncate text-sm font-medium">{v.title}</p>
              </div>
              <div class="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                {currentText(v)}
                <ChevronRight class="h-4 w-4" />
              </div>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-muted">
              <div class="h-full rounded-full {done ? 'bg-amber-500' : 'bg-primary'} transition-[width] duration-500" style="width: {Math.round(v.progress * 100)}%"></div>
            </div>
            <p class="text-xs {v.projection.status === 'ready' ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground'}">
              {goalStatusText(v, unit)}{#if dl}{" · "}{dl}{/if}
            </p>
          </Card.Content>
        </Card.Root>
      </a>
    {/each}
  {/if}
</div>
