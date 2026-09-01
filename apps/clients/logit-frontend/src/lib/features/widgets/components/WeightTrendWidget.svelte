<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Plus, Scale } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { getNutritionTargets } from "@logit/core/usecases/nutrition/getNutritionTargets";
  import { getNutritionDeps } from "$lib/features/nutrition/deps";
  import { profile } from "$lib/stores/profile.store";
  import { onForeground } from "$lib/lifecycle";
  import WeightTrendChart from "$lib/features/nutrition/WeightTrendChart.svelte";
  import { fmtWeight, type NutritionState, type WeightUnit } from "$lib/features/nutrition/nutrition";

  let loading = $state(true);
  let nut = $state<NutritionState | null>(null);

  const unit = $derived(($profile.weightUnit ?? "kg") as WeightUnit);

  const rate = $derived.by(() => {
    if (!nut || Math.abs(nut.trend.weeklyRateKg) < 0.05) return null;
    const r = unit === "lbs" ? nut.trend.weeklyRateKg * 2.2046 : nut.trend.weeklyRateKg;
    return `${r > 0 ? "+" : ""}${r.toFixed(2)} ${unit}/wk`;
  });

  async function load() {
    try {
      const fallbackKg =
        $profile.weight != null && $profile.weightUnit === "kg" ? $profile.weight : null;
      nut = await getNutritionTargets(getNutritionDeps(), { fallbackWeightKg: fallbackKg });
    } catch {
      // leave nut null
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
    return onForeground(() => void load());
  });
</script>

<Card.Root>
  <Card.Header>
    <div class="flex items-center justify-between gap-2">
      <Card.Title class="flex items-center gap-1.5">
        <Scale class="h-4 w-4" /> Weight Trend
      </Card.Title>
      <div class="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          aria-label="Log weight"
          onclick={() => void goto("/nutrition/weight")}
        >
          <Plus class="h-4 w-4" />
        </Button>
      </div>
    </div>
  </Card.Header>

  <Card.Content>
    {#if loading}
      <p class="text-sm text-muted-foreground">Loading…</p>
    {:else if !nut || nut.trend.points.length < 2}
      <a href="/nutrition/weight" class="flex items-center gap-2 text-sm text-primary">
        <Scale class="h-4 w-4" /> Log your weight to track the trend
      </a>
    {:else}
      <div class="flex items-baseline justify-between mb-1">
        <span class="text-sm font-medium tabular-nums">{fmtWeight(nut.trend.currentKg, unit)}</span>
        {#if rate}<span class="text-xs text-muted-foreground tabular-nums">{rate}</span>{/if}
      </div>
      <WeightTrendChart
        trend={nut.trend}
        unit={unit}
        targetKg={nut.goal?.targetWeightKg ?? null}
      />
    {/if}
  </Card.Content>
</Card.Root>
