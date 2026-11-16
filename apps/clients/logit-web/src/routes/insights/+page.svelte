<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { isInsightRange, QUESTIONS, type InsightAnswer, type InsightRange } from "@logit/core/domain/insights";
  import { getInsightAnswers } from "@logit/core/usecases/insights/getInsightAnswers";
  import AnswerCard from "$lib/features/insights/AnswerCard.svelte";
  import ChartCard from "$lib/features/insights/ChartCard.svelte";
  import RangePicker from "$lib/features/insights/RangePicker.svelte";
  import {
    drawCharts,
    insightsSetup,
    loadMyCharts,
    rememberRange,
    savedRange,
    type DrawnChart,
    type InsightsSetup,
  } from "$lib/features/insights/insightsData";

  const urlRange = page.url.searchParams.get("range");
  let range = $state<InsightRange>(isInsightRange(urlRange) ? urlRange : savedRange());

  // Loaded once and shared by the questions and the charts (not reactive on purpose).
  let setupP: Promise<InsightsSetup> | null = null;
  const getSetup = () => (setupP ??= insightsSetup());
  let unit = $state<"kg" | "lbs">("kg");
  let answers = $state<InsightAnswer[] | null>(null);
  let charts = $state<DrawnChart[] | null>(null);
  let error = $state<string | null>(null);

  async function loadAnswers(r: InsightRange) {
    answers = null;
    try {
      const setup = await getSetup();
      const got = await getInsightAnswers(setup.deps, { range: r });
      if (r === range) answers = got;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load Insights";
    }
  }

  async function loadCharts() {
    try {
      const setup = await getSetup();
      unit = setup.unit;
      charts = await drawCharts(await loadMyCharts(), setup);
    } catch {
      charts = [];
    }
  }

  function setRange(r: InsightRange) {
    range = r;
    rememberRange(r);
    const u = new URL(page.url);
    u.searchParams.set("range", r);
    void goto(u, { replaceState: true, noScroll: true, keepFocus: true });
  }

  $effect(() => {
    void loadAnswers(range);
  });
  onMount(() => void loadCharts());
</script>

<div class="flex flex-col gap-5">
  <header class="flex flex-wrap items-end justify-between gap-3.5">
    <div>
      <h1 class="text-[26px] font-bold tracking-tight">Insights</h1>
      <p class="mt-1 text-[13px] text-muted-foreground">Worked out from your own training, food and habits.</p>
    </div>
    <RangePicker value={range} onchange={setRange} />
  </header>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {/if}

  <section aria-label="Questions" class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
    {#if answers}
      {#each answers as a (a.id)}
        <AnswerCard answer={a} href="/insights/{a.id}?range={range}" />
      {/each}
    {:else}
      {#each QUESTIONS as q (q.id)}
        <div class="flex min-h-[190px] flex-col gap-3 rounded-[10px] border border-border bg-card px-[18px] py-4">
          <span class="text-[13px] font-medium text-muted-foreground">{q.question}</span>
          <Skeleton class="h-6 w-3/4" /><Skeleton class="h-10" /><Skeleton class="h-4 w-2/3" />
        </div>
      {/each}
    {/if}
  </section>

  <section class="mt-1.5 flex flex-col gap-3">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="text-[17px] font-bold">Your charts</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">Saved on your account. Each one draws from your latest data wherever it shows.</p>
      </div>
      <a href="/insights/charts/new" class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold leading-9 text-primary-foreground">New chart</a>
    </div>
    {#if charts === null}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5"><Skeleton class="h-40" /><Skeleton class="h-40" /></div>
    {:else if charts.length === 0}
      <p class="rounded-[10px] border border-dashed border-border px-[18px] py-6 text-center text-[13px] text-muted-foreground">
        No charts yet. Build one to put a lift, your body weight or anything else side by side, then show it on your Overview or your phone.
      </p>
    {:else}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
        {#each charts as d (d.chart.id)}
          <ChartCard drawn={d} href="/insights/charts/{d.chart.id}" {unit} />
        {/each}
      </div>
    {/if}
  </section>
</div>
