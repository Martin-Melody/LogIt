<!-- Clients › Sandbox: add the sample clients, reset them to their starting history, or remove them. -->
<script lang="ts">
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Button } from "$lib/components/ui/button";
  import { practice, sandbox } from "./sandbox.svelte";

  let confirmRemove = $state(false);
</script>

{#if sandbox.loaded && sandbox.on && !practice.on}
  <!-- Practice view is off: the samples are out of sight, one switch away (V2). -->
  <section class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm"
    aria-label="Sample clients" data-guide="clients-sandbox">
    <span>Your {sandbox.clients.length} sample clients are in Practice view.</span>
    <Button variant="outline" size="sm" onclick={() => practice.set(true)}>Open Practice view</Button>
  </section>
{:else if sandbox.loaded}
  <section class="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4 {sandbox.on ? 'border-info/30' : 'border-border'}"
    aria-labelledby="sandbox-title" data-guide="clients-sandbox">
    <div class="min-w-0 flex-[1_1_380px]">
      <h2 id="sandbox-title" class="text-sm font-semibold">
        {sandbox.on ? `Sandbox: ${sandbox.clients.length} sample clients` : "Sandbox"}
      </h2>
      <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
        {#if sandbox.on}
          Try a program, a check-in form or a swap rule on them before a real client sees it. They react on their own, and they stay until you remove them.
        {:else}
          Add three sample clients to try things on. They get four weeks of history and act on their own. They never count as clients and nobody else sees them.
        {/if}
      </p>
      {#if sandbox.error}<p class="mt-1 text-sm text-destructive" role="alert">{sandbox.error}</p>{/if}
    </div>
    <div class="flex flex-wrap gap-2">
      {#if sandbox.on}
        <Button variant="outline" disabled={sandbox.busy} onclick={() => sandbox.reset()}>{sandbox.busy ? "Working…" : "Reset to fresh"}</Button>
        <Button variant="outline" disabled={sandbox.busy} onclick={() => (confirmRemove = true)}>Remove</Button>
      {:else}
        <Button disabled={sandbox.busy} onclick={() => sandbox.add()}>{sandbox.busy ? "Adding…" : "Add sample clients"}</Button>
      {/if}
    </div>
  </section>

  <AlertDialog.Root bind:open={confirmRemove}>
    <AlertDialog.Content>
      <AlertDialog.Header>
        <AlertDialog.Title>Remove the sample clients?</AlertDialog.Title>
        <AlertDialog.Description>
          Niamh, Conor and Dara go, with their workouts, food, check-ins, messages and their copies of your programs.
          Your programs, check-in forms and invite links stay. You can add the sample clients back any time.
        </AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel>Keep them</AlertDialog.Cancel>
        <AlertDialog.Action onclick={() => { confirmRemove = false; void sandbox.remove(); }}>Remove sample clients</AlertDialog.Action>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
{/if}
