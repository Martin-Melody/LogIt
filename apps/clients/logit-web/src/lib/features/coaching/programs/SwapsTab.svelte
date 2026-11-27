<!-- Programs › Swaps (canvas PB10): what clients can swap to (for everyone; one client's own on
     their page), and every exercise's swap list in one place. A list belongs to the exercise:
     adding or removing a swap here changes it in every program of yours that has the exercise.
     The builder shows the same list under the exercise. -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { toast } from "$lib/components/ui/sonner";
  import SwapDefaultCard from "$lib/features/coaching/SwapDefaultCard.svelte";
  import NamePicker from "$lib/features/plan/NamePicker.svelte";
  import { loadExerciseIndex, type ExerciseIndex } from "$lib/features/plan/exerciseIndex";
  import { guideSignal } from "$lib/features/guide/signal";
  import type { ClientRelationship } from "@logit/core/api/coachApi";
  import { addAlternative, removeAlternative, type CoachProgram } from "@logit/core/domain/CoachProgram";
  import type { SwapRule } from "@logit/core/domain/swaps";
  import { getWebCoachProgramRepo } from "$lib/deps";

  let { programs, clients, swapRule = $bindable("any"), onchange }: {
    programs: CoachProgram[];
    clients: ClientRelationship[];
    swapRule?: SwapRule;
    onchange: (next: CoachProgram[]) => void;
  } = $props();

  type Row = { name: string; id?: string; swaps: string[]; programs: string[] };
  const rows = $derived.by((): Row[] => {
    const by = new Map<string, Row>();
    for (const p of programs) {
      if (p.archived) continue;
      for (const w of p.weeks) for (const d of w.days) for (const b of d.blocks) {
        if (b.type !== "strength") continue;
        const key = b.exerciseName.trim().toLowerCase();
        const row = by.get(key) ?? { name: b.exerciseName, id: b.exerciseId, swaps: [], programs: [] };
        for (const a of b.alternatives ?? []) if (!row.swaps.some((s) => s.toLowerCase() === a.exerciseName.toLowerCase())) row.swaps.push(a.exerciseName);
        if (!row.programs.includes(p.name)) row.programs.push(p.name);
        by.set(key, row);
      }
    }
    return [...by.values()].sort((a, b) => b.swaps.length - a.swaps.length || a.name.localeCompare(b.name));
  });

  let index = $state<ExerciseIndex | null>(null);
  $effect(() => void loadExerciseIndex([]).then((i) => (index = i), () => {}));
  const searchExercises = (q: string) => (index?.search(q, 8) ?? []).map((e) => ({ name: e.name, detail: e.primaryMuscles.slice(0, 2).join(", ") || undefined }));

  let adding = $state<string | null>(null);
  let busy = $state(false);

  async function change(row: Row, fn: (p: CoachProgram) => CoachProgram, done: string) {
    busy = true;
    try {
      const repo = getWebCoachProgramRepo();
      const next = programs.map((p) => (p.archived ? p : fn(p)));
      const changed = next.filter((p, i) => p !== programs[i]);
      await Promise.all(changed.map((p) => repo.saveProgram(p)));
      onchange(next);
      toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex flex-col gap-4">
  <SwapDefaultCard bind:rule={swapRule} {clients} />
  <p class="-mt-2 text-xs text-muted-foreground">A client's own swap setting is on their page, under Training.</p>

  <section data-guide="swap-lists" class="flex flex-col rounded-[12px] border border-border bg-card" aria-labelledby="swap-lists-h">
    <div class="flex flex-col gap-0.5 px-5 pb-2 pt-4">
      <h2 id="swap-lists-h" class="text-sm font-semibold">Swap lists</h2>
      <p class="text-[13px] text-muted-foreground">Each exercise's swaps, used in every program of yours it's in. Also under the exercise in the builder.</p>
    </div>
    {#each rows as row (row.name)}
      <div class="grid grid-cols-[minmax(0,13rem)_minmax(0,1fr)_minmax(0,14rem)] items-start gap-3 border-t border-border px-5 py-3">
        <span class="pt-1 text-[13px] font-semibold">{row.name}</span>
        <span class="flex flex-wrap items-center gap-1.5">
          {#each row.swaps as s (s)}
            <span class="inline-flex h-7 items-center gap-1 rounded-full bg-muted pl-2.5 pr-1 text-xs">{s}
              <button type="button" aria-label="Remove {s} from {row.name}" disabled={busy} class="flex size-5 items-center justify-center rounded-full hover:bg-background"
                onclick={() => void change(row, (p) => removeAlternative(p, { exerciseName: row.name, exerciseId: row.id }, s), `${s} removed`)}>×</button>
            </span>
          {/each}
          {#if adding === row.name}
            <NamePicker id="swap-list-add" label="Swap for {row.name}" placeholder="Search exercises" autofocus search={(q) => searchExercises(q).filter((r) => r.name !== row.name)}
              onPick={(n) => { adding = null; guideSignal("swap.added"); void change(row, (p) => addAlternative(p, { exerciseName: row.name, exerciseId: row.id }, { exerciseName: n }), `${n} added for ${row.name}`); }}
              onCancel={() => (adding = null)} />
          {:else}
            <Button variant="outline" size="sm" class="h-7" disabled={busy} onclick={() => (adding = row.name)}>+ Swap</Button>
          {/if}
        </span>
        <span class="pt-1 text-xs text-muted-foreground">{row.programs.join(", ")}</span>
      </div>
    {:else}
      <p class="border-t border-border px-5 py-8 text-center text-[13px] text-muted-foreground">No exercises in your programs yet.</p>
    {/each}
  </section>
</div>
