<!-- Assigning, step 2 (canvas SP2): does it fit, and where they start. Each exercise's first
     weight and where it came from; a swap in their copy only; what they said hurts, word for
     word (nothing is matched for you); and whether a Find your weights week goes first. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { slide } from "svelte/transition";
  import { Button } from "$lib/components/ui/button";
  import NamePicker from "$lib/features/plan/NamePicker.svelte";
  import { getWebDeps } from "$lib/deps";
  import { loadExerciseIndex, type ExerciseIndex } from "$lib/features/plan/exerciseIndex";
  import { startupAnswers, hurtsAnswers } from "../client/startupAnswers";
  import { knownLifts, relatedEstimate, isBodyweightLift } from "@logit/core/domain/relatedLifts";
  import { cellText, planForWeek } from "@logit/core/domain/programPlan";
  import type { CoachProgram } from "@logit/core/domain/CoachProgram";
  import type { WorkoutSession } from "@logit/core/domain/workout";

  let { clientId, name, sharesWorkouts, sharesCheckins, program, swaps = $bindable({}), findFirst = $bindable(false) }: {
    clientId: string;
    name: string;
    sharesWorkouts: boolean;
    sharesCheckins: boolean;
    program: CoachProgram;
    /** Exercise name → what it becomes in their copy. */
    swaps?: Record<string, { exerciseName: string; exerciseId?: string }>;
    findFirst?: boolean;
  } = $props();

  const first = $derived(name.split(" ")[0] ?? name);
  let sessions = $state<WorkoutSession[] | null>(null);
  let hurts = $state<{ prompt: string; answer: string }[]>([]);
  let index = $state<ExerciseIndex | null>(null);
  let swapping = $state<string | null>(null);
  let decided = false;
  onMount(() => {
    void loadExerciseIndex([]).then((i) => (index = i), () => {});
    if (sharesCheckins) void startupAnswers(clientId).then((a) => (hurts = hurtsAnswers(a)));
    if (!sharesWorkouts) { sessions = []; return; }
    void getWebDeps(clientId).workoutRepo.listAllSessions().then((s) => (sessions = s.filter((x) => x.endedAtMs != null)), () => (sessions = []));
  });

  const known = $derived(knownLifts(sessions ?? [], Date.now(), 180));
  const e1rm = (n: string): number | null => {
    const k = known.find((x) => x.name.trim().toLowerCase() === n.trim().toLowerCase());
    return k ? k.e1rm : (relatedEstimate(n, known)?.e1rmKg ?? null);
  };
  // Each strength exercise once, in day order, with what week 1 plans for them.
  const rows = $derived.by(() => {
    if (!sessions) return [];
    const w = [...program.weeks].sort((a, b) => a.weekNumber - b.weekNumber)[0];
    const plan = planForWeek(program, w?.weekNumber ?? 1, { e1rm });
    const seen = new Set<string>();
    const out: { name: string; blockId: string; starts: string; from: string; kind: "logged" | "related" | "none" }[] = [];
    for (const d of [...(w?.days ?? [])].sort((a, b) => a.orderIndex - b.orderIndex)) {
      for (const b of [...d.blocks].sort((a, c) => a.orderIndex - c.orderIndex)) {
        if (b.type !== "strength" || seen.has(b.exerciseName.toLowerCase())) continue;
        seen.add(b.exerciseName.toLowerCase());
        const own = known.find((x) => x.name.trim().toLowerCase() === b.exerciseName.trim().toLowerCase());
        const rel = own ? null : relatedEstimate(b.exerciseName, known);
        const cell = plan(b.id);
        const work = b.sets.filter((s) => s.setType !== "warmup").length;
        out.push({
          name: b.exerciseName, blockId: b.id,
          starts: own && isBodyweightLift(b.exerciseName) ? `+${own.weight} × ${own.reps} lately` : cell && cell.source !== "words" ? cellText(cell, work) : "First set finds it",
          from: own ? `Logged ${own.weight} × ${own.reps}` : rel ? `From ${rel.basis.name} ${rel.basis.weight} × ${rel.basis.reps}` : "Nothing to go on",
          kind: own ? "logged" : rel ? "related" : "none",
        });
      }
    }
    return out;
  });
  // With nothing to go on for most of it, Find your weights first is picked (they can turn it off).
  $effect(() => {
    if (decided || !rows.length) return;
    decided = true;
    findFirst = rows.filter((r) => r.kind === "none").length * 2 >= rows.length;
  });
  const search = (q: string) => (index?.search(q, 8) ?? []).map((e) => ({ name: e.name, detail: e.primaryMuscles.slice(0, 2).join(", ") || undefined }));
