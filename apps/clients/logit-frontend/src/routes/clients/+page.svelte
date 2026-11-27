<script lang="ts">
  const WEB_URL = import.meta.env.VITE_WEB_URL || "https://app.getlogit.app";
  import { replayTour } from "$lib/tour/index";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  import { apiClient, ApiError } from "@logit/core/api/client";
  import {
    coachApi,
    SHARE_ALL,
    type ClientRelationship,
    type CoachRelationship,
    type MyCoachingRequest,
    type ManageCoaching,
    type CoachingRequest,
    type ReceivedInvite,
    type SentInvite,
    type Sharing,
  } from "@logit/core/api/coachApi";
  import SharingList from "$lib/components/coaching/SharingList.svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import LockCard from "$lib/components/billing/LockCard.svelte";
  import { authStore } from "$lib/api/authStore.svelte";
  import { requestLine, sentLine } from "@logit/core/domain/coachRequest";
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import { clientPaymentNote } from "@logit/core/domain/coachPayments";

  // Self-hosted servers include everything, so Studio features are always open there.
  const isStudio = $derived(authStore.user?.tier === "Studio" || apiClient.isSelfHosted());

  const ui = $state({ loading: true, error: null as string | null, inviting: false, busyId: null as string | null });
  let clients = $state<ClientRelationship[]>([]);
  let received = $state<ReceivedInvite[]>([]);
  let coaches = $state<CoachRelationship[]>([]);
  let requests = $state<MyCoachingRequest[]>([]);
  // Canvas M1/E2/Z2: each coach's pause, end date and whether they've gone quiet.
  let manage = $state<Record<string, ManageCoaching>>({});
  // People who used the coach's link or code and wait for an answer.
  let clientRequests = $state<CoachingRequest[]>([]);
  // Accepting an invite first asks what the coach may see.
  let accepting = $state<string | null>(null);
  let acceptSharing = $state<Sharing>({ ...SHARE_ALL });
  let openCoach = $state<string | null>(null);
  let confirmStop = $state<string | null>(null);
  let sent = $state<SentInvite[]>([]);
  let inviteUsername = $state("");
  let inviteError = $state<string | null>(null);

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      const [r, c, s, mine, reqs, asks] = await Promise.all([
        coachApi.listReceivedInvites(),
        isStudio ? coachApi.listClients() : Promise.resolve([]),
        isStudio ? coachApi.listSentInvites() : Promise.resolve([]),
        coachApi.listCoaches().catch(() => []),
        coachApi.listMyRequests().catch(() => []),
        isStudio ? coachApi.listRequests().catch(() => []) : Promise.resolve([]),
      ]);
      clientRequests = asks;
      received = r;
      coaches = mine;
      requests = reqs;
      const m = await Promise.all(mine.map((x) => coachApi.manageCoaching(x.relationshipId).catch(() => null)));
      manage = Object.fromEntries(mine.flatMap((x, k) => (m[k] ? [[x.relationshipId, m[k]!]] : [])));
      clients = c;
      sent = s;
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load";
    } finally {
      ui.loading = false;
    }
  }

  let sharingLink = $state(false);
  let shareError = $state<string | null>(null);

  /** Shares the coach's invite link (their first active one, or a new one) through Android's share sheet. */
  async function shareInviteLink() {
    sharingLink = true;
    shareError = null;
    try {
      const links = await coachApi.listLinks().catch(() => []);
      const link = links.find((l) => l.state === "active" && !l.packageId) ?? (await coachApi.createLink({ name: "My invite link" }));
      const url = `${import.meta.env.VITE_WEB_URL || "https://app.getlogit.app"}/c/${link.code}`;
      try {
        const { Share } = await import("@capacitor/share");
        await Share.share({ title: "Train with me on LogIt", text: "Here's my coaching link on LogIt:", url });
      } catch {
        await navigator.clipboard?.writeText(url);
        shareError = "Link copied. Paste it to your client.";
      }
    } catch (e) {
      shareError = e instanceof Error ? e.message : "Couldn't make your link";
    } finally {
      sharingLink = false;
    }
  }

  async function invite(e: Event) {
    e.preventDefault();
    const username = inviteUsername.trim();
    if (!username) return;
    ui.inviting = true;
    inviteError = null;
    try {
      await coachApi.inviteClient(username);
      inviteUsername = "";
      await load();
    } catch (e) {
      inviteError = e instanceof ApiError ? e.message : "Failed to send invite — check the username.";
    } finally {
      ui.inviting = false;
    }
  }

  async function act(id: string, fn: () => Promise<void>) {
    ui.busyId = id;
    try {
      await fn();
      await load();
    } finally {
      ui.busyId = null;
    }
  }

  async function changeSharing(c: CoachRelationship, next: Sharing) {
    const before = c.sharing ?? SHARE_ALL;
    c.sharing = next;
    try {
      c.sharing = await coachApi.updateSharing(c.relationshipId, next);
    } catch (e) {
      c.sharing = before;
      ui.error = e instanceof Error ? e.message : "Couldn't change what your coach can see";
    }
  }

  onMount(() => void load());
  onMount(() => setTimeout(() => replayTour("phone.clients"), 600));
