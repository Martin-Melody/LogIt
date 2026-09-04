<script lang="ts">
  import { TrendingUp } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import WeightTrendChart from "$lib/features/nutrition/WeightTrendChart.svelte";
  import { smoothWeightSeries } from "@logit/core/nutrition/trend";
  import { profile } from "$lib/stores/profile.store";
  import { computeWeightTrend } from "../progressStats";
  import type { PublicWeightTrend } from "@logit/core/api/socialApi";

  // Dual-mode, per docs/architecture/profile-progress-redesign.md §2b: pass `data` (the
  // synced snapshot) when rendering someone else's — or your own already-synced — profile via
  // ProfileView; omit it on the local /routes/profile widget grid, where it self-computes live
  // from on-device data with no sync lag.
  let { data }: { data?: PublicWeightTrend } = $props();

  let live = $state<PublicWeightTrend | null>(null);
  let fetched = $state(false);

  $effect(() => {
    if (data) return;
    void computeWeightTrend().then((r) => { live = r; fetched = true; });
  });

  const points = $derived(data ?? live);
  const loading = $derived(!data && !fetched);

  const trend = $derived.by(() => {
    if (!points) return null;
    const entries = points.points.map((p) => ({
      id: p.dateIso, dateIso: p.dateIso, weightKg: p.kg, createdAtMs: 0, updatedAtMs: 0,
    }));
    return smoothWeightSeries(entries);
  });
</script>

<Card.Root>
  <Card.Header>
    <Card.Title class="text-sm flex items-center gap-1.5"><TrendingUp class="h-3.5 w-3.5 text-muted-foreground" /> Weight Trend</Card.Title>
  </Card.Header>

  <Card.Content>
    {#if loading}
      <p class="text-xs text-muted-foreground">Loading…</p>
    {:else}
      <WeightTrendChart trend={trend ?? { points: [], currentKg: null, currentActualKg: null, weeklyRateKg: 0 }} unit={$profile.weightUnit} />
    {/if}
  </Card.Content>
</Card.Root>
