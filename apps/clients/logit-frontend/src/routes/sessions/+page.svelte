<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";

  import { recentSessions } from "$lib/stores/recentSessions.store";
  import { durationMs, formatDuration } from "$lib/domain/time";
  import { getTopSetHighlight, type SessionSummary } from "$lib/domain/workout";

  let loading = true;
  let error: string | null = null;

  function dateLabelFromMs(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  }

  function toSummary(session: any): SessionSummary {
    const ended = session.endedAtMs ?? session.startedAtMs;
    const dur = session.endedAtMs
      ? durationMs(session.startedAtMs, session.endedAtMs)
      : 0;

    const top = getTopSetHighlight(session);

    return {
      id: session.id,
      dateLabel: dateLabelFromMs(ended),
      durationLabel: session.endedAtMs ? formatDuration(dur) : "In progress",
      topSetLabel: top
        ? `${top.exerciseName} — ${top.reps}×${top.weight}kg`
        : "—",
    };
  }

  $: summaries = ($recentSessions ?? []).map(toSummary);

  onMount(async () => {
    try {
      loading = true;
      error = null;

      await recentSessions.refresh(50);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load sessions";
    } finally {
      loading = false;
    }
  });

  function openSession(id: string) {
    void goto(`/sessions/${id}`);
  }
</script>

<div class="p-3">
  <Card.Root class="w-full">
    <Card.Header>
      <Card.Title>Sessions</Card.Title>
      <Card.Description>Your workout history.</Card.Description>
    </Card.Header>

    <Card.Content class="flex flex-col gap-3">
      {#if loading}
        <p class="text-sm text-muted-foreground">Loading…</p>
      {:else if error}
        <p class="text-sm text-destructive">{error}</p>
        <Button
          variant="outline"
          onclick={() => void recentSessions.refresh(50)}
        >
          Retry
        </Button>
      {:else if summaries.length === 0}
        <p class="text-sm text-muted-foreground">No sessions yet.</p>
      {:else}
        <ul class="flex flex-col gap-2">
          {#each summaries as s (s.id)}
            <li class="rounded-lg border p-3">
              <button
                type="button"
                class="text-left w-full"
                on:click={() => openSession(s.id)}
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <p class="text-sm font-medium">{s.dateLabel}</p>
                    <span class="text-xs text-muted-foreground">•</span>
                    <p class="text-xs text-muted-foreground">
                      {s.durationLabel}
                    </p>
                  </div>
                </div>

                <p class="mt-1 text-sm text-muted-foreground">
                  Top set: <span class="text-foreground">{s.topSetLabel}</span>
                </p>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </Card.Content>
  </Card.Root>
</div>
