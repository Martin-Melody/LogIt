<script lang="ts">
  import { Flame, Minus, Plus, Pause, Play } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { chip } from "$lib/components/ui/choice";
  import { MAX_WEEKLY_TARGET, type WeeklyStreak } from "@logit/core/domain/weeklyStreak";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import { isoToUtcMs } from "@logit/core/domain/dateIso";
  import { goalsStore } from "./goalsStore";
  import { loadWeeklyStreak } from "./streak";

  /**
   * Weekly streak: weeks in a row with the target number of training days. Rest days never
   * break it, and a pause (injury, holiday) holds it without counting.
   */

  let streak = $state<WeeklyStreak | null>(null);
  let pausePicker = $state(false);

  $effect(() => {
    // Recompute when the target or pauses change.
    void $goalsStore.streak;
    void loadWeeklyStreak().then((s) => (streak = s)).catch(() => {});
  });

  const openPause = $derived.by(() => {
    const today = localDateIso();
    return $goalsStore.streak.pauses.find((p) => p.startIso <= today && (p.endIso == null || p.endIso >= today)) ?? null;
  });

  function fmtIso(iso: string) {
    return new Date(isoToUtcMs(iso)).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
  }

  function pauseFor(weeks: number | null) {
    const end = weeks == null ? null : localDateIso(new Date(Date.now() + (weeks * 7 - 1) * 24 * 60 * 60 * 1000));
    goalsStore.startPause(end);
    pausePicker = false;
  }

  const target = $derived($goalsStore.streak.weeklyTarget);
  const week = $derived(streak?.thisWeek ?? null);
</script>

<Card.Root>
  <Card.Content class="flex flex-col gap-3 pt-4">
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-2.5">
        <div class="flex h-10 w-10 items-center justify-center rounded-full {streak && streak.currentWeeks > 0 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-muted text-muted-foreground'}">
          <Flame class="h-5 w-5" />
        </div>
        <div>
          <p class="text-base font-semibold leading-tight tabular-nums">
            {streak?.currentWeeks ?? 0}-week streak
          </p>
          <p class="text-xs text-muted-foreground">Best {streak?.bestWeeks ?? 0} {streak?.bestWeeks === 1 ? "week" : "weeks"}</p>
        </div>
      </div>
      <div class="flex flex-col items-end gap-0.5">
        <div class="flex items-center">
          <button type="button" class="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40" aria-label="Fewer days a week" disabled={target <= 1} onclick={() => goalsStore.setWeeklyTarget(target - 1)}>
            <Minus class="h-4 w-4" />
          </button>
          <span class="w-5 text-center text-sm font-semibold tabular-nums">{target}</span>
          <button type="button" class="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40" aria-label="More days a week" disabled={target >= MAX_WEEKLY_TARGET} onclick={() => goalsStore.setWeeklyTarget(target + 1)}>
            <Plus class="h-4 w-4" />
          </button>
        </div>
        <span class="text-[11px] text-muted-foreground">days a week</span>
      </div>
    </div>

    {#if week}
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between text-xs">
          <span class="text-muted-foreground">This week</span>
          <span class="tabular-nums {week.outcome === 'met' ? 'text-emerald-600 dark:text-emerald-400 font-medium' : ''}">
            {#if week.needed === 0}
              Paused
            {:else if week.outcome === "met"}
              Done · {week.done} of {week.needed}
            {:else}
              {week.done} of {week.needed} days
            {/if}
          </span>
        </div>
        {#if week.needed > 0}
          <div class="flex gap-1">
            {#each Array.from({ length: Math.max(week.needed, week.done) }) as _, i (i)}
              <div class="h-1.5 flex-1 rounded-full {i < week.done ? (i < week.needed ? 'bg-primary' : 'bg-primary/40') : 'bg-muted'}"></div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <div class="flex items-center justify-between gap-2 border-t border-border pt-2">
      {#if openPause}
        <p class="text-xs text-muted-foreground">
          Paused since {fmtIso(openPause.startIso)}{openPause.endIso ? `, until ${fmtIso(openPause.endIso)}` : ""}
        </p>
        <button type="button" class="flex h-9 items-center gap-1.5 text-xs font-medium text-primary" onclick={() => goalsStore.endPause()}>
          <Play class="h-3.5 w-3.5" /> Resume
        </button>
      {:else if pausePicker}
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-xs text-muted-foreground">Pause for</span>
          <button type="button" class={chip(false)} onclick={() => pauseFor(1)}>1 week</button>
          <button type="button" class={chip(false)} onclick={() => pauseFor(2)}>2 weeks</button>
          <button type="button" class={chip(false)} onclick={() => pauseFor(null)}>Until I resume</button>
        </div>
        <button type="button" class="h-9 text-xs text-muted-foreground" onclick={() => (pausePicker = false)}>Cancel</button>
      {:else}
        <p class="text-xs text-muted-foreground">Injured or away? Pausing keeps your streak.</p>
        <button type="button" class="flex h-9 shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground" onclick={() => (pausePicker = true)}>
          <Pause class="h-3.5 w-3.5" /> Pause
        </button>
      {/if}
    </div>
  </Card.Content>
</Card.Root>
