<!-- One request, for the coach (canvas C1, C4, C6): who asked and how, where it stands with the
     actions that fit, their answers, and the conversation with each step as a card. Closed
     requests (Not a fit, withdrawn) are read-only with Reopen. -->
<script lang="ts">
  import type { ClosedRequest, CoachingRequest } from "@logit/core/api/coachApi";
  import { coachApi } from "@logit/core/api/coachApi";
  import { coachCan, firstName, offerStateNow, type RequestStage } from "@logit/core/domain/coachRequest";
  import { formatMoney } from "@logit/core/domain/coachPayments";
  import { apiClient } from "@logit/core/api/client";
  import { Button } from "$lib/components/ui/button";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { toast } from "$lib/components/ui/sonner";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import MessageThread from "$lib/features/coaching/MessageThread.svelte";
  import { ago, shortDate } from "$lib/features/coaching/format";
  import SampleBadge from "$lib/features/guide/SampleBadge.svelte";
  import RequestEventCard from "./RequestEventCard.svelte";
  import OfferDialog from "./OfferDialog.svelte";
  import WaitlistDialog from "./WaitlistDialog.svelte";
  import NotAFitDialog from "./NotAFitDialog.svelte";

  type Open = { kind: "open"; r: CoachingRequest };
  type Closed = { kind: "closed"; r: ClosedRequest };

  let {
    item,
    packageName = null,
    onchange,
    dialog = $bindable(null),
  }: {
    item: Open | Closed;
    /** The package they said they're interested in. */
    packageName?: string | null;
    onchange: () => Promise<void> | void;
    /** Which dialog is open; the list's ⋯ menu opens them too. */
    dialog?: "offer" | "waitlist" | "notafit" | "withdraw" | null;
  } = $props();

  const r = $derived(item.r);
  const name = $derived(r.client.displayName || r.client.username);
  const p = $derived(firstName(name));
  const me = apiClient.getUser()?.displayName || apiClient.getUser()?.username || "You";
  const stage = $derived<RequestStage>(item.kind === "closed" ? item.r.stage : (item.r.stage ?? "asked"));
  const offer = $derived(item.kind === "open" ? (item.r.offer ?? null) : null);
  const offerState = $derived(offer ? offerStateNow(offer, Date.now()) : null);
  const can = $derived(coachCan(stage, offer, Date.now()));
  const answers = $derived(r.answers ?? []);
  const asked = $derived(item.kind === "open" ? Date.parse(item.r.requestedAt) : Date.parse(item.r.closedAt));
  let thread = $state<{ refresh: (scroll?: boolean) => Promise<void> } | null>(null);
  let busy = $state(false);

  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

  async function changed() {
    await onchange();
    await thread?.refresh(true);
  }

  async function withdraw() {
    dialog = null;
    busy = true;
    try {
      await coachApi.withdrawOffer(r.relationshipId);
      toast.success(`Offer withdrawn. ${p} sees it in your conversation.`);
      await changed();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't withdraw it");
    } finally {
      busy = false;
    }
  }

  async function reopen() {
    busy = true;
    try {
      await coachApi.reopenRequest(r.relationshipId);
      toast.success(`${p}'s request is open again`);
      await changed();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't reopen it");
    } finally {
      busy = false;
    }
  }

  const stateOf = (offerId: string) => (offer && offer.card.offerId === offerId ? offerStateNow(offer, Date.now()) : "replaced");
</script>

