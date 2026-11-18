<script lang="ts">
  // The first week of a plan done (design canvas O9), shown once after its last workout:
  // who they are now ("You're someone who trains 4 days a week"), numbers they earned, and
  // week 2 ready.
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { getWorkoutRepo } from "$lib/data/repoProvider";
  import { activeSplit } from "$lib/stores/activeSplit.store";
  import { profile } from "$lib/stores/profile.store";
  import { loadWeeklyStreak } from "$lib/features/goals/streak";
  import { getWorkoutReminders, mondayFirst } from "$lib/features/onboarding/workoutReminders";
  import { getExercises } from "@logit/core/domain/workout";
  import { playSound } from "$lib/features/sound/sounds";
  import { formatWeight } from "@logit/core/domain/units";

  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  let done = $state(0);
  let lifts = $state(0);
  let up = $state<string[]>([]);
  let streakWeeks = $state(1);
  let weekTwo = $state<string | null>(null);

  onMount(async () => {
    playSound("week");
    const unit = get(profile).weightUnit;
    const sessions = (await getWorkoutRepo().listAllSessions()).sort((a, b) => a.startedAtMs - b.startedAtMs);
    const streak = await loadWeeklyStreak().catch(() => null);
    done = streak?.thisWeek?.done ?? sessions.length;
    streakWeeks = Math.max(1, streak?.currentWeeks ?? 1);
    // Heaviest working set per exercise, per workout, in order.
    const byExercise = new Map<string, { name: string; tops: number[] }>();
    for (const s of sessions) {
      for (const ex of getExercises(s)) {
        const top = Math.max(0, ...ex.sets.filter((set) => set.completed && set.setType !== "warmup").map((set) => set.weight ?? 0));
        if (top <= 0) continue;
        const key = ex.exerciseId ?? ex.exerciseName.toLowerCase();
        const entry = byExercise.get(key) ?? { name: ex.exerciseName, tops: [] };
        entry.tops.push(top);
        byExercise.set(key, entry);
      }
    }
    lifts = byExercise.size;
    up = [...byExercise.values()]
      .map((e) => ({ name: e.name, gain: e.tops.at(-1)! - e.tops[0]! }))
      .filter((e) => e.gain > 0)
      .sort((a, b) => b.gain - a.gain)
      .slice(0, 2)
      .map((e) => `${e.name.split(" ")[0]} +${formatWeight(e.gain, unit)}`);
    const split = get(activeSplit);
    const first = split?.days.filter((d) => !d.rest && d.weekday !== undefined).sort((a, b) => a.orderIndex - b.orderIndex)[0];
    if (first) {
      const reminders = getWorkoutReminders();
      const when = reminders?.on && reminders.weekdays.includes(first.weekday!) ? ` at ${reminders.time.replace(/^0(\d)/, "$1")}` : "";
      weekTwo = `Same days, slightly heavier. ${first.name ?? "Your first workout"} on ${DAY_NAMES[first.weekday!]}${when}.`;
      void mondayFirst;
    }
  });
</script>

<div class="flex flex-col min-h-screen gap-5 bg-primary px-6 pt-[72px] pb-7 text-primary-foreground">
  <div class="grid gap-1.5" style="grid-template-columns: repeat({Math.max(done, 1)}, minmax(0, 1fr))" role="img" aria-label="{done} of {done} workouts done">
    {#each Array.from({ length: Math.max(done, 1) }) as _, i (i)}
      <span class="h-2.5 rounded-full bg-primary-foreground"></span>
    {/each}
  </div>
  <div>
    <p class="mb-1.5 text-sm font-semibold opacity-75">Week 1 · {done} of {done}</p>
    <h1 class="text-[28px] font-bold leading-tight">You're someone who trains {done} day{done === 1 ? "" : "s"} a week.</h1>
  </div>

  <div class="flex flex-col rounded-xl border border-primary-foreground/25 text-sm">
    <p class="flex justify-between gap-3 border-b border-primary-foreground/25 px-3.5 py-3"><span class="opacity-75">Lifts with a starting point</span><span class="font-semibold">{lifts}</span></p>
    {#if up.length}
      <p class="flex justify-between gap-3 border-b border-primary-foreground/25 px-3.5 py-3"><span class="opacity-75">Already up</span><span class="text-right font-semibold">{up.join(", ")}</span></p>
    {/if}
    <p class="flex justify-between gap-3 px-3.5 py-3"><span class="opacity-75">Weekly streak</span><span class="font-semibold">{streakWeeks} week{streakWeeks === 1 ? "" : "s"}</span></p>
  </div>

  {#if weekTwo}
    <div class="flex flex-col gap-1.5 rounded-xl bg-primary-foreground/10 p-3.5">
      <span class="text-sm font-semibold">Week 2 is ready</span>
      <span class="text-sm opacity-80">{weekTwo}</span>
    </div>
  {/if}

  <div class="flex-1"></div>
  <button type="button" class="h-[52px] rounded-[10px] bg-primary-foreground text-primary text-base font-semibold" onclick={() => goto("/")}>
    Onto week 2
  </button>
</div>
