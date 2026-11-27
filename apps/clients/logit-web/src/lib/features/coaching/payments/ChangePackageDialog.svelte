<!-- Change package (canvas K14): the client has to accept. It arrives as a card in your
     conversation; nothing about their payments changes until they do, and the change starts at
     their next payment, so nobody pays twice. -->
<script lang="ts">
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import { formatMoney, priceText, shortDate, type CoachPackage, type PaymentClient } from "@logit/core/domain/coachPayments";
  import { firstName } from "@logit/core/domain/coachRequest";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { toast } from "$lib/components/ui/sonner";

  let { open = $bindable(false), client, packages, ondone }: { open?: boolean; client: PaymentClient | null; packages: CoachPackage[]; ondone: () => Promise<void> | void } = $props();

  const NONE = "none";
  const name = $derived(client ? client.client.displayName || client.client.username : "");
  const p = $derived(firstName(name));
  let pick = $state(NONE);
  let message = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!open) return;
    pick = packages.find((k) => !k.hidden && k.name !== client?.packageName)?.id ?? NONE;
    message = "";
    error = null;
  });

  const chosen = $derived(packages.find((k) => k.id === pick) ?? null);
  const nextDate = $derived(client?.mode === "stripe" && client.paidUntil ? shortDate(client.paidUntil, new Date()) : "now");
  const what = $derived.by(() => {
    if (!client) return "";
    const monthly = client.mode === "stripe" && client.interval === "month" && client.state !== "ended";
    if (!chosen) return monthly ? `${p}'s monthly plan stops renewing. From ${nextDate}, ${p} pays you another way.` : `${p} pays you another way.`;
    if (monthly && chosen.interval === "month") return `From ${nextDate}, ${p} pays ${priceText(chosen)} instead. Nothing is charged now.`;
    return `${monthly ? `${p}'s monthly plan stops renewing. ` : ""}On ${nextDate} ${p} pays ${formatMoney(chosen.amountCents, chosen.currency)} for ${chosen.name}.`;
  });

  async function go() {
    if (!client || busy) return;
    busy = true;
    error = null;
    try {
      await coachPaymentsApi.changePackage(client.relationshipId, chosen?.id ?? null, message.trim() || undefined);
      toast.success(`Sent to ${p}. Nothing changes until ${p} accepts.`);
      open = false;
      await ondone();
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
      <Dialog.Title>Change {p}'s package</Dialog.Title>
      <Dialog.Description>Now: {client?.packageName ? `${client.packageName}${client.paidUntil ? `, next payment ${nextDate}` : ""}` : "no package through LogIt"}.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-4">
      <RadioGroup.Root bind:value={pick} class="gap-1.5">
        {#each packages.filter((k) => !k.hidden) as k (k.id)}
          {@const current = client?.packageName === k.name && client?.mode === "stripe"}
          <label class="flex items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-[13px] {pick === k.id ? 'border-primary/50 bg-primary/5' : 'border-border'} {current ? 'opacity-60' : ''}">
            <RadioGroup.Item value={k.id} disabled={current} />
            <span class="flex-1">{k.name}{#if current}<span class="ml-1.5 text-xs text-muted-foreground">current</span>{/if}</span>
            <span class="tabular-nums">{priceText(k)}</span>
          </label>
        {/each}
        <label class="flex items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-[13px] {pick === NONE ? 'border-primary/50 bg-primary/5' : 'border-border'}">
          <RadioGroup.Item value={NONE} />
          <span class="flex-1">No payment through LogIt</span>
        </label>
      </RadioGroup.Root>
      <div class="rounded-[10px] bg-muted px-3.5 py-2.5 text-[13px]"><b class="font-semibold">What happens</b><br />{what}</div>
      <div class="flex flex-col gap-1.5">
        <Label for="change-message">Message <span class="font-normal text-muted-foreground">optional</span></Label>
        <Textarea id="change-message" rows={2} maxlength={4000} bind:value={message} />
      </div>
      {#if error}<p class="text-[13px] text-destructive" role="alert">{error}</p>{/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={busy} onclick={() => void go()}>{busy ? "Sending…" : `Send to ${p}`}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
