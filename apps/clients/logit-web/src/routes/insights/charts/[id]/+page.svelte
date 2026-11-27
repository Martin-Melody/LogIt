<script lang="ts">
  import PageCrumbs from "$lib/components/PageCrumbs.svelte";
  import { clientName } from "$lib/features/coaching/clientName";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import OptionSelect from "$lib/components/option-select.svelte";
  import { guideSignal } from "$lib/features/guide/signal";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { createId } from "@logit/core/domain/ids";
  import { MUSCLE_LABEL } from "@logit/core/domain/library";
  import type { Habit } from "@logit/core/domain/habit";
  import {
    CHART_BUCKETS,
    CHART_COMPARES,
    CHART_METRICS,
    MAX_CHART_LINES,
    chartProblem,
    defaultChartName,
    metricDef,
    newChart,
    type ChartMetric,
    type InsightChart,
  } from "@logit/core/domain/insightChart";
  import { insightChartsApi } from "@logit/core/api/insightChartsApi";
  import { syncApi } from "@logit/core/api/syncApi";
  import { loadExerciseIndex, type ExerciseIndex } from "$lib/features/plan/exerciseIndex";
  import { parseRows } from "$lib/features/overview/overviewData";
  import { loadCoachingOverview, type ClientSummary } from "$lib/features/coaching/coachingData";
  import InsightChartView from "$lib/features/insights/InsightChartView.svelte";
  import RangePicker from "$lib/features/insights/RangePicker.svelte";
  import {
    chartVisible,
    deleteMyChart,
    drawCharts,
    insightsSetup,
    loadMyCharts,
    saveMyChart,
    type DrawnChart,
    type InsightsSetup,
  } from "$lib/features/insights/insightsData";

  /**
   * Build or edit a saved chart. With ?client=<id> a coach builds one for a client: it's
   * drawn from the client's data and saved to their account ("From <coach>").
   */
  const chartId = $derived(page.params.id ?? "new");
  const clientId = page.url.searchParams.get("client") ?? undefined;
  const backHref = clientId ? `/clients/${clientId}?tab=insights` : "/insights";

  let chart = $state<InsightChart | null>(null);
  let isNew = $state(true);
  let client = $state<ClientSummary | null>(null);
  let setup = $state<InsightsSetup | null>(null);
  let index = $state<ExerciseIndex | null>(null);
  let habits = $state<Habit[]>([]);
  let drawn = $state<DrawnChart | null>(null);
  let drawing = $state(false);
  let error = $state<string | null>(null);
  let saving = $state(false);
  let liftQuery = $state("");

  async function init() {
    try {
      if (clientId) {
        const ov = await loadCoachingOverview();
        client = ov.clients.find((c) => c.id === clientId) ?? null;
        if (!client) throw new Error("This person isn't one of your clients.");
      }
      setup = await insightsSetup(clientId ? { clientId, name: client!.name, sharing: client!.sharing } : {});
      const existing = chartId === "new"
        ? null
        : clientId
          ? (await insightChartsApi.forClient(clientId)).sent.find((c) => c.id === chartId) ?? null
          : (await loadMyCharts()).find((c) => c.id === chartId) ?? null;
      if (chartId !== "new" && !existing) throw new Error("That chart isn't there any more.");
      isNew = !existing;
      chart = existing ?? {
        ...newChart(createId("chart"), Date.now()),
        // A coach's chart goes on the client's phone; your own starts on your Overview.
        showOn: clientId ? { overview: false, phoneHome: true, coach: false } : { overview: true, phoneHome: false, coach: false },
      };
      const sessions = await setup.deps.progression.workoutRepo.listAllSessions().catch(() => []);
      index = await loadExerciseIndex(sessions);
      habits = await syncApi.pullHabits(0, clientId).then((r) => parseRows<Habit>(r.habits).filter((h) => !h.archived)).catch(() => []);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load the chart";
    }
  }
  $effect(() => {
    void chartId;
    void init();
  });

  // Redraw the preview whenever the recipe changes (a short wait so typing doesn't redraw each key).
  let timer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const c = chart ? $state.snapshot(chart) : null;
    const s = setup;
    if (!c || !s) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (chartProblem(c)) {
        drawn = null;
        return;
      }
      drawing = true;
      try {
        [drawn] = await drawCharts([c], s, clientId);
      } catch {
        drawn = null;
      } finally {
        drawing = false;
      }
    }, 250);
  });

  const def = $derived(chart ? metricDef(chart.metric) : null);
  const groups = $derived([...new Set(CHART_METRICS.map((m) => m.group))]);
  const suggestions = $derived(index && liftQuery.trim() ? index.search(liftQuery, 8).filter((e) => !chart?.lifts.some((l) => l.exerciseName.toLowerCase() === e.name.toLowerCase())) : []);
  const blocked = $derived(chart && client && !chartVisible(chart, client.sharing));
  const habitName = (id: string) => habits.find((h) => h.id === id)?.name ?? "Habit";

  function setMetric(m: ChartMetric) {
    if (!chart) return;
    chart.metric = m;
    // Lift charts per session make sense; day data reads better weekly.
    if (metricDef(m).pick !== "lifts" && chart.bucket === "session") chart.bucket = "week";
  }

  function addLift(name: string) {
    if (!chart || chart.lifts.length >= MAX_CHART_LINES) return;
    chart.lifts.push({ exerciseName: name });
    liftQuery = "";
    guideSignal("chart.lift-added");
  }

  function toggle(list: string[], v: string, max = Infinity) {
    const i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1);
    else if (list.length < max) list.push(v);
  }

  async function save() {
    if (!chart) return;
    const problem = chartProblem(chart);
    if (problem) {
      error = problem;
      return;
    }
    saving = true;
    error = null;
    try {
      const c = $state.snapshot(chart) as InsightChart;
      if (!c.name.trim()) c.name = defaultChartName(c, habitName);
      if (clientId) await insightChartsApi.sendToClient(clientId, c);
      else {
        await saveMyChart(c);
        guideSignal("chart.saved");
      }
      await goto(backHref);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't save the chart";
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!chart || isNew) return;
    saving = true;
    try {
      if (clientId) await insightChartsApi.removeFromClient(clientId, chart.id);
      else await deleteMyChart(chart);
      await goto(backHref);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't delete the chart";
      saving = false;
    }
  }

  const label = "text-xs font-medium text-muted-foreground";
  const control = "h-[38px] w-full rounded-[9px] border border-border bg-background px-2.5 text-[13px]";
  const segBtn = (on: boolean) => `h-[30px] rounded-[7px] px-3 text-xs ${on ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`;
