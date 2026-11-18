<!-- Tapping an exercise's name mid-workout (design canvas X5): what helps right now — last time,
     the muscles, the cues — read first. Editing the exercise is one quiet link at the bottom
     (the full exercise sheet, with history and machines). -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { goto } from "$app/navigation";
  import type { Exercise } from "@logit/core/domain/exercise";
  import type { SetEntry } from "@logit/core/domain/workout";
  import { formatLoad, type WeightUnit } from "@logit/core/domain/units";

  let {
    open,
    exercise,
    name,
    lastSets,
    weightUnit,
    bodyweight = false,
    onOpenChange,
    onEdit,
    onSwap,
  }: {
    open: boolean;
    exercise: Exercise | null;
    name: string;
    lastSets: SetEntry[] | null;
    weightUnit: WeightUnit;
    bodyweight?: boolean;
    onOpenChange: (v: boolean) => void;
    onEdit: () => void;
    onSwap: () => void;
  } = $props();

  const working = $derived((lastSets ?? []).filter((s) => s.completed !== false && s.setType !== "warmup" && s.reps > 0));
  const best = $derived(working.reduce<SetEntry | null>((b, s) => (!b || s.weight > b.weight || (s.weight === b.weight && s.reps > b.reps) ? s : b), null));
  const cap = (m: string) => m.charAt(0).toUpperCase() + m.slice(1).replace(/_/g, " ");
  const muscles = $derived(exercise ? (exercise.primaryMuscles ?? []).map(cap).join(", ") : "");
  const secondary = $derived(exercise ? (exercise.secondaryMuscles ?? []).map((m) => m.replace(/_/g, " ")).join(", ") : "");
  const cues = $derived((exercise?.cues ?? []).filter((c) => c.trim()));
  const load = (kg: number) => formatLoad(kg, weightUnit, bodyweight);
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content class="flex max-h-[88svh] flex-col gap-3.5 overflow-y-auto p-4 sm:max-w-[420px]">
    <Dialog.Header>
      <Dialog.Title class="text-xl">{name}</Dialog.Title>
      <Dialog.Description>{muscles || "Muscles not set"}{secondary ? ` · ${secondary}` : ""}</Dialog.Description>
    </Dialog.Header>

    <section class="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/30 px-3.5 py-3" aria-label="Last time">
      <span class="text-[13px] font-semibold text-muted-foreground">Last time</span>
      {#if working.length}
        <span class="text-[15px] tabular-nums">{working.map((s) => `${load(s.weight)} × ${s.reps}`).join(" · ")}</span>
        {#if best}<span class="text-[13px] text-muted-foreground">Best set: {load(best.weight)} × {best.reps}</span>{/if}
      {:else}
        <span class="text-sm text-muted-foreground">First time. Pick a weight you could lift about 8 times.</span>
      {/if}
    </section>

    {#if cues.length}
      <section class="flex flex-col gap-1.5" aria-label="How to do it">
        <span class="text-sm font-semibold">How to do it</span>
        <ul class="list-disc pl-5 text-sm leading-relaxed">
          {#each cues as c, i (i)}<li>{c}</li>{/each}
        </ul>
      </section>
    {/if}

    <nav class="flex flex-col border-t border-border" aria-label="More for this exercise">
      {#if exercise}
        <a href="/exercises/{exercise.id}" onclick={(e) => { e.preventDefault(); onOpenChange(false); void goto(`/exercises/${exercise.id}`); }}
          class="flex min-h-12 items-center justify-between border-b border-border text-[15px]">History and how it progresses <span class="text-muted-foreground">›</span></a>
      {/if}
      <button type="button" class="flex min-h-12 items-center justify-between text-left text-[15px]" onclick={() => { onOpenChange(false); onSwap(); }}>
        Swap for today <span class="text-muted-foreground">›</span>
      </button>
    </nav>

    <button type="button" class="min-h-10 self-center text-sm text-muted-foreground underline" onclick={() => { onOpenChange(false); onEdit(); }}>
      Edit exercise (name, notes, muscles)
    </button>
  </Dialog.Content>
</Dialog.Root>
