<!-- One request step in the conversation (canvas A1, A5, C6): an offer as a card with its state,
     anything else as one line said for whoever reads it. The same for the client (My coach) and
     the coach (Messages › Requests); only the client gets Take / Ask again. -->
<script lang="ts">
  import type { RemoteMessage } from "@logit/core/api/messagesApi";
  import { eventLine, firstName, type OfferCard, type OfferState, type RequestEvent } from "@logit/core/domain/coachRequest";
  import { formatMoney } from "@logit/core/domain/coachPayments";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";

  let {
    message,
    reader,
    coach,
    client,
    stateOf,
    onTake,
    onAskAgain,
  }: {
    message: RemoteMessage;
    reader: "client" | "coach";
    coach: string;
    client: string;
    /** How an offer stands now (the latest offer's state; older ones were replaced). */
    stateOf: (offerId: string) => OfferState;
    onTake?: (card: OfferCard) => void;
    onAskAgain?: () => Promise<void>;
  } = $props();

  const kind = $derived(message.kind as RequestEvent);
  const offer = $derived.by((): OfferCard | null => {
    if (kind !== "offer" && kind !== "offer-changed") return null;
    try {
      return JSON.parse(message.cardJson ?? "") as OfferCard;
    } catch {
      return null;
    }
  });
  const offerState = $derived(offer ? stateOf(offer.offerId) : null);
  const c = $derived(firstName(coach));
  const p = $derived(firstName(client));
  let later = $state(false);
  let asking = $state(false);

  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const price = (o: OfferCard) => formatMoney(o.amountCents, o.currency);
  const lines = (o: OfferCard) => o.packageDescription.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  async function askAgain() {
    asking = true;
    try {
      await onAskAgain?.();
    } finally {
      asking = false;
    }
  }
</script>

{#if offer}
  <article class="mx-auto flex w-full max-w-[420px] flex-col gap-3 rounded-[14px] border bg-card p-4 transition-opacity
    {offerState === 'open' ? 'border-primary/40 shadow-sm' : 'border-border'} {offerState === 'replaced' || offerState === 'withdrawn' ? 'opacity-70' : ''}"
    aria-label={eventLine(kind, reader, coach, client)}>
    <header class="flex items-center justify-between gap-2">
      <span class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{eventLine(kind, reader, coach, client)}</span>
      {#if offerState === "replaced"}<Badge variant="secondary">Replaced</Badge>
      {:else if offerState === "withdrawn"}<Badge variant="secondary">Withdrawn</Badge>
      {:else if offerState === "taken"}<Badge>Taken</Badge>
      {:else if offerState === "expired"}<Badge variant="outline">Ran out</Badge>{/if}
    </header>
    <div class="flex items-start justify-between gap-3">
      <div class="flex min-w-0 flex-col gap-1">
        <h3 class="text-[15px] font-semibold {offerState === 'replaced' ? 'line-through' : ''}">{offer.packageName}</h3>
        {#each lines(offer).slice(0, 3) as l (l)}<p class="text-[13px] text-muted-foreground">{l}</p>{/each}
      </div>
      <div class="shrink-0 text-right">
        {#if offer.pays}
          <p class="text-lg font-bold tabular-nums">{price(offer)}</p>
          <p class="text-xs text-muted-foreground">{offer.interval === "month" ? "a month" : offer.weeks ? `${offer.weeks} weeks` : "once"}</p>
        {:else}
          <p class="text-[13px] font-medium text-muted-foreground">No payment<br />through LogIt</p>
        {/if}
      </div>
    </div>
    {#if offer.startsOnMs || offer.firstChargeOnMs}
      <p class="text-[13px]">
        {#if offer.startsOnMs}Starts {day(offer.startsOnMs)}{/if}{#if offer.startsOnMs && offer.firstChargeOnMs} · {/if}{#if offer.firstChargeOnMs}First charge {day(offer.firstChargeOnMs)}{/if}
      </p>
    {/if}

    {#if offerState === "open"}
      <p class="text-xs leading-relaxed text-muted-foreground">
        {reader === "client" ? `${c} is holding this spot until ${day(offer.holdUntilMs)}.` : `Held for ${p} until ${day(offer.holdUntilMs)}.`}
        {#if offer.pays && offer.interval === "month"}{reader === "client" ? " Charged every month until you stop it in My coach." : ""}{/if}
      </p>
      {#if reader === "client" && !later}
        <div class="flex flex-wrap gap-2">
          <Button onclick={() => onTake?.(offer)} class="flex-1">{offer.pays ? `Take the spot and pay ${price(offer)}` : "Take the spot"}</Button>
          <Button variant="ghost" onclick={() => (later = true)}>Not now</Button>
        </div>
      {:else if reader === "client"}
        <Button variant="outline" size="sm" class="self-start" onclick={() => (later = false)}>Look at the offer again</Button>
      {/if}
    {:else if offerState === "expired"}
      <p class="text-[13px] leading-relaxed text-muted-foreground">
        This offer ran out on {day(offer.holdUntilMs)}. {reader === "client" ? `${c} was holding the spot until then. Ask ${c} if it's still free.` : `You can offer it again from the request.`}
      </p>
      {#if reader === "client" && onAskAgain}
        <Button variant="outline" disabled={asking} onclick={() => void askAgain()}>{asking ? "Sending…" : `Ask ${c} to offer it again`}</Button>
      {/if}
    {/if}
  </article>
{:else}
  <p class="mx-auto max-w-[460px] px-4 text-center text-[12px] leading-relaxed text-muted-foreground">
    <span class="font-medium">{eventLine(kind, reader, coach, client) || message.body}</span>
    · {new Date(message.createdAtMs).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
  </p>
{/if}
