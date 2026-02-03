<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";

  import type { WorkoutSession } from "$lib/domain/workout";
  import { getTopSetHighlight } from "$lib/domain/workout";
  import { durationMs, formatDuration } from "$lib/domain/time";
  import { getSession } from "$lib/usecases/getSession";
  import { Trash } from "lucide-svelte";
  import { deleteSession } from "$lib/usecases/deleteSession";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";

  const props = $props<{ params: { id: string } }>();

  const state = $state({
    loading: true,
    error: null as string | null,
    session: null as WorkoutSession | null,
    deleting: false,
  });

  function dateLabelFromMs(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  async function deleteThisSession() {
    if (!id) return;

    state.deleting = true;
    state.error = null;

    try {
      await deleteSession(id);

      back();
    } catch (e) {
      state.error = e instanceof Error ? e.message : "Failed to delete session";
    } finally {
      state.deleting = false;
    }
  }

  function sortByOrderIndex(
    a: { orderIndex: number },
    b: { orderIndex: number },
  ) {
    return a.orderIndex - b.orderIndex;
  }

  function countSets(session: WorkoutSession): number {
    return session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  }

  function totalVolumeKg(session: WorkoutSession): number {
    let total = 0;
    for (const ex of session.exercises) {
      for (const s of ex.sets) {
        const reps = Number.isFinite(s.reps) ? s.reps : 0;
        const weight = Number.isFinite(s.weight) ? s.weight : 0;
        total += reps * weight;
      }
    }
    return total;
  }

  const id = $derived(props.params.id);

  const ended = $derived(
    state.session?.endedAtMs ?? state.session?.startedAtMs ?? null,
  );

  const durationLabel = $derived(
    state.session?.endedAtMs && state.session?.startedAtMs
      ? formatDuration(
          durationMs(state.session.startedAtMs, state.session.endedAtMs),
        )
      : "—",
  );

  const top = $derived(
    state.session ? getTopSetHighlight(state.session) : null,
  );

  async function load() {
    try {
      state.loading = true;
      state.error = null;
      state.session = await getSession(id);
    } catch (e) {
      state.error = e instanceof Error ? e.message : "Failed to load session";
      state.session = null;
    } finally {
      state.loading = false;
    }
  }

  onMount(() => {
    void load();
  });

  // Reload if the route param changes without remounting
  $effect(() => {
    id;
    void load();
  });

  function back() {
    void goto("/sessions");
  }
</script>

<div class="p-3 flex flex-col gap-3 pb-24">
  <Card.Root class="w-full">
    <Card.Header class="flex justify-between">
      <div>
        <Card.Title>Session</Card.Title>
        <Card.Description>
          {state.session && ended ? dateLabelFromMs(ended) : ""}
        </Card.Description>
      </div>
      <div>
        <ConfirmDialog
          title="Delete this session?"
          description="This will permanently delete the session. This action cannot be undone."
          confirmLabel="Delete session"
          cancelLabel="Cancel"
          saving={state.deleting}
          onConfirm={deleteThisSession}
        >
          <Button
            variant="destructive"
            size="icon"
            disabled={state.loading || !state.session || state.deleting}
            aria-label="Delete session"
          >
            <Trash />
          </Button>
        </ConfirmDialog>
      </div>
    </Card.Header>

    <Card.Content class="flex flex-col gap-3">
      {#if state.loading}
        <p class="text-sm text-muted-foreground">Loading…</p>
      {:else if state.error}
        <p class="text-sm text-destructive">{state.error}</p>
      {:else if !state.session}
        <p class="text-sm text-muted-foreground">Session not found.</p>
      {:else}
        <!-- Summary / highlights -->
        <div class="rounded-lg border p-3 flex flex-col gap-2">
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span class="text-muted-foreground">Duration:</span>
            <span>{durationLabel}</span>

            <span class="text-muted-foreground">Exercises:</span>
            <span>{state.session.exercises.length}</span>

            <span class="text-muted-foreground">Sets:</span>
            <span>{countSets(state.session)}</span>
          </div>

          <div class="flex flex-wrap gap-2 text-sm">
            <span class="text-muted-foreground">Top set:</span>
            <span>
              {#if top}
                {top.exerciseName} — {top.reps}×{top.weight}kg
              {:else}
                —
              {/if}
            </span>
          </div>

          <div class="flex flex-wrap gap-2 text-sm">
            <span class="text-muted-foreground">Total volume:</span>
            <span>{totalVolumeKg(state.session).toLocaleString()} kg</span>
          </div>
        </div>

        <!-- Workout details (read-only) -->
        {#if state.session.exercises.length === 0}
          <p class="text-sm text-muted-foreground">No exercises recorded.</p>
        {:else}
          <div class="flex flex-col gap-2">
            {#each [...state.session.exercises].sort(sortByOrderIndex) as ex (ex.id)}
              <div class="rounded-lg border p-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium truncate">
                      {ex.exerciseName}
                    </p>
                    <p class="text-xs text-muted-foreground">
                      {ex.sets.length} set{ex.sets.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>

                {#if ex.sets.length > 0}
                  <div class="mt-3 flex flex-col gap-2">
                    {#each [...ex.sets].sort(sortByOrderIndex) as set, i (set.id)}
                      <div class="flex items-center justify-between text-sm">
                        <span class="text-muted-foreground">
                          Set {i + 1}{set.setType ? ` · ${set.setType}` : ""}
                        </span>
                        <span>{set.reps}×{set.weight}kg</span>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <p class="mt-2 text-sm text-muted-foreground">No sets.</p>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </Card.Content>

    <Card.Footer class="pt-2 flex gap-2">
      <Button variant="outline" onclick={back}>Back</Button>
    </Card.Footer>
  </Card.Root>
</div>
