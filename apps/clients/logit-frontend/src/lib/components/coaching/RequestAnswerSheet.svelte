<!-- A coach answering a request on the phone (canvas Z8): Offer a spot (C2), Waiting list (C5)
     and Not a fit (C3) as sheets, with the same fields and rules as on the web. -->
<script lang="ts">
  import { fade } from "svelte/transition";
  import { X } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { sheetUp } from "$lib/transitions";
  import { backDismiss, sheetDrag } from "$lib/components/sheet/sheet";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { DateField } from "$lib/components/ui/date-field/index.js";
  import { chip } from "$lib/components/ui/choice";
  import { coachApi } from "@logit/core/api/coachApi";
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import { formatMoney, type CoachPackage } from "@logit/core/domain/coachPayments";
  import { firstName, type RequestOffer } from "@logit/core/domain/coachRequest";

  let {
    kind,
    relationshipId,
    name,
    interestedPackageId = null,
    current = null,
    waiting = false,
    onclose,
    ondone,
  }: {
    kind: "offer" | "waitlist" | "notafit" | null;
    relationshipId: string;
    name: string;
    interestedPackageId?: string | null;
    /** The offer that's out, when changing it. */
    current?: RequestOffer | null;
    waiting?: boolean;
    onclose: () => void;
    ondone: () => Promise<void> | void;
  } = $props();

  const p = $derived(firstName(name));
  const today = new Date().toISOString().slice(0, 10);
  let packages = $state<CoachPackage[]>([]);
  let ready = $state(false);
  let pick = $state<string | null>(null);
  let hold = $state(7);
  let startsOn = $state<string | undefined>(undefined);
  let datedStart = $state(false);
  let firstChargeOn = $state<string | undefined>(undefined);
  let datedCharge = $state(false);
  let message = $state("");
  let expect = $state("");
  let block = $state(false);
  let sending = $state(false);
  let error = $state<string | null>(null);

  const iso = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : undefined);

  $effect(() => {
    if (!kind) return;
    openOverlay();
    error = null;
    message = "";
    block = false;
    if (kind === "offer") {
      hold = current?.holdDays ?? 7;
      datedStart = !!current?.card.startsOnMs;
      startsOn = iso(current?.card.startsOnMs ?? null);
      datedCharge = !!current?.card.firstChargeOnMs;
      firstChargeOn = iso(current?.card.firstChargeOnMs ?? null);
      void coachPaymentsApi.overview().then(
        (o) => {
          packages = o.packages.filter((k) => !k.hidden);
          ready = o.account.ready;
          pick = current ? (current.packageId ?? null) : ready && interestedPackageId && packages.some((k) => k.id === interestedPackageId) ? interestedPackageId : null;
        },
        () => (packages = []),
      );
    }
    if (kind === "waitlist") void coachApi.getIntake().then((i) => (expect = i.expectSpots ?? ""), () => {});
    return () => closeOverlay();
  });

  const chosen = $derived(packages.find((k) => k.id === pick) ?? null);

  async function send() {
    if (sending || !kind) return;
    if (kind === "offer" && datedStart && !startsOn) return void (error = "Pick the day they start.");
    if (kind === "offer" && chosen && datedCharge && !firstChargeOn) return void (error = "Pick the day of the first charge.");
    sending = true;
    error = null;
    try {
      if (kind === "offer") {
        await coachApi.offerSpot(relationshipId, {
          packageId: chosen?.id ?? null,
          holdDays: hold,
          startsOn: datedStart ? startsOn! : null,
          firstChargeOn: chosen && datedCharge ? firstChargeOn! : null,
          message: message.trim(),
        });
        toast.success(current ? `${p} sees the changed offer` : `Offer sent to ${p}`);
      } else if (kind === "waitlist") {
        await coachApi.putOnWaitingList(relationshipId, message.trim(), expect.trim());
        toast.success(`${p} is on your waiting list`);
      } else {
        await coachApi.notAFit(relationshipId, message.trim(), block);
        toast.success(waiting ? `${p} is off your waiting list` : `${p}'s request is closed`);
      }
      onclose();
      await ondone();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't do that. Try again.";
    } finally {
      sending = false;
    }
  }

  const title = $derived(
    kind === "offer" ? (current ? `Change ${p}'s offer` : `Offer ${p} a spot`)
      : kind === "waitlist" ? `Put ${p} on your waiting list`
      : waiting ? `Take ${p} off your waiting list` : `Tell ${p} it's not a fit`,
  );
</script>