<article class="flex min-w-0 flex-col gap-4" aria-label="{name}'s request">
  <header class="flex flex-wrap items-start gap-3">
    <Avatar name={name} url={r.client.avatarUrl} size={44} />
    <div class="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
      <h2 class="text-base font-semibold">{name}{#if r.client.isSample}<SampleBadge />{/if}</h2>
      <p class="text-xs text-muted-foreground">
        @{r.client.username} · {item.kind === "closed" ? `${stage === "withdrawn" ? "withdrew" : "closed"} ${shortDate(asked)}` : stage === "waiting" && item.r.waitingSince ? `waiting since ${shortDate(Date.parse(item.r.waitingSince))}` : `asked ${ago(asked)}`}{r.linkName ? ` via "${r.linkName}"` : ""}{packageName ? ` · interested in ${packageName}` : ""}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if item.kind === "closed"}
        <Button variant="outline" disabled={busy} onclick={() => void reopen()}>Reopen</Button>
      {:else}
        {#if can.notAFit}<Button variant="ghost" onclick={() => (dialog = "notafit")}>{stage === "waiting" ? "Remove" : "Not a fit"}</Button>{/if}
        {#if can.waitlist}<Button variant="outline" onclick={() => (dialog = "waitlist")}>Waiting list</Button>{/if}
        {#if can.withdrawOffer}<Button variant="outline" disabled={busy} onclick={() => (dialog = "withdraw")}>Withdraw offer</Button>{/if}
        {#if can.editOffer}<Button onclick={() => (dialog = "offer")}>Edit offer</Button>
        {:else if can.offer}<Button onclick={() => (dialog = "offer")}>{can.offerAgain ? "Offer again" : "Offer a spot"}</Button>{/if}
      {/if}
    </div>
  </header>

  {#if offer && offerState === "open"}
    <p class="rounded-[10px] bg-primary/8 px-3.5 py-2.5 text-[13px]">
      <b class="font-semibold">Offer sent {day(Date.parse(offer.createdAt))}</b> · {offer.card.packageName}{offer.card.pays ? ` ${formatMoney(offer.card.amountCents, offer.card.currency)}` : ""} · held until {day(offer.card.holdUntilMs)}. It holds one of your spots.
    </p>
  {:else if offer && offerState === "expired"}
    <p class="rounded-[10px] bg-muted px-3.5 py-2.5 text-[13px]">The offer ran out {day(offer.card.holdUntilMs)}. The spot is free again; offer it again if {p} still wants it.</p>
  {/if}

  <section class="flex flex-col gap-2" aria-labelledby="answers-{r.relationshipId}">
    <h3 id="answers-{r.relationshipId}" class="text-sm font-semibold">{p}'s answers</h3>
    {#if answers.length}
      <dl class="grid gap-x-6 gap-y-2.5 text-[13px] sm:grid-cols-[minmax(0,14rem)_1fr]">
        {#each answers as a (a.questionId)}
          <dt class="text-muted-foreground">{a.question}</dt>
          <dd class="whitespace-pre-wrap">{a.value}</dd>
        {/each}
      </dl>
    {:else}
      <p class="text-[13px] text-muted-foreground">{p} asked from an older version of LogIt, so there are no answers. Ask in the conversation.</p>
    {/if}
    <p class="text-xs text-muted-foreground">You see {p}'s answers only. Workouts, food and weight are shared once {p} is your client, and only what {p} picks.</p>
  </section>

  <section class="flex flex-col gap-2" aria-label="Conversation">
    <h3 class="text-sm font-semibold">Conversation</h3>
    <MessageThread bind:this={thread} relationshipId={r.relationshipId} otherName={p}
      closedNote={item.kind === "closed" ? (stage === "withdrawn" ? `${p} withdrew this request. Reopen it to talk again.` : "You closed this request. Reopen it to talk again.") : null}>
      {#snippet card(m)}
        <RequestEventCard message={m} reader="coach" coach={me} client={name} {stateOf} />
      {/snippet}
    </MessageThread>
  </section>
</article>

{#if item.kind === "open"}
  <OfferDialog bind:open={() => dialog === "offer", (v) => (dialog = v ? "offer" : null)} relationshipId={r.relationshipId} {name} interestedPackageId={item.r.interestedPackageId ?? null}
    current={can.editOffer ? offer : null} onsent={changed} />
  <WaitlistDialog bind:open={() => dialog === "waitlist", (v) => (dialog = v ? "waitlist" : null)} relationshipId={r.relationshipId} {name} onsent={changed} />
  <NotAFitDialog bind:open={() => dialog === "notafit", (v) => (dialog = v ? "notafit" : null)} relationshipId={r.relationshipId} {name} waiting={stage === "waiting"} onsent={changed} />
{/if}

<AlertDialog.Root open={dialog === "withdraw"} onOpenChange={(o) => { if (!o) dialog = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Withdraw the offer to {p}?</AlertDialog.Title>
      <AlertDialog.Description>{p} sees "withdrew the offer" in your conversation. The request stays open and the spot is free again.</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Keep it</AlertDialog.Cancel>
      <AlertDialog.Action onclick={() => void withdraw()}>Withdraw</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
