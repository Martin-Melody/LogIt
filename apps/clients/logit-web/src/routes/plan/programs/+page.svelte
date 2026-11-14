<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import * as Alert from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { coachProgramApi } from "@logit/core/api/coachProgramApi";
  import { BUILTIN_PROGRAMS, isBuiltinProgramId } from "@logit/core/domain/builtinPrograms";
  import {
    getProgramProgress,
    startOfLocalDayMs,
    type CoachProgram,
    type ProgramBlock,
    type ProgramSet,
  } from "@logit/core/domain/CoachProgram";
  import { loadFromPercent } from "@logit/core/domain/oneRepMax";
  import { programWeekToSplit } from "@logit/core/domain/programToSplit";
  import { toDisplayWeight, trimWeight, type WeightUnit } from "@logit/core/domain/units";
  import { getOwnProfile, getWebDeps } from "$lib/deps";
  import { loadExerciseIndex, type ExerciseIndex } from "$lib/features/plan/exerciseIndex";
  import { saveSplit } from "$lib/features/plan/splits";
  import PlanTabs from "$lib/features/plan/PlanTabs.svelte";

  // Programs: your coach's (read-only, Start like on the phone) and the built-in ones, which
  // you can copy into a split and change. Following a built-in stays on the phone: which one
  // you follow isn't synced.

  let coachPrograms = $state<CoachProgram[]>([]);
  let index = $state<ExerciseIndex | null>(null);
  let unit = $state<WeightUnit>("kg");
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let actionError = $state<string | null>(null);
  let weekIdx = $state(0);

  async function load() {
    loading = true;
    error = null;
    try {
      const [rows, profile, sessions] = await Promise.all([
        coachProgramApi.pullAssigned(0).catch(() => []),
        getOwnProfile(),
        getWebDeps().workoutRepo.listAllSessions().catch(() => []),
      ]);
      coachPrograms = rows
        .filter((r) => !r.deletedAtMs && r.dataJson)
        .map((r) => {
          try {
            const p = JSON.parse(r.dataJson!) as CoachProgram;
            return { ...p, ...(r.startedAtMs ? { clientStartedAtMs: r.startedAtMs } : {}) };
          } catch {
            return null;
          }
        })
        .filter((p): p is CoachProgram => p != null && !p.archived)
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      unit = profile?.weightUnit === "lbs" ? "lbs" : "kg";
      index = await loadExerciseIndex(sessions);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load programs.";
    } finally {
      loading = false;
    }
  }
  onMount(() => void load());

  const all = $derived([...coachPrograms, ...BUILTIN_PROGRAMS]);
  const selectedId = $derived(page.url.searchParams.get("id") ?? coachPrograms[0]?.id ?? BUILTIN_PROGRAMS[0]!.id);
  const program = $derived(all.find((p) => p.id === selectedId) ?? null);
  const builtin = $derived(program ? isBuiltinProgramId(program.id) : false);
  const weeks = $derived(program ? [...program.weeks].sort((a, b) => a.weekNumber - b.weekNumber) : []);
  const week = $derived(weeks[Math.min(weekIdx, weeks.length - 1)] ?? null);
  const progress = $derived(program && !builtin ? getProgramProgress(program) : null);

  async function select(id: string) {
    weekIdx = 0;
    actionError = null;
    await goto(`/plan/programs?id=${id}`, { replaceState: true, noScroll: true, keepFocus: true });
  }

  const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function kg(n: number): string {
    return `${trimWeight(Math.round(toDisplayWeight(n, unit) * 100) / 100)} ${unit}`;
  }

  /** One set's prescription: "5", "8–10", "AMRAP" plus load and effort. */
  function setParts(s: ProgramSet, exerciseName: string): { reps: string; extra: string[] } {
    const reps = s.setType === "amrap" ? "AMRAP" : s.reps != null ? String(s.reps) : s.repsMin != null || s.repsMax != null ? `${s.repsMin ?? ""}–${s.repsMax ?? ""}` : "?";
    const extra: string[] = [];
    if (s.weight) extra.push(kg(s.weight));
    if (s.percent1RM) {
      extra.push(`${s.percent1RM}%`);
      const e1rm = index?.get(exerciseName)?.e1rmKg;
      const load = e1rm ? loadFromPercent(e1rm, s.percent1RM) : null;
      if (load) extra.push(`≈ ${kg(load)}`);
    }
    if (s.rpe) extra.push(`RPE ${s.rpe}`);
    if (s.tempo) extra.push(`tempo ${s.tempo}`);
    return { reps, extra };
  }

  function blockText(b: ProgramBlock): string {
    if (b.type === "cardio") {
      const parts = [];
      if (b.targetDurationSec) parts.push(`${Math.round(b.targetDurationSec / 60)} min`);
      if (b.targetDistanceM) parts.push(b.targetDistanceM >= 1000 ? `${b.targetDistanceM / 1000} km` : `${b.targetDistanceM} m`);
      return parts.join(" · ") || "Cardio";
    }
    const sets = [...b.sets].sort((a, c) => a.orderIndex - c.orderIndex);
    const warmups = sets.filter((s) => s.setType === "warmup").length;
    const work = sets.filter((s) => s.setType !== "warmup").map((s) => setParts(s, b.exerciseName));
    if (work.length === 0) return warmups ? `${warmups} warm-up` : "";
    const same = work.every((w) => w.reps === work[0]!.reps && w.extra.join() === work[0]!.extra.join());
    const body = same
      ? [`${work.length} × ${work[0]!.reps}`, ...work[0]!.extra].join(" · ")
      : work.map((w) => [w.reps, ...w.extra].join(" ")).join(", ");
    return warmups ? `${body} (+${warmups} warm-up)` : body;
  }

  function supersetNote(day: { blocks: ProgramBlock[] }, b: ProgramBlock): string | null {
    if (!b.supersetGroup) return null;
    const n = day.blocks.filter((x) => x.supersetGroup === b.supersetGroup).length;
    return n > 1 ? "Superset" : null;
  }

  async function start() {
    if (!program || busy) return;
    busy = true;
    actionError = null;
    try {
      const { startedAtMs } = await coachProgramApi.startAssigned(program.id, startOfLocalDayMs());
      coachPrograms = coachPrograms.map((p) => (p.id === program!.id ? { ...p, clientStartedAtMs: startedAtMs } : p));
    } catch (e) {
      actionError = e instanceof Error ? e.message : "Couldn't start it.";
    } finally {
      busy = false;
    }
  }

  async function copyToSplit() {
    if (!program || !week || busy) return;
    busy = true;
    actionError = null;
    try {
      const split = programWeekToSplit(program, week, index?.e1rmByName());
      // No weight in the program: start from your heaviest working set last time.
      for (const d of split.days) {
        d.blocks = d.blocks.map((b) => {
          if (b.type !== "strength" || b.targets?.weight) return b;
          const sets = index?.get(b.exerciseName)?.last?.sets ?? [];
          const top = Math.max(0, ...sets.map((x) => x.weight));
          return top > 0 ? { ...b, targets: { ...b.targets, weight: top } } : b;
        });
      }
      const saved = await saveSplit(split, null);
      await goto(`/plan?id=${saved.id}`);
    } catch (e) {
      actionError = e instanceof Error ? e.message : "Couldn't copy it.";
      busy = false;
    }
  }

  const hasPercent = $derived(!!week?.days.some((d) => d.blocks.some((b) => b.type === "strength" && b.sets.some((s) => s.percent1RM))));
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center gap-4">
    <h1 class="text-[26px] font-bold tracking-tight">Plan</h1>
    <PlanTabs current="programs" />
  </header>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if loading}
    <div class="flex flex-wrap gap-4"><Skeleton class="h-72 flex-[1_1_240px]" /><Skeleton class="h-[28rem] flex-[999_1_640px]" /></div>
  {:else}
    <div class="flex flex-wrap items-start gap-4">
      <nav aria-label="Programs" class="flex max-w-full flex-[1_1_240px] flex-col gap-0.5 rounded-[10px] border border-border bg-card p-2">
        {#if coachPrograms.length}
          <p class="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">From your coach</p>
          {#each coachPrograms as p (p.id)}
            {@const pr = getProgramProgress(p)}
            <button type="button" onclick={() => void select(p.id)} aria-current={p.id === selectedId ? "true" : undefined}
              class="flex flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left {p.id === selectedId ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/50'}">
              <span class="flex items-center justify-between gap-2">
                <span class="truncate text-sm font-semibold">{p.name}</span>
                {#if pr.status === "running"}<span class="shrink-0 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-semibold text-success">Week {pr.weekNumber}</span>
                {:else if pr.status === "not-started"}<span class="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">New</span>{/if}
              </span>
              <span class="text-xs text-muted-foreground">{p.weeks.length} week{p.weeks.length === 1 ? "" : "s"} · {p.weeks[0]?.days.length ?? 0} days</span>
            </button>
          {/each}
        {/if}
        <p class="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Built in</p>
        {#each BUILTIN_PROGRAMS as p (p.id)}
          <button type="button" onclick={() => void select(p.id)} aria-current={p.id === selectedId ? "true" : undefined}
            class="flex flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left {p.id === selectedId ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/50'}">
            <span class="truncate text-sm font-semibold">{p.name}</span>
            <span class="text-xs text-muted-foreground">{p.weeks[0]?.days.length ?? 0} days a week</span>
          </button>
        {/each}
        <p class="mx-1 mt-1.5 border-t border-border px-2 pt-2.5 pb-1 text-xs leading-relaxed text-muted-foreground">Built-in programs can be copied into a split, then changed however you like.</p>
      </nav>

      {#if program}
        <section class="flex min-w-0 flex-[999_1_640px] flex-col gap-4 rounded-[10px] border border-border bg-card px-[22px] py-5">
          <div class="flex flex-wrap justify-between gap-3">
            <div class="flex max-w-xl flex-col gap-1.5">
              <h2 class="text-xl font-bold">{program.name}</h2>
              <p class="text-[13px] text-muted-foreground">
                {#if builtin}Built in · {program.weeks[0]?.days.length ?? 0} days a week, the same week on repeat
                {:else}From your coach · {program.weeks.length} week{program.weeks.length === 1 ? "" : "s"}
                  {#if progress?.status === "running"}{" · "}you're in week {progress.weekNumber}
                  {:else if progress?.status === "scheduled"}{" · starts "}{new Date(progress.startsAtMs).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                  {:else if progress?.status === "finished"}{" · finished"}{/if}
                {/if}
              </p>
              {#if program.description}<p class="mt-1 text-[13px] leading-relaxed text-foreground/85">{program.description}</p>{/if}
            </div>
            <div class="flex flex-wrap items-start gap-2">
              {#if builtin}
                <Button disabled={busy} onclick={() => void copyToSplit()}>{busy ? "Copying…" : "Copy into a split"}</Button>
              {:else}
                <Button variant="outline" href="/messages">Message your coach</Button>
                {#if progress?.status === "not-started"}
                  <Button disabled={busy} onclick={() => void start()}>{busy ? "Starting…" : "Start this program"}</Button>
                {/if}
              {/if}
            </div>
          </div>

          {#if actionError}<Alert.Root variant="destructive"><Alert.Description>{actionError}</Alert.Description></Alert.Root>{/if}

          {#if !builtin}
            <p role="note" class="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-xs leading-relaxed">
              Your coach edits this program, so you can read it here but not change it.
              {#if progress?.status === "not-started"}Starting it makes today week 1, day 1, the same as Start in the app.{/if}
            </p>
          {/if}

          {#if weeks.length > 1}
            <div role="tablist" aria-label="Weeks" class="flex flex-wrap gap-1.5">
              {#each weeks as w, i (w.id)}
                <button type="button" role="tab" aria-selected={i === weekIdx} onclick={() => (weekIdx = i)}
                  class="h-[30px] rounded-lg px-3 text-xs {i === weekIdx ? 'bg-muted font-semibold ring-1 ring-border' : 'border border-border text-muted-foreground hover:text-foreground'}">
                  Week {w.weekNumber}{w.name ? ` · ${w.name}` : ""}
                </button>
              {/each}
            </div>
          {/if}

          {#if week}
            <div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
              {#each [...week.days].sort((a, b) => a.orderIndex - b.orderIndex) as day, di (day.id)}
                <div class="flex min-w-0 flex-col gap-2.5 rounded-lg bg-muted p-3">
                  <span class="flex justify-between gap-2">
                    <span class="text-[13px] font-semibold">{day.name ?? `Day ${di + 1}`}</span>
                    {#if day.weekday != null}<span class="text-[11px] text-muted-foreground">{WEEKDAY[day.weekday]}</span>{/if}
                  </span>
                  {#each [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex) as b (b.id)}
                    {@const ss = supersetNote(day, b)}
                    <div class="flex flex-col gap-0.5 text-[13px]">
                      <span>{b.type === "strength" ? b.exerciseName : b.activityName}{#if ss}<span class="ml-1.5 text-[11px] text-primary">{ss}</span>{/if}</span>
                      <span class="text-xs text-muted-foreground">{blockText(b)}</span>
                      {#if b.note}<span class="text-xs italic text-muted-foreground">{b.note}</span>{/if}
                    </div>
                  {/each}
                  {#if day.blocks.length === 0}<span class="text-xs text-muted-foreground">Nothing planned</span>{/if}
                </div>
              {/each}
            </div>
          {/if}

          {#if hasPercent}
            <p class="text-xs text-muted-foreground">≈ loads come from your best estimated 1-rep max in the last 12 weeks, rounded to 2.5 kg. They go up as you get stronger.</p>
          {/if}
          {#if builtin}
            <p class="text-xs text-muted-foreground">Copying makes a split of this week: each exercise's sets, the top of its rep range, and the weight you used last time (blank if you haven't done it). It opens straight away so you can adjust it. To follow the program as it is, use Programs in the app.</p>
          {/if}
        </section>
      {/if}
    </div>
  {/if}
</div>
