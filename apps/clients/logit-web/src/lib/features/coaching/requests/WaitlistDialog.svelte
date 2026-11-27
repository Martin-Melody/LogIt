<!-- Put on the waiting list (canvas C5): she sees "You're on Sam's waiting list" in your
     conversation and can leave it any time. You offer her a spot later from Clients › Waiting list. -->
<script lang="ts">
  import { coachApi } from "@logit/core/api/coachApi";
  import { firstName } from "@logit/core/domain/coachRequest";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { toast } from "$lib/components/ui/sonner";

  let { open = $bindable(false), relationshipId, name, onsent }: { open?: boolean; relationshipId: string; name: string; onsent: () => Promise<void> | void } = $props();

  const p = $derived(firstName(name));
  let message = $state("");
  let expect = $state("");
  let sending = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!open) return;
    message = "";
    error = null;
    void coachApi.getIntake().then((i) => (expect = i.expectSpots ?? ""), () => {});
  });

  async function send() {
    if (sending) return;
    sending = true;
    error = null;
    try {
      await coachApi.putOnWaitingList(relationshipId, message.trim(), expect.trim());
      toast.success(`${p} is on your waiting list`);
      open = false;
      await onsent();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't do that";
    } finally {
      sending = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Put {p} on your waiting list</Dialog.Title>
      <Dialog.Description>{p} is told in your conversation and can leave the list any time. Offer a spot later from Clients › Waiting list.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <Label for="wait-message">Message <span class="font-normal text-muted-foreground">optional</span></Label>
        <Textarea id="wait-message" rows={3} maxlength={4000} bind:value={message} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="wait-expect">"Expect spots" shown to {p}</Label>
        <Input id="wait-expect" bind:value={expect} maxlength={40} placeholder="January" />
        <span class="text-xs text-muted-foreground">Also on your profile and to everyone waiting. Leave it empty to say nothing.</span>
      </div>
      {#if error}<p class="text-[13px] text-destructive" role="alert">{error}</p>{/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={sending} onclick={() => void send()}>{sending ? "Adding…" : "Add to waiting list"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
