<!-- Canvas W12: your own Progress over a week, a month or your block, the same cards your coach's
     Overview shows, from your data. A month your coach sent you has their note on top. -->
<script lang="ts">
  import { page } from "$app/state";
  import * as Tabs from "$lib/components/ui/tabs";
  import { Button } from "$lib/components/ui/button";
  import { ChevronLeft, ChevronRight } from "lucide-svelte";
  import WidgetViewRenderer from "$lib/features/widgets/render/WidgetViewRenderer.svelte";
  import { cardPeriod, coachCard, type CardCheckin, type CoachCardInput } from "@logit/core/domain/coachCards";
  import { coachHabitAsHabit } from "@logit/core/domain/CoachHabit";
  import { getProgramProgress, getProgramStartMs } from "@logit/core/domain/CoachProgram";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import type { DiaryDay } from "@logit/core/domain/nutrition";
  import { parseMonthReport, type MonthReport } from "@logit/core/domain/monthReport";
  import { getNutritionTargets } from "@logit/core/usecases/nutrition/getNutritionTargets";
  import { getAssignedHabitRepo, getCheckinRepo, getCoachProgramRepo, getHabitRepo, getMessagesRepo, getNutritionRepo, getWorkoutRepo } from "$lib/data/repoProvider";
  import { getNutritionDeps } from "$lib/features/nutrition/deps";

  const DAY = 86_400_000;
  // From "See it in Progress": ?period=month&m=YYYY-MM.
  const wanted = page.url.searchParams.get("m");
  const monthsBackFor = (key: string | null) => {
    if (!key || !/^\d{4}-\d{2}$/.test(key)) return 0;
    const [y, m] = key.split("-").map(Number) as [number, number];
    const now = new Date();
    return Math.max(0, (now.getFullYear() - y) * 12 + now.getMonth() - (m - 1));
  };
  let kind = $state<"week" | "month" | "block">(page.url.searchParams.get("period") === "month" || wanted ? "month" : "week");
  let monthsBack = $state(monthsBackFor(wanted));

  type Base = Omit<CoachCardInput, "now" | "period" | "diaryDays">;
  let base = $state<Base | null>(null);
  let block = $state<{ startMs: number; endMs: number; label: string } | null>(null);
  let reports = $state<{ report: MonthReport; from: string }[]>([]);
  let days = $state<DiaryDay[]>([]);

  $effect(() => {
    void (async () => {
      const [sessions, weights, own, ownEntries, assigned, subs, schedules, programs, activeId, sent] = await Promise.all([
        getWorkoutRepo().listAllSessions().catch(() => []),
        getNutritionRepo().listWeightEntries().catch(() => []),
        getHabitRepo().listHabits().catch(() => []),
        getHabitRepo().listEntries().catch(() => []),
        getAssignedHabitRepo().listAssignedHabits().catch(() => []),
        getCheckinRepo().listSubmissions().catch(() => []),
        getCheckinRepo().listAssignedSchedules().catch(() => []),
        getCoachProgramRepo().listAssignedPrograms().catch(() => []),
        getCoachProgramRepo().getActiveProgramId().catch(() => null),
        getMessagesRepo().listByKind("month-report").catch(() => []),
      ]);
      const t = (await getNutritionTargets(getNutritionDeps()).catch(() => null))?.targets ?? null;
      const program = programs.find((p) => p.id === activeId) ?? null;
      const progress = program ? getProgramProgress(program) : null;
      const start = program ? getProgramStartMs(program) : null;
      block = program && progress?.status === "running" && start ? { startMs: start, endMs: start + program.weeks.length * 7 * DAY, label: `${program.name}, week ${progress.weekNumber} of ${program.weeks.length}` } : null;
      const checkins: CardCheckin[] = subs.filter((s) => s.submittedAtMs).map((s) => ({ id: s.id, clientId: "me", submission: s, reviewed: true, schedule: schedules.find((x) => x.id === s.scheduleId) ?? null }));
      reports = sent.filter((m) => !m.mine).flatMap((m) => { const r = parseMonthReport(m.cardJson); return r ? [{ report: r, from: m.relationshipId }] : []; });
      base = {
        firstName: "You",
        sharing: { workouts: true, nutrition: true, bodyweight: true, habits: true, checkins: true },
        sessions,
        daysPerWeek: program && progress?.status === "running" ? (program.weeks.find((w) => w.weekNumber === progress.weekNumber)?.days.length ?? null) : null,
        weights,
        target: t ? { kcal: t.kcal, proteinG: t.macros?.proteinG ?? null } : null,
        habits: [...own.filter((h) => !h.archived), ...assigned.filter((h) => !h.archived).map(coachHabitAsHabit)],
        habitEntries: ownEntries,
        checkins,
      };
    })();
  });

  const period = $derived(cardPeriod(kind === "block" && !block ? "week" : kind, Date.now(), { monthsBack, block }));
  $effect(() => {
    const p = period;
    void getNutritionRepo().listDaysInRange(localDateIso(new Date(p.fromMs)), localDateIso(new Date(p.toMs - 1))).then((d) => (days = d)).catch(() => (days = []));
  });
  const key = $derived.by(() => { const d = new Date(period.fromMs); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const sentNote = $derived(kind === "month" ? (reports.filter((r) => r.report.month === key).at(-1) ?? null) : null);
  const views = $derived(base ? (["training", "body", "food", "habits"] as const).map((id) => coachCard(id, { ...base!, now: Date.now(), period, diaryDays: days })) : []);
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center gap-1">
    <Tabs.Root value={kind} onValueChange={(v) => { kind = v as typeof kind; monthsBack = 0; }} class="flex-1">
      <Tabs.List class="w-full">
        <Tabs.Trigger value="week" class="flex-1">Week</Tabs.Trigger>
        <Tabs.Trigger value="month" class="flex-1">{kind === "month" ? period.label : "Month"}</Tabs.Trigger>
        <Tabs.Trigger value="block" class="flex-1" disabled={!block}>Block</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
    {#if kind === "month"}
      <Button variant="ghost" size="icon" aria-label="Month before" onclick={() => (monthsBack += 1)}><ChevronLeft class="size-5" /></Button>
      <Button variant="ghost" size="icon" aria-label="Month after" disabled={monthsBack === 0} onclick={() => (monthsBack -= 1)}><ChevronRight class="size-5" /></Button>
    {/if}
  </div>
  {#if kind === "block" && block}<p class="text-[13px] text-muted-foreground">{block.label}</p>{/if}

  {#if sentNote}
    <section class="rounded-2xl border border-border bg-card px-4 py-3.5" aria-label="Your coach's note on your {sentNote.report.label}">
      <h2 class="text-[13px] font-semibold text-muted-foreground">Your coach's note on your {sentNote.report.label}</h2>
      <p class="mt-1 whitespace-pre-wrap text-[15px] leading-snug">“{sentNote.report.note || "Sent without a note."}”</p>
    </section>
  {/if}

  {#if !base}
    <p class="py-6 text-center text-sm text-muted-foreground">Loading…</p>
  {:else}
    {#each views as v (v.title)}<WidgetViewRenderer view={v} />{/each}
  {/if}
</div>
