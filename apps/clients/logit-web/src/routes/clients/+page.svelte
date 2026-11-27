<script lang="ts">
  import ClientHoverCard from "$lib/features/coaching/ClientHoverCard.svelte";
  import * as Table from "$lib/components/ui/table/index.js";
  import ActionMenu from "$lib/features/commands/ActionMenu.svelte";
  import { clientActions } from "$lib/features/commands/commands.svelte";
  import { canCoach } from "$lib/workspace";
  import { guideSignal } from "$lib/features/guide/signal";
  import { onSampleActivity, practice } from "$lib/features/guide/sandbox.svelte";
  import SampleBadge from "$lib/features/guide/SampleBadge.svelte";
  import SandboxCard from "$lib/features/guide/SandboxCard.svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { apiClient, ApiError } from "@logit/core/api/client";
  import { coachApi } from "@logit/core/api/coachApi";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { viewingClient } from "$lib/viewingClient.svelte";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import { coachBadges } from "$lib/features/coaching/badges.svelte";
  import {
    inView,
    loadCoachingOverview,
    needsYou,
    type ClientSummary,
    type CoachingOverview,
  } from "$lib/features/coaching/coachingData";
  import { ago, daysBetween, when } from "$lib/features/coaching/format";

  // Your clients (canvas C1, C4): the table, then Requests, the Waiting list and Invites you
  // sent as tabs, under how many of your spots are taken.
  import { page } from "$app/state";
  import * as Tabs from "$lib/components/ui/tabs";
  import { Button } from "$lib/components/ui/button";
  import type { ClosedRequest } from "@logit/core/api/coachApi";
  import type { CoachIntake } from "@logit/core/domain/coachRequest";
  import RequestsBoard from "$lib/features/coaching/requests/RequestsBoard.svelte";
  import IntakeDialog from "$lib/features/coaching/requests/IntakeDialog.svelte";
  import InviteDialog from "$lib/features/coaching/requests/InviteDialog.svelte";
  import { coachTrial } from "$lib/workspace";

  type Tab = "clients" | "requests" | "waiting" | "invites";
  let tab = $state<Tab>((["requests", "waiting", "invites"].includes(page.url.searchParams.get("tab") ?? "") ? page.url.searchParams.get("tab") : "clients") as Tab);
  let closed = $state<ClosedRequest[]>([]);
  let intake = $state<CoachIntake | null>(null);
  let packages = $state<Record<string, string>>({});
  let editingIntake = $state(false);

  function setTab(t: Tab) {
    tab = t;
    const u = new URL(page.url);
    u.searchParams.set("tab", t);
    u.searchParams.delete("r");
    u.searchParams.delete("view");
    void goto(u, { replaceState: true, keepFocus: true, noScroll: true });
  }

  async function loadRequests() {
    if (coachTrial()) return;
    const [c, i, profile] = await Promise.all([
      coachApi.listClosedRequests().catch(() => []),
      coachApi.getIntake().catch(() => null),
      coachApi.getCoachProfile().catch(() => null),
    ]);
    closed = c.filter((r) => practice.shows(r.client.isSample));
    intake = i;
    packages = Object.fromEntries((profile?.packages ?? []).map((k) => [k.id, k.name]));
  }

  let overview = $state<CoachingOverview | null>(null);
  let error = $state<string | null>(null);
  let inviting = $state(false);
  let busy = $state<string | null>(null);

  async function load() {
    try {
      overview = await loadCoachingOverview();
      coachBadges.fromOverview(overview);
      viewingClient.setClients(inView(await coachApi.listClients()));
      await loadRequests();
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load your clients";
    }
  }

  onMount(() => {
    // Without Studio there's no coaching workspace; your own coach lives in My coach.
    if (!canCoach()) void goto("/my-coach", { replaceState: true });
    else void load();
  });
  onMount(() => onSampleActivity(() => void load()));

  // Practice view already decides which clients these are (samples or real ones).
  const shownClients = $derived(overview?.clients ?? []);

  async function cancelInvite(relationshipId: string) {
    busy = relationshipId;
    try {
      await coachApi.revokeRelationship(relationshipId);
      await load();
    } finally {
      busy = null;
    }
  }

  const waiting = $derived(overview ? needsYou(overview).filter((i) => i.kind === "checkin" || i.kind === "message").slice(0, 4) : []);

  function checkinCell(c: ClientSummary): { text: string; tone: "warn" | "bad" | "" } {
    if (!c.sharing.checkins) return { text: "Not shared", tone: "" };
    if (c.toReview.length) return { text: c.toReview.length === 1 ? "New" : `${c.toReview.length} new`, tone: "warn" };
    if (c.missed) {
      const late = daysBetween(c.missed.dueMs, Date.now());
      return { text: late > 0 ? `Late ${late} day${late === 1 ? "" : "s"}` : "Due today", tone: "bad" };
    }
    if (c.lastCheckinAtMs) return { text: `Sent ${when(c.lastCheckinAtMs)}`, tone: "" };
    return { text: c.scheduleCount ? "None yet" : "No form", tone: "" };
  }

  function programCell(c: ClientSummary): string {
    const p = c.program;
    if (!p) return "Own plan";
    if (p.state === "running") return `${p.program.name} · week ${p.week} of ${p.totalWeeks}`;
    if (p.state === "scheduled") return `${p.program.name} · starts ${when(p.startsAtMs!)}`;
    return `${p.program.name} · not started`;
  }

  const tone = { warn: "bg-warning/12 text-warning", bad: "bg-destructive/12 text-destructive", "": "" } as const;
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-[26px] font-bold tracking-tight">Clients</h1>
      {#if overview}
        <p class="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
          {#if intake?.spots}
            <span><b class="font-semibold text-foreground">{intake.taken} of your {intake.spots} {intake.spots === 1 ? "spot" : "spots"}</b> taken{intake.full ? ` · full, ${intake.whenFull === "stop" ? "not taking requests" : "new requests join the waiting list"}` : ""}</span>
          {:else}
            <span>{overview.clients.length} active{#if waiting.length}{` · ${waiting.length} need${waiting.length === 1 ? "s" : ""} you`}{/if}</span>
          {/if}
          {#if intake}<Button variant="ghost" size="sm" class="h-7 px-2" onclick={() => (editingIntake = true)}>{intake.spots ? "Change" : "Set a client limit"}</Button>{/if}
        </p>
        {#if intake?.spots}
          <div class="mt-1.5 h-1.5 w-56 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Spots taken" aria-valuemin={0} aria-valuemax={intake.spots} aria-valuenow={intake.taken}>
            <div class="h-full rounded-full bg-primary transition-[width] duration-500" style="width: {Math.min(100, (intake.taken / intake.spots) * 100)}%"></div>
          </div>
        {/if}
      {/if}
    </div>
    <div class="flex flex-col items-end gap-1">
      <Button disabled={practice.on} onclick={() => (inviting = true)}>Invite someone you know</Button>
      {#if practice.on}<span class="text-xs text-muted-foreground">Inviting reaches a real person: turn off Practice view first.</span>{/if}
    </div>
  </header>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if !overview}
    <Skeleton class="h-24" />
    <Skeleton class="h-72" />
  {:else}
    {@const openRequests = overview.requests.filter((r) => r.stage !== "waiting")}
    {@const waitingList = overview.requests.filter((r) => r.stage === "waiting")}
    <Tabs.Root value={tab} onValueChange={(v) => setTab(v as Tab)}>
      <Tabs.List aria-label="Clients">
        <Tabs.Trigger value="clients">Clients <span class="opacity-60">{overview.clients.length}</span></Tabs.Trigger>
        <Tabs.Trigger value="requests">Requests{#if openRequests.length} <span class="opacity-60">{openRequests.length}</span>{/if}</Tabs.Trigger>
        <Tabs.Trigger value="waiting">Waiting list{#if waitingList.length} <span class="opacity-60">{waitingList.length}</span>{/if}</Tabs.Trigger>
        <Tabs.Trigger value="invites">Invites you sent{#if overview.sent.length} <span class="opacity-60">{overview.sent.length}</span>{/if}</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>

    {#if tab === "requests" || tab === "waiting"}
      {#key tab}
        <RequestsBoard mode={tab} requests={overview.requests} {closed} {packages} expectSpots={intake?.expectSpots ?? null}
          onchange={load} onEditIntake={() => (editingIntake = true)} />
      {/key}
    {:else if tab === "invites"}
      <section class="rounded-[10px] border border-border bg-card px-1.5 py-2">
        {#each overview.sent as s (s.relationshipId)}
          <div class="flex items-center gap-3 border-b border-border px-3 py-3 last:border-0">
            <Avatar name={s.client.displayName || s.client.username} url={s.client.avatarUrl} size={30} dim />
            <span class="flex min-w-0 flex-1 flex-col"><span class="text-[13px] font-medium">@{s.client.username}</span><span class="text-xs text-muted-foreground">Invite sent {ago(Date.parse(s.createdAt))} · nothing is shared until they accept</span></span>
            <Button variant="outline" size="sm" disabled={busy === s.relationshipId} onclick={() => cancelInvite(s.relationshipId)}>Cancel invite</Button>
          </div>
        {:else}
          <p class="px-3 py-6 text-center text-[13px] text-muted-foreground">No invites waiting. Invite someone by username above.</p>
        {/each}
      </section>
    {:else}
    {#if waiting.length}
      <section class="flex flex-col gap-2.5 rounded-[10px] border border-warning/30 bg-card px-[18px] py-4">
        <h2 class="text-sm font-semibold">Needs you</h2>
        <div class="flex flex-wrap gap-2.5">
          {#each waiting as i, n (n)}
            {#if i.kind === "checkin"}
              <a href="/coaching/checkins?id={encodeURIComponent(i.item.id)}&client={i.client.id}" class="flex flex-[1_1_280px] items-center gap-2.5 rounded-lg bg-muted px-3 py-2.5 hover:bg-muted/70">
                <Avatar name={i.client.name} url={i.client.avatarUrl} size={30} />
                <span class="flex flex-col gap-0.5"><span class="text-[13px] font-medium">{i.client.name} sent a check-in</span><span class="text-xs text-muted-foreground">{ago(i.item.submittedAtMs)}</span></span>
              </a>
            {:else if i.kind === "message"}
              <a href="/messages?c={i.client.relationshipId}" class="flex flex-[1_1_280px] items-center gap-2.5 rounded-lg bg-muted px-3 py-2.5 hover:bg-muted/70">
                <Avatar name={i.client.name} url={i.client.avatarUrl} size={30} />
                <span class="flex flex-col gap-0.5"><span class="text-[13px] font-medium">{i.client.name} messaged you</span><span class="text-xs text-muted-foreground">{i.client.unread} unread</span></span>
              </a>
            {/if}
          {/each}
        </div>
      </section>
    {/if}

    <div id="sandbox" class="scroll-mt-16"><SandboxCard /></div>


    <section data-guide="clients-list" class="rounded-[10px] border border-border bg-card px-1.5 py-2">
      <div class="overflow-x-auto">
        <Table.Root class="w-full min-w-[760px] border-collapse text-[13px]">
          <Table.Header>
            <Table.Row class="text-left text-xs text-muted-foreground">
              <Table.Head class="px-3 py-2 font-medium">Client</Table.Head>
              <Table.Head class="px-3 py-2 font-medium">Last 7 days</Table.Head>
              <Table.Head class="px-3 py-2 font-medium">Last workout</Table.Head>
              <Table.Head class="px-3 py-2 font-medium">Check-in</Table.Head>
              <Table.Head class="px-3 py-2 font-medium">Program</Table.Head>
              <Table.Head class="px-3 py-2 font-medium">Messages</Table.Head>
              <Table.Head class="w-10 px-1 py-2"><span class="sr-only">More</span></Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each shownClients as c (c.relationshipId)}
              {@const ck = checkinCell(c)}
              {@const actions = clientActions(c)}
              <ActionMenu {actions} label="More for {c.name}">
              {#snippet children({ props, more })}
              <Table.Row {...props} class="border-t border-border align-middle data-[state=open]:bg-muted">
                <Table.Cell class="px-3 py-3">
                  <a href="/clients/{c.id}" class="flex items-center gap-2.5" onclick={() => guideSignal("client.opened")}>
                    <Avatar name={c.name} url={c.avatarUrl} size={30} />
                    <span><span class="block font-medium"><ClientHoverCard clientId={c.id} span>{c.name}</ClientHoverCard>{#if c.isSample}<SampleBadge />{/if}</span><span class="text-xs text-muted-foreground">{c.isSample ? "Sample client" : `@${c.username}`}</span></span>
                  </a>
                </Table.Cell>
                {#if c.sharing.workouts}
                  <Table.Cell class="px-3 py-3">{c.sessions7d}{c.program?.state === "running" ? ` of ${c.program.daysPerWeek}` : ""}</Table.Cell>
                  <Table.Cell class="px-3 py-3">{c.lastSessionAtMs ? when(c.lastSessionAtMs) : "None yet"}</Table.Cell>
                {:else}
                  <Table.Cell class="px-3 py-3 text-muted-foreground" colspan={2}>Workouts not shared</Table.Cell>
                {/if}
                <Table.Cell class="px-3 py-3">
                  {#if ck.tone}<span class="rounded-full px-2 py-0.5 text-[11px] font-semibold {tone[ck.tone]}">{ck.text}</span>{:else}<span class="text-muted-foreground">{ck.text}</span>{/if}
                </Table.Cell>
                <Table.Cell class="px-3 py-3">{programCell(c)}</Table.Cell>
                <Table.Cell class="px-3 py-3">
                  {#if c.unread}<a href="/messages?c={c.relationshipId}" class="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">{c.unread} new</a>{:else}<a href="/messages?c={c.relationshipId}" class="text-muted-foreground hover:text-foreground">Open</a>{/if}
                </Table.Cell>
                <Table.Cell class="px-1 py-3">{@render more()}</Table.Cell>
              </Table.Row>
              {/snippet}
              </ActionMenu>
            {/each}
            {#if overview.clients.length === 0}
              <Table.Row><Table.Cell colspan={7} class="px-3 py-6 text-center text-muted-foreground">No clients yet. Invite someone by username, or <a href="/coaching/links" class="text-primary hover:underline">share an invite link</a>.</Table.Cell></Table.Row>
            {/if}
          </Table.Body>
        </Table.Root>
      </div>
    </section>
    {/if}
  {/if}
</div>

<InviteDialog bind:open={inviting} onsent={async () => { await load(); setTab("invites"); }} />

{#if intake}
  <IntakeDialog bind:open={editingIntake} {intake} onsaved={(i) => (intake = i)} />
{/if}
