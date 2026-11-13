<script lang="ts">
  import { Flame, Target, ChevronRight } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { profile } from "$lib/stores/profile.store";
  import { lastSyncedAt } from "$lib/sync/syncService";
  import type { WeightUnit } from "@logit/core/domain/units";
  import type { WeeklyStreak } from "@logit/core/domain/weeklyStreak";
  import { goalsStore, activeGoals } from "./goalsStore";
  import { loadGoalViews, type GoalView } from "./goalProgress";
  import { goalStatusText } from "./goalText";
  import { loadWeeklyStreak } from "./streak";

  /** Home: the week streak and the two goals closest to done. Taps through to Progress › Goals. */

  const unit = $derived(($profile.weightUnit ?? "kg") as WeightUnit);
  let views = $state<GoalView[]>([]);
  let streak = $state<WeeklyStreak | null>(null);

  $effect(() => {
    void $lastSyncedAt;
    const goals = activeGoals($goalsStore);
    const u = unit;
    void loadGoalViews(goals, u).then((v) => (views = v)).catch(() => {});
    void loadWeeklyStreak().then((s) => (streak = s)).catch(() => {});
  });

  const top = $derived(
    views
      .filter((v) => v.projection.status !== "achieved")
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 2),
  );
</script>

<a href="/progress?tab=goals" class="block">
  <Card.Root class="w-full transition-colors hover:bg-muted/30">
    <Card.Header class="pb-2">
      <Card.Title class="flex items-center justify-between text-base">
        <span class="flex items-center gap-1.5">Goals</span>
        <ChevronRight class="h-4 w-4 text-muted-foreground" />
      </Card.Title>
    </Card.Header>
    <Card.Content class="flex flex-col gap-3">
      {#if streak}
        <div class="flex items-center justify-between gap-2 text-sm">
          <span class="flex items-center gap-1.5">
            <Flame class="h-4 w-4 {streak.currentWeeks > 0 ? 'text-amber-500' : 'text-muted-foreground'}" />
            <span class="font-medium tabular-nums">{streak.currentWeeks}-week streak</span>
          </span>
          <span class="text-xs text-muted-foreground tabular-nums">
            {#if streak.pausedNow}Paused{:else}This week {streak.thisWeek.done}/{streak.thisWeek.needed}{/if}
          </span>
        </div>
      {/if}
      {#each top as v (v.key)}
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between gap-2">
            <p class="truncate text-sm">{v.title}</p>
            <span class="shrink-0 text-xs text-muted-foreground tabular-nums">{Math.round(v.progress * 100)}%</span>
          </div>
          <div class="h-1.5 overflow-hidden rounded-full bg-muted">
            <div class="h-full rounded-full bg-primary" style="width: {Math.round(v.progress * 100)}%"></div>
          </div>
          <p class="text-[11px] text-muted-foreground">{goalStatusText(v, unit)}</p>
        </div>
      {:else}
        <p class="flex items-center gap-1.5 text-xs text-muted-foreground"><Target class="h-3.5 w-3.5" /> Set a goal and see when you'll get there.</p>
      {/each}
    </Card.Content>
  </Card.Root>
</a>
