<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
</script>

<div class="max-w-3xl mx-auto px-4 py-16 flex flex-col gap-10">
  <div class="flex flex-col gap-4">
    <h1 class="text-3xl font-semibold">Track your training. Own your data.</h1>
    <p class="text-muted-foreground">
      LogIt is an open-source, offline-first workout tracker. Log sessions, run your own
      progression algorithms, and see your training data on the web — all without an account.
    </p>
    <div class="flex gap-2">
      <Button href="/pricing">See pricing</Button>
    </div>
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <Card.Root>
      <Card.Header>
        <Card.Title>Self-host, free</Card.Title>
        <Card.Description>Run your own instance</Card.Description>
      </Card.Header>
      <Card.Content class="text-sm text-muted-foreground pt-1">
        LogIt's server is a single Docker Compose stack. Run it on your own hardware, keep
        every byte of your training data, pay nothing.
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
