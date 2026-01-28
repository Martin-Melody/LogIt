<script lang="ts">
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";

  export let onAddExercise: () => void | Promise<void> = () => {};
</script>

<Card.Root class="w-full">
  <Card.Header>
    <Card.Title>No exercises yet</Card.Title>
    <Card.Description
      >Add your first exercise to begin logging.</Card.Description
    >
  </Card.Header>

  <Card.Content>
    <Button onclick={() => void onAddExercise()}>Add exercise</Button>
  </Card.Content>
</Card.Root>
