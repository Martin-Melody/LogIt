<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { page } from "$app/state";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { back } from "$lib/navigation";
  import * as Card from "$lib/components/ui/card";
  import ProgressStatusChip from "$lib/features/exercise/components/ProgressStatusChip.svelte";
  import Sparkline from "$lib/features/exercise/components/Sparkline.svelte";
  import NutritionCorrelationPanel from "$lib/features/exercise/components/NutritionCorrelationPanel.svelte";
  import RangePicker from "$lib/features/insights/RangePicker.svelte";
  import MiniViz from "$lib/features/insights/MiniViz.svelte";
  import ChartView from "$lib/features/insights/ChartView.svelte";
  import { phoneInsightDeps, savedRange } from "$lib/features/insights/insightsDeps";
  import {
    goalLine,
    isInsightRange,
    isQuestionId,
    questionText,
    rangeStartMs,
    type EatingSummary,
    type InsightAnswer,
    type InsightRange,
    type MuscleBalanceRow,
  } from "@logit/core/domain/insights";
  import { chartLines, newChart, type ChartLine } from "@logit/core/domain/insightChart";
  import { computeWeeklyStreak, weekResults, type WeekResult, type WeeklyStreak } from "@logit/core/domain/weeklyStreak";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import { toDisplayWeight } from "@logit/core/domain/units";
  import type { GoalView } from "@logit/core/domain/goalView";
  import type { ProgressStatus } from "@logit/core/domain/progression";
  import { getAllExerciseProgressStories } from "@logit/core/usecases/progression/getAllExerciseProgressStories";
  import type { ExerciseProgressStory } from "@logit/core/usecases/progression/getExerciseProgressStory";
  import type { NutritionTrainingCorrelationResult } from "@logit/core/usecases/nutritionTrainingCorrelation";
  import { getInsightAnswer, loadEatingSummary, loadFoodVsLifts, loadMuscleBalance } from "@logit/core/usecases/insights/getInsightAnswers";
  import { smoothWeightSeries } from "@logit/core/nutrition/trend";
  import { getNutritionRepo } from "$lib/data/repoProvider";

  /** One Insights question on the phone: the answer, then what's behind it. */
  const id = $derived(page.params.question ?? "");
  const urlRange = page.url.searchParams.get("range");
  let range = $state<InsightRange>(isInsightRange(urlRange) ? urlRange : savedRange());

  type Detail =
    | { kind: "lifts"; stories: ExerciseProgressStory[] }
    | { kind: "balance"; rows: MuscleBalanceRow[]; untagged: number }
    | { kind: "showing-up"; weeks: WeekResult[]; streak: WeeklyStreak }
    | { kind: "eating"; summary: EatingSummary; lines: ChartLine[] }
    | { kind: "food-vs-lifts"; result: NutritionTrainingCorrelationResult }
    | { kind: "goals"; views: GoalView[] };

  let answer = $state<InsightAnswer | null>(null);
  let detail = $state<Detail | null>(null);
  let unit = $state<"kg" | "lbs">("kg");
  const RANK: Record<ProgressStatus, number> = { regressing: 0, plateaued: 1, detraining: 2, progressing: 3, new: 4 };

  async function load(q: string, r: InsightRange) {
    answer = null;
    detail = null;
    if (!isQuestionId(q)) return;
    const { deps, unit: u } = await phoneInsightDeps();
    unit = u;
    const a = await getInsightAnswer(q, deps, { range: r });
    if (r !== range) return;
    answer = a;
    const now = Date.now();
    const opts = { range: r };
    let d: Detail | null = null;
    try {
      if (q === "lifts") {
        const start = rangeStartMs(r, now);
        const stories = (await getAllExerciseProgressStories(deps.progression))
          .filter((s) => s.lastTrainedMs >= start)
          .sort((x, y) => RANK[x.status] - RANK[y.status] || y.lastTrainedMs - x.lastTrainedMs);
        d = { kind: "lifts", stories };
      } else if (q === "balance") {
        const b = await loadMuscleBalance(deps, opts);
        d = { kind: "balance", rows: b.rows, untagged: b.untaggedSetsShare };
      } else if (q === "showing-up") {
        const sessions = (await deps.progression.workoutRepo.listAllSessions()).filter((s) => s.endedAtMs != null);
        const input = {
          trainedDaysIso: sessions.map((s) => localDateIso(new Date(s.startedAtMs))),
          weeklyTarget: deps.streak.weeklyTarget,
          targetHistory: deps.streak.targetHistory,
          pauses: deps.streak.pauses,
          todayIso: localDateIso(new Date(now)),
        };
        d = { kind: "showing-up", weeks: weekResults({ ...input, fromIso: localDateIso(new Date(rangeStartMs(r, now))) }), streak: computeWeeklyStreak(input) };
      } else if (q === "eating") {
        const summary = await loadEatingSummary(deps, opts);
        if (summary) {
          const repo = getNutritionRepo();
          const startIso = localDateIso(new Date(rangeStartMs(r, now)));
          const [days, weights] = await Promise.all([repo.listDaysInRange(startIso, localDateIso(new Date(now))), repo.listWeightEntries()]);
          const chart = { ...newChart("eating", now), metric: "calories" as const, compare: "body-weight" as const, bucket: "week" as const, range: r };
          d = { kind: "eating", summary, lines: chartLines(chart, { sessions: [], days, weight: weights.length ? smoothWeightSeries(weights) : null }, now) };
        }
      } else if (q === "food-vs-lifts") {
        const result = await loadFoodVsLifts(deps, opts);
        if (result) d = { kind: "food-vs-lifts", result };
      } else if (q === "goals") {
        d = { kind: "goals", views: await deps.loadGoalViews() };
      }
    } catch {
      d = null;
    }
    if (r === range) detail = d;
  }

  $effect(() => {
    void load(id, range);
  });

  const WEEK_CLASS: Record<WeekResult["outcome"], string> = {
    met: "bg-success/15 text-success",
    missed: "bg-warning/15 text-warning",
    skipped: "bg-muted text-muted-foreground",
    in_progress: "bg-muted text-foreground",
  };
  const barMax = $derived(detail?.kind === "balance" ? Math.max(25, ...detail.rows.map((r) => r.setsPerWeek)) : 25);
  const weekLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
