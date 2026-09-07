<script lang="ts">
  import { onMount } from "svelte";
  import { fly, fade, scale } from "svelte/transition";
  import { backOut } from "svelte/easing";
  import { Check, Trophy, Sparkles } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import type { WorkoutSession, CardioBlockData, ExerciseEntry } from "@logit/core/domain/workout";
  import { getExercises, getTopSetHighlight, foldSupersets, setTypeMeta } from "@logit/core/domain/workout";
  import { formatDuration } from "@logit/core/domain/time";
  import { toDisplayWeight, formatWeight } from "@logit/core/domain/units";
  import { getSessionPRs, type SessionPR } from "@logit/core/usecases/progression/getSessionPRs";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import { get } from "svelte/store";

  import { authStore } from "$lib/api/authStore.svelte";
  import { profile } from "$lib/stores/profile.store";
  import Confetti from "./Confetti.svelte";
  import CountUp from "./CountUp.svelte";

  const weightUnit = get(profile).weightUnit;

  const { session, onDone, onCancel, onShare }: {
    session: WorkoutSession;
    onDone: () => void | Promise<void>;
    onCancel?: () => void;
    onShare?: (session: WorkoutSession) => void;
  } = $props();

  const durationMs = Math.max(0, Date.now() - session.startedAtMs);
  const exercises = getExercises(session);
  const topSet = getTopSetHighlight(session);
  const totalSets = exercises.reduce((n, ex) => n + ex.sets.length, 0);
  const totalVolumeKg = exercises.reduce(
    (vol, ex) => vol + ex.sets.reduce((s, set) => s + set.reps * set.weight, 0),
    0,
  );
  const totalVolume = Math.round(toDisplayWeight(totalVolumeKg, weightUnit));

  const cardioBlocks = session.blocks.filter((b) => b.type === "cardio");
  const totalCardioDistanceM = cardioBlocks.reduce((sum, b) => {
    const data = b.data as CardioBlockData;
    return sum + data.intervals.reduce((s, iv) => s + (iv.distanceM ?? 0), 0);
  }, 0);
  const totalCardioDurationMs = cardioBlocks.reduce((sum, b) => {
    const data = b.data as CardioBlockData;
    return sum + data.intervals.reduce((s, iv) => s + (iv.durationMs ?? 0), 0);
  }, 0);

  function formatDistance(m: number): string {
    return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m} m`;
  }

  // Hero stats — the two or three numbers that matter, count up on reveal.
  type HeroStat = { label: string; value: number; fmt: (n: number) => string; noCount?: boolean };
  const heroStats: HeroStat[] = [
    ...(totalVolume > 0
      ? [{ label: `Volume (${weightUnit})`, value: totalVolume, fmt: (n: number) => Math.round(n).toLocaleString() }]
      : []),
    ...(totalSets > 0 ? [{ label: "Sets", value: totalSets, fmt: (n: number) => String(Math.round(n)) }] : []),
    { label: "Time", value: durationMs, fmt: () => formatDuration(durationMs), noCount: true },
  ];

  const secondaryStats: { label: string; value: string }[] = [
    { label: "Exercises", value: String(exercises.length + cardioBlocks.length) },
    ...(totalCardioDistanceM > 0 ? [{ label: "Distance", value: formatDistance(totalCardioDistanceM) }] : []),
    ...(totalCardioDurationMs > 0 ? [{ label: "Cardio time", value: formatDuration(totalCardioDurationMs) }] : []),
  ];

  let prs = $state<SessionPR[]>([]);
  let prsLoaded = $state(false);

  onMount(() => {
    void (async () => {
      try {
        prs = await getSessionPRs(session, getProgressionDeps());
      } catch {
        prs = [];
      } finally {
        prsLoaded = true;
      }
    })();

    void (async () => {
      try {
        const { Haptics, NotificationType } = await import("@capacitor/haptics");
        await Haptics.notification({ type: NotificationType.Success });
      } catch {}
    })();
  });

  function prLabel(pr: SessionPR): string {
    if (pr.kind === "first") return "First time";
    if (pr.kind === "reps") return "Rep PR";
    return "Weight PR";
  }

  // Per-exercise breakdown — superset members folded into a bracketed group.
  const breakdown = foldSupersets(exercises);

  function exerciseVolume(ex: ExerciseEntry): number {
    const kg = ex.sets.reduce((v, s) => v + s.reps * s.weight, 0);
    return Math.round(toDisplayWeight(kg, weightUnit));
  }
  function workingSets(ex: ExerciseEntry): number {
    return ex.sets.filter((s) => s.setType !== "warmup").length;
  }
</script>

<div class="fixed inset-0 z-50 flex flex-col bg-background overflow-y-auto pb-[env(safe-area-inset-bottom)]">
  <div class="relative">
    <Confetti />

    <!-- Beat 1 — the checkmark -->
    <div class="flex flex-col items-center justify-center gap-4 px-6 pt-16 pb-8 text-center">
      <div
        in:scale={{ duration: 480, start: 0.2, easing: backOut }}
        class="h-16 w-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-lg"
      >
        <Check class="h-8 w-8" strokeWidth={3} />
      </div>
      <div in:fly={{ y: 12, duration: 380, delay: 220 }}>
        <h1 class="text-2xl font-bold tracking-tight">Workout complete</h1>
        <p class="text-sm text-muted-foreground mt-1">
          {formatDuration(durationMs)} · {exercises.length + cardioBlocks.length} exercise{exercises.length + cardioBlocks.length === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  </div>

  <!-- Beat 2 — hero stats -->
  <div class="mx-4 grid gap-2" style="grid-template-columns: repeat({heroStats.length}, 1fr)">
    {#each heroStats as stat, i (stat.label)}
      <div
        in:fly={{ y: 16, duration: 340, delay: 420 + i * 80 }}
        class="flex flex-col items-center gap-0.5 rounded-lg border border-border px-2 py-3"
      >
        <span class="text-xl font-bold tabular-nums">
          {#if stat.noCount}
            {stat.fmt(stat.value)}
          {:else}
            <CountUp value={stat.value} format={stat.fmt} delay={420 + i * 80} />
          {/if}
        </span>
        <span class="text-xs text-muted-foreground">{stat.label}</span>
      </div>
    {/each}
  </div>

  <!-- Beat 3 — PRs -->
  {#if prsLoaded && prs.length > 0}
    <div class="mx-4 mt-3 flex flex-col gap-2" in:fly={{ y: 16, duration: 400, delay: 120 }}>
      {#each prs as pr, i (pr.exerciseName + pr.kind)}
        <div
          in:fly={{ x: 12, duration: 320, delay: i * 90 }}
          class="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3"
        >
          <Trophy class="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div class="min-w-0">
            <p class="text-sm font-semibold truncate">
              {pr.exerciseName}
              <span class="ml-1 text-xs font-medium text-amber-700 dark:text-amber-400">{prLabel(pr)}</span>
            </p>
            <p class="text-xs text-muted-foreground tabular-nums">
              {pr.reps} reps @ {formatWeight(pr.weight, weightUnit)}
            </p>
          </div>
          <Sparkles class="ml-auto h-4 w-4 shrink-0 text-amber-500/70" />
        </div>
      {/each}
    </div>
  {:else if topSet}
    <div class="mx-4 mt-3 rounded-lg border border-border px-4 py-3" in:fade={{ duration: 300, delay: 700 }}>
      <p class="text-xs text-muted-foreground">Best lift</p>
      <p class="text-sm font-semibold mt-0.5">
        {topSet.exerciseName}
        <span class="font-normal text-muted-foreground"> · {topSet.reps} reps @ {formatWeight(topSet.weight, weightUnit)}</span>
      </p>
    </div>
  {/if}

  <!-- Secondary stats -->
  {#if secondaryStats.length > 0}
    <div class="mx-4 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" in:fade={{ duration: 300, delay: 800 }}>
      {#each secondaryStats as s (s.label)}
        <span><span class="text-foreground font-medium tabular-nums">{s.value}</span> {s.label}</span>
      {/each}
    </div>
  {/if}

  <!-- Session note -->
  {#if session.note}
    <div class="mx-4 mt-3 rounded-lg border border-border px-4 py-3" in:fade={{ duration: 300, delay: 850 }}>
      <p class="text-xs text-muted-foreground">Note</p>
      <p class="text-sm mt-0.5 whitespace-pre-wrap">{session.note}</p>
    </div>
  {/if}

  <!-- Per-exercise breakdown -->
  {#if breakdown.length > 0}
    {#snippet exerciseRow(ex: ExerciseEntry)}
      <div class="px-3 py-2">
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-sm font-medium truncate">{ex.exerciseName}</span>
          <span class="text-xs text-muted-foreground tabular-nums shrink-0">
            {workingSets(ex)} set{workingSets(ex) === 1 ? "" : "s"}{exerciseVolume(ex) > 0 ? ` · ${exerciseVolume(ex).toLocaleString()} ${weightUnit}` : ""}
          </span>
        </div>
        {#if ex.sets.length > 0}
          <div class="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
            {#each ex.sets as s (s.id)}
              {@const meta = setTypeMeta(s.setType)}
              <span class={s.setType === "warmup" ? "opacity-50" : ""}>
                {#if meta.short}<span class="text-[10px] font-bold">{meta.short}</span>{/if}
                {s.reps}×{formatWeight(s.weight, weightUnit, { withUnit: false })}
              </span>
            {/each}
          </div>
        {/if}
      </div>
    {/snippet}

    <div class="mx-4 mt-4" in:fade={{ duration: 300, delay: 880 }}>
      <p class="text-xs font-medium text-muted-foreground mb-1.5">What you did</p>
      <div class="rounded-lg border border-border divide-y divide-border overflow-hidden">
        {#each breakdown as group (group.kind === "superset" ? group.id : group.exercise.id)}
          {#if group.kind === "superset"}
            <div class="bg-primary/[0.03]">
              <p class="px-3 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                {group.label ?? "Superset"}
              </p>
              <div class="ml-3 border-l-2 border-primary/30 divide-y divide-border">
                {#each group.exercises as ex (ex.id)}
                  {@render exerciseRow(ex)}
                {/each}
              </div>
            </div>
          {:else}
            {@render exerciseRow(group.exercise)}
          {/if}
        {/each}
      </div>
    </div>
  {/if}

  <div class="flex-1 min-h-6"></div>

  <div class="px-4 py-4 flex flex-col gap-2" in:fade={{ duration: 300, delay: 650 }}>
    <Button class="w-full" onclick={() => void onDone()}>Save & finish</Button>
    {#if onShare && authStore.isAuthenticated}
      <Button variant="outline" class="w-full" onclick={() => onShare(session)}>Share workout</Button>
    {/if}
    {#if onCancel}
      <Button variant="ghost" class="w-full" onclick={onCancel}>Back to workout</Button>
    {/if}
  </div>
</div>
