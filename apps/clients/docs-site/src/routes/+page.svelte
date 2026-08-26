<script lang="ts">
  import { Button } from "$lib/components/ui/button";
</script>

<div class="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-8">
  <div>
    <h1 class="text-2xl font-semibold mb-2">An open-source, offline-first workout tracker</h1>
    <p class="text-sm text-muted-foreground">
      Log workouts with no network required, define training splits or go freeform, and use
      plug-and-play progression algorithms to know what to lift next. Your data stays yours —
      run LogIt entirely on your phone, sync it through your own server, or let us host it.
    </p>
  </div>

  <div class="flex gap-2">
    <Button href="https://github.com/Martin-Melody/LogIt">View on GitHub</Button>
    <Button href="/self-hosting" variant="outline">Self-host it</Button>
  </div>

  <div class="flex flex-col gap-3 border-t border-border pt-6">
    <h2 class="text-base font-semibold">Two ways to run it</h2>
    <p class="text-sm text-muted-foreground">
      <strong class="text-foreground">Self-host, free.</strong> Run your own copy of the sync
      server and web dashboard with Docker Compose — see the
      <a href="/self-hosting" class="underline hover:text-foreground">self-hosting guide</a>.
      Your data never leaves infrastructure you control.
    </p>
    <p class="text-sm text-muted-foreground">
      <strong class="text-foreground">Managed hosting, paid.</strong> Don't want to run a server
      yourself? We host it for you — including, for personal trainers, a plan for managing
      clients' training data with their consent. That's a separate site from this one; this page
      is specifically about the open-source project and self-hosting it.
    </p>
  </div>

  <div class="flex flex-col gap-3 border-t border-border pt-6">
    <h2 class="text-base font-semibold">What's in the repo</h2>
    <ul class="text-sm text-muted-foreground list-disc pl-5 flex flex-col gap-1.5">
      <li>A Capacitor + SvelteKit mobile app (iOS/Android) — the primary way most people use LogIt</li>
      <li>A web dashboard for deeper analytics, once your data is synced to a server</li>
      <li>A .NET sync/social API you can self-host</li>
      <li>A plug-and-play progression algorithm system, open for anyone to extend</li>
    </ul>
  </div>

  <div class="border-t border-border pt-6 text-xs text-muted-foreground">
    LogIt is open source.
    <a href="https://github.com/Martin-Melody/LogIt" class="underline hover:text-foreground">
      Source, issues, and contributing on GitHub.
    </a>
  </div>
</div>
