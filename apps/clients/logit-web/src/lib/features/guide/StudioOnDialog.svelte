<!-- Right after getting Studio (canvas V5), once, for a coach who was trying it with sample
     clients: nothing to redo or copy. Links go live, the profile's Coaching section goes public,
     and the coach chooses when to leave Practice view. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { apiClient } from "@logit/core/api/client";
  import { coachApi } from "@logit/core/api/coachApi";
  import { practice, sandbox } from "./sandbox.svelte";

  const TRIED = "logit:studio-tried";
  const WELCOMED = "logit:studio-on-seen";
  let open = $state(false);
  let links = $state<number | null>(null);

  const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
  const write = (k: string) => { try { localStorage.setItem(k, "1"); } catch { /* private mode */ } };

  $effect(() => {
    if (!sandbox.loaded) return;
    if (practice.locked) {
      // Trying Studio: remember it, and keep Practice view on for when Studio arrives, so the
      // coach chooses when to switch to real clients.
      write(TRIED);
      practice.set(true);
      return;
    }
    if (apiClient.getUser()?.tier === "Studio" && read(TRIED) && !read(WELCOMED)) {
      write(WELCOMED);
      open = true;
      void coachApi.listLinks().then((l) => (links = l.filter((x) => x.state === "active").length), () => (links = null));
    }
  });

  function done(real: boolean) {
    if (real) practice.set(false);
    open = false;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title class="text-xl">Studio is on</Dialog.Title>
      <Dialog.Description>Nothing to redo or copy: what you built while trying it is now live.</Dialog.Description>
    </Dialog.Header>
    <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
      <dt class="font-medium">Invite links</dt>
      <dd>{links === null ? "Your links are live" : links === 0 ? "Make one in Invite links" : `Your ${links} ${links === 1 ? "link is" : "links are"} live`}</dd>
      <dt class="font-medium">Profile</dt><dd>Shows Ask to be coached and your packages</dd>
      <dt class="font-medium">Programs, meal plans, forms</dt><dd>All still here</dd>
      <dt class="font-medium">Payments</dt><dd>Connect Stripe when you're ready, in <a href="/coaching/payments?tab=packages" class="underline underline-offset-2" onclick={() => (open = false)}>Payments</a></dd>
      {#if sandbox.on}<dt class="font-medium">Your samples</dt><dd>Stay in Practice view</dd>{/if}
    </dl>
    <Dialog.Footer class="flex-wrap gap-2 sm:justify-start">
      {#if sandbox.on}
        <Button onclick={() => done(false)}>Stay in Practice view</Button>
        <Button variant="outline" onclick={() => done(true)}>Switch to real clients</Button>
      {:else}
        <Button onclick={() => done(false)}>Done</Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
