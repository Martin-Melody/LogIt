<script lang="ts">
  import {
    X, Dumbbell, Trophy, MessageSquare, CalendarDays,
    Activity, Cpu, LayoutDashboard, Paperclip,
  } from "lucide-svelte";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import { socialApi, type ApiPost, type PostType } from "@logit/core/api/socialApi";
  import { ApiError } from "@logit/core/api/client";
  import { recentSessions } from "$lib/stores/recentSessions.store";
  import { splits } from "$lib/stores/splits.store";
  import { exercisesStore } from "$lib/stores/exercises.store";
  import { getPersonalRecords, type PersonalRecord } from "$lib/usecases/getPersonalRecords";
  import { getProgressionConfig } from "@logit/core/usecases/progression/getProgressionConfig";
  import { getAnalyticsConfig } from "@logit/core/usecases/progression/getAnalyticsConfig";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import { localProfileWidgetRegistry } from "$lib/features/profileWidgets/localProfileWidgetRegistry";
  import { localWidgetRegistry } from "$lib/features/widgets/localWidgetRegistry";
  import type { WorkoutSession } from "@logit/core/domain/workout";
  import { getExercises } from "@logit/core/domain/workout";
  import { formatDuration, durationMs as calcDuration } from "@logit/core/domain/time";
  import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
  import type { ProgressionAlgorithmMeta } from "@logit/core/domain/progression";
  import type { AnalyticsPluginMeta } from "@logit/core/domain/analytics";

  const { open, onclose, onposted, prefillSession } = $props<{
    open: boolean;
    onclose: () => void;
    onposted?: (post: ApiPost) => void;
    prefillSession?: WorkoutSession | null;
  }>();

  type AttachmentType = "none" | "workout" | "pr" | "split" | "exercise" | "algorithm" | "widget";

  // ── Form state ───────────────────────────────────────────────────────────────

  let attachmentType = $state<AttachmentType>("none");
  let showAttach = $state(false);
  let body = $state("");
  let error = $state<string | null>(null);
  let submitting = $state(false);

  // Workout
  let selectedSession = $state<WorkoutSession | null>(null);
  let sessionsLoading = $state(false);

  // PR
  let prs = $state<PersonalRecord[]>([]);
  let prsLoading = $state(false);
  let prExercise = $state("");
  let prWeight = $state("");
  let prReps = $state("");

  // Split
  let selectedSplit = $state<WorkoutSplit | null>(null);
  let splitsLoading = $state(false);

  // Custom exercise
  let selectedExerciseId = $state<string | null>(null);
  let exercisesLoading = $state(false);

  // Algorithm
  type AlgoEntry = { id: string; name: string; description: string; family: "progression" | "analytics"; author?: string };
  let algorithms = $state<AlgoEntry[]>([]);
  let algorithmsLoading = $state(false);
  let selectedAlgo = $state<AlgoEntry | null>(null);

  // Widget — all registries combined, deduplicated by id
  const widgets = [
    ...localProfileWidgetRegistry.list(),
    ...localWidgetRegistry.list(),
  ].filter((w, i, arr) => arr.findIndex((x) => x.id === w.id) === i);
  let selectedWidgetId = $state<string | null>(null);

  // ── Reset and load on open ───────────────────────────────────────────────────

  $effect(() => {
    if (open) {
      openOverlay();
      return () => closeOverlay();
    }
  });

  $effect(() => {
    if (!open) return;

    // Reset form
    body = "";
    showAttach = false;
    error = null;
    submitting = false;
    prs = [];
    prExercise = "";
    prWeight = "";
    prReps = "";
    selectedSplit = null;
    selectedExerciseId = null;
    selectedAlgo = null;
    selectedWidgetId = null;
    if (prefillSession) {
      selectedSession = prefillSession;
      attachmentType = "workout";
    } else {
      selectedSession = null;
      attachmentType = "none";
    }

    // Load all data upfront — no loading flags read here to avoid re-entry loops
    if (!prefillSession) {
      sessionsLoading = true;
      recentSessions.refresh(10).then(() => { sessionsLoading = false; }).catch(() => { sessionsLoading = false; });
    }

    splitsLoading = true;
    splits.refresh().then(() => { splitsLoading = false; }).catch(() => { splitsLoading = false; });

    exercisesLoading = true;
    exercisesStore.refresh().then(() => { exercisesLoading = false; }).catch(() => { exercisesLoading = false; });

    prsLoading = true;
    getPersonalRecords(30).then((data) => { prs = data; prsLoading = false; }).catch(() => { prsLoading = false; });

    algorithmsLoading = true;
    const progressionDeps = getProgressionDeps();
    Promise.all([getProgressionConfig(progressionDeps), getAnalyticsConfig(progressionDeps)]).then(([prog, analytics]) => {
      algorithms = [
        ...prog.algorithms.map((a): AlgoEntry => ({ ...a, family: "progression" })),
        ...analytics.plugins.map((a): AlgoEntry => ({ ...a, family: "analytics" })),
      ];
      algorithmsLoading = false;
    }).catch(() => { algorithmsLoading = false; });
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function sessionSummary(s: WorkoutSession): string {
    const end = s.endedAtMs ?? s.startedAtMs;
    const date = new Date(end).toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });
    const dur = s.endedAtMs ? ` · ${formatDuration(calcDuration(s.startedAtMs, s.endedAtMs))}` : "";
    const n = getExercises(s).length;
    return `${date}${dur} · ${n} exercise${n !== 1 ? "s" : ""}`;
  }

  const customExercises = $derived(($exercisesStore.items ?? []).filter((e) => !e.isCore));
  const selectedExercise = $derived(customExercises.find((e) => e.id === selectedExerciseId) ?? null);

  function selectPr(pr: PersonalRecord) {
    prExercise = pr.exerciseName;
    prWeight = String(pr.weight);
    prReps = String(pr.reps);
  }

  // ── Payload builders ─────────────────────────────────────────────────────────

  function buildPayload(): string | undefined {
    switch (attachmentType) {
      case "workout": {
        if (!selectedSession) return undefined;
        const exs = getExercises(selectedSession);
        const dur = selectedSession.endedAtMs
          ? calcDuration(selectedSession.startedAtMs, selectedSession.endedAtMs)
          : 0;
        return JSON.stringify({
          duration: dur,
          exercises: exs.map((ex) => ({ name: ex.exerciseName, sets: ex.sets.length })),
        });
      }
      case "pr": {
        if (!prExercise.trim()) return undefined;
        return JSON.stringify({
          exerciseName: prExercise.trim(),
          weight: Number(prWeight) || undefined,
          unit: "kg",
          reps: Number(prReps) || undefined,
        });
      }
      case "split": {
        if (!selectedSplit) return undefined;
        return JSON.stringify({
          name: selectedSplit.name,
          days: selectedSplit.days.map((d) => ({
            name: d.name,
            exercises: d.blocks
              .filter((b) => b.type === "strength")
              .map((b) => (b as { exerciseName: string }).exerciseName),
          })),
        });
      }
      case "exercise": {
        if (!selectedExercise) return undefined;
        return JSON.stringify({ name: selectedExercise.name, notes: selectedExercise.notes ?? undefined });
      }
      case "algorithm": {
        if (!selectedAlgo) return undefined;
        return JSON.stringify({
          id: selectedAlgo.id,
          name: selectedAlgo.name,
          family: selectedAlgo.family,
          description: selectedAlgo.description,
          author: selectedAlgo.author,
        });
      }
      case "widget": {
        const w = widgets.find((x) => x.id === selectedWidgetId);
        if (!w) return undefined;
        return JSON.stringify({ id: w.id, name: w.label, description: w.description });
      }
      default:
        return undefined;
    }
  }

  function resolvePostType(): PostType {
    const map: Record<AttachmentType, PostType> = {
      none: "Text",
      workout: "WorkoutSession",
      pr: "PersonalRecord",
      split: "Split",
      exercise: "Exercise",
      algorithm: "Algorithm",
      widget: "Widget",
    };
    return map[attachmentType];
  }

  const canSubmit = $derived(
    !submitting &&
    (body.trim().length > 0 || attachmentType !== "none") &&
    (attachmentType !== "workout" || selectedSession !== null) &&
    (attachmentType !== "pr" || prExercise.trim().length > 0) &&
    (attachmentType !== "split" || selectedSplit !== null) &&
    (attachmentType !== "exercise" || selectedExercise !== null) &&
    (attachmentType !== "algorithm" || selectedAlgo !== null) &&
    (attachmentType !== "widget" || selectedWidgetId !== null),
  );

  async function submit() {
    if (!canSubmit) return;
    submitting = true;
    error = null;
    try {
      const post = await socialApi.createPost(
        resolvePostType(),
        body.trim() || undefined,
        buildPayload(),
      );
      onposted?.(post);
      onclose();
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to post. Try again.";
    } finally {
      submitting = false;
    }
  }

  // ── Attachment type definitions ───────────────────────────────────────────────

  const ATTACHMENT_TYPES: { type: AttachmentType; label: string; icon: typeof MessageSquare }[] = [
    { type: "none",      label: "Text",      icon: MessageSquare },
    { type: "workout",   label: "Workout",   icon: Dumbbell },
    { type: "pr",        label: "PR",        icon: Trophy },
    { type: "split",     label: "Split",     icon: CalendarDays },
    { type: "exercise",  label: "Exercise",  icon: Activity },
    { type: "algorithm", label: "Algorithm", icon: Cpu },
    { type: "widget",    label: "Widget",    icon: LayoutDashboard },
  ];
