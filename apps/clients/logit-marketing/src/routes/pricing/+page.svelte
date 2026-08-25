<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";

  // Placeholder prices — not real, finalized numbers. Set once actual pricing is decided.
  const PRO_PRICE_LABEL = "$X/mo";
  const STUDIO_PRICE_LABEL = "$Y/mo"; // higher than Pro — set once actual pricing is decided
</script>

<div class="max-w-3xl mx-auto px-4 py-12 flex flex-col gap-8">
  <div class="text-center flex flex-col gap-2">
    <h1 class="text-2xl font-semibold">Pricing</h1>
    <p class="text-sm text-muted-foreground">Self-host for free, or let us run it for you.</p>
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <Card.Root>
      <Card.Header>
        <Card.Title>Free</Card.Title>
        <Card.Description>Self-host, or a limited online account</Card.Description>
      </Card.Header>
      <Card.Content class="flex flex-col gap-3 pt-1">
        <p class="text-2xl font-semibold">$0</p>
        <ul class="text-sm text-muted-foreground flex flex-col gap-1.5">
          <li>· Full app, no feature limits</li>
          <li>· Your own server, your own data</li>
          <li>· One command: <code class="text-xs bg-muted px-1 py-0.5 rounded">docker compose up</code></li>
        </ul>
        <!-- TODO: link to the real GitHub repo once it's public -->
        <p class="text-xs text-muted-foreground">Instructions are in the project's README.</p>

        <div class="border-t border-border pt-3 mt-1">
          <p class="text-xs text-muted-foreground">
            Just want the social feed on your phone, no server to run? Create a free online
            account instead — mobile app only, no sync, web dashboard, or analytics.
          </p>
          <Button href="/signup" variant="outline" class="w-full mt-2">Sign up free</Button>
        </div>
      </Card.Content>
    </Card.Root>

    <Card.Root class="border-primary">
      <Card.Header>
        <Card.Title>Pro — managed hosting</Card.Title>
        <Card.Description>We run it for you</Card.Description>
      </Card.Header>
      <Card.Content class="flex flex-col gap-3 pt-1">
        <p class="text-2xl font-semibold">{PRO_PRICE_LABEL}</p>
        <ul class="text-sm text-muted-foreground flex flex-col gap-1.5">
          <li>· No server to run or maintain</li>
          <li>· Cloud sync across devices</li>
          <li>· Same app, same data model</li>
        </ul>
        <Button href="/signup?plan=pro" class="mt-2">Get started</Button>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header>
        <Card.Title>Studio — for trainers</Card.Title>
        <Card.Description>Manage clients, not just yourself</Card.Description>
      </Card.Header>
      <Card.Content class="flex flex-col gap-3 pt-1">
        <p class="text-2xl font-semibold">{STUDIO_PRICE_LABEL}</p>
        <ul class="text-sm text-muted-foreground flex flex-col gap-1.5">
          <li>· Everything in Pro</li>
          <li>· Invite clients and view their training data</li>
          <li>· Nothing is visible until a client accepts your invite</li>
        </ul>
        <Button href="/signup?plan=studio" class="mt-2">Get started</Button>
      </Card.Content>
    </Card.Root>
  </div>
</div>
