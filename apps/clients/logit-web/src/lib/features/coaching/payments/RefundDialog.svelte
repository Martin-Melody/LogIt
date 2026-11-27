<!-- Refund (canvas Q9): give money back without ending coaching. Through the coach's Stripe
     account; the client gets Stripe's refund email and a line in your conversation. -->
<script lang="ts">
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import { formatMoney } from "@logit/core/domain/coachPayments";
  import { firstName } from "@logit/core/domain/coachRequest";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { toast } from "$lib/components/ui/sonner";

  let { open = $bindable(false), relationshipId, name, ondone }: { open?: boolean; relationshipId: string; name: string; ondone: () => Promise<void> | void } = $props();

  type Receipt = Awaited<ReturnType<typeof coachPaymentsApi.receipts>>[number];
  const p = $derived(firstName(name));
  let receipts = $state<Receipt[] | null>(null);
  let pick = $state("");
  let amount = $state("");
  let reason = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!open) return;
    receipts = null;
    amount = "";
    reason = "";
    error = null;
    void coachPaymentsApi.receipts(relationshipId).then((r) => {
      receipts = r;
      pick = r.find((x) => x.amountCents > x.refundedCents)?.id ?? "";
    }, (e) => (error = e instanceof Error ? e.message : "Couldn't load their payments"));
  });

  const chosen = $derived(receipts?.find((r) => r.id === pick) ?? null);
  const left = $derived(chosen ? chosen.amountCents - chosen.refundedCents : 0);
  const cents = $derived(Math.round(Number((amount || "0").replace(",", ".")) * 100));
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  async function go() {
    if (!chosen || busy) return;
    if (!(cents >= 1 && cents <= left)) return void (error = `Refund between ${formatMoney(1, chosen.currency)} and ${formatMoney(left, chosen.currency)}.`);
    busy = true;
    error = null;
    try {
      await coachPaymentsApi.refund(relationshipId, chosen.id, cents, reason.trim() || undefined);
      toast.success(`${formatMoney(cents, chosen.currency)} refunded to ${p}`);
      open = false;
      await ondone();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't refund";
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Refund {p}</Dialog.Title>
      <Dialog.Description>Coaching carries on; this only gives money back.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-4">
      {#if receipts === null && !error}
        <p class="text-[13px] text-muted-foreground">Loading their payments…</p>
      {:else if receipts?.length === 0}
        <p class="text-[13px] text-muted-foreground">{p} hasn't paid you through LogIt yet.</p>
      {:else if receipts}
        <RadioGroup.Root bind:value={pick} class="gap-1.5">
          {#each receipts as r (r.id)}
            {@const rest = r.amountCents - r.refundedCents}
            <label class="flex items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-[13px] {pick === r.id ? 'border-primary/50 bg-primary/5' : 'border-border'} {rest <= 0 ? 'opacity-50' : ''}">
              <RadioGroup.Item value={r.id} disabled={rest <= 0} />
              <span class="flex-1">{day(r.paidAt)} · {r.packageName ?? "Payment"}</span>
              <span class="tabular-nums">{formatMoney(r.amountCents, r.currency)}{#if r.refundedCents}<span class="block text-xs text-muted-foreground">{formatMoney(r.refundedCents, r.currency)} refunded</span>{/if}</span>
            </label>
          {/each}
        </RadioGroup.Root>
        {#if chosen}
          <div class="flex flex-col gap-1.5">
            <Label for="refund-amount">Amount <span class="font-normal text-muted-foreground">· up to {formatMoney(left, chosen.currency)}</span></Label>
            <Input id="refund-amount" bind:value={amount} inputmode="decimal" placeholder={(left / 100).toFixed(2)} class="w-32" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="refund-reason">Reason {p} sees <span class="font-normal text-muted-foreground">optional</span></Label>
            <Input id="refund-reason" bind:value={reason} maxlength={200} placeholder="Missed week while I was away" />
          </div>
          <p class="text-xs text-muted-foreground">Through your Stripe account. Stripe's fee on the original payment isn't returned to you (Stripe's rule). {p} gets Stripe's refund email.</p>
        {/if}
      {/if}
      {#if error}<p class="text-[13px] text-destructive" role="alert">{error}</p>{/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={busy || !chosen || cents < 1} onclick={() => void go()}>{busy ? "Refunding…" : chosen && cents >= 1 ? `Refund ${formatMoney(cents, chosen.currency)}` : "Refund"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
