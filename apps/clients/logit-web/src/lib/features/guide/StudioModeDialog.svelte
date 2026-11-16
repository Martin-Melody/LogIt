<!-- Asked the first time a Studio chapter starts: practise on sample clients, or use real ones. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { guide } from "./guide.svelte";
  import { sandbox, SAMPLES } from "./sandbox.svelte";

  const open = $derived(guide.askStudioMode !== null);

  async function useSamples() {
    if (!sandbox.on) await sandbox.add();
    if (!sandbox.error) guide.chooseStudioMode("samples");
  }
</script>

<Dialog.Root open={open} onOpenChange={(o) => { if (!o) guide.askStudioMode = null; }}>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-xl">
    <Dialog.Header>
      <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Studio walkthrough</p>
      <Dialog.Title class="text-xl">Practise on sample clients first?</Dialog.Title>
      <Dialog.Description class="text-sm leading-relaxed">
        The walkthrough has you do everything for real: make an invite link, build a program, set a check-in, reply to messages.
        Three sample clients give you someone to do it with. They answer on their own, a few seconds after you act.
      </Dialog.Description>
    </Dialog.Header>

    <ul class="flex flex-col">
      {#each SAMPLES as s (s.key)}
        <li class="flex gap-3 border-t border-border py-3">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">{s.displayName[0]}</span>
          <div>
            <div class="text-sm font-semibold">{s.displayName} <span class="ml-1 rounded-full bg-info/15 px-1.5 py-px text-[10px] font-semibold text-info">Sample</span></div>
            <p class="text-sm leading-relaxed text-muted-foreground">{s.about}</p>
          </div>
        </li>
      {/each}
    </ul>

    <ul class="list-disc pl-5 text-sm leading-relaxed text-foreground/85">
      <li>Marked Sample everywhere. They can't sign in, and never show up in social, search, payments or your client count.</li>
      <li>They stay until you remove them (Clients › Sandbox), and you can add them back any time.</li>
    </ul>

    {#if sandbox.error}<p class="text-sm text-destructive" role="alert">{sandbox.error}</p>{/if}

    <Dialog.Footer class="flex-wrap gap-2 sm:justify-start">
      <Button disabled={sandbox.busy} onclick={useSamples}>
        {sandbox.busy ? "Adding sample clients…" : sandbox.on ? "Use the sample clients" : "Add sample clients and start"}
      </Button>
      <Button variant="outline" disabled={sandbox.busy} onclick={() => guide.chooseStudioMode("real")}>I'll use my real clients</Button>
      <Button variant="ghost" disabled={sandbox.busy} onclick={() => (guide.askStudioMode = null)}>Not now</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
