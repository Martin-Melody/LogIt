<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
</script>

<div class="max-w-3xl mx-auto px-4 py-16 flex flex-col gap-10">
  <div class="flex flex-col gap-4">
    <h1 class="text-3xl font-semibold">Track your training and your nutrition. Own your data.</h1>
    <p class="text-muted-foreground">
      LogIt is an open-source, offline-first training and nutrition tracker. Log workouts and
      meals, run your own progression and macro algorithms, and see everything on the web —
      all without an account.
    </p>
    <div class="flex gap-2">
      <Button href="/pricing">See pricing</Button>
    </div>
  </div>

  <div class="flex flex-col gap-4">
    <h2 class="text-lg font-semibold">What you get</h2>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card.Root>
        <Card.Header>
          <Card.Title>Training</Card.Title>
          <Card.Description>Log it your way</Card.Description>
        </Card.Header>
        <Card.Content class="text-sm text-muted-foreground pt-1">
          Log sessions freeform or from a split you define. Plate math, supersets, RPE, rest
          timers, full history and progress charts.
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Nutrition</Card.Title>
          <Card.Description>Food, macros, bodyweight</Card.Description>
        </Card.Header>
        <Card.Content class="text-sm text-muted-foreground pt-1">
          Log food against a bundled database of 250,000+ foods — barcode scan, nutrition-label
          scan, recipes and saved meals. Calorie and macro targets that adapt to your weight
          trend. Works offline.
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Algorithms</Card.Title>
          <Card.Description>Plug and play</Card.Description>
        </Card.Header>
        <Card.Content class="text-sm text-muted-foreground pt-1">
          Progression and adaptive-macro algorithms are pluggable. Pick one from the registry
          or write your own — it reads your history and gives you the next target.
        </Card.Content>
      </Card.Root>
    </div>
  </div>

  <div class="flex flex-col gap-4">
    <h2 class="text-lg font-semibold">How it's hosted</h2>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card.Root>
        <Card.Header>
          <Card.Title>Self-host, free</Card.Title>
          <Card.Description>Run your own instance</Card.Description>
        </Card.Header>
        <Card.Content class="text-sm text-muted-foreground pt-1">
          LogIt's server is a single Docker Compose stack. Run it on your own hardware, keep
          every byte of your training and nutrition data, pay nothing.
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Or let us host it</Card.Title>
          <Card.Description>Managed cloud, like Bitwarden</Card.Description>
        </Card.Header>
        <Card.Content class="text-sm text-muted-foreground pt-1">
          Don't want to run a server? Pay for a managed LogIt Cloud account — same app, same
          data model, we handle the uptime.
        </Card.Content>
      </Card.Root>
    </div>
  </div>
</div>