</script>

<div class="flex flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/settings")} />
    <h1 class="page-title">Coaching</h1>
  </PageHeader>

  {#if ui.error}
    <p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>
  {/if}

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else}
    {#if received.length > 0}
      <div class="border-b border-border">
        <p class="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Coach invites</p>
        <ul class="divide-y divide-border">
          {#each received as inv (inv.relationshipId)}
            <li class="flex flex-col text-sm">
              <div class="flex items-center justify-between px-3 py-2.5">
                <span>{inv.coach.displayName || inv.coach.username}</span>
                {#if inv.offer && inv.offer.state === "open"}
                  <!-- K13: an invite with an offer is taken on the web, like any offer. -->
                  <div class="flex gap-2">
                    <a href="{WEB_URL}/take/{inv.offer.card.offerId}" target="_blank" rel="noopener"
                      class="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">See the offer</a>
                    <Button size="sm" variant="outline" disabled={ui.busyId === inv.relationshipId}
                      onclick={() => act(inv.relationshipId, () => coachApi.declineInvite(inv.relationshipId))}>Decline</Button>
                  </div>
                {:else if accepting !== inv.relationshipId}
                  <div class="flex gap-2">
                    <Button size="sm" disabled={ui.busyId === inv.relationshipId}
                      onclick={() => { accepting = inv.relationshipId; acceptSharing = { ...SHARE_ALL }; }}>Accept</Button>
                    <Button size="sm" variant="outline" disabled={ui.busyId === inv.relationshipId}
                      onclick={() => act(inv.relationshipId, () => coachApi.declineInvite(inv.relationshipId))}>Decline</Button>
                  </div>
                {/if}
              </div>
              {#if accepting === inv.relationshipId}
                <p class="px-3 pb-1 text-xs text-muted-foreground">Pick what {inv.coach.displayName || inv.coach.username} can see. You can change this any time here.</p>
                <SharingList sharing={acceptSharing} disabled={ui.busyId === inv.relationshipId} onchange={(s) => (acceptSharing = s)} />
                <div class="flex gap-2 px-3 py-3">
                  <Button size="sm" disabled={ui.busyId === inv.relationshipId}
                    onclick={() => act(inv.relationshipId, async () => { await coachApi.acceptInvite(inv.relationshipId, acceptSharing); accepting = null; })}>Accept as my coach</Button>
                  <Button size="sm" variant="outline" onclick={() => (accepting = null)}>Back</Button>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if coaches.length > 0 || requests.length > 0}
      <div class="border-b border-border">
        <p class="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">My coach</p>
        <ul class="divide-y divide-border">
          {#each coaches as c (c.relationshipId)}
            {@const name = c.coach.displayName || c.coach.username}
            {@const note = clientPaymentNote(c.payment, c.status, name)}
            {@const problem = note && note.tone !== "ok" ? note : null}
            {@const m = manage[c.relationshipId]}
            <li class="flex flex-col text-sm">
              <button type="button" class="flex items-center justify-between gap-2 px-3 py-3 text-left hover:bg-muted/40" aria-expanded={openCoach === c.relationshipId}
                onclick={() => (openCoach = openCoach === c.relationshipId ? null : c.relationshipId)}>
                <span><span class="font-medium">{name}</span><span class="block text-xs text-muted-foreground mt-0.5">What {name} can see{note ? " · your plan" : ""}</span></span>
                <span class="flex items-center gap-2">
                  {#if c.status === "paused"}
                    <span class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Paused</span>
                  {:else if problem}
                    <span class="rounded-full bg-destructive/12 px-2 py-0.5 text-[11px] font-semibold text-destructive">Payment issue</span>
                  {/if}
                  <span class="text-muted-foreground">{openCoach === c.relationshipId ? "⌃" : "›"}</span>
                </span>
              </button>
              {#if m?.pausedUntil}
                <p role="status" class="mx-3 mb-2 rounded-lg bg-warning/10 px-3 py-2 text-xs leading-relaxed">{name} paused coaching until {new Date(m.pausedUntil).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}. Payments and check-ins pause; your program keeps going.</p>
              {:else if m?.endsAt}
                <p role="status" class="mx-3 mb-2 rounded-lg bg-muted px-3 py-2 text-xs">Coaching with {name} ends {new Date(m.endsAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}.</p>
              {/if}
              {#if c.away?.now}
                <!-- Canvas Z7: pinned while the coach is away. -->
                <div role="status" class="mx-3 mb-2 flex flex-col gap-1 rounded-lg bg-muted px-3 py-2.5">
                  <span class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{name} is away until {new Date(c.away.until).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                  {#if c.away.note}<span class="text-[13px] leading-relaxed">{c.away.note}</span>{/if}
                </div>
              {/if}
              {#if m?.change || m?.payDue}
                <!-- Canvas K14: answering a change of package and paying happen on the web (W6). -->
                <div role="status" class="mx-3 mb-2 flex flex-col gap-2 rounded-lg border border-primary/40 px-3 py-2.5">
                  <span class="text-sm font-semibold">{m.payDue ? `Time to pay for ${m.payDue.packageName}` : `${name} suggests ${m.change?.packageName}`}</span>
                  <span class="text-xs text-muted-foreground">{m.payDue ? "Pay on the web; coaching carries on once it's paid." : "Nothing changes unless you accept. Accept or keep your package on the web."}</span>
                  <a href="{WEB_URL}/my-coach" target="_blank" rel="noopener" class="inline-flex h-9 items-center self-start rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">{m.payDue ? "Pay on the web" : "See it on the web"}</a>
                </div>
              {/if}
              {#if m?.quiet}
                <!-- Canvas Z2: the coach hasn't replied for a week. -->
                <div role="status" class="mx-3 mb-3 flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                  <span class="text-sm font-semibold">{name} hasn't replied for {m.quiet.days} days</span>
                  <div class="flex gap-2">
                    <Button size="sm" variant="outline" onclick={() => goto(`/messages/${c.relationshipId}?name=${encodeURIComponent(name)}`)}>Message again</Button>
                    <Button size="sm" variant="destructive" disabled={ui.busyId === c.relationshipId}
                      onclick={() => act(c.relationshipId, async () => { await coachApi.stopCoaching(c.relationshipId, true); })}>{m.plan ? "Stop and get a refund" : "Stop coaching"}</Button>
                  </div>
                </div>
              {/if}
              {#if problem}
                <!-- No price, no pay button and no link to pay: the app only says what's happening. -->
                <div role="status" class="mx-3 mb-3 flex flex-col gap-1 rounded-lg border px-3 py-2.5 {problem.tone === 'bad' ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/40'}">
                  <span class="text-sm font-semibold">{problem.title}</span>
                  <span class="text-xs leading-relaxed">{problem.body}</span>
                </div>
              {/if}
              {#if openCoach === c.relationshipId}
                {#if note?.tone === "ok" && c.payment}
                  <div class="flex flex-col gap-1 px-3 pb-3">
                    <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your plan with {name}</span>
                    <span class="text-sm">{note.title}</span>
                    <span class="text-xs text-muted-foreground">{note.body}</span>
                    {#if c.payment.canStop}
                      <div class="pt-1.5">
                        {#if c.payment.stopsAtPeriodEnd}
                          <Button size="sm" variant="outline" disabled={ui.busyId === c.relationshipId}
                            onclick={() => act(c.relationshipId, async () => { await coachPaymentsApi.stopMyPlan(c.relationshipId, false); })}>Keep my plan going</Button>
                        {:else}
                          <Button size="sm" variant="outline" disabled={ui.busyId === c.relationshipId}
                            onclick={() => act(c.relationshipId, async () => { await coachPaymentsApi.stopMyPlan(c.relationshipId, true); })}>Stop paying at the end of the month</Button>
                        {/if}
                      </div>
                    {/if}
                  </div>
                {/if}
                <p class="px-3 pb-1 text-xs text-muted-foreground">Switching one off hides it from {name} straight away, past entries too.</p>
                <SharingList sharing={c.sharing ?? SHARE_ALL} onchange={(s) => changeSharing(c, s)} />
                <div class="px-3 py-3">
                  {#if confirmStop === c.relationshipId}
                    {@const plan = manage[c.relationshipId]?.plan}
                    <p class="pb-2 text-xs text-muted-foreground">
                      {plan && plan.interval === "month" && plan.state === "paid" && plan.paidUntil && Date.parse(plan.paidUntil) > Date.now()
                        ? `Your plan stops renewing. Coaching carries on until ${new Date(plan.paidUntil).toLocaleDateString(undefined, { day: "numeric", month: "short" })}, the end of what you paid for.`
                        : `${name} stops seeing your data, and their program, check-ins and habits leave your app. Your own logs stay.`}
                    </p>
                    <div class="flex gap-2">
                      <Button size="sm" variant="destructive" disabled={ui.busyId === c.relationshipId}
                        onclick={() => act(c.relationshipId, async () => { await coachApi.stopCoaching(c.relationshipId); })}>Stop coaching</Button>
                      <Button size="sm" variant="outline" onclick={() => (confirmStop = null)}>Keep</Button>
                    </div>
                  {:else}
                    <Button size="sm" variant="outline" class="text-destructive" onclick={() => (confirmStop = c.relationshipId)}>Stop coaching with {name}</Button>
                  {/if}
                </div>
              {/if}
            </li>
          {/each}
          {#each requests as r (r.relationshipId)}
            {@const name = r.coach.displayName || r.coach.username}
            <!-- R5: a request is its conversation, where it can be withdrawn. -->
            <li>
              <a href="/messages/request/{r.relationshipId}?name={encodeURIComponent(name)}" class="flex min-h-14 items-center justify-between gap-2 px-3 py-2.5 text-sm text-inherit no-underline hover:bg-muted/40">
                <span><span class="font-medium">{name}</span><span class="block text-xs text-muted-foreground">Coach request · {sentLine(r, Date.now())}</span></span>
                <span class="text-muted-foreground">›</span>
              </a>
            </li>
          {/each}
        </ul>
        {#if coaches.length > 0 && requests.length > 0}
          <p class="px-3 pb-3 text-xs text-muted-foreground">{coaches[0]!.coach.displayName || coaches[0]!.coach.username} can't see your {requests.length === 1 ? "request" : "requests"}.</p>
        {/if}
      </div>
    {/if}

    {#if coaches.length === 0 && requests.length === 0 && received.length === 0}
      <!-- No coach (never had one, or just left one): the way to a new one (bug hunt 10.8). -->
      <div class="border-b border-border px-3 pt-3 pb-3">
        <p class="pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">My coach</p>
        <p class="pb-2.5 text-sm text-muted-foreground">Have a coach? Enter their code or scan their QR code.</p>
        <Button variant="outline" class="h-11 w-full" onclick={() => goto("/onboarding/coach")}>I have a coach</Button>
      </div>
    {/if}

    <!-- A client (coached, asking, or invited) isn't shown the Studio offer for coaching others. -->
    {#if isStudio || (coaches.length === 0 && requests.length === 0 && received.length === 0)}
    <div class="border-b border-border">
      <p class="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">My clients</p>
      {#if !isStudio}
        <div class="px-3 pb-3">
          <LockCard
            plan="Studio"
            title="Coach your own clients"
            text="With Studio you can invite clients, see their training, nutrition and habits once they accept, and give them programs, macro targets and check-ins."
          />
        </div>
      {:else}
        {#if clientRequests.length > 0}
          <ul class="divide-y divide-border border-b border-border">
            {#each clientRequests as q (q.relationshipId)}
              {@const who = q.client.displayName || q.client.username}
              <!-- Z8: a request opens as a conversation with their answers and Offer / Waiting list / Not a fit. -->
              <li>
                <a href="/messages/request/{q.relationshipId}?name={encodeURIComponent(who)}" class="flex min-h-14 items-center justify-between gap-2 px-3 py-2.5 text-sm text-inherit no-underline hover:bg-muted/40">
                  <span class="min-w-0"><span class="font-medium">{who}</span><span class="block text-xs text-muted-foreground">{q.stage === "waiting" ? "On your waiting list" : `Asked you to coach them · ${requestLine(q.stage ?? "asked", q.offer ?? null, Date.now())}`}{q.linkName ? ` · ${q.linkName}` : ""}</span></span>
                  <span class="text-muted-foreground">›</span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
        {#if clients.length === 0 && clientRequests.length === 0}
          <!-- A coach's first day (design canvas C2): invite the first client. -->
          <div class="mx-3 mb-3 flex flex-col gap-2.5 rounded-[14px] bg-primary p-4 text-primary-foreground">
            <span class="text-base font-bold">Invite your first client</span>
            <span class="text-sm opacity-80">They open your link and choose what you can see. You accept them here.</span>
            <button type="button" class="h-11 rounded-lg bg-primary-foreground text-sm font-semibold text-primary disabled:opacity-60"
              disabled={sharingLink} onclick={() => void shareInviteLink()}>{sharingLink ? "Making your link…" : "Share link"}</button>
            {#if shareError}<span class="text-xs">{shareError}</span>{/if}
          </div>
        {:else}
          <ul class="divide-y divide-border" data-guide="phone-clients-list">
            {#each clients as c (c.relationshipId)}
              <li class="flex items-center">
                <button type="button" class="flex-1 min-w-0 px-3 py-3 text-left hover:bg-muted/40"
                  onclick={() => void goto(`/clients/${c.client.id}?u=${c.client.username}`)}>
                  <span class="text-sm font-medium">{c.client.displayName || c.client.username}</span>
                  <p class="text-xs text-muted-foreground mt-0.5">@{c.client.username}</p>
                </button>
                <span class="text-muted-foreground text-sm pr-3">›</span>
              </li>
            {/each}
          </ul>
        {/if}

        <form class="flex gap-2 px-3 py-3" onsubmit={invite}>
          <input type="text" aria-label="Client's username" placeholder="Client's username" bind:value={inviteUsername}
            class="h-10 flex-1 min-w-0 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          <Button type="submit" size="sm" disabled={ui.inviting || !inviteUsername.trim()}>Invite</Button>
        </form>
        {#if inviteError}<p class="px-3 pb-2 text-sm text-destructive">{inviteError}</p>{/if}

        {#if sent.length > 0}
          <div class="px-3 pb-3">
            <p class="text-xs text-muted-foreground mb-1">Pending invites sent</p>
            {#each sent as inv (inv.relationshipId)}
              <div class="flex items-center justify-between py-0.5 text-sm">
                <span class="text-muted-foreground">{inv.client.displayName || inv.client.username}</span>
                <Button size="sm" variant="outline" disabled={ui.busyId === inv.relationshipId}
                  onclick={() => act(inv.relationshipId, () => coachApi.revokeRelationship(inv.relationshipId))}>Cancel</Button>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
    {/if}
  {/if}
</div>
