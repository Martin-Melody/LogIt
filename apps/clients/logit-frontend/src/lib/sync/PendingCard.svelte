<script lang="ts">
  import * as Card from "$lib/components/ui/card";
  import type { FirstDownload } from "./firstDownload";

  /**
   * Stands in for a Home card while the account's data hasn't arrived: grey placeholder lines
   * while it downloads, a plain line if the server couldn't be reached. Never the card's own
   * empty state ("No sessions yet"), which would read as if the training were gone.
   */
  const { title, status }: { title: string; status: Exclude<FirstDownload, null> } = $props();
</script>

<Card.Root class="w-full" aria-busy={status === "loading"} data-testid="pending-card">
  <Card.Header class="pb-2">
    <Card.Title class="text-base">{title}</Card.Title>
  </Card.Header>
  <Card.Content class="flex flex-col gap-2.5">
    {#if status === "loading"}
      <span class="h-3.5 w-4/5 animate-pulse rounded-md bg-muted"></span>
      <span class="h-3.5 w-3/5 animate-pulse rounded-md bg-muted"></span>
      <span class="h-3.5 w-2/3 animate-pulse rounded-md bg-muted"></span>
    {:else}
      <p class="text-sm text-muted-foreground">Shows once your training has downloaded.</p>
    {/if}
  </Card.Content>
</Card.Root>
