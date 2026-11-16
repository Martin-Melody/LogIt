<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import type { Sharing } from "@logit/core/api/coachApi";
  import { insightChartsApi } from "@logit/core/api/insightChartsApi";
  import { isQuestionId, QUESTIONS, type InsightAnswer, type InsightRange } from "@logit/core/domain/insights";
  import { getInsightAnswers } from "@logit/core/usecases/insights/getInsightAnswers";
  import AnswerCard from "$lib/features/insights/AnswerCard.svelte";
  import ChartCard from "$lib/features/insights/ChartCard.svelte";
  import QuestionDetail from "$lib/features/insights/QuestionDetail.svelte";
  import RangePicker from "$lib/features/insights/RangePicker.svelte";
  import {
    chartVisible,
    drawCharts,
    insightsSetup,
    savedRange,
    type DrawnChart,
    type InsightsSetup,
  } from "$lib/features/insights/insightsData";

  /** A client's Insights, as their coach sees them: the same questions, limited by what they share. */
  let { clientId, name, sharing }: { clientId: string; name: string; sharing: Sharing } = $props();

  let range = $state<InsightRange>(savedRange());
  let setup = $state<InsightsSetup | null>(null);
  let answers = $state<InsightAnswer[] | null>(null);
  let shown = $state<DrawnChart[] | null>(null);
  let sent = $state<DrawnChart[] | null>(null);
  let hiddenCount = $state(0);

  const q = $derived(page.url.searchParams.get("q"));

  function open(id: string | null) {
    const u = new URL(page.url);
    if (id) u.searchParams.set("q", id);
    else u.searchParams.delete("q");
    void goto(u, { noScroll: !id, keepFocus: true });
  }

  $effect(() => {
    void (async () => {
      setup = await insightsSetup({ clientId, name, sharing });
      try {
        const charts = await insightChartsApi.forClient(clientId);
        const visible = (list: typeof charts.shown) => list.filter((c) => chartVisible(c, sharing));
        hiddenCount = charts.shown.length - visible(charts.shown).length;
        const drawn = await drawCharts([...visible(charts.shown), ...visible(charts.sent)], setup, clientId);
        shown = drawn.filter((d) => charts.shown.some((c) => c.id === d.chart.id));
        sent = drawn.filter((d) => charts.sent.some((c) => c.id === d.chart.id));
      } catch {
        shown = [];
        sent = [];
      }
    })();
  });

  $effect(() => {
    const s = setup;
    const r = range;
    if (!s) return;
    answers = null;
    void getInsightAnswers(s.deps, { range: r }).then((a) => {
      if (r === range) answers = a;
    });
  });
</script>

{#if q && isQuestionId(q) && setup}
  <div class="flex flex-col gap-3">
    <button type="button" class="w-fit text-[13px] text-muted-foreground hover:text-foreground" onclick={() => open(null)}>‹ All of {name}'s insights</button>
    {#key q}
      <QuestionDetail id={q} {setup} bind:range {clientId} whose="{name}'s" />
    {/key}
  </div>
{:else}
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2.5">
      <p class="text-[13px] text-muted-foreground">The same questions {name} sees, from what they share with you.</p>
      <RangePicker value={range} onchange={(r) => (range = r)} />
    </div>

    <section aria-label="Questions about {name}" class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
      {#if answers}
        {#each answers as a (a.id)}
          {#if a.state === "locked"}
            <AnswerCard answer={a} compact />
          {:else}
            <button type="button" class="h-full text-left" onclick={() => open(a.id)}><AnswerCard answer={a} compact /></button>
          {/if}
        {/each}
      {:else}
        {#each QUESTIONS as qq (qq.id)}<Skeleton class="h-40" />{/each}
      {/if}
    </section>

    <div class="flex flex-wrap items-start gap-3.5">
      <section class="flex min-w-0 flex-[1_1_420px] flex-col gap-2.5 rounded-[10px] border border-border bg-card px-[18px] py-4">
        <div class="flex items-baseline justify-between gap-2.5"><h2 class="text-sm font-semibold">Charts {name} shows you</h2><span class="text-xs text-muted-foreground">They tick "My coach" on these</span></div>
        {#if shown === null}
          <Skeleton class="h-24" />
        {:else if shown.length === 0}
          <p class="text-[13px] text-muted-foreground">None yet.{hiddenCount ? ` ${hiddenCount} need data ${name} doesn't share with you.` : ""}</p>
        {:else}
          <div class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {#each shown as d (d.chart.id)}<ChartCard drawn={d} unit={setup?.unit ?? "kg"} showWhere={false} />{/each}
          </div>
        {/if}
      </section>

      <section class="flex min-w-0 flex-[1_1_420px] flex-col gap-2.5 rounded-[10px] border border-border bg-card px-[18px] py-4">
        <div class="flex items-center justify-between gap-2.5">
          <h2 class="text-sm font-semibold">Charts you made for {name}</h2>
          <a href="/insights/charts/new?client={clientId}" class="h-[34px] rounded-[9px] border border-border px-3 text-[13px] font-medium leading-[34px] hover:bg-muted">New chart for {name}</a>
        </div>
        {#if sent === null}
          <Skeleton class="h-24" />
        {:else if sent.length === 0}
          <p class="text-[13px] text-muted-foreground">Make one to point something out, like bench against chest sets. It shows in {name}'s Insights as from you, and on their phone's home screen if you tick that.</p>
        {:else}
          <div class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {#each sent as d (d.chart.id)}<ChartCard drawn={d} href="/insights/charts/{d.chart.id}?client={clientId}" unit={setup?.unit ?? "kg"} showWhere={false} />{/each}
          </div>
        {/if}
      </section>
    </div>
  </div>
{/if}
