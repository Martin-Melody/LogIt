<!-- The plan asks for more than this place has (My gym, decided 2026-11-18): ask once whether
     load can be added another way; if so, progression keeps going that way; if not, suggest a
     harder version of the exercise. The answer is remembered for that equipment at that place. -->
<script lang="ts">
  import { reveal } from "$lib/transitions";
  import type { ExtraLoad } from "@logit/core/domain/place";

  let {
    heaviestLabel,
    kind,
    answer,
    onAnswer,
    onSwap,
  }: {
    /** "24 kg is the heaviest dumbbell at Home" */
    heaviestLabel: string;
    kind: "machine" | "dumbbells" | "kettlebells";
    /** Saved answer: undefined = not asked yet. */
    answer: ExtraLoad[] | undefined;
    onAnswer: (extra: ExtraLoad[]) => void;
    /** Canvas EQ3 (3): without a coach, the last resort is theirs: swap for a harder version. */
    onSwap?: () => void;
  } = $props();

  let picked = $state<ExtraLoad[]>([]);

  const OPTIONS: { id: ExtraLoad; label: string }[] = $derived(
    kind === "machine"
      ? [{ id: "addons", label: "Clip-on add-ons" }, { id: "pin", label: "Pin with plates" }]
      : [{ id: "addons", label: "Clip-on plates" }, { id: "vest", label: "Vest or belt" }, { id: "bands", label: "Bands or chains" }],
  );
</script>

{#if answer === undefined}
  <div transition:reveal class="mx-3 my-2 flex flex-col gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
    <p class="text-sm font-semibold">{heaviestLabel}. Can you add load?</p>
    <div class="flex flex-wrap gap-1.5">
      {#each OPTIONS as o (o.id)}
        <button type="button" aria-pressed={picked.includes(o.id)}
          class="min-h-9 rounded-full border px-3 text-xs {picked.includes(o.id) ? 'border-foreground bg-primary font-semibold text-primary-foreground' : 'border-border bg-background'}"
          onclick={() => (picked = picked.includes(o.id) ? picked.filter((x) => x !== o.id) : [...picked, o.id])}>{o.label}</button>
      {/each}
      <button type="button" class="min-h-9 rounded-full border border-border bg-background px-3 text-xs" onclick={() => onAnswer([])}>No, make it harder</button>
    </div>
    {#if picked.length}
      <button type="button" class="min-h-9 self-start rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground" transition:reveal onclick={() => onAnswer(picked)}>That's what I have</button>
    {/if}
  </div>
{:else if answer.length === 0}
  <p transition:reveal class="mx-3 my-1.5 rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed">
    {heaviestLabel}. To keep it getting harder: lower for 3 seconds, pause at the bottom, or switch to a single-arm or single-leg version.
    {#if onSwap}<button type="button" class="ml-1 min-h-10 rounded-lg border border-border bg-background px-3 text-xs font-medium" onclick={onSwap}>Swap for a harder version</button>{/if}
  </p>
{/if}
