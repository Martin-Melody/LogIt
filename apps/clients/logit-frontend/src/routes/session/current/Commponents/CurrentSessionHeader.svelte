<script lang="ts">
  import * as Card from "$lib/components/ui/card";
  import { formatShortDate } from "$lib/utils";

  export let subtitle: string | null = null;
  export let description = "Log sets as you go.";
  export let error: string | null = null;
  export let date: Date | string | null = null;

  const formattedDate = date
    ? formatShortDate(date)
    : formatShortDate(new Date());
</script>

<Card.Root class="w-full pb-1 pl-1 shadow-none border-none">
  <Card.Header class="px-1">
    <div class="flex mx-0 flex-col gap-0.5">
      {#if subtitle}
        <Card.Title>{subtitle}</Card.Title>
      {:else}
        <Card.Title>Current Workout</Card.Title>
      {/if}

      <Card.Description class="flex flex-col gap-1">
        <span>{description}</span>
        <span class="text-muted-foreground text-xs">
          {formattedDate}
        </span>
      </Card.Description>
    </div>
  </Card.Header>

  {#if error}
    <Card.Content class="pt-0">
      <p class="text-sm text-destructive">{error}</p>
    </Card.Content>
  {/if}
</Card.Root>
