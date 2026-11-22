<script lang="ts">
  // Home: this week of a split on a weekday schedule (design canvas O7 and O8). During the
  // first week of a plan from onboarding it's "Your first week". A missed workout moves
  // forward in order instead of being dropped ("Tuesday's workout moved to today"), with
  // "Make it 3 this week" and "Change days". Never "missed", never red. Shows nothing for a
  // split that runs as a rotation.
  import { goto } from "$app/navigation";
  import { Check } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { activeSplit } from "$lib/stores/activeSplit.store";
  import { recentSessions } from "$lib/stores/recentSessions.store";
  import { lastSyncedAt } from "$lib/sync/syncService";
  import { refreshWeekSessions } from "./weekSessions";
  import { goalsStore } from "$lib/features/goals/goalsStore";
  import { selectDayOverride } from "$lib/stores/todaysPlan.store";
  import { startPlannedWorkout } from "$lib/features/session/startWorkout";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import { dayOfWeek, weekStartIso } from "@logit/core/domain/dateIso";
  import { targetForWeek } from "@logit/core/domain/weeklyStreak";
  import { planWeek, weekPlanLine, type WeekPlan } from "@logit/core/domain/weekPlan";
  import { inFirstWeek, planStartIso } from "./firstWeek";

  const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  let week = $state<WeekPlan | null>(null);
  const todayIso = localDateIso();
  const firstWeek = inFirstWeek(todayIso);

  $effect(() => {
    const split = $activeSplit;
    void $recentSessions;
    void $lastSyncedAt;
    if (!split || split.schedule !== "weekdays") {
      week = null;
      return;
    }
    void refreshWeekSessions()
      .then((sessions) => (week = planWeek(split, sessions, todayIso, planStartIso())))
      .catch(() => (week = null));
  });

  const target = $derived(targetForWeek(weekStartIso(todayIso), $goalsStore.streak.targetHistory, $goalsStore.streak.weeklyTarget));
  // Lowered for this week already ("Make it 3"): don't offer to lower it again.
  const lowered = $derived(target < $goalsStore.streak.weeklyTarget);
  const today = $derived(week?.slots.find((s) => s.dateIso === todayIso) ?? null);
  // Started late in the week (a Saturday, 3 a week): only what fits before Sunday is asked for.
  const fits = $derived(week ? week.done + week.remaining - week.leftOver.length : 0);
  // Only the workout days (and days trained on) in the first week, like the mockup; a whole week after.
  const shown = $derived(week ? (firstWeek ? week.slots.filter((s) => s.state !== "rest") : week.slots) : []);

  function short(name: string | undefined): string {
    if (!name) return "";
    const words = name.split(/\s+/);
    return words.length > 1 ? `${words[0]!.slice(0, 2)} ${words.at(-1)!.slice(0, 1)}` : name.slice(0, 4);
  }

  async function startMoved() {
    const split = $activeSplit;
    if (!split || !today?.dayId) return;
    selectDayOverride(split.id, today.dayId);
    await startPlannedWorkout();
  }
</script>

{#if week && week.planned > 0}
  <Card.Root class="w-full {firstWeek ? 'border-2 border-primary' : ''}">
    <Card.Header class="pb-2">
      <Card.Title class="flex items-baseline justify-between text-base">
        <span>{firstWeek ? "Your first week" : "This week"}</span>
        {#if firstWeek}
          <span class="text-[11px] font-bold text-primary">NEW</span>
        {:else}
          <span class="text-[13px] font-normal text-muted-foreground">{week.done} of {target}</span>
        {/if}
      </Card.Title>
    </Card.Header>
    <Card.Content class="flex flex-col gap-2.5">
      <div class="grid gap-1 text-center text-[11px] text-muted-foreground" style="grid-template-columns: repeat({shown.length}, minmax(0, 1fr))">
        {#each shown as slot (slot.dateIso)}
          <span class="flex flex-col gap-1">
            <span class="flex h-[30px] items-center justify-center rounded-md text-[11px] font-semibold
              {slot.state === 'done' ? 'bg-primary text-primary-foreground' : slot.state === 'today' ? 'border-2 border-primary text-foreground' : slot.state === 'planned' ? 'bg-muted-foreground/15 text-foreground' : 'bg-muted'}"
              aria-label="{SHORT[slot.weekday]}: {slot.state === 'rest' ? 'rest' : `${slot.dayName ?? 'workout'}, ${slot.state}`}">
              {#if slot.state === "done"}<Check class="h-3.5 w-3.5" />
              {:else if slot.state === "today" && firstWeek && !slot.movedFromWeekday}Today
              {:else if slot.state !== "rest"}{short(slot.dayName)}{/if}
            </span>
            {SHORT[slot.weekday]}
          </span>
        {/each}
      </div>
      <p class="text-[13px] text-muted-foreground">
        {#if firstWeek && !week.moves.length && fits < target}
          {week.done} of {fits} done. Your first full week starts Monday.
        {:else if firstWeek && !week.moves.length}
          {week.done} of {target} done. {week.done >= target ? "That's your first week on the streak." : `Finish all ${target === 1 ? "of it" : target === 2 ? "both" : target} for your first week on the streak.`}
        {:else}
          {weekPlanLine(week, dayOfWeek(todayIso), target)}
        {/if}
      </p>
      {#if week.moves.length && week.remaining > 0}
        <div class="flex gap-2">
          {#if target > 1 && !lowered}
            <button type="button" class="flex-1 h-10 rounded-lg border border-border text-[13px] font-medium"
              onclick={() => goalsStore.setTargetThisWeekOnly(Math.max(1, Math.min(target - 1, week!.done + week!.remaining - week!.leftOver.length)))}>
              Make it {Math.max(1, Math.min(target - 1, week.done + week.remaining - week.leftOver.length))} this week
            </button>
          {/if}
          <button type="button" class="flex-1 h-10 rounded-lg border border-border text-[13px] font-medium"
            onclick={() => goto(`/splits/${$activeSplit?.id}`)}>Change days</button>
        </div>
        {#if today?.movedFromWeekday !== undefined}
          <button type="button" class="h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold" onclick={() => void startMoved()}>
            Start {today.dayName}
          </button>
        {/if}
      {/if}
    </Card.Content>
  </Card.Root>
{/if}
