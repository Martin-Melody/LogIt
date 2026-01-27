<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";

  import type { WorkoutSession } from "$lib/domain/workout";
  import { getTopSetHighlight } from "$lib/domain/workout";
  import { durationMs, formatDuration } from "$lib/domain/time";
  import { getSession } from "$lib/usecases/getSession";

  const props = $props<{ params: { id: string } }>();

  const state = $state({
    loading: true,
    error: null as string | null,
    session: null as WorkoutSession | null,
  });

  function dateLabelFromMs(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
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

<div class="p-3">
  <Card.Root class="w-full">
    <Card.Header>
      <Card.Title>Session</Card.Title>
      <Card.Description>
        {state.session && ended ? dateLabelFromMs(ended) : ""}
      </Card.Description>
    </Card.Header>

    <Card.Content class="flex flex-col gap-3">
      {#if state.loading}
        <p class="text-sm text-muted-foreground">Loading…</p>
      {:else if state.error}
        <p class="text-sm text-destructive">{state.error}</p>
      {:else if !state.session}
        <p class="text-sm text-muted-foreground">Session not found.</p>
      {:else}
        <div class="rounded-lg border p-3">
          <p class="text-sm">
            <span class="text-muted-foreground">Duration:</span>
            <span class="ml-2">{durationLabel}</span>
          </p>

          <p class="mt-2 text-sm">
            <span class="text-muted-foreground">Top set:</span>
            <span class="ml-2">
              {#if top}
                {top.exerciseName} — {top.reps}×{top.weight}kg
              {:else}
                —
              {/if}
            </span>
          </p>
        </div>

        <pre class="rounded border p-3 text-xs overflow-auto">
{JSON.stringify(state.session, null, 2)}
        </pre>
      {/if}
    </Card.Content>

    <Card.Footer class="pt-2 flex gap-2">
      <Button variant="outline" onclick={back}>Back</Button>
    </Card.Footer>
  </Card.Root>
</div>