</script>

<div class="flex flex-col gap-4">
  <PageCrumbs crumbs={clientId
    ? [{ label: "Clients", href: "/clients" }, { label: client?.name ?? clientName(clientId), href: `/clients/${clientId}`, clientId }, { label: "Insights", href: backHref }, { label: chart?.name || "New chart" }]
    : [{ label: "Insights", href: "/insights" }, { label: chart?.name || "New chart" }]} />

  {#if error && !chart}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if !chart || !setup}
    <Skeleton class="h-11 w-96 max-w-full" /><Skeleton class="h-96" />
  {:else}
    <header class="flex flex-wrap items-end justify-between gap-3.5">
      <div class="flex max-w-[420px] flex-1 flex-col gap-1.5">
        <label class={label} for="chart-name">{clientId ? `Chart for ${client?.name}` : "Chart name"}</label>
        <input id="chart-name" class="h-[42px] w-full rounded-[9px] border border-border bg-background px-2.5 text-lg font-bold" placeholder={defaultChartName(chart, habitName)} bind:value={chart.name} maxlength="80" />
      </div>
    </header>

    {#if error}<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}

    <div class="flex flex-wrap items-start gap-3.5">
      <section aria-label="What to chart" class="flex flex-[1_1_300px] flex-col gap-4 rounded-[10px] border border-border bg-card px-[18px] py-4">
        <div class="flex flex-col gap-1.5">
          <label class={label} for="chart-show">Show</label>
          <OptionSelect id="chart-show" class="w-full" value={chart.metric} onValueChange={(v) => setMetric(v as ChartMetric)}
            options={groups.flatMap((g) => CHART_METRICS.filter((m) => m.group === g).map((m) => ({ value: m.id, label: m.label, group: g })))} />
        </div>

        {#if def?.pick === "lifts"}
          <div class="flex flex-col gap-1.5" data-guide="chart-for">
            <span class={label}>For</span>
            <span class="flex flex-wrap gap-1.5">
              {#each chart.lifts as l, i (l.exerciseName)}
                <span class="inline-flex h-[30px] items-center gap-1 rounded-full bg-muted pl-2.5 pr-1 text-xs">{l.exerciseName}
                  <button type="button" class="size-[22px] rounded-full text-sm text-muted-foreground hover:text-foreground" aria-label="Remove {l.exerciseName}" onclick={() => chart!.lifts.splice(i, 1)}>×</button>
                </span>
              {/each}
            </span>
            {#if chart.lifts.length < MAX_CHART_LINES}
              <div class="relative">
                <input class={control} placeholder="Add a lift" aria-label="Add a lift" bind:value={liftQuery}
                  onkeydown={(e) => { if (e.key === "Enter" && suggestions[0]) { e.preventDefault(); addLift(suggestions[0].name); } }} />
                {#if suggestions.length}
                  <ul class="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-[9px] border border-border bg-popover py-1 shadow-md">
                    {#each suggestions as s (s.name)}
                      <li><button type="button" class="flex w-full justify-between gap-2 px-3 py-2 text-left text-[13px] hover:bg-muted" onclick={() => addLift(s.name)}>
                        <span>{s.name}</span>{#if s.last}<span class="text-xs text-muted-foreground">logged</span>{/if}
                      </button></li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/if}
            <span class="text-xs text-muted-foreground">Up to {MAX_CHART_LINES} lines.</span>
          </div>
        {:else if def?.pick === "muscles"}
          <div class="flex flex-col gap-1.5">
            <span class={label}>Muscles (added up into one line)</span>
            <span class="flex flex-wrap gap-1.5">
              {#each Object.keys(MUSCLE_LABEL) as m (m)}
                <button type="button" aria-pressed={chart.muscles.includes(m)} onclick={() => toggle(chart!.muscles, m)}
                  class="h-[30px] rounded-full px-3 text-xs {chart.muscles.includes(m) ? 'bg-primary font-semibold text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}">{MUSCLE_LABEL[m as keyof typeof MUSCLE_LABEL]}</button>
              {/each}
            </span>
          </div>
        {:else if def?.pick === "habits"}
          <div class="flex flex-col gap-1.5">
            <span class={label}>Habits</span>
            {#if habits.length === 0}
              <span class="text-xs text-muted-foreground">No habits yet.</span>
            {:else}
              <span class="flex flex-wrap gap-1.5">
                {#each habits as h (h.id)}
                  <button type="button" aria-pressed={chart.habitIds.includes(h.id)} onclick={() => toggle(chart!.habitIds, h.id, MAX_CHART_LINES)}
                    class="h-[30px] rounded-full px-3 text-xs {chart.habitIds.includes(h.id) ? 'bg-primary font-semibold text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}">{h.name}</button>
                {/each}
              </span>
            {/if}
          </div>
        {/if}

        <div class="flex flex-col gap-1.5">
          <label class={label} for="chart-compare">Compare with</label>
          <OptionSelect id="chart-compare" class="w-full" bind:value={chart.compare}
            options={CHART_COMPARES.filter((c) => c.id !== chart!.metric).map((c) => ({ value: c.id, label: c.label }))} />
          <span class="text-xs text-muted-foreground">Gets its own scale on the right.</span>
        </div>

        <div class="flex flex-col gap-1.5">
          <span class={label}>Each point is</span>
          <span role="group" aria-label="Each point is" class="inline-flex w-fit gap-0.5 rounded-[9px] bg-muted p-[3px]">
            {#each CHART_BUCKETS as b (b.id)}
              <button type="button" aria-pressed={chart.bucket === b.id} class={segBtn(chart.bucket === b.id)} onclick={() => (chart!.bucket = b.id)}>{b.id === "session" && def?.pick !== "lifts" && def?.id !== "workouts" && def?.id !== "training-time" && def?.id !== "muscle-sets" ? "A day" : b.label}</button>
            {/each}
          </span>
        </div>

        <div class="flex flex-col gap-1.5">
          <span class={label}>Range</span>
          <RangePicker value={chart.range} onchange={(r) => (chart!.range = r)} />
        </div>
      </section>

      <div class="flex min-w-0 flex-[999_1_520px] flex-col gap-3.5">
        <section class="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-[18px] py-4">
          <div class="flex items-center justify-between gap-2.5">
            <h2 class="text-sm font-semibold">Preview with {clientId ? `${client?.name}'s` : "your"} data</h2>
            {#if drawing}<span class="text-xs text-muted-foreground">Drawing…</span>{/if}
          </div>
          {#if blocked}
            <p class="py-6 text-center text-[13px] text-muted-foreground">{client?.name} doesn't share what this chart needs with you.</p>
          {:else if chartProblem(chart)}
            <p class="py-10 text-center text-[13px] text-muted-foreground">{chartProblem(chart)}</p>
          {:else if drawn}
            <InsightChartView lines={drawn.lines} bucket={chart.bucket} unit={setup.unit} />
            <p class="rounded-lg bg-muted px-3.5 py-3 text-[13px] leading-relaxed">
              {drawn.summary}
              {#if chart.compare !== "none"}<span class="text-muted-foreground"> This shows them side by side; it doesn't test whether one drives the other.</span>{/if}
            </p>
          {:else}
            <Skeleton class="h-64" />
          {/if}
        </section>

        <section data-guide="chart-show-on" class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] py-4">
          <h2 class="mb-1 text-sm font-semibold">Show it on</h2>
          {#if clientId}
            <label class="flex items-start gap-2.5 py-2 text-[13px] leading-snug">
              <Checkbox class="mt-0.5" bind:checked={chart.showOn.phoneHome} />
              <span>{client?.name}'s phone home screen<br /><span class="text-xs text-muted-foreground">It always shows in their Insights as "From you". They can hide it.</span></span>
            </label>
          {:else}
            <label class="flex items-start gap-2.5 py-2 text-[13px] leading-snug">
              <Checkbox class="mt-0.5" bind:checked={chart.showOn.overview} />
              <span>Overview here<br /><span class="text-xs text-muted-foreground">Added at the bottom; move it with Edit on the Overview.</span></span>
            </label>
            <label class="flex items-start gap-2.5 py-2 text-[13px] leading-snug">
              <Checkbox class="mt-0.5" bind:checked={chart.showOn.phoneHome} />
              <span>My phone's home screen<br /><span class="text-xs text-muted-foreground">Shows after the phone's next sync. The phone draws it from its own data.</span></span>
            </label>
            <label class="flex items-start gap-2.5 py-2 text-[13px] leading-snug">
              <Checkbox class="mt-0.5" bind:checked={chart.showOn.coach} />
              <span>My coach's view of me<br /><span class="text-xs text-muted-foreground">Only works for things you share with them in My coach.</span></span>
            </label>
          {/if}
        </section>

        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            {#if !isNew}
              <button type="button" disabled={saving} onclick={remove} class="h-9 rounded-[9px] px-3.5 text-[13px] font-medium text-destructive hover:bg-destructive/10">{clientId ? `Remove from ${client?.name}` : "Delete chart"}</button>
            {/if}
          </div>
          <div class="flex gap-2">
            <a href={backHref} class="h-9 rounded-[9px] border border-border px-3.5 text-[13px] font-medium leading-9 hover:bg-muted">Cancel</a>
            <button type="button" data-guide="chart-save" disabled={saving || !!chartProblem(chart)} onclick={save} class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">
              {saving ? "Saving…" : clientId ? (isNew ? `Send to ${client?.name}` : "Save changes") : "Save chart"}
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
