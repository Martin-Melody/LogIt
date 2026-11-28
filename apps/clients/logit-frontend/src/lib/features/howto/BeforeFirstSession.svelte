<!-- Before the first session (canvas HT1): on Home while a coach's program is new, the how-tos for
     its first week, about 30 seconds each, the working-weight explainer first. On the sofa, not
     at the bar. Nothing is a test; the card goes once they're all read or the first week is over. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { slide } from "svelte/transition";
  import { Check, ChevronRight } from "lucide-svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { loadLibrary } from "$lib/data/library/library";
  import { howToFor } from "@logit/core/domain/howTo";
  import type { CoachProgram } from "@logit/core/domain/CoachProgram";
  import type { Exercise } from "@logit/core/domain/exercise";
  import HowToCard from "./HowToCard.svelte";
  import WorkingWeight from "./WorkingWeight.svelte";
  import { WORKING_WEIGHT, firstWeekExercises, markHowToRead, readHowTos } from "./howtos";

  const { program, coachName }: { program: CoachProgram; coachName: string } = $props();

  let library = $state<Exercise[]>([]);
  let read = $state<string[]>([]);
  onMount(() => {
    read = readHowTos(program.id);
    void loadLibrary("strength").then((l) => (library = l.flatMap((e) => (e.kind === "strength" ? [e.item] : []))), () => {});
  });
  const items = $derived([
    { key: WORKING_WEIGHT, title: "How to find your working weight", detail: "For every exercise · 2 min" },
    ...firstWeekExercises(program).map((x) => ({ key: x.name.toLowerCase(), title: x.name, detail: `${x.day} · 30 s`, exerciseId: x.exerciseId })),
  ]);
  const done = $derived(items.filter((i) => read.includes(i.key)).length);
  const left = $derived(items.length - done);

  let at = $state<number | null>(null);
  const current = $derived(at == null ? null : items[at] ?? null);
  const howTo = $derived.by(() => {
    if (!current || current.key === WORKING_WEIGHT) return null;
    const ex = library.find((e) => (current as { exerciseId?: string }).exerciseId === e.id) ?? library.find((e) => e.name.toLowerCase() === current.key) ?? null;
    return howToFor(current.title, ex, program.howtos);
  });
  function next() {
    if (at == null || !current) return;
    read = markHowToRead(program.id, current.key);
    at = at + 1 < items.length ? at + 1 : null;
  }
</script>

{#if left > 0}
  <section transition:slide={{ duration: 200 }} class="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4" aria-label="Before your first session">
    <div class="flex flex-col gap-0.5">
      <h2 class="text-lg font-bold tracking-tight">Before your first session</h2>
      <p class="text-[13px] text-muted-foreground">{items.length} quick how-tos for your first week, about {Math.max(1, Math.round((items.length - 1) * 0.5 + 2))} minutes.{done ? ` ${done} done.` : ""}</p>
    </div>
    <ul class="flex flex-col">
      {#each items as it, i (it.key)}
        <li>
          <button type="button" class="flex min-h-[52px] w-full items-center gap-3 border-t border-border py-2 text-left" onclick={() => (at = i)}>
            <span class="flex size-6 shrink-0 items-center justify-center rounded-full {read.includes(it.key) ? 'bg-success text-success-foreground' : 'border border-border'}">{#if read.includes(it.key)}<Check class="size-3.5" strokeWidth={3} />{/if}</span>
            <span class="flex min-w-0 flex-1 flex-col"><span class="truncate text-[15px] font-medium">{it.title}</span><span class="text-xs text-muted-foreground">{it.detail}</span></span>
            <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<Dialog.Root open={at != null} onOpenChange={(v) => { if (!v) at = null; }}>
  <Dialog.Content class="flex max-h-[90svh] flex-col gap-3 overflow-y-auto sm:max-w-[440px]">
    {#if current}
      <Dialog.Header>
        <span class="text-xs text-muted-foreground">{(at ?? 0) + 1} of {items.length}</span>
        <Dialog.Title>{current.key === WORKING_WEIGHT ? "Finding your working weight" : current.title}</Dialog.Title>
        <Dialog.Description class="sr-only">A short how-to</Dialog.Description>
      </Dialog.Header>
      {#if current.key === WORKING_WEIGHT}<WorkingWeight {coachName} />{:else if howTo}<HowToCard {howTo} {coachName} />{/if}
      <div class="flex gap-2 pt-1">
        {#if (at ?? 0) > 0}<button type="button" class="h-12 flex-1 rounded-xl border border-border text-[15px] font-medium" onclick={() => (at = (at ?? 1) - 1)}>Back</button>{/if}
        <button type="button" class="h-12 flex-[2] rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground" onclick={next}>{(at ?? 0) + 1 < items.length ? "Got it · next" : "Got it"}</button>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