</script>

{#if open}
  <!-- Backdrop -->
  <button
    type="button"
    aria-label="Close"
    class="fixed inset-0 z-50 bg-black/40"
    onclick={onclose}
  ></button>

  <!-- Sheet -->
  <div class="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-background rounded-t-xl max-h-[85dvh] pb-[env(safe-area-inset-bottom)]">

    <!-- Header -->
    <div class="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border shrink-0">
      <button type="button" class="p-1 -ml-1 text-muted-foreground" onclick={onclose}>
        <X class="h-5 w-5" />
      </button>
      <span class="text-sm font-semibold flex-1">New post</span>
      <button
        type="button"
        class="px-4 py-1.5 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        disabled={!canSubmit}
        onclick={() => void submit()}
      >
        {submitting ? "Posting…" : "Post"}
      </button>
    </div>

    <!-- Scrollable content -->
    <div class="flex flex-col gap-4 px-4 pt-4 overflow-y-auto flex-1">

      <!-- Text body -->
      <textarea
        rows={3}
        placeholder="What's on your mind?"
        class="w-full bg-transparent text-sm resize-none focus:outline-none placeholder:text-muted-foreground/60"
        bind:value={body}
      ></textarea>

      <!-- Attachment: collapsed by default so a plain post is the norm -->
      {#if !prefillSession && !showAttach && attachmentType === "none"}
        <button
          type="button"
          class="self-start flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded-full border border-border px-3 py-1.5 shrink-0"
          onclick={() => (showAttach = true)}
        >
          <Paperclip class="h-3 w-3" /> Attach a workout, PR, split…
        </button>
      {/if}

      <!-- Attachment type pills (hidden if prefill locks to workout) -->
      {#if !prefillSession && (showAttach || attachmentType !== "none")}
        <div class="flex gap-1.5 overflow-x-auto pb-1 shrink-0 -mx-4 px-4">
          {#each ATTACHMENT_TYPES as { type, label, icon: Icon } (type)}
            <button
              type="button"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs whitespace-nowrap transition-colors shrink-0
                {attachmentType === type
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-muted-foreground/50'}"
              onclick={() => {
                attachmentType = type;
                selectedSession = null;
                selectedSplit = null;
                selectedExerciseId = null;
                selectedAlgo = null;
                selectedWidgetId = null;
                error = null;
              }}
            >
              <Icon class="h-3 w-3" />
              {label}
            </button>
          {/each}
        </div>
      {/if}

      <!-- ── Workout picker ─────────────────────────────────────────────── -->
      {#if attachmentType === "workout"}
        {#if prefillSession}
          <div class="rounded border border-border bg-muted/30 px-3 py-2.5 flex items-center gap-3 shrink-0">
            <Dumbbell class="h-4 w-4 text-muted-foreground shrink-0" />
            <p class="text-xs text-muted-foreground">{sessionSummary(prefillSession)}</p>
          </div>
        {:else}
          <div class="flex flex-col gap-1.5 shrink-0">
            <p class="text-xs font-medium text-muted-foreground">Pick a workout</p>
            {#if sessionsLoading}
              <p class="text-xs text-muted-foreground py-2">Loading…</p>
            {:else if ($recentSessions ?? []).length === 0}
              <p class="text-xs text-muted-foreground py-2">No sessions recorded yet.</p>
            {:else}
              <ul class="flex flex-col gap-1 max-h-44 overflow-y-auto">
                {#each ($recentSessions ?? []) as s (s.id)}
                  <li>
                    <button type="button"
                      class="w-full text-left px-3 py-2 rounded border text-xs transition-colors
                        {selectedSession?.id === s.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-muted-foreground/50'}"
                      onclick={() => (selectedSession = s)}
                    >{sessionSummary(s)}</button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
      {/if}

      <!-- ── PR picker ──────────────────────────────────────────────────── -->
      {#if attachmentType === "pr"}
        <div class="flex flex-col gap-2 shrink-0">
          {#if prsLoading}
            <p class="text-xs text-muted-foreground py-2">Loading personal records…</p>
          {:else if prs.length > 0}
            <p class="text-xs font-medium text-muted-foreground">Pick a PR to share</p>
            <ul class="flex flex-col gap-1 max-h-36 overflow-y-auto">
              {#each prs as pr (pr.exerciseName)}
                <li>
                  <button type="button"
                    class="w-full text-left px-3 py-2 rounded border text-xs transition-colors
                      {prExercise === pr.exerciseName
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-muted-foreground/50'}"
                    onclick={() => selectPr(pr)}
                  >
                    <span class="font-medium">{pr.exerciseName}</span>
                    <span class="ml-2">{pr.weight} kg × {pr.reps}</span>
                  </button>
                </li>
              {/each}
            </ul>
            <p class="text-xs text-muted-foreground">Edit before posting if needed.</p>
          {/if}

          <!-- Always show editable fields (pre-filled if PR was selected) -->
          <input type="text" placeholder="Exercise name"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={prExercise} />
          <div class="grid grid-cols-2 gap-2">
            <div class="flex items-center rounded border bg-background overflow-hidden">
              <input type="number" min="0" inputmode="decimal" placeholder="Weight"
                class="flex-1 min-w-0 px-3 py-2 text-sm bg-transparent focus:outline-none"
                bind:value={prWeight} />
              <span class="pr-3 text-xs text-muted-foreground">kg</span>
            </div>
            <div class="flex items-center rounded border bg-background overflow-hidden">
              <input type="number" min="0" inputmode="numeric" placeholder="Reps"
                class="flex-1 min-w-0 px-3 py-2 text-sm bg-transparent focus:outline-none"
                bind:value={prReps} />
              <span class="pr-3 text-xs text-muted-foreground">reps</span>
            </div>
          </div>
        </div>
      {/if}

      <!-- ── Split picker ───────────────────────────────────────────────── -->
      {#if attachmentType === "split"}
        <div class="flex flex-col gap-1.5 shrink-0">
          <p class="text-xs font-medium text-muted-foreground">Pick a split</p>
          {#if splitsLoading}
            <p class="text-xs text-muted-foreground py-2">Loading…</p>
          {:else if ($splits ?? []).length === 0}
            <p class="text-xs text-muted-foreground py-2">No splits found. Create one in the app first.</p>
          {:else}
            <ul class="flex flex-col gap-1 max-h-44 overflow-y-auto">
              {#each ($splits ?? []) as split (split.id)}
                <li>
                  <button type="button"
                    class="w-full text-left px-3 py-2 rounded border text-xs transition-colors
                      {selectedSplit?.id === split.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-muted-foreground/50'}"
                    onclick={() => (selectedSplit = split)}
                  >
                    <span class="font-medium">{split.name}</span>
                    <span class="ml-2">{split.days.length} day{split.days.length !== 1 ? "s" : ""}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}

      <!-- ── Custom exercise picker ─────────────────────────────────────── -->
      {#if attachmentType === "exercise"}
        <div class="flex flex-col gap-1.5 shrink-0">
          <p class="text-xs font-medium text-muted-foreground">Pick a custom exercise</p>
          {#if exercisesLoading}
            <p class="text-xs text-muted-foreground py-2">Loading…</p>
          {:else if customExercises.length === 0}
            <p class="text-xs text-muted-foreground py-2">No custom exercises yet. Add one in the exercise library.</p>
          {:else}
            <ul class="flex flex-col gap-1 max-h-44 overflow-y-auto">
              {#each customExercises as ex (ex.id)}
                <li>
                  <button type="button"
                    class="w-full text-left px-3 py-2 rounded border text-xs transition-colors
                      {selectedExerciseId === ex.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-muted-foreground/50'}"
                    onclick={() => (selectedExerciseId = ex.id)}
                  >
                    <span class="font-medium">{ex.name}</span>
                    {#if ex.notes}<span class="ml-2 text-muted-foreground">{ex.notes}</span>{/if}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}

      <!-- ── Algorithm picker ───────────────────────────────────────────── -->
      {#if attachmentType === "algorithm"}
        <div class="flex flex-col gap-1.5 shrink-0">
          <p class="text-xs font-medium text-muted-foreground">Pick an algorithm</p>
          {#if algorithmsLoading}
            <p class="text-xs text-muted-foreground py-2">Loading…</p>
          {:else if algorithms.length === 0}
            <p class="text-xs text-muted-foreground py-2">No algorithms installed.</p>
          {:else}
            <ul class="flex flex-col gap-1 max-h-44 overflow-y-auto">
              {#each algorithms as algo (algo.id + algo.family)}
                <li>
                  <button type="button"
                    class="w-full text-left px-3 py-2 rounded border text-xs transition-colors
                      {selectedAlgo?.id === algo.id && selectedAlgo?.family === algo.family
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-muted-foreground/50'}"
                    onclick={() => (selectedAlgo = algo)}
                  >
                    <span class="font-medium">{algo.name}</span>
                    <span class="ml-2 capitalize text-muted-foreground">{algo.family}</span>
                    {#if algo.author}<span class="ml-1 text-muted-foreground/60">· {algo.author}</span>{/if}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}

      <!-- ── Widget picker ──────────────────────────────────────────────── -->
      {#if attachmentType === "widget"}
        <div class="flex flex-col gap-1.5 shrink-0">
          <p class="text-xs font-medium text-muted-foreground">Pick a widget</p>
          <ul class="flex flex-col gap-1">
            {#each widgets as w (w.id)}
              <li>
                <button type="button"
                  class="w-full text-left px-3 py-2 rounded border text-xs transition-colors
                    {selectedWidgetId === w.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-muted-foreground/50'}"
                  onclick={() => (selectedWidgetId = w.id)}
                >
                  <span class="font-medium">{w.label}</span>
                  <span class="ml-2">{w.description}</span>
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if error}
        <p class="text-xs text-destructive shrink-0">{error}</p>
      {/if}

      <div class="h-2 shrink-0"></div>
    </div>
  </div>
{/if}
