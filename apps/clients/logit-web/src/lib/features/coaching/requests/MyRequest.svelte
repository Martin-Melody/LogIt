<!-- A request you sent, as a conversation with the coach (canvas A1–A3, A5): who and where it
     stands, a pinned card with what you can do now (edit your answers, withdraw, leave the
     waiting list, delete a closed one), then the messages with each step as a card. -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { coachApi, type AskInfo, type MyCoachingRequest } from "@logit/core/api/coachApi";
  import { messagesApi } from "@logit/core/api/messagesApi";
  import { createId } from "@logit/core/domain/ids";
  import { ASK_AGAIN_TEXT, clientCan, firstName, offerStateNow, type OfferCard, type RequestStage } from "@logit/core/domain/coachRequest";
  import { apiClient } from "@logit/core/api/client";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { toast } from "$lib/components/ui/sonner";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import MessageThread from "$lib/features/coaching/MessageThread.svelte";
  import AskForm from "$lib/features/coaching/ask/AskForm.svelte";
  import { shortDate } from "$lib/features/coaching/format";
  import RequestEventCard from "./RequestEventCard.svelte";

  let { request, open = true, onchange }: { request: MyCoachingRequest; open?: boolean; onchange: () => Promise<void> | void } = $props();

  const name = $derived(request.coach.displayName || request.coach.username);
  const c = $derived(firstName(name));
  const me = apiClient.getUser()?.displayName || apiClient.getUser()?.username || "You";
  const stage = $derived<RequestStage>(request.stage ?? "asked");
  const now = Date.now();
  const can = $derived(clientCan(stage, request.offer ?? null, now));
  const answers = $derived(request.answers ?? []);
  const status = $derived(
    request.closed ? "Request closed"
      : stage === "waiting" ? "Waiting list"
      : stage === "offered" && request.offer && offerStateNow(request.offer, now) === "open" ? "Offer to look at"
      : "Your request · not coaching yet",
  );

  let showAll = $state(false);
  let expanded = $state(false);
  let confirm = $state<"withdraw" | "leave" | "delete" | null>(null);
  let busy = $state(false);
  let thread = $state<{ refresh: (scroll?: boolean) => Promise<void> } | null>(null);

  // Editing answers asks the coach's questions as they are now, filled in with yours.
  let editing = $state<AskInfo | null>(null);
  let draft = $state<Record<string, string>>({});
  async function edit() {
    try {
      editing = await coachApi.askInfo(request.coach.username);
      draft = Object.fromEntries(answers.map((a) => [a.questionId, a.value]));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open your answers");
    }
  }
  async function saveAnswers(a: Record<string, string>) {
    await coachApi.ask(request.coach.username, a, null, request.sharing);
    editing = null;
    toast.success(`Your answers are updated for ${c}`);
    await onchange();
  }

  const stateOf = (offerId: string) =>
    request.offer && request.offer.card.offerId === offerId ? offerStateNow(request.offer, Date.now()) : "replaced";

  // Taking a spot goes through the agreement, what to share and paying (canvas J1).
  function take(card: OfferCard) {
    void goto(`/take/${card.offerId}`);
  }

  async function askAgain() {
    await messagesApi.send({ relationshipId: request.relationshipId, messageId: createId("msg"), body: ASK_AGAIN_TEXT, createdAtMs: Date.now() });
    await thread?.refresh(true);
  }

  async function act() {
    const what = confirm;
    confirm = null;
    busy = true;
    try {
      if (what === "delete") {
        await coachApi.deleteMyRequest(request.relationshipId);
        toast.success("Request deleted");
      } else {
        await coachApi.withdrawMyRequest(request.relationshipId);
        toast.success(what === "leave" ? `You've left ${c}'s waiting list` : "Request withdrawn");
      }
      await onchange();
      await thread?.refresh(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't do that");
    } finally {
      busy = false;
    }
  }

  const confirmText = $derived(
    confirm === "delete"
      ? { title: "Delete this request?", body: `Your answers go, and ${c} no longer sees this request. You can't undo this.`, action: "Delete" }
      : confirm === "leave"
        ? { title: `Leave ${c}'s waiting list?`, body: `${c} won't offer you a spot when one opens. You can ask again later.`, action: "Leave the waiting list" }
        : { title: "Withdraw your request?", body: `${c} is told, and any offer is closed. You can ask again later.`, action: "Withdraw" },
  );
</script>

<section id="request-{request.relationshipId}" class="flex flex-col gap-3 rounded-[12px] border border-border bg-card px-[18px] py-4">
  <header class="flex items-center gap-3">
    <Avatar name={name} url={request.coach.avatarUrl} size={40} />
    <div class="min-w-0 flex-1">
      <h2 class="truncate text-sm font-semibold">{name}</h2>
      <p class="text-xs text-muted-foreground">{status}</p>
    </div>
  </header>

  <!-- The pinned card: where it stands and what you can do (A1, A2, A3). -->
  <div class="flex flex-col gap-3 rounded-[10px] border border-border bg-muted/40 p-3.5">
    {#if stage === "waiting" && !request.closed}
      <div class="flex flex-col gap-1">
        <h3 class="text-sm font-semibold">You're on {c}'s waiting list</h3>
        <p class="text-[13px] leading-relaxed text-muted-foreground">{c} will offer you a spot here when one opens. Nothing is shared with {c} until you take it, and you can keep training in LogIt as you are.</p>
      </div>
      <dl class="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        {#if request.waitingSince}<div class="flex gap-1.5"><dt class="text-muted-foreground">Joined</dt><dd>{shortDate(Date.parse(request.waitingSince))}</dd></div>{/if}
        {#if request.expectSpots}<div class="flex gap-1.5"><dt class="text-muted-foreground">{c} expects spots</dt><dd>{request.expectSpots}</dd></div>{/if}
      </dl>
    {:else if request.closed}
      <div class="flex flex-col gap-1">
        <h3 class="text-sm font-semibold">{stage === "withdrawn" ? "You withdrew this request" : `${c} can't coach you right now`}</h3>
        <p class="text-[13px] leading-relaxed text-muted-foreground">Nothing was shared and nothing was paid. Your answers stay with {c} until you delete this request.</p>
      </div>
    {:else}
      <p class="text-[13px] text-muted-foreground">You asked {c} to coach you · {shortDate(Date.parse(request.requestedAt))}</p>
    {/if}

    {#if answers.length}
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-muted-foreground">Your answers · {answers.length} {answers.length === 1 ? "question" : "questions"}</span>
        <dl class="flex flex-col gap-1.5 text-[13px]">
          {#each showAll ? answers : answers.slice(0, 3) as a (a.questionId)}
            <div><dt class="text-muted-foreground">{a.question}</dt><dd class="whitespace-pre-wrap">{a.value}</dd></div>
          {/each}
        </dl>
        {#if answers.length > 3}
          <Button variant="ghost" size="sm" class="self-start" aria-expanded={showAll} onclick={() => (showAll = !showAll)}>{showAll ? "Show fewer" : "See all answers"}</Button>
        {/if}
      </div>
    {/if}

    <div class="flex flex-wrap gap-2">
      {#if can.reply && !request.closed}<Button variant="outline" size="sm" onclick={() => void edit()}>Edit answers</Button>{/if}
      {#if can.leaveWaitingList}<Button variant="outline" size="sm" disabled={busy} onclick={() => (confirm = "leave")}>Leave the waiting list</Button>{/if}
      {#if can.withdraw}<Button variant="ghost" size="sm" disabled={busy} onclick={() => (confirm = "withdraw")}>Withdraw request</Button>{/if}
      {#if can.delete}<Button variant="outline" size="sm" disabled={busy} onclick={() => (confirm = "delete")}>Delete this request</Button>{/if}
    </div>
  </div>

  {#if open || expanded}
    <MessageThread bind:this={thread} relationshipId={request.relationshipId} otherName={c}
      closedNote={request.closed ? (stage === "withdrawn" ? "You withdrew this request, so it can't be replied to." : `${c} closed this request, so you can't reply here.`) : null}>
      {#snippet card(m)}
        <RequestEventCard message={m} reader="client" coach={name} client={me} {stateOf} onTake={take} onAskAgain={askAgain} />
      {/snippet}
    </MessageThread>
  {:else}
    <Button variant="ghost" size="sm" class="self-start" onclick={() => (expanded = true)}>Show the conversation</Button>
  {/if}
</section>

<Dialog.Root open={!!editing} onOpenChange={(o) => { if (!o) editing = null; }}>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Your answers for {c}</Dialog.Title>
      <Dialog.Description>{c} sees the new answers straight away.</Dialog.Description>
    </Dialog.Header>
    {#if editing}
      <AskForm coachName={name} questions={editing.questions} bind:answers={draft} signedIn editing onsend={saveAnswers} />
    {/if}
  </Dialog.Content>
</Dialog.Root>

<AlertDialog.Root open={!!confirm} onOpenChange={(o) => { if (!o) confirm = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{confirmText.title}</AlertDialog.Title>
      <AlertDialog.Description>{confirmText.body}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={() => void act()}>{confirmText.action}</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
