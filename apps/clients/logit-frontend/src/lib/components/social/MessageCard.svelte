<!-- A workout or record shared into a chat (design canvas M2). A snapshot from when it was sent. -->
<script lang="ts">
  import { Dumbbell, Trophy } from "lucide-svelte";
  import { cardTitle, type Card } from "@logit/core/domain/messageCard";
  import { dayTime } from "$lib/features/friends/dmTime";

  const { card, mine = false }: { card: Card; mine?: boolean } = $props();
  const when = $derived(card.data.atMs ? dayTime(card.data.atMs, Date.now()) : null);
</script>

<div class="flex w-[min(78vw,280px)] flex-col gap-1.5 rounded-2xl border border-border bg-card px-3.5 py-3 {mine ? 'self-end' : ''}">
  <span class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
    {#if card.type === "PersonalRecord"}<Trophy class="size-3.5" />New record{:else}<Dumbbell class="size-3.5" />Workout{/if}
  </span>
  <span class="text-[15px] font-semibold leading-snug tabular-nums">{cardTitle(card)}</span>
  {#if card.type === "WorkoutSession" && card.data.exercises?.length}
    <span class="text-[13px] leading-snug text-muted-foreground">{card.data.exercises.map((e) => `${e.name} (${e.sets})`).join(" · ")}</span>
  {/if}
  {#if when}<span class="text-[12px] text-muted-foreground">{when}</span>{/if}
</div>