{#if kind}
  <button type="button" class="fixed inset-0 z-40 bg-black/40" aria-label="Close" onclick={onclose} transition:fade={{ duration: 150 }}></button>
  <div class="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-xl border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
    use:sheetDrag={{ onDismiss: onclose }} use:backDismiss={onclose} transition:sheetUp role="dialog" aria-modal="true" aria-labelledby="answer-title">
    <div class="flex shrink-0 items-center justify-between border-b border-border px-4 pt-3 pb-2">
      <p id="answer-title" class="text-[15px] font-semibold">{title}</p>
      <button type="button" class="flex size-11 items-center justify-center text-muted-foreground" onclick={onclose} aria-label="Close"><X class="size-5" /></button>
    </div>

    <div class="flex flex-col gap-5 overflow-y-auto px-4 py-4">
      {#if kind === "offer"}
        <div class="flex flex-col gap-2" role="radiogroup" aria-label="Package">
          <span class="text-sm font-semibold">Package</span>
          {#each packages as k (k.id)}
            <button type="button" role="radio" aria-checked={pick === k.id} disabled={!ready}
              class="flex min-h-12 items-center justify-between gap-3 rounded-[10px] border px-3.5 text-left text-[15px] disabled:opacity-50 {pick === k.id ? 'border-primary bg-primary/5' : 'border-border'}"
              onclick={() => (pick = k.id)}>
              <span>{k.name}{#if k.id === interestedPackageId}<span class="block text-xs text-muted-foreground">{p} picked this</span>{/if}</span>
              <span class="text-sm tabular-nums">{formatMoney(k.amountCents, k.currency)} {k.interval === "month" ? "a month" : "once"}</span>
            </button>
          {/each}
          <button type="button" role="radio" aria-checked={pick === null}
            class="flex min-h-12 flex-col justify-center rounded-[10px] border px-3.5 py-2 text-left {pick === null ? 'border-primary bg-primary/5' : 'border-border'}" onclick={() => (pick = null)}>
            <span class="text-[15px]">No payment through LogIt</span>
            <span class="text-xs text-muted-foreground">You sort payment out yourself.</span>
          </button>
          {#if packages.length && !ready}<span class="text-xs text-muted-foreground">Paid packages need payments set up, on the web.</span>{/if}
        </div>
        <div class="flex flex-col gap-2">
          <span id="hold-label" class="text-sm font-semibold">Hold the spot for</span>
          <div role="radiogroup" aria-labelledby="hold-label" class="flex flex-wrap gap-2">
            {#each [3, 5, 7, 14] as d (d)}
              <button type="button" role="radio" aria-checked={hold === d} class={chip(hold === d)} onclick={() => (hold = d)}>{d} days</button>
            {/each}
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <span id="start-label" class="text-sm font-semibold">{p} starts</span>
          <div role="radiogroup" aria-labelledby="start-label" class="flex flex-wrap gap-2">
            <button type="button" role="radio" aria-checked={!datedStart} class={chip(!datedStart)} onclick={() => (datedStart = false)}>{chosen ? `The day ${p} pays` : `The day ${p} takes it`}</button>
            <button type="button" role="radio" aria-checked={datedStart} class={chip(datedStart)} onclick={() => (datedStart = true)}>On a date</button>
          </div>
          {#if datedStart}<DateField bind:value={startsOn} minIso={today} aria-label="Start date" />{/if}
        </div>
        {#if chosen?.interval === "month"}
          <div class="flex flex-col gap-2">
            <span id="charge-label" class="text-sm font-semibold">First charge</span>
            <div role="radiogroup" aria-labelledby="charge-label" class="flex flex-wrap gap-2">
              <button type="button" role="radio" aria-checked={!datedCharge} class={chip(!datedCharge)} onclick={() => (datedCharge = false)}>When {p} starts</button>
              <button type="button" role="radio" aria-checked={datedCharge} class={chip(datedCharge)} onclick={() => (datedCharge = true)}>A later date</button>
            </div>
            {#if datedCharge}<DateField bind:value={firstChargeOn} minIso={today} aria-label="First charge date" />{/if}
          </div>
        {/if}
      {:else if kind === "waitlist"}
        <p class="text-sm text-muted-foreground">{p} is told in your conversation and can leave the list any time.</p>
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-semibold">"Expect spots" shown to {p}</span>
          <Input bind:value={expect} maxlength={40} placeholder="January" />
        </label>
      {:else}
        <p class="text-sm text-muted-foreground">The request closes. {p} sees your message and "can't coach you right now". Nothing was shared or paid.</p>
        <label class="flex min-h-11 items-start gap-3">
          <Checkbox bind:checked={block} class="mt-0.5" />
          <span class="flex flex-col"><span class="text-[15px]">Block further requests from {p}</span><span class="text-xs text-muted-foreground">For spam or abuse. {p} isn't told.</span></span>
        </label>
      {/if}
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-semibold">Message <span class="font-normal text-muted-foreground">(optional)</span></span>
        <Textarea rows={3} maxlength={4000} bind:value={message} class="text-[15px]" />
      </label>
    </div>

    <div class="shrink-0 border-t border-border px-4 py-3">
      {#if error}<p class="pb-2 text-sm text-destructive" role="alert">{error}</p>{/if}
      <button type="button" disabled={sending} onclick={() => void send()}
        class="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] text-[15px] font-semibold disabled:opacity-50 {kind === 'notafit' ? 'bg-destructive text-white' : 'bg-primary text-primary-foreground'}">
        {#if sending}<Spinner class="size-4" />{/if}
        {kind === "offer" ? (current ? "Send the changed offer" : "Send offer") : kind === "waitlist" ? "Add to waiting list" : "Send and close"}
      </button>
    </div>
  </div>
{/if}
