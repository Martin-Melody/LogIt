<!-- A request you sent, in the app (canvas A1–A3, A5, R4): the conversation with the coach before
     coaching starts. A pinned card says where it stands with what you can do; each step (an
     offer, the waiting list…) is a card in the messages. Online only, like asking: nothing here
     is kept for offline. Taking a spot happens on the web, where paying is (decided 2026-11-14). -->
<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { Send } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import AskSheet from "$lib/components/coaching/AskSheet.svelte";
  import * as Message from "$lib/components/ui/message/index.js";
  import * as Bubble from "$lib/components/ui/bubble/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import ChatText from "$lib/components/social/ChatText.svelte";
  import { back } from "$lib/navigation";
  import { coachApi, type MyCoachingRequest } from "@logit/core/api/coachApi";
  import { messagesApi, type RemoteMessage } from "@logit/core/api/messagesApi";
  import { createId } from "@logit/core/domain/ids";
  import { formatMoney } from "@logit/core/domain/coachPayments";
  import {
    ASK_AGAIN_TEXT, clientCan, eventLine, firstName, offerStateNow, readerOf, sentLine,
    type OfferCard, type RequestEvent,
  } from "@logit/core/domain/coachRequest";

  const WEB_URL = import.meta.env.VITE_WEB_URL || "https://app.getlogit.app";
  const props = $props<{ params: { relationshipId: string } }>();
  const id = $derived(props.params.relationshipId);

  let request = $state<MyCoachingRequest | null>(null);
  let messages = $state<RemoteMessage[]>([]);
  let loading = $state(true);
  let gone = $state(false);
  let draft = $state("");
  let sending = $state(false);
  let showAll = $state(false);
  let editing = $state(false);
  let confirm = $state<"withdraw" | "leave" | "delete" | null>(null);
  let listEl = $state<HTMLDivElement | null>(null);
  let poll: ReturnType<typeof setInterval> | undefined;

  const name = $derived(request ? request.coach.displayName || request.coach.username : page.url.searchParams.get("name") ?? "Coach");
  const c = $derived(firstName(name));
  const stage = $derived(request?.stage ?? "asked");
  const can = $derived(clientCan(stage, request?.offer ?? null, Date.now()));
  const answers = $derived(request?.answers ?? []);

  async function load(scroll = false) {
    try {
      const [mine, list] = await Promise.all([coachApi.listMyRequests(true), messagesApi.list(id, 0)]);
      request = mine.find((r) => r.relationshipId === id) ?? null;
      gone = !request;
      messages = list.sort((a, b) => a.createdAtMs - b.createdAtMs || a.messageId.localeCompare(b.messageId));
      const lastTheirs = messages.filter((m) => !m.mine && m.readAtMs == null).at(-1)?.createdAtMs;
      if (lastTheirs) await messagesApi.markRead(id, lastTheirs).catch(() => {});
      if (scroll) {
        await tick();
        listEl?.scrollTo({ top: listEl.scrollHeight });
      }
    } catch {
      // A request that became coaching (or was deleted) isn't listed: My coach has it now.
      if (!request) gone = true;
    } finally {
      loading = false;
    }
  }
  onMount(() => {
    void load(true);
    poll = setInterval(() => void load(), 15_000);
  });
  onDestroy(() => clearInterval(poll));

  async function send(body = draft.trim()) {
    if (!body || sending) return;
    sending = true;
    try {
      await messagesApi.send({ relationshipId: id, messageId: createId("msg"), body, createdAtMs: Date.now() });
      if (body === draft.trim()) draft = "";
      await load(true);
    } catch {
      toast.error("Couldn't send. Check your connection.");
    } finally {
      sending = false;
    }
  }

  async function act() {
    const what = confirm;
    confirm = null;
    try {
      if (what === "delete") {
        await coachApi.deleteMyRequest(id);
        toast.success("Request deleted");
        back("/messages/requests?tab=sent");
        return;
      }
      await coachApi.withdrawMyRequest(id);
      toast.success(what === "leave" ? `You've left ${c}'s waiting list` : "Request withdrawn");
      await load(true);
    } catch {
      toast.error("Couldn't do that. Try again.");
    }
  }

  const offerOf = (m: RemoteMessage): OfferCard | null => {
    if (m.kind !== "offer" && m.kind !== "offer-changed") return null;
    try {
      return JSON.parse(m.cardJson ?? "") as OfferCard;
    } catch {
      return null;
    }
  };
  const stateOf = (o: OfferCard) =>
    request?.offer && request.offer.card.offerId === o.offerId ? offerStateNow(request.offer, Date.now()) : "replaced";
  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

  const status = $derived(request?.closed ? "Request closed" : request ? sentLine(request, Date.now()) : "");
  const confirmText = $derived(
    confirm === "delete"
      ? { title: "Delete this request?", body: `Your answers go, and ${c} no longer sees this request.`, action: "Delete" }
      : confirm === "leave"
        ? { title: `Leave ${c}'s waiting list?`, body: `${c} won't offer you a spot when one opens. You can ask again later.`, action: "Leave" }
        : { title: "Withdraw your request?", body: `${c} is told, and any offer is closed. You can ask again later.`, action: "Withdraw" },
  );
