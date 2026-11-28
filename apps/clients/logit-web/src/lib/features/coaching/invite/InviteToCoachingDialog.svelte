<!-- Invite to coaching from a chat (canvas MS5): a card in the conversation, either "Ask me to
     coach you" (they answer your questions, as any request) or an offer for a package now,
     when you've already talked it through. -->
<script lang="ts">
  import { coachApi } from "@logit/core/api/coachApi";
  import { dmApi, type DmTo } from "@logit/core/api/dmApi";
  import { formatMoney } from "@logit/core/domain/coachPayments";
  import type { ProfilePackage } from "@logit/core/domain/coachProfile";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import { Button } from "$lib/components/ui/button";
  import { toast } from "$lib/components/ui/sonner";

  let { open = $bindable(false), to, username, name, onsent }: { open?: boolean; to: DmTo; username: string; name: string; onsent?: () => void } = $props();

  let kind = $state<"ask" | "offer">("ask");
  let packages = $state<ProfilePackage[] | null>(null);
  let pkg = $state<string>("none");
  let hasProfile = $state(true);
  let sending = $state(false);
  const first = $derived(name.split(" ")[0] || name);

  $effect(() => {
    if (!open || packages) return;
    void coachApi.getCoachProfile().then((p) => {
      packages = p.packages;
      hasProfile = !!p.profile?.headline;
      pkg = p.packages[0]?.id ?? "none";
    }).catch(() => (packages = []));
  });

  async function send() {
    sending = true;
    try {
      let json = "{}";
      if (kind === "offer") {
        const r = await coachApi.inviteClient(username, { packageId: pkg === "none" ? null : pkg });
        if (!r.offerId) throw new Error("Couldn't make the offer");
        json = JSON.stringify({ offerId: r.offerId });
      }
      await dmApi.send(to, crypto.randomUUID(), "", { card: { type: "CoachInvite", json } });
      toast.success(kind === "offer" ? `Offer sent to ${first}` : `Sent ${first} your coaching invite`);
      open = false;
      onsent?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send it");
    } finally {
      sending = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Invite {first} to coaching</Dialog.Title>
      <Dialog.Description>A card goes into this chat. Once {first} asks or opens the offer, it's a request in Coaching › Messages.</Dialog.Description>
    </Dialog.Header>
    {#if !hasProfile}
      <p class="rounded-[10px] bg-muted px-3.5 py-2.5 text-[13px]">Set up your coaching profile first, so the card has something to show. <a href="/coaching/profile" class="underline">Coaching › Profile</a></p>
    {:else}
      <RadioGroup.Root bind:value={kind} class="flex flex-col gap-2">
        <label class="flex cursor-pointer items-start gap-3 rounded-[10px] border px-3.5 py-3 {kind === 'ask' ? 'border-primary bg-primary/5' : 'border-border'}">
          <RadioGroup.Item value="ask" class="mt-0.5" />
          <span><span class="block text-sm font-semibold">Ask me to coach you</span><span class="text-[13px] text-muted-foreground">{first} answers your questions, then you reply as with any request.</span></span>
        </label>
        <label class="flex cursor-pointer items-start gap-3 rounded-[10px] border px-3.5 py-3 {kind === 'offer' ? 'border-primary bg-primary/5' : 'border-border'}">
          <RadioGroup.Item value="offer" class="mt-0.5" />
          <span><span class="block text-sm font-semibold">Offer a spot</span><span class="text-[13px] text-muted-foreground">You've talked it through: pick a package and send the offer now.</span></span>
        </label>
      </RadioGroup.Root>
      {#if kind === "offer"}
        <RadioGroup.Root bind:value={pkg} class="flex flex-col gap-1.5 rounded-[10px] border border-border p-2">
          {#each packages ?? [] as p (p.id)}
            <label class="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"><RadioGroup.Item value={p.id} /><span class="flex-1 text-[13px]">{p.name}</span><span class="text-[13px] tabular-nums text-muted-foreground">{formatMoney(p.amountCents, p.currency)}{p.interval === "month" ? " a month" : ""}</span></label>
          {/each}
          <label class="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"><RadioGroup.Item value="none" /><span class="flex-1 text-[13px]">No payment through LogIt</span></label>
        </RadioGroup.Root>
      {/if}
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={sending || !hasProfile} onclick={() => void send()}>{sending ? "Sending…" : `Send to ${first}`}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
