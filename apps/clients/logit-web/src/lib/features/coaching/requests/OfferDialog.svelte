<!-- Offer a spot (canvas C2), or change the offer that's out (C6: she sees "Sam changed the
     offer"). A package she pays for through LogIt, or no payment through LogIt; how long the
     spot is held; when she starts and, for someone already paid up elsewhere, a later first charge. -->
<script lang="ts">
  import { coachApi } from "@logit/core/api/coachApi";
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import { formatMoney, type CoachPackage } from "@logit/core/domain/coachPayments";
  import { firstName, type RequestOffer } from "@logit/core/domain/coachRequest";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import ReplyBox from "./ReplyBox.svelte";
  import { DateField } from "$lib/components/ui/date-field";
  import OptionSelect from "$lib/components/option-select.svelte";
  import { toast } from "$lib/components/ui/sonner";
  import { guideSignal } from "$lib/features/guide/signal";

  let {
    open = $bindable(false),
    relationshipId,
    name,
    interestedPackageId = null,
    current = null,
    onsent,
  }: {
    open?: boolean;
    relationshipId: string;
    name: string;
    interestedPackageId?: string | null;
    /** The offer that's out, when editing it. */
    current?: RequestOffer | null;
    onsent: () => Promise<void> | void;
  } = $props();

  const NONE = "none";
  const p = $derived(firstName(name));
  let packages = $state<CoachPackage[]>([]);
  let ready = $state(false);
  let connected = $state(false);
  let pick = $state(NONE);
  let hold = $state("7");
  let startMode = $state("pays");
  let startsOn = $state<string | undefined>(undefined);
  let chargeMode = $state("start");
  let firstChargeOn = $state<string | undefined>(undefined);
  let message = $state("");
  let sending = $state(false);
  let error = $state<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const iso = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : undefined);

  $effect(() => {
    if (!open) return;
    error = null;
    message = "";
    void coachPaymentsApi.overview().then(
      (o) => {
        packages = o.packages.filter((k) => !k.hidden);
        ready = o.account.ready;
        connected = o.account.connected;
        pick = current
          ? (current.packageId ?? NONE)
          : interestedPackageId && packages.some((k) => k.id === interestedPackageId) ? interestedPackageId : NONE;
      },
      () => (packages = []),
    );
    if (current) {
      const c = current.card;
      hold = String(current.holdDays ?? 7);
      startMode = c.startsOnMs ? "date" : "pays";
      startsOn = iso(c.startsOnMs);
      chargeMode = c.firstChargeOnMs ? "date" : "start";
      firstChargeOn = iso(c.firstChargeOnMs);
    } else {
      hold = "7";
      startMode = "pays";
      startsOn = undefined;
      chargeMode = "start";
      firstChargeOn = undefined;
    }
  });

  const chosen = $derived(packages.find((k) => k.id === pick) ?? null);
  const pays = $derived(!!chosen);

  async function send() {
    if (sending) return;
    if (startMode === "date" && !startsOn) return void (error = "Pick the day she starts.");
    if (pays && chargeMode === "date" && !firstChargeOn) return void (error = "Pick the day of the first charge.");
    sending = true;
    error = null;
    try {
      await coachApi.offerSpot(relationshipId, {
        packageId: chosen?.id ?? null,
        holdDays: Number(hold),
        startsOn: startMode === "date" ? startsOn! : null,
        firstChargeOn: pays && chargeMode === "date" ? firstChargeOn! : null,
        message: message.trim(),
      });
      toast.success(current ? `${p} sees the changed offer` : `Offer sent to ${p}`);
      guideSignal("request.offered");
      open = false;
      await onsent();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't send the offer";
    } finally {
      sending = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{current ? `Change ${p}'s offer` : `Offer ${p} a spot`}</Dialog.Title>
      <Dialog.Description>
        {current ? `This replaces the offer that's out; ${p} sees "changed the offer".` : pays ? `${p} sees it in your conversation with a pay button. Coaching starts when ${p} pays.` : `${p} sees it in your conversation. Coaching starts when ${p} takes it.`}
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-5">
      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm font-semibold">Package</legend>
        <RadioGroup.Root bind:value={pick} class="gap-0 overflow-hidden rounded-[10px] border border-border">
          {#each packages as k (k.id)}
            <label class="flex cursor-pointer items-center gap-3 border-b border-border px-3.5 py-3 has-[button:disabled]:cursor-not-allowed has-[button:disabled]:opacity-60">
              <RadioGroup.Item value={k.id} disabled={!ready} />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="text-sm font-medium">{k.name}{#if k.id === interestedPackageId}<span class="ml-1.5 text-xs font-normal text-muted-foreground">· {p} picked this</span>{/if}</span>
                {#if !ready && connected}<span class="text-xs text-muted-foreground">Can't be paid until you finish in Stripe</span>{/if}
              </span>
              <span class="text-sm tabular-nums">{formatMoney(k.amountCents, k.currency)} {k.interval === "month" ? "a month" : "once"}</span>
            </label>
          {/each}
          <label class="flex cursor-pointer items-start gap-3 px-3.5 py-3">
            <RadioGroup.Item value={NONE} class="mt-0.5" />
            <span class="flex flex-col">
              <span class="text-sm font-medium">No payment through LogIt</span>
              <span class="text-xs text-muted-foreground">You sort payment out yourself. {p} starts as soon as {p} takes it.</span>
            </span>
          </label>
        </RadioGroup.Root>
        {#if packages.length && !ready}
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-xs text-muted-foreground">{connected ? "Stripe needs something before clients can pay you." : "Paid packages need Stripe connected first."}</p>
            <Button variant="outline" size="sm" href="/coaching/payments?tab=packages">{connected ? "Finish in Stripe" : "Connect Stripe first"}</Button>
          </div>
        {/if}
      </fieldset>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-1.5">
          <Label for="offer-hold">Hold the spot for</Label>
          <OptionSelect id="offer-hold" bind:value={hold} options={[["3", "3 days"], ["5", "5 days"], ["7", "7 days"], ["14", "14 days"], ["30", "30 days"]].map(([value, label]) => ({ value, label }))} />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="offer-start">{p} starts on</Label>
          <OptionSelect id="offer-start" bind:value={startMode} options={[{ value: "pays", label: pays ? `The day ${p} pays` : `The day ${p} takes it` }, { value: "date", label: "A date…" }]} />
          {#if startMode === "date"}<DateField bind:value={startsOn} minIso={today} aria-label="Start date" />{/if}
        </div>
        {#if pays && chosen?.interval === "month"}
          <div class="flex flex-col gap-1.5 sm:col-span-2">
            <Label for="offer-charge">First charge</Label>
            <OptionSelect id="offer-charge" bind:value={chargeMode} options={[{ value: "start", label: `When ${p} starts` }, { value: "date", label: "A later date…" }]} />
            {#if chargeMode === "date"}<DateField bind:value={firstChargeOn} minIso={today} aria-label="First charge date" />{/if}
            <p class="text-xs text-muted-foreground">A later first charge suits someone already paid up with another coach or app.</p>
          </div>
        {/if}
      </div>
      <p class="text-xs leading-relaxed text-muted-foreground">The offer holds one of your spots for {hold} days. If {p} pays a little after, the spot is still {p}'s.</p>

      <div class="flex flex-col gap-1.5">
        <Label for="offer-message">Message <span class="font-normal text-muted-foreground">optional</span></Label>
        <ReplyBox id="offer-message" bind:value={message} {name} />
      </div>
      {#if error}<p class="text-[13px] text-destructive" role="alert">{error}</p>{/if}
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={sending} onclick={() => void send()}>{sending ? "Sending…" : current ? "Send the changed offer" : "Send offer"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
