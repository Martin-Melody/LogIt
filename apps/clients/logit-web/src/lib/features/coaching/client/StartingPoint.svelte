<!-- A new client's starting point (canvas SP1): worked out from their training, nothing typed in.
     At the top of Training while they're new, and from ⋯ › Starting point after that. What the
     start-up form said (what hurts, goal) is shown in their own words: nothing is matched. -->
<script lang="ts">
  import { onMount } from "svelte";
  import type { Sharing } from "@logit/core/api/coachApi";
  import { loadWebLibrary } from "$lib/features/library/libraryData";
  import { startingPoint, type StartingLift } from "@logit/core/domain/startingPoint";
  import type { WorkoutSession } from "@logit/core/domain/workout";
  import { startupAnswers } from "./startupAnswers";

  let { clientId, name, sharing, sessions, programExercises = [] }: {
    clientId: string;
    name: string;
    sharing: Sharing;
    sessions: WorkoutSession[];
    /** Their program's exercises, so ones they haven't lifted get a worked-out start. */
    programExercises?: string[];
  } = $props();

  const first = $derived(name.split(" ")[0] ?? name);
  let muscleOf = $state<((n: string) => string[]) | undefined>(undefined);
  let startup = $state<{ prompt: string; answer: string }[]>([]);
  onMount(() => {
    void loadWebLibrary().then((lib) => {
      const by = new Map<string, string[]>();
      for (const e of lib.entries) if (e.kind === "strength") by.set(e.item.name.trim().toLowerCase(), e.item.primaryMuscles.map(String));
      muscleOf = (n) => by.get(n.trim().toLowerCase()) ?? [];
    }, () => {});
    if (sharing.checkins) void startupAnswers(clientId).then((a) => (startup = a));
  });

  const sp = $derived(startingPoint(sessions, Date.now(), { muscleOf, also: programExercises }));
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const clock = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
  const sinceText = $derived(sp.sinceMs ? new Date(sp.sinceMs).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "");
  const maxSets = $derived(Math.max(1, ...sp.weeklySets.map((m) => m.sets)));
  function fromText(l: StartingLift): string {
    if (l.from.kind === "logged") return `Logged · ${l.from.times} ${l.from.times === 1 ? "time" : "times"}`;
    return l.from.machine ? `From ${l.from.basis} · machine, start light` : `From ${l.from.basis}`;
  }
  const HOW = { high: "High", rough: "Rough", low: "Low" } as const;
</script>

<section class="flex flex-col gap-4 rounded-[12px] border border-border bg-card px-[18px] py-4" aria-label="Starting point">
  <div class="flex items-baseline justify-between gap-3">
    <h2 class="text-base font-semibold">Starting point</h2>
    <span class="text-xs text-muted-foreground">{sp.workouts ? `Worked out from ${sp.workouts} ${sp.workouts === 1 ? "workout" : "workouts"}${sinceText ? ` since ${sinceText}` : ""}. Nothing here was typed in.` : `${first} hasn't logged a workout yet.`}</span>
  </div>
  {#if sharing.pastTraining === false}
    <p class="text-xs text-muted-foreground">{first} didn't share training from before, so this is only what they've logged since starting with you. They can change it in Manage coaching.</p>
  {/if}

  {#if sp.lifts.length}
    <table class="w-full text-[13px]">
      <thead><tr class="text-left text-xs text-muted-foreground"><th class="py-1.5 font-medium">Lift</th><th class="font-medium">Best recent set</th><th class="font-medium">Estimated max</th><th class="font-medium">Where it's from</th><th class="font-medium">How sure</th></tr></thead>
      <tbody>
        {#each sp.lifts as l (l.name)}
          <tr class="border-t border-border">
            <td class="py-2 font-medium">{l.name}</td>
            <td class="tabular-nums">{l.best ? `${l.e1rm == null ? "+" : ""}${l.best.weight} × ${l.best.reps}` : "–"}</td>
            <td class="tabular-nums {l.from.kind === 'related' ? 'text-info' : ''}">{l.e1rm == null ? "–" : `${l.from.kind === "related" ? (l.from.machine ? "at least " : "about ") : ""}${l.e1rm} kg`}</td>
            <td class="text-xs text-muted-foreground">{fromText(l)}</td>
            <td class="text-xs {l.how === 'high' ? '' : 'text-warning'}">{HOW[l.how]}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if sp.lifts.some((l) => l.from.kind === "related")}
      <p class="text-xs text-muted-foreground"><span class="text-info">Blue</span>: worked out from another lift, not lifted yet. Rough guesses start at the low end; their first set confirms them.</p>
    {/if}
  {/if}

  <div class="grid gap-4 sm:grid-cols-2">
    {#if sp.habits}
      <div class="flex flex-col gap-1.5 text-[13px]">
        <h3 class="text-xs font-semibold text-muted-foreground">How {first} trains (last 8 weeks)</h3>
        <span>Days a week · {sp.habits.perWeek}{sp.habits.weekdays.length ? `, mostly ${sp.habits.weekdays.map((d) => DAYS[d]).join(" ")}` : ""}</span>
        {#if sp.habits.startHour != null}<span>Usual start · around {clock(sp.habits.startHour)}</span>{/if}
        {#if sp.habits.minutes != null}<span>Session · about {sp.habits.minutes} min{sp.habits.sets ? `, ${sp.habits.sets} sets` : ""}</span>{/if}
      </div>
    {/if}
    {#if sp.weeklySets.length}
      <div class="flex flex-col gap-1.5 text-[13px]">
        <h3 class="text-xs font-semibold text-muted-foreground">Weekly sets, last 8 weeks</h3>
        {#each sp.weeklySets.slice(0, 6) as m (m.muscle)}
          <span class="grid grid-cols-[6.5rem_minmax(0,1fr)_2rem] items-center gap-2">
            <span class="truncate capitalize">{m.muscle}</span>
            <span class="h-1.5 rounded-full bg-muted"><span class="block h-1.5 rounded-full bg-foreground/70" style="width: {(m.sets / maxSets) * 100}%"></span></span>
            <span class="text-right tabular-nums text-muted-foreground">{m.sets}</span>
          </span>
        {/each}
      </div>
    {/if}
  </div>

  {#if sp.keeps.length || sp.swaps.length || sp.skips.length}
    <div class="flex flex-col gap-1 text-[13px]">
      <h3 class="text-xs font-semibold text-muted-foreground">What {first} does and doesn't do</h3>
      {#if sp.keeps.length}<span>Keeps coming back to · {sp.keeps.join(", ")}</span>{/if}
      {#if sp.swaps.length}<span>Swaps away · {sp.swaps.map((s) => `${s.from} → ${s.to} (${s.times} times)`).join(", ")}</span>{/if}
      {#if sp.skips.length}<span>Skips · {sp.skips.map((s) => `${s.name} (planned ${s.planned}, done ${s.done})`).join(", ")}</span>{/if}
    </div>
  {/if}

  {#if startup.length}
    <div class="flex flex-col gap-1 text-[13px]">
      <h3 class="text-xs font-semibold text-muted-foreground">From the start-up form (what training can't tell)</h3>
      {#each startup as a (a.prompt)}<span><span class="text-muted-foreground">{a.prompt} ·</span> "{a.answer}"</span>{/each}
    </div>
  {/if}
</section>
