<!-- Can't coach a client for now? (canvas E1): pause until a date (away, ill, injured: payments
     and check-ins pause, they keep training) or end it (their plan stops now, with a refund of
     your choosing, a message, and another coach to suggest). Either way they get a message. -->
<script lang="ts">
  import { coachApi, type EndingPreview } from "@logit/core/api/coachApi";
  import { formatMoney } from "@logit/core/domain/coachPayments";
  import { firstName } from "@logit/core/domain/coachRequest";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { DateField } from "$lib/components/ui/date-field";
  import { toast } from "$lib/components/ui/sonner";

  let { open = $bindable(false), relationshipId, name, ondone }: { open?: boolean; relationshipId: string; name: string; ondone: () => Promise<void> | void } = $props();

  const p = $derived(firstName(name));
  let what = $state<"pause" | "end">("pause");
  let preview = $state<EndingPreview | null>(null);
  let until = $state<string | undefined>(undefined);
  let refund = $state<"none" | "unused" | "full" | "exact">("unused");
  let part = $state("");
  let suggest = $state("");
  let message = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  $effect(() => {
    if (!open) return;
    what = "pause";
    until = undefined;
    refund = "unused";
    part = "";
    suggest = "";
    message = "";
    error = null;
    void coachApi.endingPreview(relationshipId).then((x) => (preview = x), () => (preview = null));
  });

  const last = $derived(preview?.lastPayment ?? null);
  const money = (c: number) => formatMoney(c, last?.currency ?? "eur");
  const refundCents = $derived(
    !last ? 0 : refund === "full" ? last.amountCents : refund === "unused" ? (preview?.unusedCents ?? 0) : refund === "exact" ? Math.round(Number(part || 0) * 100) : 0,
  );

  async function go() {
    if (busy) return;
    error = null;
    if (what === "pause" && !until) return void (error = "Pick the day coaching starts again.");
    if (what === "end" && refund === "exact" && (!last || refundCents <= 0 || refundCents > last.amountCents)) return void (error = `A part refund is between ${money(1)} and ${money(last?.amountCents ?? 0)}.`);
    busy = true;
    try {
      if (what === "pause") {
        await coachApi.pauseCoaching(relationshipId, until!, message.trim() || undefined);
        toast.success(`Coaching with ${p} is paused`);
      } else {
        const r = await coachApi.endCoaching(relationshipId, {
          refund: last ? refund : "none", refundCents: refund === "exact" ? refundCents : undefined,
          message: message.trim() || undefined, suggest: suggest.trim() || undefined,
        });
        toast.success(r.refundedCents > 0 ? `Coaching ended. ${formatMoney(r.refundedCents, r.currency)} refunded to ${p}.` : `Coaching with ${p} ended`);
      }
      open = false;
      await ondone();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't do that";
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Can't coach {p} for now?</Dialog.Title>
      <Dialog.Description>{p} gets a message either way.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-4">
      <RadioGroup.Root bind:value={what} class="gap-2">
        <label class="flex items-start gap-3 rounded-[10px] border px-3.5 py-3 {what === 'pause' ? 'border-primary/50 bg-primary/5' : 'border-border'}">
          <RadioGroup.Item value="pause" class="mt-0.5" />
          <span class="flex flex-col"><span class="text-sm font-medium">Pause coaching</span><span class="text-xs text-muted-foreground">Away, ill or injured. Their payments and check-ins pause, and they keep training on their program.</span></span>
        </label>
        <label class="flex items-start gap-3 rounded-[10px] border px-3.5 py-3 {what === 'end' ? 'border-destructive/50 bg-destructive/5' : 'border-border'}">
          <RadioGroup.Item value="end" class="mt-0.5" />
          <span class="flex flex-col"><span class="text-sm font-medium">End coaching</span><span class="text-xs text-muted-foreground">Their plan stops now. They keep their program, meal plan and history; you stop seeing their data.</span></span>
        </label>
      </RadioGroup.Root>

      {#if what === "pause"}
        <div class="flex flex-col gap-1.5">
          <Label>Back on</Label>
          <DateField bind:value={until} minIso={tomorrow} aria-label="Back on" />
        </div>
      {:else}
        {#if last}
          <fieldset class="flex flex-col gap-2">
            <legend class="mb-1 text-sm font-medium">Refund <span class="font-normal text-muted-foreground">· their last payment: {money(last.amountCents)}, paid {new Date(last.paidAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span></legend>
            <RadioGroup.Root bind:value={refund}>
              <label class="flex items-center gap-2.5 text-[13px]"><RadioGroup.Item value="unused" />The days not used · {money(preview?.unusedCents ?? 0)}</label>
              <label class="flex items-center gap-2.5 text-[13px]"><RadioGroup.Item value="full" />All of it · {money(last.amountCents)}</label>
              <label class="flex items-center gap-2.5 text-[13px]"><RadioGroup.Item value="exact" />Part of it
                {#if refund === "exact"}<Input bind:value={part} inputmode="decimal" placeholder="40" class="h-8 w-24" aria-label="Refund amount" />{/if}</label>
              <label class="flex items-center gap-2.5 text-[13px]"><RadioGroup.Item value="none" />No refund</label>
            </RadioGroup.Root>
            <span class="text-xs text-muted-foreground">The refund goes through your Stripe account from here; no need to open Stripe.</span>
          </fieldset>
        {:else if preview?.mode === "elsewhere"}
          <p class="text-[13px] text-muted-foreground">{p} pays you outside LogIt, so any refund is yours to sort out.</p>
        {/if}
        <div class="flex flex-col gap-1.5">
          <Label for="end-suggest">Suggest another coach <span class="font-normal text-muted-foreground">optional</span></Label>
          <Input id="end-suggest" bind:value={suggest} placeholder="@username" />
          <span class="text-xs text-muted-foreground">{p} gets their profile. Nothing is shared with them unless {p} asks.</span>
        </div>
      {/if}
      <div class="flex flex-col gap-1.5">
        <Label for="end-message">Message to {p}</Label>
        <Textarea id="end-message" rows={3} maxlength={4000} bind:value={message} />
      </div>
      {#if error}<p class="text-[13px] text-destructive" role="alert">{error}</p>{/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button variant={what === "end" ? "destructive" : "default"} disabled={busy} onclick={() => void go()}>
        {busy ? "Working…" : what === "pause" ? "Pause coaching" : refundCents > 0 ? `End coaching and refund ${money(refundCents)}` : "End coaching"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
