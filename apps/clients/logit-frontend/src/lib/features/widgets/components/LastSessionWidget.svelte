<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { recentSessions } from "$lib/stores/recentSessions.store";
  import { durationMs, formatDuration } from "$lib/domain/time";
  import { getTopSetHighlight, getExercises } from "$lib/domain/workout";

  onMount(() => { void recentSessions.refresh(5); });

  function label(ms: number) {
    return new Date(ms).toLocaleDateString(undefined, {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  }

  const summaries = $derived(
    $recentSessions.map((s) => {
      const dur = s.endedAtMs ? durationMs(s.startedAtMs, s.endedAtMs) : 0;
      const top = getTopSetHighlight(s);
      return {
        id: s.id,
        dateLabel: label(s.endedAtMs ?? s.startedAtMs),
        durationLabel: s.endedAtMs ? formatDuration(dur) : "In progress",
        topSet: top ? `${top.exerciseName} ${top.reps}×${top.weight}kg` : null,
        exerciseCount: getExercises(s).length,
      };
    }),
  );
</script>

<Card.Root>
  <Card.Header>
    <div class="flex items-center justify-between gap-2">
      <Card.Title>Recent sessions</Card.Title>
      <Button variant="ghost" class="h-7 px-2 text-xs shrink-0" onclick={() => void goto("/sessions")}>
        All
      </Button>
    </div>
  </Card.Header>

  <Card.Content>
    {#if summaries.length === 0}
      <p class="text-sm text-muted-foreground">No sessions yet.</p>
    {:else}
      <ul class="flex flex-col divide-y divide-border">
        {#each summaries.slice(0, 4) as s (s.id)}
          <li>
            <button
              type="button"
              class="w-full text-left py-2 flex items-center justify-between gap-3"
              onclick={() => void goto(`/sessions/${s.id}`)}
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium">{s.dateLabel}</span>
                  <span class="text-xs text-muted-foreground">{s.durationLabel}</span>
                </div>
                {#if s.topSet}
                  <p class="text-xs text-muted-foreground truncate mt-0.5">Top: {s.topSet}</p>
                {:else}
                  <p class="text-xs text-muted-foreground mt-0.5">{s.exerciseCount} exercise{s.exerciseCount === 1 ? "" : "s"}</p>
                {/if}
              </div>
              <span class="text-muted-foreground text-xs shrink-0">›</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </Card.Content>
</Card.Root>
