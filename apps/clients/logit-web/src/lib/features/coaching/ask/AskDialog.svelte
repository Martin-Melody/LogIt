<!-- "Ask to be coached" on a coach's profile inside the app: you're signed in already, so the
     form opens here instead of on its own page. It scrolls inside the dialog, with the coach's
     name staying at the top. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import AskPanel from "./AskPanel.svelte";

  let { open = $bindable(false), username, name }: { open?: boolean; username: string; name: string } = $props();
  let sent = $state<{ relationshipId: string; waiting: boolean } | null>(null);
</script>

<Dialog.Root bind:open onOpenChange={(o) => { if (!o) sent = null; }}>
  <Dialog.Content class="flex max-h-[88svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
    <Dialog.Header class="border-b border-border px-5 py-4">
      <Dialog.Title>Coaching with {name}</Dialog.Title>
    </Dialog.Header>
    <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      {#if open}<AskPanel {username} bind:sent plain />{/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
