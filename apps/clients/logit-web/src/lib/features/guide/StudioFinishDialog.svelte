<!-- The coaching walkthrough's finish (canvas V5): everything made is kept, and the samples stay
     in Practice view for trying things. Removing them lives on Clients, in Practice view. -->
<script lang="ts">
  import CheckIcon from "@lucide/svelte/icons/check";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { guide, chaptersOf } from "./guide.svelte";
  import { practice, sandbox } from "./sandbox.svelte";

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
      <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Coaching walkthrough · done</p>
      <Dialog.Title class="text-xl">That's coaching in LogIt</Dialog.Title>
      <Dialog.Description>
        Everything you made is kept.{#if sandbox.on}{" "}The samples stay in Practice view for trying things before a real client sees them.{/if}
        Replay any chapter from Guide.
      </Dialog.Description>
    </Dialog.Header>

    <ul class="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
      {#each chapters as c (c.id)}
        <li class="flex items-center gap-2"><CheckIcon class="size-4 text-success" aria-hidden="true" />{c.title}</li>
      {/each}
    </ul>

    <Dialog.Footer class="flex-wrap gap-2 sm:justify-start">
      {#if practice.locked}
        <Button href="/upgrade" onclick={() => (open = false)}>Get Studio</Button>
        <Button variant="outline" onclick={() => (open = false)}>Keep practising</Button>
      {:else if practice.on}
        <Button onclick={() => { practice.set(false); open = false; }}>Back to real clients</Button>
        <Button variant="outline" onclick={() => (open = false)}>Keep practising</Button>
      {:else}
        <Button onclick={() => (open = false)}>Done</Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
