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
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          trend. See whether your lifts trend better on the days you hit your targets, surfaced
          as a hypothesis with its own confidence, not a flat claim. Works offline.
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Algorithms</Card.Title>
          <Card.Description>Shows its reasoning, not just a verdict</Card.Description>
        </Card.Header>
        <Card.Content class="text-sm text-muted-foreground pt-1">
          Progression algorithms are pluggable — pick one from the registry or write your own.
          The built-in engine explains every suggestion, learns your personal volume and
          rep-range sweet spots per muscle group and exercise from your own training history,
          and tracks e1RM everywhere.
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Programs</Card.Title>
          <Card.Description>Or skip the engine entirely</Card.Description>
        </Card.Header>
        <Card.Content class="text-sm text-muted-foreground pt-1">
          Don't want to think about progression at all? Start from a built-in program —
          full-body, upper/lower, push/pull/legs, or a 5×5 strength template — and just follow
          the days. Switch to an algorithm, or a different program, whenever you want.
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
