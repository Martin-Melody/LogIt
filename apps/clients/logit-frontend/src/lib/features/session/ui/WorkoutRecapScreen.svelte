<script lang="ts">
  import { playSound } from "$lib/features/sound/sounds";
  import { onMount } from "svelte";
  import { fly, fade, scale } from "svelte/transition";
  import { backOut } from "svelte/easing";
  import { ArrowLeft, Info, Trophy, Sparkles } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import type { WorkoutSession, CardioBlockData, MobilityBlockData, ExerciseEntry } from "@logit/core/domain/workout";
  import { getExercises, getTopSetHighlight, foldSupersets, groupLabel, setTypeMeta, getExerciseVolumeKg } from "@logit/core/domain/workout";
  import type { ExerciseType } from "@logit/core/domain/exercise";
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
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import Confetti from "./Confetti.svelte";
  import { getWorkoutRepo } from "$lib/data/repoProvider";
  import { getSuggestion } from "@logit/core/usecases/progression/getSuggestion";
  import { formatPrescription } from "$lib/features/session/planFormat";
  import type { WorkoutRepo } from "@logit/core/data/workoutRepo";
  import CountUp from "./CountUp.svelte";
  import { tagClass } from "$lib/components/ui/choice";

  const weightUnit = get(profile).weightUnit;

  const { session, title = "Workout", skipped = [], onNote, onDone, onCancel, onShare, onPrs }: {
    session: WorkoutSession;
    /** "Finish Upper". */
    title?: string;
    /** What's planned but not done, left out of what's saved ("Thoracic rotation", "1 set of Overhead Press"). */
    skipped?: string[];
    /** The note typed here, saved with the workout. */
    onNote?: (note: string) => void | Promise<void>;
    onDone: () => void | Promise<void>;
    onCancel?: () => void;
    onShare?: (session: WorkoutSession) => void;
    /** The session's PRs once worked out (before it's saved, so history doesn't include it). */
    onPrs?: (prs: SessionPR[]) => void;
  } = $props();

  const durationMs = Math.max(0, Date.now() - session.startedAtMs);

  // A first workout says so, and leaves out volume: "1,640 kg" means nothing on day one (bug hunt 3.13).
  let firstWorkout = $state(false);
  // What each lift is planned at next time, worked out with this workout counted (decision D3).
  let nextTime = $state<{ name: string; text: string; change: string | null; up: boolean }[]>([]);
  onMount(() => {
    const repo = getWorkoutRepo();
    void repo.listRecentSessions({ limit: 1 }).then((r) => (firstWorkout = !r.some((x) => x.endedAtMs && x.id !== session.id))).catch(() => {});
    void loadNextTime(repo);
  });

  async function loadNextTime(repo: WorkoutRepo) {
    // This workout isn't saved until Done, so the planner is shown it alongside the saved ones.
    const done = { ...session, endedAtMs: Date.now() };
    const withToday = Object.create(repo) as WorkoutRepo;
    withToday.listAllSessions = async () => [done, ...(await repo.listAllSessions()).filter((x) => x.id !== session.id)];
    withToday.listRecentSessions = async (o) => [done, ...(await repo.listRecentSessions(o)).filter((x) => x.id !== session.id)];
    const deps = { ...getProgressionDeps(), workoutRepo: withToday };
    const out: { name: string; text: string; change: string | null; up: boolean }[] = [];
    for (const ex of exercises.slice(0, 6)) {
      const working = ex.sets.filter((x) => x.setType !== "warmup").length;
      const s = await getSuggestion({ id: ex.exerciseId, name: ex.exerciseName }, deps, { sets: working }).catch(() => null);
      const first = s?.sets[0];
      if (!s || !first) continue;
      // Against today's heaviest working set: "+2" when it goes up, "same" when it doesn't.
      const today = Math.max(0, ...ex.sets.filter((x) => x.setType !== "warmup" && x.completed !== false).map((x) => x.weight));
      const diff = first.weight - today;
      const change = today > 0 && first.weight > 0
        ? Math.abs(diff) < 0.01 ? "same" : `${diff > 0 ? "+" : "−"}${formatLoad(Math.abs(diff), weightUnit, false, { withUnit: false })}`
        : null;
      out.push({ name: ex.exerciseName, text: first.weight === 0 && !s.bodyweightLoad ? `${s.sets.length} sets` : formatPrescription([first], weightUnit, !!s.bodyweightLoad), change, up: diff > 0.01 });
    }
    nextTime = out;
  }
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
  const blockCount = exercises.length + cardioBlocks.length + mobilityBlocks.length + session.blocks.filter((b) => b.type.startsWith("plugin:")).length;
  const totalMobilityHoldSec = mobilityBlocks.reduce((sum, b) => {
    const data = b.data as MobilityBlockData;
    return sum + data.sets.reduce((s, set) => s + (set.durationSec ?? 0), 0);
  }, 0);
  const totalMobilityReps = mobilityBlocks.reduce((sum, b) => {
    const data = b.data as MobilityBlockData;
    return sum + data.sets.reduce((s, set) => s + (set.reps ?? 0), 0);
  }, 0);

  let prs = $state<SessionPR[]>([]);
  let prsLoaded = $state(false);
  // Hero stats — the two or three numbers that matter, count up on reveal.
  type HeroStat = { label: string; value: number; fmt: (n: number) => string; noCount?: boolean };
  const heroStats: HeroStat[] = $derived.by(() => {
    const best = prsLoaded ? prs.filter((p) => p.kind !== "first").length : 0;
    const out: HeroStat[] = [
      ...(showDuration ? [{ label: "Time", value: durationMs, fmt: () => formatDuration(durationMs), noCount: true }] : []),
      ...(totalSets > 0 ? [{ label: "Sets", value: totalSets, fmt: (n: number) => String(Math.round(n)) }] : []),
      ...(totalVolume > 0 && !firstWorkout
        ? [{ label: `Volume (${weightUnit})`, value: totalVolume, fmt: (n: number) => Math.round(n).toLocaleString() }]
        : []),
    ];
    // Three tiles at most (design canvas S-finish): best lifts when there's room.
    if (best > 0 && out.length < 3) out.push({ label: best === 1 ? "Best lift" : "Best lifts", value: best, fmt: (n: number) => String(Math.round(n)) });
    return out;
  });
  let note = $state(session.note ?? "");

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


  // Full screen: hide the bottom nav (shown on the workout screen) while it's up.
  onMount(() => {
    openOverlay();
    return () => closeOverlay();
  });

  onMount(() => {
    void (async () => {
      try {
        prs = await getSessionPRs(session, getProgressionDeps());
        // The signature sound, or the PR one when there's a PR (it vibrates too).
        playSound(prs.length > 0 ? "pr" : "finish");
        onPrs?.(prs);
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
    // By name too: a push-up or pull-up whose exercise has no type yet is still bodyweight work.
    return getLoadMode(exerciseType(ex), ex.sets.map((s) => s.weight), ex.exerciseName) === "bodyweight";
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

<div class="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)]">
  <!-- Design canvas S-finish: a plain header; the summary scrolls, the buttons stay put. -->
  <header class="page-header">
    {#if onCancel}
      <button type="button" class="-ml-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-muted" aria-label="Back to workout" onclick={onCancel}>
        <ArrowLeft class="h-5 w-5" />
      </button>
    {/if}
    <h1 class="page-title">{firstWorkout ? "First workout done" : `Finish ${title}`}</h1>
  </header>
  <div class="flex-1 min-h-0 overflow-y-auto pb-4 pt-3.5">
    {#if prsLoaded && prs.some((p) => p.kind !== "first")}<div class="relative"><Confetti /></div>{/if}
    <!-- Beat 2 — hero stats -->
    <div class="mx-4 grid gap-2" style="grid-template-columns: repeat({heroStats.length}, 1fr)">
      {#each heroStats as stat, i (stat.label)}
        <div
          in:fly={{ y: 16, duration: 340, delay: 420 + i * 80 }}
          class="flex flex-col gap-0.5 rounded-xl border border-border bg-card px-3 py-2.5"
        >
          <span class="text-xl font-semibold tabular-nums">
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

    {#if nextTime.length}
      <div class="mx-4 mt-4" in:fade={{ duration: 300 }}>
        <h2 class="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Next time</h2>
        <ul class="overflow-hidden rounded-xl border border-border bg-card">
          {#each nextTime as line (line.name)}
            {@const best = prs.some((p) => p.exerciseName === line.name && p.kind !== "first")}
            <li class="flex items-center gap-2.5 border-t border-border px-3.5 py-2.5 text-sm first:border-t-0">
              <span class="min-w-0 truncate">{line.name}</span>
              {#if best}<span class={tagClass("warn")}>Best</span>{/if}
              <span class="ml-auto shrink-0 tabular-nums"><span class="font-semibold text-info">{line.text}</span>{#if line.change}<span class="ml-1.5 text-[13px] {line.up ? 'text-success' : 'text-muted-foreground'}">{line.change}</span>{/if}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if skipped.length && onCancel}
      <div class="mx-4 mt-3 flex items-start gap-2.5 rounded-xl bg-muted px-3 py-2.5 text-[13px] leading-snug">
        <Info class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span class="flex-1">{skipped.length === 1 ? skipped[0] : `${skipped.slice(0, -1).join(", ")} and ${skipped.at(-1)}`} {skipped.length === 1 && !/^\d/.test(skipped[0]!) ? "wasn't" : "weren't"} done, so {skipped.length === 1 ? "it's" : "they're"} left out.</span>
        <button type="button" class="h-9 shrink-0 rounded-lg border border-input px-2.5 text-xs font-medium" onclick={onCancel}>Go back</button>
      </div>
    {/if}

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

    <!-- Note -->
    <div class="mx-4 mt-4 flex flex-col gap-1.5">
      <label for="finish-note" class="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Note</label>
      <input id="finish-note" type="text" bind:value={note} placeholder="How it felt, sleep, anything"
        onchange={() => void onNote?.(note.trim())}
        class="h-12 w-full rounded-xl border border-input bg-background px-3.5 text-[15px]" />
    </div>

    <!-- Per-exercise breakdown -->
    {#if breakdown.length > 0}
      {#snippet exerciseRow(ex: ExerciseEntry)}
        <div class="px-3 py-2">
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-sm font-medium truncate">{ex.exerciseName}</span>
            <span class="text-xs text-muted-foreground tabular-nums shrink-0">
              {workingSets(ex)} set{workingSets(ex) === 1 ? "" : "s"}{exerciseVolume(ex) > 0 && !firstWorkout ? ` · ${exerciseVolume(ex).toLocaleString()} ${weightUnit}` : ""}
            </span>
          </div>
          {#if ex.sets.length > 0}
            <div class="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
              {#each ex.sets as s (s.id)}
                {@const meta = setTypeMeta(s.setType)}
                <span class={s.setType === "warmup" ? "opacity-75" : ""}>
                  {#if meta.short}<span class="text-[11px] font-bold">{meta.short}</span>{/if}
                  {formatLoad(s.weight, weightUnit, isBodyweight(ex), { withUnit: false })}×{s.reps}
                </span>
              {/each}
            </div>
          {/if}
        </div>
      {/snippet}

      <div class="mx-4 mt-4" in:fade={{ duration: 300, delay: 880 }}>
        <h2 class="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">What you did</h2>
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
    <Button class="h-12 w-full rounded-xl text-[15px] font-semibold" onclick={async () => { if (note.trim() !== (session.note ?? "")) await onNote?.(note.trim()); void onDone(); }}>Save workout</Button>
    {#if onShare && authStore.isAuthenticated}
      <Button variant="outline" class="h-11 w-full rounded-xl" onclick={async () => { if (note.trim() !== (session.note ?? "")) await onNote?.(note.trim()); onShare({ ...session, note: note.trim() || null }); }}>Save and share</Button>
    {/if}
  </div>
</div>