</script>

<div class="flex flex-col gap-3">
  <p class="text-[13px] text-muted-foreground">Starting weights for {first}, from {sharesWorkouts ? "their training" : "nothing yet: they don't share workouts"}. Swap any exercise in their copy only.</p>
  {#if !sessions}
    <p class="py-4 text-center text-[13px] text-muted-foreground">Reading {first}'s training…</p>
  {:else}
    <table class="w-full text-[13px]">
      <thead><tr class="text-left text-xs text-muted-foreground"><th class="py-1.5 font-medium">Exercise</th><th class="font-medium">Starts at</th><th class="font-medium">From</th><th></th></tr></thead>
      <tbody>
        {#each rows as r (r.blockId)}
          <tr class="border-t border-border align-top">
            <td class="py-2 font-medium">{#if swaps[r.name]}<s class="text-muted-foreground">{r.name}</s> {swaps[r.name]!.exerciseName}{:else}{r.name}{/if}</td>
            <td class="py-2 tabular-nums {r.kind === 'related' ? 'text-info' : r.kind === 'none' ? 'text-muted-foreground' : ''}">{swaps[r.name] ? "Its own estimate" : r.starts}</td>
            <td class="py-2 text-xs text-muted-foreground">{r.from}</td>
            <td class="py-1.5 text-right">
              {#if swaps[r.name]}
                <Button variant="ghost" size="sm" onclick={() => { const { [r.name]: _x, ...rest } = swaps; swaps = rest; }}>Undo</Button>
              {:else}
                <Button variant="ghost" size="sm" onclick={() => (swapping = swapping === r.name ? null : r.name)}>Swap…</Button>
              {/if}
            </td>
          </tr>
          {#if swapping === r.name}
            <tr transition:slide={{ duration: 160 }}><td colspan="4" class="pb-2">
              <NamePicker id="fit-swap" label="Swap {r.name} in {first}'s copy for" placeholder="Search exercises" autofocus {search}
                onPick={(n) => { swaps = { ...swaps, [r.name]: { exerciseName: n, exerciseId: index?.get(n)?.id } }; swapping = null; }} onCancel={() => (swapping = null)} />
            </td></tr>
          {/if}
        {/each}
      </tbody>
    </table>
    {#if rows.some((r) => r.kind === "related")}<p class="text-xs text-muted-foreground"><span class="text-info">Blue</span>: a guess from another lift; plain ones they've lifted.</p>{/if}
  {/if}

  {#if hurts.length}
    <div class="rounded-[10px] bg-muted/60 px-3.5 py-3 text-[13px]">
      <b class="font-semibold">{first} said, in their start-up form</b>
      {#each hurts as h (h.prompt)}<p class="mt-1">"{h.answer}"</p>{/each}
    </div>
  {/if}

  <div class="flex flex-col gap-2" role="radiogroup" aria-label="First phase">
    <span class="text-xs font-semibold text-muted-foreground">First phase</span>
    {#each [{ v: false, t: "Start straight away", d: "Week 1 plans from the numbers above." }, { v: true, t: "Find your weights first (1 week)", d: "A week of LogIt's Weight finder on each lift; you check what they found before the program starts." }] as o (o.t)}
      <button type="button" role="radio" aria-checked={findFirst === o.v} onclick={() => (findFirst = o.v)}
        class="flex flex-col gap-0.5 rounded-[10px] border px-3.5 py-2.5 text-left transition-colors {findFirst === o.v ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/50'}">
        <span class="text-[13px] font-semibold">{o.t}</span><span class="text-xs text-muted-foreground">{o.d}</span>
      </button>
    {/each}
  </div>
</div>
