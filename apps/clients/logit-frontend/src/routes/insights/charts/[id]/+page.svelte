<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { get } from "svelte/store";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import * as Card from "$lib/components/ui/card";
  import { back } from "$lib/navigation";
  import { profile } from "$lib/stores/profile.store";
  import { coachFor } from "$lib/features/coaching/coachCache";
  import { drawCharts, insightCharts, type DrawnChart } from "$lib/features/insights/charts.svelte";
  import ChartView from "$lib/features/insights/ChartView.svelte";

  /** One saved chart on the phone: view it, put it on the home screen. Editing is on the web. */
  const chart = $derived(insightCharts.get(page.params.id ?? ""));
  const unit = get(profile).weightUnit === "lbs" ? "lbs" : "kg";
  let drawn = $state<DrawnChart | null>(null);

  $effect(() => {
    const c = chart;
    if (!c) return;
    void drawCharts([c], unit).then(([d]) => (drawn = d ?? null));
  });
  $effect(() => void insightCharts.sync());

  const coach = $derived(chart?.from ? coachFor(chart.from.userId) : undefined);
</script>

<div class="flex flex-col gap-3 p-3 pb-32">
  <PageHeader>
    <BackButton onclick={() => back("/insights")} />
    <h1 class="page-title truncate">{chart?.name || "Chart"}</h1>
  </PageHeader>

  {#if !chart}
    <p class="text-sm text-muted-foreground">This chart isn't here any more.</p>
  {:else}
    {#if chart.from}<span class="w-fit rounded-full bg-info/14 px-2 py-0.5 text-[11px] font-semibold text-info">From {chart.from.name}</span>{/if}
    <Card.Root>
      <Card.Content class="flex flex-col gap-3 pt-3">
        {#if drawn}
          <ChartView lines={drawn.lines} bucket={chart.bucket} {unit} height={240} />
          <p class="text-[13px] leading-relaxed">{drawn.summary}</p>
        {:else}
          <Skeleton class="h-60 rounded-lg" />
        {/if}
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Content class="flex flex-col pt-1">
        <div class="flex min-h-14 items-center justify-between gap-3 text-sm">
          <span>On my home screen</span>
          <Switch checked={chart.showOn.phoneHome} label="On my home screen" onchange={(v) => void insightCharts.setPhoneHome(chart.id, v)} />
        </div>
        {#if coach}
          <button type="button" class="min-h-12 border-t border-border text-left text-sm" onclick={() => void goto(`/messages/${coach.relationshipId}`)}>Reply to {chart.from?.name}</button>
        {/if}
      </Card.Content>
    </Card.Root>
    <p class="px-0.5 text-xs leading-relaxed text-muted-foreground">
      {chart.from ? `${chart.from.name} can change this chart.` : "Change what this chart shows on the web: app.getlogit.app/insights."}
    </p>
  {/if}
</div>