</script>

<div class="flex flex-col gap-3 p-3 pb-32">
  <PageHeader>
    <BackButton onclick={() => back("/insights")} />
    <h1 class="page-title truncate">{isQuestionId(id) ? questionText(id) : "Insights"}</h1>
  </PageHeader>

  {#if !isQuestionId(id)}
    <p class="text-sm text-muted-foreground">There's no question here.</p>
  {:else}
    <RangePicker value={range} onchange={(r) => (range = r)} label="Range for this question" />

    <Card.Root>
      <Card.Content class="flex flex-col gap-2 pt-3">
        {#if answer}
          <p class="text-lg font-bold leading-snug">{answer.answer}
            {#if answer.hypothesis}<span class="ml-1 align-middle rounded-full bg-info/14 px-2 py-0.5 text-[11px] font-semibold text-info">Hypothesis</span>{/if}
          </p>
          {#if answer.mini && answer.mini.kind !== "rows"}<MiniViz mini={answer.mini} />{/if}
          <p class="text-[13px] leading-relaxed text-muted-foreground">{answer.detail}</p>
        {:else}
          <Skeleton class="h-20 rounded-lg" />
        {/if}
      </Card.Content>
    </Card.Root>

    {#if detail?.kind === "lifts"}
      <Card.Root>
        <Card.Content class="pt-1">
          {#each detail.stories as s, i (s.exerciseName)}
            <div class="flex items-center gap-3 py-3 {i ? 'border-t border-border' : ''}">
              <span class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="truncate text-sm font-medium">{s.exerciseName}</span>
                <span class="text-xs text-muted-foreground">{s.statusDetail}</span>
              </span>
              <span class="flex shrink-0 flex-col items-end gap-1"><ProgressStatusChip status={s.status} /><Sparkline values={s.spark} /></span>
            </div>
          {:else}
            <p class="py-3 text-sm text-muted-foreground">No lifts trained in this range.</p>
          {/each}
        </Card.Content>
      </Card.Root>
    {:else if detail?.kind === "balance"}
      <Card.Root>
        <Card.Content class="flex flex-col gap-3 pt-3">
          <div class="flex items-center justify-between gap-2"><span class="text-sm font-semibold">Working sets a week</span><span class="text-xs text-muted-foreground">Band: 10 to 20</span></div>
          {#each detail.rows as r (r.muscleGroup)}
            <div class="flex flex-col gap-1">
              <span class="flex items-center justify-between gap-2 text-[13px]"><span>{r.label}</span><span class="tabular-nums">{Math.round(r.setsPerWeek * 10) / 10} · {Math.round(r.daysPerWeek * 10) / 10} days</span></span>
              <span class="relative h-2.5 rounded bg-muted">
                <span class="absolute inset-y-0 bg-chart-1/20" style="left: {(10 / barMax) * 100}%; width: {(10 / barMax) * 100}%"></span>
                <span class="absolute inset-y-0 left-0 rounded {r.low ? 'bg-chart-3' : 'bg-chart-1'}" style="width: {Math.min(100, (r.setsPerWeek / barMax) * 100)}%"></span>
              </span>
            </div>
          {/each}
          <p class="text-xs leading-relaxed text-muted-foreground">Warm-ups aren't counted. A set counts fully for the muscles an exercise works most and 0.4 for muscles it only helps.{#if detail.untagged >= 0.02} {Math.round(detail.untagged * 100)}% of your sets are on exercises with no muscles tagged.{/if}</p>
        </Card.Content>
      </Card.Root>
    {:else if detail?.kind === "showing-up"}
      <Card.Root>
        <Card.Content class="flex flex-col gap-2 pt-3">
          <span class="text-xs text-muted-foreground">Target {detail.streak.weeklyTarget} a week · {detail.streak.currentWeeks} in a row · best {detail.streak.bestWeeks}</span>
          <div class="grid grid-cols-4 gap-1.5">
            {#each detail.weeks as w (w.startIso)}
              <div class="flex flex-col rounded-lg px-2 py-1.5 {WEEK_CLASS[w.outcome]}">
                <span class="text-[11px] opacity-80">{weekLabel(w.startIso)}</span>
                <span class="text-sm font-semibold tabular-nums">{w.done}<span class="text-[11px] font-normal opacity-80">/{w.needed}</span></span>
              </div>
            {/each}
          </div>
        </Card.Content>
      </Card.Root>
    {:else if detail?.kind === "eating"}
      {@const s = detail.summary}
      <div class="grid grid-cols-2 gap-2">
        {#each [
          { label: "Calories a day", value: s.avgKcal != null ? `${Math.round(s.avgKcal).toLocaleString()}` : "–" },
          { label: "On target", value: s.adherencePct != null ? `${s.adherencePct}%` : "No target" },
          { label: "Protein a day", value: s.avgProteinG != null ? `${Math.round(s.avgProteinG)} g` : "–" },
          { label: "Weight a week", value: s.weeklyRateKg != null ? `${s.weeklyRateKg > 0 ? "+" : ""}${(Math.round(toDisplayWeight(s.weeklyRateKg, unit) * 100) / 100).toFixed(2)} ${unit === "lbs" ? "lb" : "kg"}` : "–" },
        ] as t (t.label)}
          <div class="rounded-xl border border-border bg-card px-3 py-2.5"><div class="text-xs text-muted-foreground">{t.label}</div><div class="text-lg font-bold">{t.value}</div></div>
        {/each}
      </div>
      <Card.Root>
        <Card.Content class="pt-3">
          <ChartView lines={detail.lines} bucket="week" {unit} height={200} />
        </Card.Content>
      </Card.Root>
    {:else if detail?.kind === "food-vs-lifts"}
      <NutritionCorrelationPanel preloaded={detail.result} />
    {:else if detail?.kind === "goals"}
      <Card.Root>
        <Card.Content class="pt-1">
          {#each detail.views as v, i (v.key)}
            <div class="flex items-center justify-between gap-3 py-3 text-sm {i ? 'border-t border-border' : ''}"><span class="min-w-0 truncate">{v.title}</span><span class="shrink-0 text-xs text-muted-foreground">{goalLine(v, Date.now())}</span></div>
          {/each}
          <a href="/progress?tab=goals" class="block py-3 text-xs text-muted-foreground underline">Goal charts are on Progress</a>
        </Card.Content>
      </Card.Root>
    {/if}
  {/if}
</div>
