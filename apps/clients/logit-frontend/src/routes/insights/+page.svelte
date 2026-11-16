<script lang="ts">
  import { replayTour } from "$lib/tour/index";
  import { onMount } from "svelte";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { back } from "$lib/navigation";
  import { ChevronRight, Lock } from "lucide-svelte";
  import { QUESTIONS, type InsightAnswer, type InsightRange } from "@logit/core/domain/insights";
  import { getInsightAnswers } from "@logit/core/usecases/insights/getInsightAnswers";
  import { phoneInsightDeps, rememberRange, savedRange } from "$lib/features/insights/insightsDeps";
  import { drawCharts, insightCharts, type DrawnChart } from "$lib/features/insights/charts.svelte";
  import RangePicker from "$lib/features/insights/RangePicker.svelte";
  import ChartView from "$lib/features/insights/ChartView.svelte";
  import { authStore } from "$lib/api/authStore.svelte";

  let range = $state<InsightRange>(savedRange());
  let answers = $state<InsightAnswer[] | null>(null);
  let drawn = $state<DrawnChart[]>([]);
  let unit = $state<"kg" | "lbs">("kg");

  $effect(() => {
    const r = range;
    answers = null;
    void phoneInsightDeps().then(({ deps, unit: u }) => {
      unit = u;
      return getInsightAnswers(deps, { range: r });
    }).then((a) => {
      if (r === range) answers = a;
    });
  });

  // Charts: made on the web or by a coach, drawn here from this phone's data.
  $effect(() => {
    const list = insightCharts.list;
    void drawCharts(list, unit).then((d) => (drawn = d)).catch(() => (drawn = []));
  });

  onMount(() => void insightCharts.sync(true));
  onMount(() => setTimeout(() => replayTour("phone.insights"), 400));
</script>

<div class="flex flex-col gap-3 p-3 pb-32">
  <PageHeader>
    <BackButton onclick={() => back("/progress")} />
    <h1 class="page-title">Insights</h1>
  </PageHeader>

  <RangePicker value={range} onchange={(r) => { range = r; rememberRange(r); }} />

  <section aria-label="Questions" data-guide="phone-insights-questions" class="rounded-xl border border-border bg-card px-3.5">
    {#each answers ?? QUESTIONS.map((q) => ({ id: q.id, question: q.question, answer: "", state: "empty", detail: "" }) as InsightAnswer) as a, i (a.id)}
      {@const locked = a.state === "locked"}
      <a href={locked ? undefined : `/insights/${a.id}?range=${range}`} class="flex min-h-14 items-center gap-2.5 py-2.5 {i ? 'border-t border-border' : ''}">
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="flex items-center gap-1 text-xs text-muted-foreground">{#if locked}<Lock class="size-3" aria-hidden="true" />{/if}{a.question}</span>
          {#if answers}
            <span class="text-sm font-semibold">{a.answer}</span>
          {:else}
            <span class="h-4 w-2/3 animate-pulse rounded bg-muted"></span>
          {/if}
        </span>
        {#if !locked}<ChevronRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{/if}
      </a>
    {/each}
  </section>

  <section class="flex flex-col gap-2" data-guide="phone-insights-charts">
    <h2 class="px-0.5 pt-1 text-[15px] font-semibold">Your charts</h2>
    {#each drawn as d (d.chart.id)}
      <a href="/insights/charts/{d.chart.id}" class="flex flex-col gap-2 rounded-xl border border-border bg-card px-3.5 py-3">
        <span class="flex items-center justify-between gap-2">
          <span class="text-sm font-semibold">{d.chart.name || "Chart"}</span>
          {#if d.chart.from}<span class="rounded-full bg-info/14 px-2 py-0.5 text-[11px] font-semibold text-info">From {d.chart.from.name}</span>{/if}
        </span>
        <ChartView lines={d.lines} bucket={d.chart.bucket} {unit} compact height={60} />
        {#if d.chart.showOn.phoneHome || d.chart.showOn.coach}
          <span class="flex gap-1.5">
            {#if d.chart.showOn.phoneHome}<span class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">On home</span>{/if}
            {#if d.chart.showOn.coach && !d.chart.from}<span class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">Shown to your coach</span>{/if}
          </span>
        {/if}
      </a>
    {:else}
      <p class="px-0.5 text-xs leading-relaxed text-muted-foreground">
        {authStore.isAuthenticated ? "No charts yet." : "Sign in to see charts you saved on the web."}
        Charts are made on the web at app.getlogit.app/insights and show up here.
      </p>
    {/each}
    {#if drawn.length}<p class="px-0.5 text-xs text-muted-foreground">Make new charts on the web: app.getlogit.app/insights</p>{/if}
  </section>
</div>
