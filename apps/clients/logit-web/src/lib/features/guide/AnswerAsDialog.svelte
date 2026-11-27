<!-- Answer as a sample client (canvas V2): write what Niamh says, and it arrives in your
     conversation as a message from her, the way a real client's would. Practice view only. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { toast } from "$lib/components/ui/sonner";
  import { sampleSays } from "@logit/core/guide/sandboxDriver";
  import { firstName } from "@logit/core/domain/coachRequest";
  import { sandbox } from "./sandbox.svelte";

  let { open = $bindable(false), userId, relationshipId, name }: { open?: boolean; userId: string; relationshipId: string; name: string } = $props();

  const p = $derived(firstName(name));
  let body = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);
  $effect(() => {
    if (open) {
      body = "";
      error = null;
    }
  });

  async function send() {
    if (!body.trim() || busy) return;
    busy = true;
    error = null;
    try {
      await sampleSays(userId, relationshipId, body.trim());
      sandbox.notify();
      toast.success(`${p} sent it. It's in your messages with ${p}.`);
      open = false;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't send it";
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Answer as {p}</Dialog.Title>
      <Dialog.Description>{p} is a sample client. What you write arrives as a message from {p}, so you can try a conversation. Sample clients also reply on their own, and their check-ins come by themselves.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-1.5">
      <Label for="answer-as">{p} says</Label>
      <Textarea id="answer-as" rows={3} maxlength={4000} bind:value={body} placeholder="Can I train Saturday instead?" />
      {#if error}<p class="text-[13px] text-destructive" role="alert">{error}</p>{/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={busy || !body.trim()} onclick={() => void send()}>{busy ? "Sending…" : `Send as ${p}`}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
