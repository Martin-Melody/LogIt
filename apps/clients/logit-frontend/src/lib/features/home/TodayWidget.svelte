<script lang="ts">
  // Home's Today card (decision D1, design canvas "LogIt decisions D1–D3, D5, D11"): the week
  // strip, and one answer to "what now?" — today's workout with its next weights and one Start,
  // or done / rest with what's next. Replaces This week, Quick start and Today's plan, which each
  // worked it out their own way and could offer different workouts at once.
  import { goto } from "$app/navigation";
  import { Check } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import { activeSplit } from "$lib/stores/activeSplit.store";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { recentSessions } from "$lib/stores/recentSessions.store";
  import { profile } from "$lib/stores/profile.store";
  import { selectDayOverride } from "$lib/stores/todaysPlan.store";
  import { lastSyncedAt } from "$lib/sync/syncService";
  import { getSplitPlan } from "$lib/usecases/Splits/splitRotation";
  import { planSplitDay } from "$lib/usecases/startSessionFromSplitDay";
  import { startEmptyWorkout, startPlannedWorkout } from "$lib/features/session/startWorkout";
  import { formatPrescription } from "$lib/features/session/planFormat";
  import { refreshWeekSessions } from "$lib/features/onboarding/weekSessions";
  import { inFirstWeek, planStartIso } from "$lib/features/onboarding/firstWeek";
  import { goalsStore } from "$lib/features/goals/goalsStore";
  import { loadWeeklyStreak } from "$lib/features/goals/streak";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import { dayOfWeek, weekStartIso } from "@logit/core/domain/dateIso";
  import { targetForWeek } from "@logit/core/domain/weeklyStreak";
  import { planWeek, weekPlanLine, type WeekPlan } from "@logit/core/domain/weekPlan";
  import { splitDayName, sortedDays } from "@logit/core/domain/splitSchedule";
  import { todayCard, type TodayCard } from "@logit/core/domain/todayCard";
  import type { SplitDay } from "@logit/core/domain/WorkoutSplit";
  import type { StrengthBlockData } from "@logit/core/domain/workout";

  const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const SHOWN = 3;

  type Line = { name: string; target: string | null };
  const todayIso = localDateIso();
  const firstWeek = inFirstWeek(todayIso);

  let week = $state<WeekPlan | null>(null);
  let streakWeeks = $state(0);
  let card = $state<TodayCard>({ kind: "none" });
  let lines = $state<Line[]>([]);
  let more = $state(0);
  let picking = $state(false);

  $effect(() => {
    const split = $activeSplit;
    const inProgress = $currentSession !== null;
    void $recentSessions;
    void $lastSyncedAt;
    card = todayCard(split ? getSplitPlan(split) : null, { inProgress });
    if (split?.schedule === "weekdays") {
      void refreshWeekSessions()
        .then((sessions) => (week = planWeek(split, sessions, todayIso, planStartIso())))
        .catch(() => (week = null));
    } else {
      week = null;
    }
    void loadWeeklyStreak().then((s) => (streakWeeks = s.currentWeeks)).catch(() => {});
  });

  // The day the card shows exercises for: today's, else the next one.
  const startDay = $derived(card.kind === "start" ? card.day : null);
  const nextDay = $derived(card.kind === "done" || card.kind === "rest" ? (card.next?.day ?? null) : null);
  const shownDay = $derived<SplitDay | null>(startDay ?? nextDay);

  $effect(() => {
    const day = shownDay;
    const unit = $profile.weightUnit;
    lines = [];
    more = 0;
    if (!day) return;
    const blocks = [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
    more = Math.max(0, blocks.length - SHOWN);
    // Names straight away; the next weights once the plan is worked out.
    lines = blocks.slice(0, SHOWN).map((b) => ({ name: blockName(b), target: null }));
    void planSplitDay(day).then((plan) => {
      if (shownDay !== day) return;
      lines = [...plan.session.blocks]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .slice(0, SHOWN)
        .map((b) => {
          if (b.type !== "strength") return { name: blockName(b), target: null };
          const s = plan.suggestions[b.id];
          const first = s?.sets[0];
          const target = !s || !first ? null
            : first.weight === 0 && !s.bodyweightLoad ? `${s.sets.length} sets`
            : formatPrescription([first], unit, !!s.bodyweightLoad);
          return { name: (b.data as StrengthBlockData).exerciseName, target };
        });
    }).catch(() => {});
  });

  function blockName(b: { type: string; exerciseName?: string; activityName?: string; drillName?: string; data?: unknown }): string {
    const d = (b.data ?? b) as { exerciseName?: string; activityName?: string; drillName?: string };
    return d.exerciseName ?? d.activityName ?? d.drillName ?? "Exercise";
  }

  const split = $derived($activeSplit);
  const name = (day: SplitDay) => (split ? splitDayName(split, day) : day.name ?? "Workout");
  const target = $derived(targetForWeek(weekStartIso(todayIso), $goalsStore.streak.targetHistory, $goalsStore.streak.weeklyTarget));
  const todaySlot = $derived(week?.slots.find((s) => s.dateIso === todayIso) ?? null);
  // Week one, a plan from onboarding started midweek: only what fits is asked for.
  const goal = $derived(firstWeek && week ? Math.min(target, week.onSchedule || target) : target);
  const workoutDays = $derived(split ? sortedDays(split).filter((d) => !d.rest) : []);

  function when(iso: string): string {
    const diff = Math.round((Date.parse(`${iso}T12:00:00`) - Date.parse(`${todayIso}T12:00:00`)) / 86_400_000);
    return diff === 1 ? "tomorrow" : diff < 7 ? WEEKDAYS[dayOfWeek(iso)]! : new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  }

  async function start(day: SplitDay) {
    if (!split) return;
    picking = false;
    selectDayOverride(split.id, day.id);
    await startPlannedWorkout();
  }
</script>

<Card.Root class="w-full">
  <Card.Content class="flex flex-col gap-4 pt-5">
    {#if week && week.planned > 0}
      <div class="flex items-center justify-between gap-3">
        <div class="flex gap-1.5" role="img"
          aria-label={`This week: ${week.slots.filter((s) => s.state !== "rest").map((s) => `${WEEKDAYS[s.weekday]} ${s.state}`).join(", ")}`}>
          {#each week.slots as slot (slot.dateIso)}
            <span class="flex w-8 flex-col items-center gap-1">
              <span class="text-[11px] {slot.dateIso === todayIso ? 'font-semibold text-foreground' : 'text-muted-foreground'}">{LETTERS[slot.weekday]}</span>
              {#if slot.state === "done"}
                <span class="flex size-[26px] items-center justify-center rounded-full bg-success text-background"><Check class="size-3.5" strokeWidth={3} /></span>
              {:else if slot.state === "today"}
                <span class="size-[26px] rounded-full ring-2 ring-inset ring-foreground"></span>
              {:else if slot.state === "planned"}
                <span class="size-[26px] rounded-full bg-muted"></span>
              {:else}
                <span class="flex size-[26px] items-center justify-center"><span class="size-1 rounded-full bg-muted-foreground/40"></span></span>
              {/if}
            </span>
          {/each}
        </div>
        <div class="text-right">
          {#if streakWeeks > 0}
            <div class="text-[15px] font-semibold tabular-nums">{streakWeeks} week{streakWeeks === 1 ? "" : "s"}</div>
            <div class="text-[11px] text-muted-foreground">in a row</div>
          {:else}
            <!-- Never "0-week streak" (bug hunt 3.14): the week so far instead. -->
            <div class="text-[15px] font-semibold tabular-nums">{week.done} of {goal}</div>
            <div class="text-[11px] text-muted-foreground">{firstWeek ? "week one" : "this week"}</div>
          {/if}
        </div>
      </div>
    {/if}

    {#if card.kind === "continue"}
      <div class="flex flex-col gap-3">
        <h2 class="text-xl font-bold tracking-tight">Workout in progress</h2>
        <button type="button" class="h-[52px] rounded-xl bg-primary text-base font-semibold text-primary-foreground" onclick={() => goto("/session/current")}>Continue workout</button>
      </div>
    {:else if card.kind === "start"}
      <div class="flex flex-col gap-1.5">
        <div class="flex items-baseline justify-between gap-3">
          <h2 class="text-2xl font-bold tracking-tight">{name(card.day)}</h2>
          <span class="shrink-0 text-[13px] text-muted-foreground">Today</span>
        </div>
        {#if todaySlot?.movedFromWeekday !== undefined && week}
          <p class="text-[13px] text-muted-foreground">{weekPlanLine(week, dayOfWeek(todayIso), target)}</p>
        {:else if split && split.schedule !== "weekdays"}
          <p class="text-[13px] text-muted-foreground">Next in your rotation</p>
        {/if}
      </div>
      {@render exercises()}
      <button type="button" class="h-[52px] rounded-xl bg-primary text-base font-semibold text-primary-foreground" onclick={() => startDay && void start(startDay)}>
        Start {name(card.day)}
      </button>
      <div class="flex gap-2">
        {#if workoutDays.length > 1}
          <button type="button" class="h-11 flex-1 rounded-[10px] border border-border text-sm font-medium" onclick={() => (picking = true)}>Another day</button>
        {/if}
        <button type="button" class="h-11 flex-1 rounded-[10px] border border-border text-sm font-medium" onclick={() => void startEmptyWorkout()}>Empty workout</button>
      </div>
    {:else if card.kind === "done" || card.kind === "rest"}
      <div class="flex flex-col gap-1.5">
        {#if card.kind === "done"}
          <div class="flex items-center gap-2.5">
            <span class="flex size-7 items-center justify-center rounded-full bg-success/15 text-success"><Check class="size-4" strokeWidth={2.6} /></span>
            <h2 class="text-xl font-bold tracking-tight">{card.done.map(name).join(" and ")} done</h2>
          </div>
        {:else}
          <h2 class="text-xl font-bold tracking-tight">Rest day</h2>
        {/if}
      </div>
      {#if card.next}
        <div class="flex flex-col gap-2.5 border-t border-border pt-3.5">
          <div class="flex items-baseline justify-between gap-3">
            <h3 class="text-base font-semibold">{name(card.next.day)}</h3>
            <span class="shrink-0 text-[13px] text-muted-foreground">Next · {when(card.next.dateIso)}</span>
          </div>
          {@render exercises()}
        </div>
      {/if}
      <div class="flex gap-2">
        {#if card.next}
          <button type="button" class="h-11 flex-1 rounded-[10px] border border-border text-sm font-medium" onclick={() => nextDay && void start(nextDay)}>Train anyway</button>
        {/if}
        <button type="button" class="h-11 flex-1 rounded-[10px] border border-border text-sm font-medium" onclick={() => void startEmptyWorkout()}>Empty workout</button>
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        <h2 class="text-xl font-bold tracking-tight">Today</h2>
        <p class="text-sm text-muted-foreground">{split ? "Nothing planned in your split yet." : "No plan yet. Log a workout as you go, or pick a plan."}</p>
        <button type="button" class="h-[52px] rounded-xl bg-primary text-base font-semibold text-primary-foreground" onclick={() => void startEmptyWorkout()}>Empty workout</button>
        <button type="button" class="h-11 rounded-[10px] border border-border text-sm font-medium" onclick={() => goto(split ? `/splits/${split.id}` : "/splits")}>{split ? "Edit your split" : "Pick a plan"}</button>
      </div>
    {/if}
  </Card.Content>
</Card.Root>

{#snippet exercises()}
  {#if lines.length}
    <ul class="flex flex-col gap-2.5 text-[15px]">
      {#each lines as line, i (i)}
        <li class="flex items-baseline justify-between gap-3">
          <span class="min-w-0 truncate">{line.name}</span>
          {#if line.target}<span class="shrink-0 font-semibold tabular-nums text-sky-700 dark:text-sky-300">{line.target}</span>{/if}
        </li>
      {/each}
      {#if more > 0}<li class="text-[13px] text-muted-foreground">and {more} more</li>{/if}
    </ul>
  {/if}
{/snippet}

{#if picking && split}
  <BottomSheet label="Another day" onclose={() => (picking = false)}>
    <h2 class="px-5 pb-2 text-lg font-bold">Train another day</h2>
    <div class="flex flex-col pb-4">
      {#each workoutDays as day (day.id)}
        <button type="button" class="flex min-h-14 items-center justify-between gap-3 border-t border-border px-5 text-left" onclick={() => void start(day)}>
          <span class="font-medium">{name(day)}</span>
          <span class="text-xs text-muted-foreground">{day.blocks.length} exercise{day.blocks.length === 1 ? "" : "s"}</span>
        </button>
      {/each}
    </div>
  </BottomSheet>
{/if}
