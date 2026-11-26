<script lang="ts">
  import * as Table from "$lib/components/ui/table/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import ReasoningDialog from "$lib/components/Dialogs/ReasoningDialog.svelte";
  import ProgressStatusChip from "$lib/features/exercise/components/ProgressStatusChip.svelte";
  import Sparkline from "$lib/features/exercise/components/Sparkline.svelte";
  import NutritionCorrelationPanel from "$lib/features/exercise/components/NutritionCorrelationPanel.svelte";
  import GoalChart from "$lib/features/habitsGoals/GoalChart.svelte";
  import {
    goalLine,
    rangeStartMs,
    type InsightAnswer,
    type InsightRange,
    type MuscleBalanceRow,
    type QuestionId,
    type EatingSummary,
  } from "@logit/core/domain/insights";
  import { chartLines, newChart, type ChartLine } from "@logit/core/domain/insightChart";
  import { computeWeeklyStreak, weekResults, type WeekResult, type WeeklyStreak } from "@logit/core/domain/weeklyStreak";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import { toDisplayWeight } from "@logit/core/domain/units";
  import type { GoalView } from "@logit/core/domain/goalView";
  import type { ProgressStatus } from "@logit/core/domain/progression";
  import type { MuscleGroupInsight } from "@logit/core/usecases/progression/getMuscleGroupInsights";
  import { getAllExerciseProgressStories } from "@logit/core/usecases/progression/getAllExerciseProgressStories";
  import type { ExerciseProgressStory } from "@logit/core/usecases/progression/getExerciseProgressStory";
  import { getMuscleGroupInsightConfig } from "@logit/core/usecases/progression/getMuscleGroupInsightConfig";
  import type { NutritionTrainingCorrelationResult } from "@logit/core/usecases/nutritionTrainingCorrelation";
  import {
    getInsightAnswer,
    loadEatingSummary,
    loadFoodVsLifts,
    loadMuscleBalance,
  } from "@logit/core/usecases/insights/getInsightAnswers";
  import { loadChartData, type InsightsSetup } from "./insightsData";
  import InsightChartView from "./InsightChartView.svelte";
  import RangePicker from "./RangePicker.svelte";

  /**
   * One Insights question opened: the answer up top, then the detail behind it. Used on
   * /insights/[question] for your own data and in a coach's client tab for a client's.
   */
  let {
    id,
    setup,
    range = $bindable(),
    clientId,
    whose = "your",
  }: { id: QuestionId; setup: InsightsSetup; range: InsightRange; clientId?: string; whose?: string } = $props();

  type Detail =
    | { kind: "lifts"; stories: ExerciseProgressStory[] }
    | { kind: "balance"; rows: MuscleBalanceRow[]; insights: MuscleGroupInsight[]; untagged: number; method: string }
    | { kind: "showing-up"; weeks: WeekResult[]; streak: WeeklyStreak }
    | { kind: "eating"; summary: EatingSummary; lines: ChartLine[] }
    | { kind: "food-vs-lifts"; result: NutritionTrainingCorrelationResult }
    | { kind: "goals"; views: GoalView[] };

  let answer = $state<InsightAnswer | null>(null);
  let detail = $state<Detail | null>(null);
  let failed = $state(false);

  const STATUS_RANK: Record<ProgressStatus, number> = { regressing: 0, plateaued: 1, detraining: 2, progressing: 3, new: 4 };

  async function loadDetail(r: InsightRange): Promise<Detail | null> {
    const opts = { range: r };
    const nowMs = Date.now();
    switch (id) {
      case "lifts": {
        const start = rangeStartMs(r, nowMs);
        const stories = (await getAllExerciseProgressStories(setup.deps.progression))
          .filter((s) => s.lastTrainedMs >= start)
          .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.lastTrainedMs - a.lastTrainedMs);
        return { kind: "lifts", stories };
      }
      case "balance": {
        const [{ rows, insights, untaggedSetsShare }, config] = await Promise.all([
          loadMuscleBalance(setup.deps, opts),
          getMuscleGroupInsightConfig(setup.deps.progression).catch(() => null),
        ]);
        const method = config?.algorithms.find((a) => a.id === config.activeAlgorithmId)?.name ?? "Built-in";
        return { kind: "balance", rows, insights, untagged: untaggedSetsShare, method };
      }
      case "showing-up": {
        const sessions = (await setup.deps.progression.workoutRepo.listAllSessions()).filter((s) => s.endedAtMs != null);
        const input = {
          trainedDaysIso: sessions.map((s) => localDateIso(new Date(s.startedAtMs))),
          weeklyTarget: setup.deps.streak.weeklyTarget,
          targetHistory: setup.deps.streak.targetHistory,
          pauses: setup.deps.streak.pauses,
          todayIso: localDateIso(new Date(nowMs)),
        };
        return {
          kind: "showing-up",
          weeks: weekResults({ ...input, fromIso: localDateIso(new Date(rangeStartMs(r, nowMs))) }),
          streak: computeWeeklyStreak(input),
        };
      }
      case "eating": {
        const summary = await loadEatingSummary(setup.deps, opts);
        if (!summary) return null;
        const chart = { ...newChart("eating", nowMs), metric: "calories" as const, compare: "body-weight" as const, bucket: "week" as const, range: r };
        const lines = chartLines(chart, await loadChartData([chart], setup, clientId), nowMs);
        return { kind: "eating", summary, lines };
      }
      case "food-vs-lifts": {
        const result = await loadFoodVsLifts(setup.deps, opts);
        return result ? { kind: "food-vs-lifts", result } : null;
      }
      case "goals":
        return { kind: "goals", views: await setup.deps.loadGoalViews() };
    }
  }

  async function load(r: InsightRange) {
    answer = null;
    detail = null;
    failed = false;
    const a = await getInsightAnswer(id, setup.deps, { range: r });
    if (r !== range) return;
    answer = a;
    if (a.state === "locked") return;
    try {
      const d = await loadDetail(r);
      if (r === range) detail = d;
    } catch {
      failed = true;
    }
  }

  $effect(() => {
    void load(range);
  });

  function fmtSets(n: number): string {
    return String(Math.round(n * 10) / 10);
  }

  const BAND_LO = 10;
  const BAND_HI = 20;
  const barScale = $derived(detail?.kind === "balance" ? Math.max(25, ...detail.rows.map((r) => r.setsPerWeek)) : 25);

  function liftsNote(r: MuscleBalanceRow): string {
    if (r.lifts.length === 0) return "No main lift";
    return r.lifts.slice(0, 2).map((l) => l.exerciseName).join(", ");
  }

  function patterns(d: Extract<Detail, { kind: "balance" }>): string[] {
    const out: string[] = [];
    for (const g of d.insights) {
      const v = g.volumeInsight;
      if (!v) continue;
      const above = Math.round(v.improveRateAbove * 100);
      const below = Math.round(v.improveRateBelow * 100);
      out.push(`${g.muscleGroup.charAt(0).toUpperCase()}${g.muscleGroup.slice(1)}: ${whose === "your" ? "your" : "their"} lifts improved in ${above}% of weeks with ${Math.round(v.thresholdSets)} or more sets, and ${below}% below that.`);
    }
    return out.slice(0, 4);
  }

  function evenOut(rows: MuscleBalanceRow[]): string | null {
    const low = rows.filter((r) => r.low);
    if (low.length === 0) return null;
    const parts = low.slice(0, 3).map((r) => `about ${Math.max(2, Math.round(BAND_LO - r.setsPerWeek))} more ${r.muscleGroup} sets a week`);
    return `Adding ${parts.join(" and ")} would bring ${low.length === 1 ? "it" : "them"} to around ${BAND_LO}, the low end of the common range.`;
  }

  const WEEK_CLASS: Record<WeekResult["outcome"], string> = {
    met: "bg-success/15 text-success",
    missed: "bg-warning/15 text-warning",
    skipped: "bg-muted text-muted-foreground",
    in_progress: "bg-muted text-foreground",
  };
  const WEEK_WORD: Record<WeekResult["outcome"], string> = { met: "On target", missed: "Missed", skipped: "Paused", in_progress: "This week" };

  function weekLabel(iso: string): string {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
  }
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-start justify-between gap-3.5">
    <div class="max-w-[640px]">
      <h1 class="text-2xl font-bold tracking-tight">{answer?.question ?? ""}</h1>
      {#if answer}
        <p class="mt-1.5 text-[15px] leading-normal">
          <span class="font-semibold">{answer.answer}.</span>
          <span class="text-muted-foreground">{answer.detail}</span>
          {#if answer.hypothesis}<span class="ml-1 rounded-full bg-info/14 px-2 py-0.5 text-[11px] font-semibold text-info">Hypothesis</span>{/if}
        </p>
      {:else}
        <Skeleton class="mt-2 h-5 w-96 max-w-full" />
      {/if}
    </div>
    {#if answer?.state !== "locked"}
      <RangePicker value={range} onchange={(r) => (range = r)} label="Range for this question" />
    {/if}
  </header>

  {#if answer?.state === "locked"}
    <!-- the header already says what's missing -->
  {:else if failed}
    <p class="text-[13px] text-muted-foreground">Couldn't load the detail. Try again in a bit.</p>
  {:else if !detail}
    {#if answer?.state !== "empty"}<Skeleton class="h-72" />{/if}
  {:else if detail.kind === "lifts"}
    <section class="rounded-[10px] border border-border bg-card px-[18px] py-3">
      {#if detail.stories.length === 0}
        <p class="py-3 text-[13px] text-muted-foreground">No lifts trained in this range.</p>
      {:else}
        <div class="overflow-x-auto">
          <Table.Root class="w-full min-w-[560px] border-collapse text-[13px]">
            <Table.Header><Table.Row class="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Table.Head class="pb-2 pr-3">Lift</Table.Head><Table.Head class="pb-2 pr-3">Trend</Table.Head><Table.Head class="pb-2 pr-3">Why</Table.Head><Table.Head class="pb-2 pr-3">Now</Table.Head>{#if detail.stories.some((s) => s.nextTarget)}<Table.Head class="pb-2 pr-3">Next</Table.Head>{/if}<Table.Head class="pb-2"></Table.Head></Table.Row></Table.Header>
            <Table.Body>
              {#each detail.stories as s (s.exerciseName)}
                <Table.Row class="border-t border-border">
                  <Table.Cell class="py-2.5 pr-3 font-medium">{s.exerciseName}</Table.Cell>
                  <Table.Cell class="py-2.5 pr-3"><ProgressStatusChip status={s.status} /></Table.Cell>
                  <Table.Cell class="py-2.5 pr-3 text-muted-foreground">{s.statusDetail}</Table.Cell>
                  <Table.Cell class="py-2.5 pr-3 tabular-nums" title={s.headline.label}>{s.headline.value}</Table.Cell>
                  {#if detail.stories.some((x) => x.nextTarget)}<Table.Cell class="py-2.5 pr-3 text-muted-foreground">{s.nextTarget ?? "–"}</Table.Cell>{/if}
                  <Table.Cell class="py-2.5"><Sparkline values={s.spark} /></Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>
        {#if !clientId}<p class="pt-2 text-xs text-muted-foreground">Charts for each lift are on <a href="/progress" class="underline">Progress</a>.</p>{/if}
      {/if}
    </section>
  {:else if detail.kind === "balance"}
    <div class="flex flex-wrap items-start gap-3.5">
      <section class="flex min-w-0 flex-[999_1_560px] flex-col gap-3 rounded-[10px] border border-border bg-card px-[18px] py-4">
        <div class="flex flex-wrap items-center justify-between gap-2.5">
          <h2 class="text-sm font-semibold">Working sets a week, per muscle</h2>
          <span class="flex items-center gap-1.5 text-xs text-muted-foreground"><span class="h-2.5 w-[18px] rounded-sm bg-chart-1/25"></span>{BAND_LO} to {BAND_HI} a week, a common range for growth</span>
        </div>
        {#if detail.rows.length === 0}
          <p class="text-[13px] text-muted-foreground">{answer?.detail}</p>
        {:else}
          <div class="overflow-x-auto">
            <Table.Root class="w-full min-w-[520px] border-collapse text-[13px]">
              <Table.Header><Table.Row class="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Table.Head class="pb-2 pr-3">Muscle</Table.Head><Table.Head class="w-[44%] pb-2 pr-3">Sets a week</Table.Head><Table.Head class="pb-2 pr-3">Days a week</Table.Head><Table.Head class="pb-2">Its lifts</Table.Head></Table.Row></Table.Header>
              <Table.Body>
                {#each detail.rows as r (r.muscleGroup)}
                  <Table.Row class="border-t border-border">
                    <Table.Cell class="py-2.5 pr-3">{r.label}</Table.Cell>
                    <Table.Cell class="py-2.5 pr-3">
                      <span class="flex items-center gap-2.5">
                        <span class="relative h-3 min-w-[160px] flex-1 rounded-md bg-muted">
                          <span class="absolute inset-y-0 bg-chart-1/20" style="left: {(BAND_LO / barScale) * 100}%; width: {((BAND_HI - BAND_LO) / barScale) * 100}%"></span>
                          <span class="absolute inset-y-0.5 left-0 rounded {r.low ? 'bg-chart-3' : 'bg-chart-1'}" style="width: {Math.min(100, (r.setsPerWeek / barScale) * 100)}%"></span>
                        </span>
                        <span class="w-8 text-right tabular-nums">{fmtSets(r.setsPerWeek)}</span>
                      </span>
                    </Table.Cell>
                    <Table.Cell class="py-2.5 pr-3 tabular-nums">{fmtSets(r.daysPerWeek)}</Table.Cell>
                    <Table.Cell class="py-2.5"><span class="flex items-center gap-2"><ProgressStatusChip status={r.status} /><span class="truncate text-xs text-muted-foreground">{liftsNote(r)}</span></span></Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
        {/if}
        <p class="text-xs leading-relaxed text-muted-foreground">
          Warm-ups aren't counted. A set counts fully for the muscles an exercise works most, and 0.4 for muscles it only helps. Weeks with no training count as 0.
          {#if detail.untagged >= 0.02}{Math.round(detail.untagged * 100)}% of {whose} sets are on exercises with no muscles tagged{#if !clientId}: <a href="/library" class="underline">tag them in Library</a>{/if}.{/if}
        </p>
      </section>
      <aside class="flex flex-[1_1_300px] flex-col gap-3.5">
        {#if patterns(detail).length}
          <section class="flex flex-col gap-2.5 rounded-[10px] border border-border bg-card px-[18px] py-4">
            <h2 class="text-sm font-semibold">What {whose} own data says</h2>
            {#each patterns(detail) as p (p)}<p class="text-[13px] leading-relaxed">{p}</p>{/each}
            <p class="text-xs leading-relaxed text-muted-foreground">A pattern in {whose} history, not proof. Sleep, food and how hard the sets were aren't in it.</p>
          </section>
        {/if}
        {#if evenOut(detail.rows)}
          <section class="flex flex-col gap-2.5 rounded-[10px] border border-border bg-card px-[18px] py-4">
            <h2 class="text-sm font-semibold">One way to even it out</h2>
            <p class="text-[13px] leading-relaxed">{evenOut(detail.rows)}</p>
            {#if !clientId}<a href="/plan" class="w-fit rounded-[9px] border border-border px-3.5 py-2 text-[13px] font-medium hover:bg-muted">Open Plan</a>{/if}
          </section>
        {/if}
        <details class="rounded-[10px] border border-border bg-card px-[18px] py-4 text-[13px]">
          <summary class="cursor-pointer text-sm font-semibold">How this was worked out</summary>
          <div class="mt-2.5 flex flex-col gap-2 leading-relaxed text-muted-foreground">
            <span>Uses <span class="text-foreground">{detail.method}</span>, the muscle-group method picked in the app's settings. A plugin can replace it.</span>
            <span>Each muscle's trend is the worst of its main lifts, with the same labels as on Progress.</span>
            {#each detail.insights.slice(0, 1) as g (g.muscleGroup)}<ReasoningDialog reasoning={g.reasoning} triggerLabel="Show the numbers for {g.muscleGroup}" />{/each}
          </div>
        </details>
      </aside>
    </div>
  {:else if detail.kind === "showing-up"}
    <section class="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-[18px] py-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-sm font-semibold">Training days each week</h2>
        <span class="text-xs text-muted-foreground">Target {detail.streak.weeklyTarget} a week · {detail.streak.currentWeeks} weeks in a row · best {detail.streak.bestWeeks}</span>
      </div>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2">
        {#each detail.weeks as w (w.startIso)}
          <div class="flex flex-col gap-0.5 rounded-lg px-2.5 py-2 {WEEK_CLASS[w.outcome]}">
            <span class="text-[11px] opacity-80">{weekLabel(w.startIso)}</span>
            <span class="text-[15px] font-semibold tabular-nums">{w.done}<span class="text-xs font-normal opacity-80"> of {w.needed}</span></span>
            <span class="text-[11px]">{WEEK_WORD[w.outcome]}</span>
          </div>
        {/each}
      </div>
      {#if !clientId}<p class="text-xs text-muted-foreground">Change the weekly target or pause for a holiday under <a href="/habits" class="underline">Habits &amp; goals</a>.</p>{/if}
    </section>
  {:else if detail.kind === "eating"}
    {@const s = detail.summary}
    <div class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
      {#each [
        { label: "Calories a day", value: s.avgKcal != null ? `${Math.round(s.avgKcal).toLocaleString()} kcal` : "–" },
        { label: "Days on target", value: s.adherencePct != null ? `${s.adherencePct}%` : "No target" },
        { label: "Protein a day", value: s.avgProteinG != null ? `${Math.round(s.avgProteinG)} g` : "–" },
        { label: "Weight change", value: s.weeklyRateKg != null ? `${s.weeklyRateKg > 0 ? "+" : ""}${(Math.round(toDisplayWeight(s.weeklyRateKg, setup.unit) * 100) / 100).toFixed(2)} ${setup.unit === "lbs" ? "lb" : "kg"} a week` : "Not enough weigh-ins" },
        { label: "Days logged", value: String(s.loggedDays) },
      ] as t (t.label)}
        <div class="rounded-[10px] border border-border bg-card px-[18px] py-4">
          <div class="text-xs text-muted-foreground">{t.label}</div>
          <div class="mt-1 text-xl font-bold">{t.value}</div>
        </div>
      {/each}
    </div>
    <section class="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-[18px] py-4">
      <h2 class="text-sm font-semibold">Calories and body weight, by week</h2>
      <InsightChartView lines={detail.lines} bucket="week" unit={setup.unit} />
    </section>
    {#if !clientId}<p class="text-xs text-muted-foreground">Targets and the day-by-day diary are on <a href="/nutrition" class="underline">Nutrition</a>.</p>{/if}
  {:else if detail.kind === "food-vs-lifts"}
    <NutritionCorrelationPanel preloaded={detail.result} {clientId} />
    <p class="text-xs leading-relaxed text-muted-foreground">
      Compares workouts where volume went up from the one before against what was eaten that day. It only shows what happened alongside what; it can't tell what caused it.
    </p>
  {:else if detail.kind === "goals"}
    {#if detail.views.length === 0}
      <p class="text-[13px] text-muted-foreground">{answer?.detail}</p>
    {:else}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-3.5">
        {#each detail.views as v (v.key)}
          <section class="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-[18px] py-4">
            <div class="flex items-baseline justify-between gap-2"><h2 class="text-sm font-semibold">{v.title}</h2><span class="text-xs text-muted-foreground">{goalLine(v, Date.now())}</span></div>
            <GoalChart view={v} toDisplay={(x) => (v.unit === "kg" || v.unit === "bodyweight" ? toDisplayWeight(x, setup.unit) : x)} unitLabel={v.unit === "kg" || v.unit === "bodyweight" ? setup.unit : v.unit === "reps" ? "reps" : ""} />
          </section>
        {/each}
      </div>
      {#if !clientId}<p class="text-xs text-muted-foreground">Add or change goals under <a href="/habits" class="underline">Habits &amp; goals</a>.</p>{/if}
    {/if}
  {/if}
</div>
