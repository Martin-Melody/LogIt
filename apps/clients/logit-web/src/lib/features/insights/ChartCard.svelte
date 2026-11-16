<script lang="ts">
  import type { WeightUnit } from "@logit/core/domain/units";
  import { CHART_BUCKETS } from "@logit/core/domain/insightChart";
  import type { DrawnChart } from "./insightsData";
  import InsightChartView from "./InsightChartView.svelte";

  let { drawn, href, unit = "kg", showWhere = true }: { drawn: DrawnChart; href?: string; unit?: WeightUnit; showWhere?: boolean } = $props();

  const c = $derived(drawn.chart);
  const where = $derived(
    [c.showOn.overview && "Overview", c.showOn.phoneHome && "Phone home", c.showOn.coach && "My coach"].filter(Boolean) as string[],
  );
</script>

<svelte:element this={href ? "a" : "div"} {href} class="flex min-w-0 flex-col gap-2.5 rounded-[10px] border border-border bg-card px-[18px] py-4 {href ? 'transition-colors hover:border-foreground/20' : ''}">
  <span class="flex items-start justify-between gap-2">
    <span class="text-sm font-semibold">{c.name || "Untitled chart"}</span>
    <span class="shrink-0 text-xs text-muted-foreground">{CHART_BUCKETS.find((b) => b.id === c.bucket)?.label.replace(/^A /, "Each ")}</span>
  </span>
  <InsightChartView lines={drawn.lines} bucket={c.bucket} {unit} compact height={90} />
  {#if showWhere || c.from}
    <span class="flex flex-wrap gap-1.5">
      {#if c.from}<span class="rounded-full bg-info/14 px-2 py-0.5 text-[11px] font-semibold text-info">From {c.from.name}</span>{/if}
      {#if showWhere}
        {#each where as w (w)}<span class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/80">{w}</span>{/each}
      {/if}
    </span>
  {/if}
</svelte:element>
