<!-- The sample clients on Clients (canvas V2). In Practice view: reset them to their starting
     four weeks, or remove them, inside Practice view rather than mixed into the real list. With
     Practice view off: one line saying they're there. No samples yet: add them. -->
<script lang="ts">
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Button } from "$lib/components/ui/button";
  import { practice, sandbox } from "./sandbox.svelte";

  /** Outside Practice view: how many real clients the list shows. */
  let { realClients = null }: { realClients?: number | null } = $props();
  let confirmRemove = $state(false);
  const names = $derived(sandbox.clients.map((c) => c.displayName.split(" ")[0]).join(", "));
</script>

{#if sandbox.loaded && sandbox.on && !practice.on}
  <section class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm"
    aria-label="Sample clients" data-guide="clients-sandbox">
    <span>{#if realClients !== null}{realClients} real {realClients === 1 ? "client" : "clients"} · {/if}your {sandbox.clients.length} sample clients are in Practice view.</span>
    <Button variant="outline" size="sm" onclick={() => practice.set(true)}>Open Practice view</Button>
  </section>
{:else if sandbox.loaded && sandbox.on}
  <section class="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
    aria-label="Sample clients" data-guide="clients-sandbox">
    <p class="min-w-0 flex-[1_1_380px] text-sm text-muted-foreground">
      {names}: sample clients to try a program, a form or a reply on before a real client sees it. They act on their own and never count as clients.
      {#if sandbox.error}<span class="block text-destructive" role="alert">{sandbox.error}</span>{/if}
    </p>
    <div class="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={sandbox.busy} onclick={() => sandbox.reset()}>{sandbox.busy ? "Working…" : "Reset samples to fresh"}</Button>
      <Button variant="outline" size="sm" disabled={sandbox.busy} onclick={() => (confirmRemove = true)}>Remove samples…</Button>
    </div>
  </section>
{:else if sandbox.loaded}
  <section class="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4" aria-labelledby="sandbox-title" data-guide="clients-sandbox">
    <div class="min-w-0 flex-[1_1_380px]">
      <h2 id="sandbox-title" class="text-sm font-semibold">Sample clients</h2>
      <p class="mt-1 text-sm leading-relaxed text-muted-foreground">Add three sample clients to try things on, in Practice view. They get four weeks of history and act on their own. They never count as clients and nobody else sees them.</p>
      {#if sandbox.error}<p class="mt-1 text-sm text-destructive" role="alert">{sandbox.error}</p>{/if}
    </div>
    <Button disabled={sandbox.busy} onclick={() => sandbox.add()}>{sandbox.busy ? "Adding…" : "Add sample clients"}</Button>
  </section>
{/if}

<AlertDialog.Root bind:open={confirmRemove}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Remove the sample clients?</AlertDialog.Title>
      <AlertDialog.Description>
        {names} go, with their workouts, food, check-ins, messages and their copies of your programs.
        Your programs, forms, packages and invite links stay. You can add the sample clients back any time.
        {#if practice.locked}<b class="mt-2 block font-semibold text-foreground">You're trying Studio with them: removing them closes Coaching until you get Studio or add them back.</b>{/if}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Keep them</AlertDialog.Cancel>
      <AlertDialog.Action onclick={() => { confirmRemove = false; void sandbox.remove(); }}>Remove sample clients</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
