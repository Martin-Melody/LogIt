<!-- After the last Studio chapter: what you've done, and whether to keep the sample clients. -->
<script lang="ts">
  import CheckIcon from "@lucide/svelte/icons/check";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { guide, chaptersOf } from "./guide.svelte";
  import { sandbox } from "./sandbox.svelte";

  const chapters = $derived(chaptersOf("studio"));
  const allDone = $derived(chapters.length > 0 && chapters.every((c) => guide.isDone(c.id)));
  let open = $state(false);

  // Shown once, when the walkthrough's last open chapter has just been finished.
  $effect(() => {
    if (guide.justFinished && allDone && chapters.some((c) => c.id === guide.justFinished)) {
      open = true;
      guide.panelOpen = false;
      guide.justFinished = null;
    }
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-xl">
    <Dialog.Header>
      <Dialog.Title class="text-xl">You've done the Studio walkthrough</Dialog.Title>
      <Dialog.Description>All {chapters.length} chapters. You can replay any of them from Guide, with or without sample clients.</Dialog.Description>
    </Dialog.Header>

    <ul class="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
      {#each chapters as c (c.id)}
        <li class="flex items-center gap-2"><CheckIcon class="size-4 text-success" aria-hidden="true" />{c.title}</li>
      {/each}
    </ul>

    {#if sandbox.on}
      <div class="rounded-xl border border-border bg-card p-4">
        <h3 class="text-sm font-bold">Remove the sample clients?</h3>
        <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
          Removing takes {sandbox.clients.map((c) => c.displayName).join(", ")} and everything they sent: workouts, food, check-ins, messages and their copies of your programs.
          What you built stays yours: programs, check-in forms and invite links. Kept sample clients stay marked Sample, and you can remove or add them back from Clients › Sandbox.
        </p>
      </div>
    {/if}

    <Dialog.Footer class="flex-wrap gap-2 sm:justify-start">
      {#if sandbox.on}
        <Button disabled={sandbox.busy} onclick={async () => { await sandbox.remove(); open = false; }}>Remove sample clients</Button>
        <Button variant="outline" onclick={() => (open = false)}>Keep them for now</Button>
      {:else}
        <Button onclick={() => (open = false)}>Done</Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
