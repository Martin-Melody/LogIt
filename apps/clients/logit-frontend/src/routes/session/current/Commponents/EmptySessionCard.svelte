<script lang="ts">
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Plus } from "lucide-svelte";

  export let onAddExercise: () => void | Promise<void> = () => {};
</script>

<Card.Root
  class="w-full rounded-none py-1 px-1 shadow-none border-x-0 border-t border-b ring-0 outline-none"
>
  <Card.Header class="pb-1 px-0">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <Card.Title class="text-base truncate">No exercises yet</Card.Title>
        <Card.Description>
          Add your first exercise to begin logging.
        </Card.Description>
      </div>

      <div class="flex items-center gap-1">
        <Button
          size="icon"
          variant="outline"
          aria-label="Add exercise"
          onclick={() => void onAddExercise()}
        >
          <Plus class="h-4 w-4" />
        </Button>
      </div>
    </div>
  </Card.Header>
</Card.Root>
