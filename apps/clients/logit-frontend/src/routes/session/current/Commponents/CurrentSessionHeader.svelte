<script lang="ts">
  import * as Card from "$lib/components/ui/card";

  export let title = "Current Session";
  export let description = "Log sets as you go.";
  export let saving = false;
  export let error: string | null = null;
</script>

<Card.Root class="w-full">
  <Card.Header>
    <div class="flex items-center justify-center gap-3">
      <div>
        <Card.Title>{title}</Card.Title>
        <Card.Description>
          {#if saving}
            Saving…
          {:else}
            {description}
          {/if}
        </Card.Description>
      </div>
    </div>
  </Card.Header>

  {#if error}
    <Card.Content class="pt-0">
      <p class="text-sm text-destructive">{error}</p>
    </Card.Content>
  {/if}
</Card.Root>
