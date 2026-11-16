<script lang="ts">
  import { get } from "svelte/store";
  import { goto } from "$app/navigation";
  import * as Card from "$lib/components/ui/card";
  import { profile } from "$lib/stores/profile.store";
  import { coachFor } from "$lib/features/coaching/coachCache";
  import { insightCharts, drawCharts, type DrawnChart } from "./charts.svelte";
  import ChartView from "./ChartView.svelte";

  /** A saved Insights chart on the home screen, drawn from this phone's data. */
  let { chartId }: { chartId: string } = $props();

  const chart = $derived(insightCharts.get(chartId));
  let drawn = $state<DrawnChart | null>(null);
  const unit = get(profile).weightUnit === "lbs" ? "lbs" : "kg";

  $effect(() => {
    const c = chart;
    if (!c) return;
    void drawCharts([c], unit).then(([d]) => (drawn = d ?? null)).catch(() => (drawn = null));
  });

  const coach = $derived(chart?.from ? coachFor(chart.from.userId) : undefined);
</script>

{#if chart}
  <Card.Root>
    <Card.Content class="flex flex-col gap-2 pt-3">
      <div class="flex items-center justify-between gap-2">
        <a href="/insights/charts/{chart.id}" class="text-[15px] font-semibold">{chart.name || "Chart"}</a>
        {#if chart.from}<span class="rounded-full bg-info/14 px-2 py-0.5 text-[11px] font-semibold text-info">From {chart.from.name}</span>{/if}
      </div>
      {#if drawn}
        <ChartView lines={drawn.lines} bucket={chart.bucket} {unit} height={150} />
        <p class="text-[13px] leading-snug">{drawn.summary}</p>
      {:else}
        <div class="h-[150px]"></div>
      {/if}
      <div class="flex flex-wrap gap-3 text-[13px]">
        {#if coach}
          <button type="button" class="min-h-11 underline" onclick={() => void goto(`/messages/${coach.relationshipId}`)}>Reply to {chart.from?.name}</button>
        {/if}
        <button type="button" class="min-h-11 text-muted-foreground underline" onclick={() => void insightCharts.setPhoneHome(chart.id, false)}>Remove from home</button>
      </div>
    </Card.Content>
  </Card.Root>
{/if}
