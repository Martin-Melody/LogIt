<script lang="ts">
  import { onMount } from "svelte";
  import { fly, fade, scale } from "svelte/transition";
  import { backOut } from "svelte/easing";
  import { Check, Trophy, Sparkles } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import type { WorkoutSession, CardioBlockData, MobilityBlockData, ExerciseEntry } from "@logit/core/domain/workout";
  import { getExercises, getTopSetHighlight, foldSupersets, groupLabel, setTypeMeta, getExerciseVolumeKg } from "@logit/core/domain/workout";
  import { usesBodyweightLoad, type ExerciseType } from "@logit/core/domain/exercise";
  import { getLoadMode } from "@logit/core/domain/bodyweight";
  import { loadBodyweightLookup, profileBodyweightKg } from "$lib/features/bodyweight/bodyweight";
  import { formatDuration } from "@logit/core/domain/time";
  import { toDisplayWeight, formatWeight, formatLoad } from "@logit/core/domain/units";
  import { estimated1RM } from "@logit/core/domain/oneRepMax";
  import { getSessionPRs, type SessionPR } from "@logit/core/usecases/progression/getSessionPRs";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import { getExerciseRepo } from "$lib/data/repoProvider";
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
  // Under a minute means the sets were logged after the fact, so "0m" says nothing.
  const showDuration = durationMs >= 60_000;

  // Exercise types, so bodyweight work reads "BW−22.5" like it does mid-session
  // and an assisted machine's help isn't counted as lifted weight.
  let exerciseTypes = $state<Record<string, ExerciseType | undefined>>({});
  // Bodyweight-exercise volume is bodyweight ± the logged number.
  let bodyweightKg = $state<number | null>(profileBodyweightKg());

  function exerciseType(ex: ExerciseEntry): ExerciseType | undefined {
    return ex.exerciseId ? exerciseTypes[ex.exerciseId] : undefined;
  }
  // kg moved by one exercise. Bodyweight / assisted work counts only once the
  // bodyweight is known; before that the row shows its sets alone.
  function exerciseVolumeKg(ex: ExerciseEntry): number {
    const type = exerciseType(ex);
    const mode = getLoadMode(type, ex.sets.map((s) => s.weight), ex.exerciseName);
    if (mode !== "external" && bodyweightKg == null) return 0;
    return getExerciseVolumeKg(ex, { exerciseType: type, bodyweightKg });
  }
  const totalVolume = $derived(
    Math.round(toDisplayWeight(exercises.reduce((vol, ex) => vol + exerciseVolumeKg(ex), 0), weightUnit)),
  );

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

  const mobilityBlocks = session.blocks.filter((b) => b.type === "mobility");
  const blockCount = exercises.length + cardioBlocks.length + mobilityBlocks.length;
  const totalMobilityHoldSec = mobilityBlocks.reduce((sum, b) => {
    const data = b.data as MobilityBlockData;
    return sum + data.sets.reduce((s, set) => s + (set.durationSec ?? 0), 0);
  }, 0);
  const totalMobilityReps = mobilityBlocks.reduce((sum, b) => {
    const data = b.data as MobilityBlockData;
    return sum + data.sets.reduce((s, set) => s + (set.reps ?? 0), 0);
  }, 0);

  // Hero stats — the two or three numbers that matter, count up on reveal.
  type HeroStat = { label: string; value: number; fmt: (n: number) => string; noCount?: boolean };
  const heroStats: HeroStat[] = $derived([
    ...(totalVolume > 0
      ? [{ label: `Volume (${weightUnit})`, value: totalVolume, fmt: (n: number) => Math.round(n).toLocaleString() }]
      : []),
    ...(totalSets > 0 ? [{ label: "Sets", value: totalSets, fmt: (n: number) => String(Math.round(n)) }] : []),
    ...(showDuration ? [{ label: "Time", value: durationMs, fmt: () => formatDuration(durationMs), noCount: true }] : []),
  ]);

  function formatHold(s: number): string {
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
  }

  const secondaryStats: { label: string; value: string }[] = [
    ...(totalCardioDistanceM > 0 ? [{ label: "Distance", value: formatDistance(totalCardioDistanceM) }] : []),
    ...(totalCardioDurationMs > 0 ? [{ label: "Cardio time", value: formatDuration(totalCardioDurationMs) }] : []),
    ...(totalMobilityHoldSec > 0 ? [{ label: "Time under tension", value: formatHold(totalMobilityHoldSec) }] : []),
    ...(totalMobilityReps > 0 ? [{ label: "Mobility reps", value: String(totalMobilityReps) }] : []),
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

    void loadBodyweightLookup()
      .then((at) => (bodyweightKg = at(Date.now())))
      .catch(() => {});

    void (async () => {
      const ids = [...new Set(exercises.map((ex) => ex.exerciseId).filter((id): id is string => !!id))];
      const found = await Promise.all(
        ids.map((id) => getExerciseRepo().getById(id).catch(() => null)),
      );
      exerciseTypes = Object.fromEntries(found.filter((ex) => !!ex).map((ex) => [ex!.id, ex!.exerciseType]));
    })();

    void (async () => {
      try {
        const { Haptics, NotificationType } = await import("@capacitor/haptics");
        await Haptics.notification({ type: NotificationType.Success });
      } catch {}
    })();
  });

  // Only worth showing alongside the raw set once reps > 1 — at 1 rep the estimate
  // equals the weight already on screen, so a second "≈ Xkg 1RM" would be redundant.
  function e1rmLabel(weight: number, reps: number): string | null {
    if (reps <= 1) return null;
    return `≈${formatWeight(estimated1RM(weight, reps), weightUnit)} 1RM`;
  }

  // Real PRs get a card each. Debuts are only news one at a time: on a first
  // workout every exercise is "First time", so two or more share one card.
  const prCards = $derived(prs.filter((p) => p.kind !== "first" || prs.filter((q) => q.kind === "first").length === 1));
  const firstTimers = $derived(prs.filter((p) => p.kind === "first").length > 1 ? prs.filter((p) => p.kind === "first") : []);

  function prLabel(pr: SessionPR): string {
    if (pr.kind === "first") return "First time";
    if (pr.kind === "reps") return "Rep PR";
    return "Weight PR";
  }

  // Per-exercise breakdown — superset members folded into a bracketed group.
  const breakdown = foldSupersets(exercises);

  function isBodyweight(ex: ExerciseEntry): boolean {
    return usesBodyweightLoad(exerciseType(ex), ex.sets.map((s) => s.weight));
  }
  function isBodyweightName(name: string): boolean {
    const ex = exercises.find((e) => e.exerciseName === name);
    return !!ex && isBodyweight(ex);
  }
  // A PR / best-lift line: "5 reps @ BW+2.5 kg", with no 1RM estimate for bodyweight
  // work since the logged number is only the offset from bodyweight.
  function liftLine(name: string, weight: number, reps: number): { load: string; e1rm: string | null } {
    const bw = isBodyweightName(name);
    return { load: formatLoad(weight, weightUnit, bw), e1rm: bw ? null : e1rmLabel(weight, reps) };
  }
  function exerciseVolume(ex: ExerciseEntry): number {
    return Math.round(toDisplayWeight(exerciseVolumeKg(ex), weightUnit));
  }
  function workingSets(ex: ExerciseEntry): number {
    return ex.sets.filter((s) => s.setType !== "warmup").length;
  }
