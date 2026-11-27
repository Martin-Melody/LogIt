<!-- A conversation where you're the client (your coach, or a coach you asked), in Me › Messages
     (canvas MS1): every conversation lives in one place, by your role in it. Request steps and
     offers show as cards; My coach has the rest (your plan, answers, managing coaching). -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { apiClient } from "@logit/core/api/client";
  import { messagesApi } from "@logit/core/api/messagesApi";
  import { createId } from "@logit/core/domain/ids";
  import { offerStateNow, ASK_AGAIN_TEXT, type OfferCard } from "@logit/core/domain/coachRequest";
  import type { CoachRelationship, MyCoachingRequest } from "@logit/core/api/coachApi";
  import { Button } from "$lib/components/ui/button";
  import Avatar from "./Avatar.svelte";
  import MessageThread from "./MessageThread.svelte";
  import RequestEventCard from "./requests/RequestEventCard.svelte";
  import { coachBadges } from "./badges.svelte";
  import { shortDate } from "./format";

  let { coach = null, request = null }: { coach?: CoachRelationship | null; request?: MyCoachingRequest | null } = $props();

  const rel = $derived(coach?.relationshipId ?? request?.relationshipId ?? "");
  const who = $derived(coach?.coach ?? request?.coach);
  const name = $derived(who ? who.displayName || who.username : "");
  const me = apiClient.getUser()?.displayName || apiClient.getUser()?.username || "You";
  const label = $derived(coach ? (coach.status === "paused" ? "Your coach · paused" : "Your coach")
    : request?.closed ? "Request closed" : request?.stage === "waiting" ? "Waiting list"
    : request?.stage === "offered" && request.offer && offerStateNow(request.offer, Date.now()) === "open" ? "Offer to look at" : "You asked");
  const stateOf = (offerId: string) => (coach ? "taken" : request?.offer && request.offer.card.offerId === offerId ? offerStateNow(request.offer, Date.now()) : "replaced");

  let thread = $state<{ refresh: (scroll?: boolean) => Promise<void> } | null>(null);
  function take(card: OfferCard) { void goto(`/take/${card.offerId}`); }
  async function askAgain() {
    await messagesApi.send({ relationshipId: rel, messageId: createId("msg"), body: ASK_AGAIN_TEXT, createdAtMs: Date.now() });
    await thread?.refresh(true);
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex items-center gap-3 border-b border-border px-4 py-3">
    <Avatar {name} url={who?.avatarUrl ?? null} size={36} />
    <span class="min-w-0 flex-1"><span class="block truncate text-sm font-semibold">{name}</span><span class="block text-xs text-muted-foreground">{label}</span></span>
    <Button variant="outline" size="sm" href="/my-coach?c={rel}">My coach</Button>
  </div>
  {#if coach?.away?.now}
    <div role="status" class="mx-4 mt-3 rounded-[10px] border border-border bg-muted/60 px-3.5 py-2.5">
      <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{name} is away until {shortDate(Date.parse(coach.away.until))}</p>
      {#if coach.away.note}<p class="mt-1 text-[13px] leading-relaxed">{coach.away.note}</p>{/if}
    </div>
  {/if}
  <div class="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-2">
    {#key rel}
      <MessageThread bind:this={thread} relationshipId={rel} otherName={name} onRead={() => void coachBadges.refresh(undefined, true)}
        closedNote={request?.closed ? (request.stage === "withdrawn" ? "You withdrew this request, so it can't be replied to." : `${name} closed this request, so you can't reply here.`) : null}>
        {#snippet card(m)}
          <RequestEventCard message={m} reader="client" coach={name} client={me} {stateOf} onTake={take} onAskAgain={askAgain} />
        {/snippet}
      </MessageThread>
    {/key}
  </div>
</div>
