<!-- Canvas K4: the client's week beside a check-in, as plain numbers for the 7 days up to when
     they sent it, with the week before where it helps. Only what they share; a row they don't
     share says "Not shared". -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { getWebCoachHabitRepo, getWebDeps, getWebNutritionDeps } from "$lib/deps";
  import { coachHabitAsHabit } from "@logit/core/domain/CoachHabit";
  import { foodAverages, weekLifts, type WeekLift } from "@logit/core/domain/checkinWeek";
  import { weekSquares } from "@logit/core/domain/habit";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import { fetchClientHabitEntries } from "@logit/core/data/remote/remoteCoachHabitRepo";
  import { getNutritionTargets } from "@logit/core/usecases/nutrition/getNutritionTargets";
  import { smoothWeightSeries } from "@logit/core/nutrition/trend";
  import { clientNutritionContext, targetsFor } from "./nutrition/clientNutrition";
  import type { ClientSummary } from "./coachingData";

  let { client, untilMs }: { client: ClientSummary; untilMs: number } = $props();
  const fromMs = $derived(untilMs - 7 * 86_400_000);
  const first = $derived(client.name.split(" ")[0] || client.name);

  type Week = {
    sessions: number | null;
    lifts: WeekLift[];
    weight: { kg: number; rate: number | null } | null;
    food: { kcal: number; proteinG: number } | null;
    target: { kcal: number; proteinG: number | null } | null;
    habits: { name: string; done: number; target: number; weekly: boolean }[];
  };
  let week = $state<Week | null>(null);

  $effect(() => {
    const c = client, from = fromMs, until = untilMs;
    week = null;
    void (async () => {
      const s = c.sharing;
      const nutrition = getWebNutritionDeps(c.id);
      const [sessions, weights, days, habits, entries, ctx] = await Promise.all([
        s.workouts ? getWebDeps(c.id).workoutRepo.listAllSessions().catch(() => []) : Promise.resolve(null),
        s.bodyweight ? nutrition.nutritionRepo.listWeightEntries().catch(() => []) : Promise.resolve(null),
        s.nutrition ? nutrition.nutritionRepo.listDaysInRange(localDateIso(new Date(from + 86_400_000)), localDateIso(new Date(until))).catch(() => []) : Promise.resolve(null),
        getWebCoachHabitRepo().listForRecipient(c.id).catch(() => []),
        s.habits ? fetchClientHabitEntries(c.id).catch(() => []) : Promise.resolve([]),
        s.nutrition ? clientNutritionContext(c.id, s).catch(() => null) : Promise.resolve(null),
      ]);
      let target: Week["target"] = null;
      if (s.nutrition) {
        const t = ctx?.current
          ? await targetsFor(c.id, ctx.current, {}).catch(() => null)
          : (await getNutritionTargets({ nutritionRepo: nutrition.nutritionRepo, nutritionAlgorithmRegistry: nutrition.nutritionAlgorithmRegistry }).catch(() => null))?.targets ?? null;
        if (t) target = { kcal: t.kcal, proteinG: t.macros?.proteinG ?? null };
      }
      const inWeek = sessions?.filter((x) => x.endedAtMs != null && x.startedAtMs >= from && x.startedAtMs < until) ?? null;
      const trend = weights ? smoothWeightSeries(weights.filter((w) => Date.parse(w.dateIso ?? "") <= until || !w.dateIso)) : null;
      const endIso = localDateIso(new Date(until));
      if (client.id !== c.id || untilMs !== until) return;
      week = {
        sessions: inWeek ? inWeek.length : null,
        lifts: sessions ? weekLifts(sessions, from, until) : [],
        weight: trend?.currentKg != null ? { kg: trend.currentKg, rate: trend.weeklyRateKg ?? null } : null,
        food: days ? foodAverages(days) : null,
        target,
        habits: s.habits
          ? habits.map((h) => h.habit).filter((h) => !h.archived).map((h) => {
              const w = weekSquares(coachHabitAsHabit(h), entries, endIso);
              return { name: h.name, done: w.done, target: w.target, weekly: h.cadence.kind === "weekly" };
            })
          : [],
      };
    })();
  });
  const k = (n: number) => n.toLocaleString("en-GB");
  const set = (w: number, r: number) => `${k(w)} × ${r}`;
</script>

<aside aria-label="{first}'s week" class="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-4 py-3.5 text-[13px]">
  <h2 class="text-sm font-semibold">{first}'s week</h2>
  {#if !week}
    <Skeleton class="h-40" />
  {:else}
    <dl class="grid grid-cols-[1fr_auto] gap-x-3">
      <dt class="border-t border-border py-2 text-muted-foreground">Sessions</dt>
      <dd class="border-t border-border py-2 text-right tabular-nums">{week.sessions == null ? "Not shared" : client.program?.state === "running" ? `${week.sessions} of ${client.program.daysPerWeek}` : week.sessions}</dd>
      {#each week.lifts as l (l.name)}
        <dt class="border-t border-border py-2 text-muted-foreground">{l.name}, best set</dt>
        <dd class="flex flex-col items-end border-t border-border py-2 tabular-nums">{set(l.weight, l.reps)}{#if l.was}<span class="text-xs text-muted-foreground">was {set(l.was.weight, l.was.reps)}</span>{/if}</dd>
      {/each}
      <dt class="border-t border-border py-2 text-muted-foreground">Weight, 7-day avg</dt>
      <dd class="border-t border-border py-2 text-right tabular-nums">{!client.sharing.bodyweight ? "Not shared" : week.weight ? `${week.weight.kg.toFixed(1)}${week.weight.rate != null ? ` ${week.weight.rate > 0 ? "+" : week.weight.rate < 0 ? "−" : "±"}${Math.abs(week.weight.rate).toFixed(1)}` : ""}` : "No weigh-ins"}</dd>
      <dt class="border-t border-border py-2 text-muted-foreground">Calories, average</dt>
      <dd class="flex flex-col items-end border-t border-border py-2 tabular-nums">{!client.sharing.nutrition ? "Not shared" : week.food ? k(week.food.kcal) : "Nothing logged"}{#if week.food && week.target}<span class="text-xs text-muted-foreground">of {k(week.target.kcal)}</span>{/if}</dd>
      {#if client.sharing.nutrition && week.food}
        <dt class="border-t border-border py-2 text-muted-foreground">Protein, average</dt>
        <dd class="flex flex-col items-end border-t border-border py-2 tabular-nums">{week.food.proteinG} g{#if week.target?.proteinG}<span class="text-xs text-muted-foreground">of {week.target.proteinG}</span>{/if}</dd>
      {/if}
      {#if !client.sharing.habits}
        <dt class="border-t border-border py-2 text-muted-foreground">Habits</dt><dd class="border-t border-border py-2 text-right">Not shared</dd>
      {/if}
      {#each week.habits as h (h.name)}
        <dt class="border-t border-border py-2 text-muted-foreground">{h.name}</dt>
        <dd class="border-t border-border py-2 text-right tabular-nums">{h.done} of {h.target}{h.weekly ? "" : " days"}</dd>
      {/each}
    </dl>
  {/if}
  <Button variant="outline" size="sm" href="/clients/{client.id}" class="self-start">Open {first}'s page</Button>
</aside>
