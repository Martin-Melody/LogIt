<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ChevronRight } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { activeSplit } from "$lib/stores/activeSplit.store";

  onMount(() => { void activeSplit.load(); });

  const split = $derived($activeSplit);
</script>

<Card.Root>
  <Card.Header>
    <Card.Title class="text-sm">Active Split</Card.Title>
    {#if split}
      <Card.Action>
        <button
          type="button"
          class="text-xs text-muted-foreground hover:text-foreground"
          onclick={() => void goto(`/splits/${split.id}`)}
        >
          <ChevronRight class="h-4 w-4" />
        </button>
      </Card.Action>
    {/if}
  </Card.Header>

  <Card.Content>
    {#if split}
      <p class="text-sm font-medium">{split.name}</p>
      {#if split.days.length > 0}
        <ul class="mt-2 flex flex-col gap-1">
          {#each split.days as day (day.id)}
            <li class="flex items-center justify-between text-xs">
              <span class="text-muted-foreground">{day.name ?? `Day ${day.orderIndex + 1}`}</span>
              <span class="text-right text-foreground/70">
                {(() => {
                  const names = day.blocks.flatMap(b => b.type === 'strength' ? [b.exerciseName] : []);
                  return names.slice(0, 3).join(", ") + (names.length > 3 ? "…" : "");
                })()}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      <p class="text-sm text-muted-foreground">No active split. <button type="button" class="underline" onclick={() => void goto("/splits")}>Set one up</button></p>
    {/if}
  </Card.Content>
</Card.Root>
