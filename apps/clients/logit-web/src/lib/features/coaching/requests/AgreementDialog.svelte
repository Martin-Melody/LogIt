<!-- The coach's agreement in full (canvas K9). From the take page, "I agree" ticks the box there;
     elsewhere (Manage) it shows when it was agreed instead of buttons. -->
<script lang="ts">
  import RichText from "@logit/ui/RichText.svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";

  let {
    open = $bindable(false),
    coach,
    text,
    changedAt = null,
    agreedAt = null,
    onagree,
  }: { open?: boolean; coach: string; text: string; changedAt?: string | null; agreedAt?: string | null; onagree?: () => void } = $props();

  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{coach}'s coaching agreement</Dialog.Title>
      <Dialog.Description>Written by {coach}, not LogIt{changedAt ? ` · last changed ${day(changedAt)}` : ""}</Dialog.Description>
    </Dialog.Header>
    <RichText {text} class="text-[14px] leading-relaxed" />
    <Dialog.Footer>
      {#if agreedAt}
        <p class="mr-auto text-[13px] text-muted-foreground">You agreed on {day(agreedAt)}.</p>
        <Button variant="outline" onclick={() => (open = false)}>Close</Button>
      {:else}
        <Button variant="outline" onclick={() => (open = false)}>Back</Button>
        {#if onagree}<Button onclick={() => { onagree(); open = false; }}>I agree</Button>{/if}
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
