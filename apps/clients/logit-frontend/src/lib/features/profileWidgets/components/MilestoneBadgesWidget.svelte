<script lang="ts">
  import { Award } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { computeBadges } from "../progressStats";
  import type { PublicBadge } from "@logit/core/api/socialApi";

  // Dual-mode — see WeightTrendWidget.svelte's comment. A small, explicitly bounded v1 set
  // (see progressStats.ts computeBadges()) — not an open achievement system, no server-side
  // verification (not competitive/leaderboard-facing).
  let { data }: { data?: PublicBadge[] } = $props();

  let live = $state<PublicBadge[] | null>(null);
  let fetched = $state(false);

  $effect(() => {
    if (data) return;
    void computeBadges().then((r) => { live = r; fetched = true; });
  });

  const badges = $derived(data ?? live ?? []);
  const loading = $derived(!data && !fetched);
</script>

<Card.Root>
  <Card.Header>
    <Card.Title class="text-sm flex items-center gap-1.5"><Award class="h-3.5 w-3.5 text-muted-foreground" /> Milestones</Card.Title>
  </Card.Header>

  <Card.Content>
    {#if loading}
      <p class="text-xs text-muted-foreground">Loading…</p>
    {:else if badges.length === 0}
      <p class="text-xs text-muted-foreground">Keep training to earn your first milestone.</p>
    {:else}
      <div class="flex flex-wrap gap-1.5">
        {#each badges as badge (badge.id)}
          <span class="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium">
            {badge.label}
          </span>
        {/each}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