</script>

<div class="flex h-full flex-col">
  <PageHeader>
    <BackButton onclick={() => back("/messages")} />
    <span class="flex min-w-0 flex-col">
      <h1 class="truncate text-[17px] font-semibold">{name}</h1>
      {#if status}<span class="truncate text-xs text-muted-foreground">{status}</span>{/if}
    </span>
  </PageHeader>

  <div bind:this={listEl} class="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
    {#if loading}
      <Skeleton class="h-40 w-full rounded-xl" />
    {:else if gone}
      <p class="px-2 py-10 text-center text-sm text-muted-foreground">This request isn't open any more. If {c} is your coach now, it's in My coach.</p>
      <Button variant="outline" class="self-center" onclick={() => goto("/clients")}>Open My coach</Button>
    {:else if request}
      <!-- The pinned card (A1, A2, A3). -->
      <section class="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3.5">
        {#if stage === "waiting" && !request.closed}
          <h2 class="text-[15px] font-semibold">You're on {c}'s waiting list</h2>
          <p class="text-sm leading-relaxed text-muted-foreground">{c} will offer you a spot here when one opens. Nothing is shared with {c} until you take it, and you can keep training in LogIt as you are.</p>
        {:else if request.closed}
          <h2 class="text-[15px] font-semibold">{stage === "withdrawn" ? "You withdrew this request" : `${c} can't coach you right now`}</h2>
          <p class="text-sm leading-relaxed text-muted-foreground">Nothing was shared and nothing was paid. Your answers stay with {c} until you delete this request.</p>
        {:else}
          <p class="text-sm text-muted-foreground">You asked {c} to coach you</p>
        {/if}
        {#if answers.length}
          <dl class="flex flex-col gap-1.5 text-sm">
            {#each showAll ? answers : answers.slice(0, 2) as a (a.questionId)}
              <div><dt class="text-muted-foreground">{a.question}</dt><dd class="whitespace-pre-wrap">{a.value}</dd></div>
            {/each}
          </dl>
          {#if answers.length > 2}
            <button type="button" class="min-h-11 self-start text-sm font-medium" aria-expanded={showAll} onclick={() => (showAll = !showAll)}>{showAll ? "Show fewer" : `See all ${answers.length} answers`}</button>
          {/if}
        {/if}
        <div class="flex flex-wrap gap-2">
          {#if can.reply}<Button size="sm" variant="outline" onclick={() => (editing = true)}>Edit answers</Button>{/if}
          {#if can.leaveWaitingList}<Button size="sm" variant="outline" onclick={() => (confirm = "leave")}>Leave the waiting list</Button>{/if}
          {#if can.withdraw}<Button size="sm" variant="ghost" onclick={() => (confirm = "withdraw")}>Withdraw</Button>{/if}
          {#if can.delete}<Button size="sm" variant="outline" onclick={() => (confirm = "delete")}>Delete this request</Button>{/if}
        </div>
      </section>

      {#each messages as m (m.messageId)}
        {@const offer = offerOf(m)}
        {#if offer}
          {@const st = stateOf(offer)}
          <article class="flex flex-col gap-2.5 rounded-xl border bg-card p-3.5 {st === 'open' ? 'border-primary/40' : 'border-border opacity-80'}">
            <span class="flex items-center justify-between text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {eventLine(m.kind as RequestEvent, "client", name, "")}
              {#if st !== "open"}<span class="rounded-full bg-muted px-2 py-0.5 normal-case tracking-normal">{st === "replaced" ? "Replaced" : st === "withdrawn" ? "Withdrawn" : st === "taken" ? "Taken" : "Ran out"}</span>{/if}
            </span>
            <span class="flex items-start justify-between gap-3">
              <span class="text-base font-semibold {st === 'replaced' ? 'line-through' : ''}">{offer.packageName}</span>
              <span class="text-right text-base font-bold tabular-nums">{offer.pays ? formatMoney(offer.amountCents, offer.currency) : ""}<span class="block text-xs font-normal text-muted-foreground">{offer.pays ? (offer.interval === "month" ? "a month" : "once") : "No payment through LogIt"}</span></span>
            </span>
            {#if st === "open"}
              <span class="text-[13px] text-muted-foreground">{c} is holding this spot until {day(offer.holdUntilMs)}.{offer.startsOnMs ? ` Starts ${day(offer.startsOnMs)}.` : ""}</span>
              <a href="{WEB_URL}/take/{offer.offerId}" target="_blank" rel="noopener"
                class="flex h-12 items-center justify-center rounded-[10px] bg-primary text-[15px] font-semibold text-primary-foreground">
                {offer.pays ? `Take the spot and pay ${formatMoney(offer.amountCents, offer.currency)}` : "Take the spot"}
              </a>
              {#if offer.pays}<span class="text-xs text-muted-foreground">Paying happens on the web; then everything comes to this app.</span>{/if}
            {:else if st === "expired"}
              <span class="text-[13px] text-muted-foreground">This offer ran out on {day(offer.holdUntilMs)}. Ask {c} if it's still free.</span>
              <Button variant="outline" disabled={sending} onclick={() => void send(ASK_AGAIN_TEXT)}>Ask {c} to offer it again</Button>
            {/if}
          </article>
        {:else if m.kind}
          <p class="px-6 py-1 text-center text-[13px] leading-snug text-muted-foreground">{eventLine(m.kind as RequestEvent, readerOf(m.kind as RequestEvent, m.mine), name, "") || m.body}</p>
        {:else}
          <Message.Root align={m.mine ? "end" : "start"} class="shrink-0 text-[15px]">
            <Message.Content>
              <Bubble.Root variant={m.mine ? "default" : "muted"} align={m.mine ? "end" : "start"} class="max-w-[78%]">
                <Bubble.Content class="rounded-[20px] px-3.5 py-2 text-[15px] leading-snug"><ChatText text={m.body} /></Bubble.Content>
              </Bubble.Root>
            </Message.Content>
          </Message.Root>
        {/if}
      {/each}
    {/if}
  </div>

  {#if request && !gone}
    {#if request.closed}
      <p class="border-t border-border px-4 py-3 text-center text-sm text-muted-foreground">
        {stage === "withdrawn" ? "You withdrew this request, so it can't be replied to." : `${c} closed this request, so you can't reply here.`}
      </p>
    {:else}
      <form class="flex items-end gap-2 border-t border-border px-3 py-2" onsubmit={(e) => { e.preventDefault(); void send(); }}>
        <label for="request-compose" class="sr-only">Message {c}</label>
        <textarea id="request-compose" bind:value={draft} rows={1} placeholder="Message {c}"
          class="max-h-32 min-h-11 flex-1 resize-none rounded-[20px] border border-border bg-background px-3.5 py-2.5 text-[15px] focus:outline-none focus:ring-1 focus:ring-ring"></textarea>
        <button type="submit" aria-label="Send" disabled={sending || !draft.trim()}
          class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"><Send class="size-5" /></button>
      </form>
    {/if}
    <AskSheet open={editing} username={request.coach.username} initial={Object.fromEntries(answers.map((a) => [a.questionId, a.value]))}
      onclose={() => (editing = false)} onsent={() => { toast.success(`Your answers are updated for ${c}`); void load(); }} />
  {/if}
</div>

<ConfirmDialog open={!!confirm} onOpenChange={(o) => { if (!o) confirm = null; }} title={confirmText.title} description={confirmText.body}
  confirmLabel={confirmText.action} onConfirm={act} />
