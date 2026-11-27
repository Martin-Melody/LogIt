<!-- Not a fit (canvas C3), or taking someone off the waiting list (C4): the request closes, they
     see your message and "Sam can't coach you right now". Nothing was shared or paid. -->
<script lang="ts">
  import { coachApi } from "@logit/core/api/coachApi";
  import { firstName } from "@logit/core/domain/coachRequest";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Label } from "$lib/components/ui/label";
  import ReplyBox from "./ReplyBox.svelte";
  import { toast } from "$lib/components/ui/sonner";

  let {
    open = $bindable(false),
    relationshipId,
    name,
    waiting = false,
    onsent,
  }: { open?: boolean; relationshipId: string; name: string; waiting?: boolean; onsent: () => Promise<void> | void } = $props();

  const p = $derived(firstName(name));
  let message = $state("");
  let block = $state(false);
  let sending = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!open) return;
    message = "";
    block = false;
    error = null;
  });

  async function send() {
    if (sending) return;
    sending = true;
    error = null;
    try {
      await coachApi.notAFit(relationshipId, message.trim(), block);
      toast.success(waiting ? `${p} is off your waiting list` : `${p}'s request is closed`);
      open = false;
      await onsent();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't close it";
    } finally {
      sending = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{waiting ? `Take ${p} off your waiting list` : `Tell ${p} it's not a fit`}</Dialog.Title>
      <Dialog.Description>The request closes. {p} sees your message and "can't coach you right now". Nothing was shared or paid. You can reopen it from Closed.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <Label for="nofit-message">Message <span class="font-normal text-muted-foreground">optional</span></Label>
        <ReplyBox id="nofit-message" bind:value={message} {name} />
      </div>
      <label class="flex items-start gap-2.5">
        <Checkbox bind:checked={block} class="mt-0.5" />
        <span class="flex flex-col"><span class="text-sm font-medium">Block further requests from {p}</span><span class="text-xs text-muted-foreground">For spam or abuse. {p} isn't told.</span></span>
      </label>
      {#if error}<p class="text-[13px] text-destructive" role="alert">{error}</p>{/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button variant="destructive" disabled={sending} onclick={() => void send()}>{sending ? "Closing…" : "Send and close"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
