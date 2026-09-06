<script lang="ts">
  import { Flame } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { computeStreak } from "../progressStats";
  import type { PublicStreak } from "@logit/core/api/socialApi";

  // Dual-mode — see WeightTrendWidget.svelte's comment.
  let { data }: { data?: PublicStreak } = $props();

  let live = $state<PublicStreak | null>(null);
  let fetched = $state(false);

  $effect(() => {
    if (data) return;
    void computeStreak().then((r) => { live = r; fetched = true; });
  });

  const streak = $derived(data ?? live);
  const loading = $derived(!data && !fetched);
</script>

<Card.Root>
  <Card.Header>
    <Card.Title class="text-sm flex items-center gap-1.5"><Flame class="h-3.5 w-3.5 text-muted-foreground" /> Training Streak</Card.Title>
  </Card.Header>

  <Card.Content>
    {#if loading}
      <p class="text-xs text-muted-foreground">Loading…</p>
    {:else if streak}
      <dl class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <dt class="text-muted-foreground">Current</dt>
        <dd class="font-medium tabular-nums">{streak.currentDays} day{streak.currentDays === 1 ? "" : "s"}</dd>
        <dt class="text-muted-foreground">Best</dt>
        <dd class="font-medium tabular-nums">{streak.bestDays} day{streak.bestDays === 1 ? "" : "s"}</dd>
      </dl>
    {/if}
  </Card.Content>
</Card.Root>
