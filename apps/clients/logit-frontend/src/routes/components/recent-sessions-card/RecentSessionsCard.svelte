<script context="module">
</script>

<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import type { SessionSummary } from "$lib/domain/workout";

  export let sessions: SessionSummary[] = [];

  export let onOpen: (id: string) => void = () => {};
  export let onRepeat: (id: string) => void = () => {};
  export let onViewAll: () => void = () => {};
</script>

<Card.Root class="w-full">
  <Card.Header>
    <Card.Title>Recent</Card.Title>
    <Card.Description>Jump back in with a repeat.</Card.Description>
  </Card.Header>

  <Card.Content class="flex flex-col gap-3">
    {#if sessions.length === 0}
      <p class="text-sm text-muted-foreground">
        No workouts yet. Your recent sessions will show up here.
      </p>
    {:else}
      <ul class="flex flex-col gap-2">
        {#each sessions.slice(0, 3) as s (s.id)}
          <li class="rounded-lg border p-3">
            <div class="flex items-start justify-between gap-3">
              <button
                type="button"
                class="text-left flex-1"
                on:click={() => onOpen(s.id)}
              >
                <div class="flex items-center gap-2">
                  <p class="text-sm font-medium">{s.dateLabel}</p>
                  <span class="text-xs text-muted-foreground">•</span>
                  <p class="text-xs text-muted-foreground">{s.durationLabel}</p>
                </div>

                <p class="mt-1 text-sm text-muted-foreground">
                  Top set: <span class="text-foreground">{s.topSetLabel}</span>
                </p>
              </button>

              <Button
                size="sm"
                variant="outline"
                class="shrink-0"
                onclick={() => onRepeat(s.id)}
              >
                Repeat
              </Button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </Card.Content>

  {#if sessions.length > 0}
    <Card.Footer class="pt-2">
      <Button variant="link" class="h-auto p-0 text-sm" onclick={onViewAll}>
        View all sessions
      </Button>
    </Card.Footer>
  {/if}
</Card.Root>
