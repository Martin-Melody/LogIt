<script lang="ts">
  import { onMount } from "svelte";
  import { back } from "$lib/navigation";

  import type { WorkoutSession } from "$lib/domain/workout";
  import { durationMs, formatDuration } from "$lib/domain/time";
  import { getSession } from "$lib/usecases/getSession";
  import { deleteSession } from "$lib/usecases/deleteSession";
  import { Trash, ArrowLeft } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";

  const props = $props<{ params: { id: string } }>();
  const id = $derived(props.params.id);

  const state = $state({
    loading: true,
    error: null as string | null,
    session: null as WorkoutSession | null,
    deleting: false,
  });

  function longDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function sortByOrder(a: { orderIndex: number }, b: { orderIndex: number }) {
    return a.orderIndex - b.orderIndex;
  }

  function countSets(s: WorkoutSession): number {
    return s.exercises.reduce((n, ex) => n + ex.sets.length, 0);
  }

  function totalVolume(s: WorkoutSession): number {
    let v = 0;
    for (const ex of s.exercises)
      for (const set of ex.sets)
        v += (Number.isFinite(set.reps) ? set.reps : 0) * (Number.isFinite(set.weight) ? set.weight : 0);
    return v;
  }

  const ended = $derived(state.session?.endedAtMs ?? state.session?.startedAtMs ?? null);

  const durationLabel = $derived(
    state.session?.endedAtMs && state.session?.startedAtMs
      ? formatDuration(durationMs(state.session.startedAtMs, state.session.endedAtMs))
      : null,
  );

  async function load() {
    state.loading = true;
    state.error = null;
    try {
      state.session = await getSession(id);
    } catch (e) {
      state.error = e instanceof Error ? e.message : "Failed to load session";
      state.session = null;
    } finally {
      state.loading = false;
    }
  }

  async function deleteThisSession() {
    if (!id) return;
    state.deleting = true;
    state.error = null;
    try {
      await deleteSession(id);
      back("/sessions");
    } catch (e) {
      state.error = e instanceof Error ? e.message : "Failed to delete session";
    } finally {
      state.deleting = false;
    }
  }

  onMount(() => { void load(); });
  $effect(() => { id; void load(); });
</script>

<div class="flex flex-col pb-24">
  <!-- Header -->
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={() => back("/sessions")}>
      <ArrowLeft class="h-4 w-4" />
    </Button>

    <div class="flex-1 min-w-0">
      <span class="text-sm font-semibold">
        {ended ? longDate(ended) : "Session"}
      </span>
    </div>

    <ConfirmDialog
      title="Delete this session?"
      description="Permanently removes this session. Cannot be undone."
      confirmLabel="Delete"
      cancelLabel="Cancel"
      saving={state.deleting}
      onConfirm={deleteThisSession}
    >
      {#snippet child({ props })}
        <Button
          {...props}
          variant="ghost"
          size="icon"
          class="h-7 w-7 text-muted-foreground hover:text-destructive"
          disabled={state.loading || !state.session || state.deleting}
          aria-label="Delete session"
        >
          <Trash class="h-3.5 w-3.5" />
        </Button>
      {/snippet}
    </ConfirmDialog>
  </div>

  {#if state.error}
    <p class="px-3 py-2 text-sm text-destructive border-b border-border">{state.error}</p>
  {/if}

  {#if state.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if !state.session}
    <p class="px-3 py-4 text-sm text-muted-foreground">Session not found.</p>
  {:else}
    <!-- Stats strip -->
    <div class="flex items-center gap-3 px-3 py-2 border-b border-border text-xs text-muted-foreground flex-wrap">
      {#if durationLabel}
        <span>{durationLabel}</span>
        <span>·</span>
      {/if}
      <span>{state.session.exercises.length} exercise{state.session.exercises.length === 1 ? "" : "s"}</span>
      <span>·</span>
      <span>{countSets(state.session)} sets</span>
      <span>·</span>
      <span>{totalVolume(state.session).toLocaleString()} kg</span>
    </div>

    <!-- Exercises -->
    {#if state.session.exercises.length === 0}
      <p class="px-3 py-6 text-sm text-muted-foreground text-center">No exercises recorded.</p>
    {:else}
      {#each [...state.session.exercises].sort(sortByOrder) as ex (ex.id)}
        <!-- Exercise section header -->
        <div class="border-t border-border bg-muted/20 px-3 py-2 flex items-center justify-between gap-3">
          <span class="text-sm font-semibold truncate">{ex.exerciseName}</span>
          <span class="text-xs text-muted-foreground shrink-0">
            {ex.sets.length} set{ex.sets.length === 1 ? "" : "s"}
          </span>
        </div>

        {#if ex.sets.length > 0}
          <!-- Column headers -->
          <div class="grid grid-cols-[2rem_1fr_1fr] gap-2 px-3 py-1 text-xs text-muted-foreground border-b border-border">
            <span>#</span>
            <span>Reps</span>
            <span>Weight</span>
          </div>

          {#each [...ex.sets].sort(sortByOrder) as set, i (set.id)}
            <div class="grid grid-cols-[2rem_1fr_1fr] gap-2 items-center px-3 py-1.5 border-b border-border/50">
              <span class="text-xs text-muted-foreground">
                {#if set.setType && set.setType !== "normal"}
                  <span class="font-medium text-foreground">{set.setType.slice(0, 1).toUpperCase()}</span>
                {:else}
                  {i + 1}
                {/if}
              </span>
              <span class="text-sm tabular-nums">{set.reps}</span>
              <span class="text-sm tabular-nums">{set.weight} kg</span>
            </div>
          {/each}
        {/if}
      {/each}
    {/if}
  {/if}
</div>