</script>

<div class="fixed inset-0 z-50 flex flex-col bg-background">
  <!-- Only the summary scrolls; the buttons below always stay on screen. -->
  <div class="flex-1 min-h-0 overflow-y-auto pb-4">
    <div class="relative">
      <Confetti />

      <!-- Beat 1 — the checkmark -->
      <div class="flex flex-col items-center justify-center gap-3 px-6 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-6 text-center">
        <div
          in:scale={{ duration: 480, start: 0.2, easing: backOut }}
          class="h-16 w-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-lg"
        >
          <Check class="h-8 w-8" strokeWidth={3} />
        </div>
        <div in:fly={{ y: 12, duration: 380, delay: 220 }}>
          <h1 class="text-2xl font-bold tracking-tight">Workout complete</h1>
          <p class="text-sm text-muted-foreground mt-1">
            {#if showDuration}{formatDuration(durationMs)} · {/if}{blockCount} exercise{blockCount === 1 ? "" : "s"}
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
        {#each prCards as pr, i (pr.exerciseName + pr.kind)}
          {@const line = liftLine(pr.exerciseName, pr.weight, pr.reps)}
          <div
            in:fly={{ x: 12, duration: 320, delay: i * 90 }}
            class="flex items-center gap-3 rounded-lg border border-highlight/40 bg-highlight/10 px-4 py-3"
          >
            <Trophy class="h-5 w-5 shrink-0 text-highlight" />
            <div class="min-w-0">
              <p class="text-sm font-semibold truncate">
                {pr.exerciseName}
                <span class="ml-1 text-xs font-medium text-highlight">{prLabel(pr)}</span>
              </p>
              <p class="text-xs text-muted-foreground tabular-nums">
                {pr.reps} reps @ {line.load}
                {#if line.e1rm}
                  <span class="text-muted-foreground"> · {line.e1rm}</span>
                {/if}
              </p>
            </div>
            <Sparkles class="ml-auto h-4 w-4 shrink-0 text-highlight/70" />
          </div>
        {/each}
        {#if firstTimers.length > 0}
          <div
            in:fly={{ x: 12, duration: 320, delay: prCards.length * 90 }}
            class="flex items-center gap-3 rounded-lg border border-highlight/40 bg-highlight/10 px-4 py-3"
          >
            <Sparkles class="h-5 w-5 shrink-0 text-highlight" />
            <div class="min-w-0">
              <p class="text-sm font-semibold">
                {firstTimers.length} new exercises
                <span class="ml-1 text-xs font-medium text-highlight">First time</span>
              </p>
              <p class="text-xs text-muted-foreground">
                {firstTimers.map((p) => p.exerciseName).join(", ")} — next time you'll have something to beat.
              </p>
            </div>
          </div>
        {/if}
      </div>
    {:else if topSet}
      {@const line = liftLine(topSet.exerciseName, topSet.weight, topSet.reps)}
      <div class="mx-4 mt-3 rounded-lg border border-border px-4 py-3" in:fade={{ duration: 300, delay: 700 }}>
        <p class="text-xs text-muted-foreground">Best lift</p>
        <p class="text-sm font-semibold mt-0.5">
          {topSet.exerciseName}
          <span class="font-normal text-muted-foreground"> · {topSet.reps} reps @ {line.load}</span>
          {#if line.e1rm}
            <span class="font-normal text-muted-foreground"> · {line.e1rm}</span>
          {/if}
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
                <span class={s.setType === "warmup" ? "opacity-75" : ""}>
                  {#if meta.short}<span class="text-[11px] font-bold">{meta.short}</span>{/if}
                  {s.reps}×{formatLoad(s.weight, weightUnit, isBodyweight(ex), { withUnit: false })}
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
                <p class="px-3 pt-1.5 text-xs font-medium uppercase tracking-wide text-primary">
                  {groupLabel(group.exercises.length, group.label, group.groupKind)}
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
  </div>

  <div
    class="shrink-0 border-t border-border bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex flex-col gap-2"
    in:fade={{ duration: 300, delay: 650 }}
  >
    <Button class="w-full" onclick={() => void onDone()}>Save & finish</Button>
    {#if onShare && authStore.isAuthenticated}
      <Button variant="outline" class="w-full" onclick={() => onShare(session)}>Share workout</Button>
    {/if}
    {#if onCancel}
      <Button variant="ghost" class="w-full" onclick={onCancel}>Back to workout</Button>
    {/if}
  </div>
</div>
