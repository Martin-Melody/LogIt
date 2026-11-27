<!-- Coaching › Messages (canvas W2): one inbox. Your clients' conversations, your direct
     messages and people asking you to coach them, together (the two kinds of message stay
     separate underneath). Beside a client's conversation, what you'd open a second tab for.
     ⋯: Saved replies (canvas W10). Your own coach's conversation is in My coach. -->
<script lang="ts">
  import SwapInProgramDialog from "$lib/features/coaching/programs/SwapInProgramDialog.svelte";
  import SavedRepliesDialog from "$lib/features/coaching/SavedRepliesDialog.svelte";
  import { onSampleActivity } from "$lib/features/guide/sampleActivity";
  import { inView, loadCoachingOverview, type ClientSummary } from "$lib/features/coaching/coachingData";
  import ClientHoverCard from "$lib/features/coaching/ClientHoverCard.svelte";
  import { canCoach } from "$lib/workspace";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
  import ActionMenu from "$lib/features/commands/ActionMenu.svelte";
  import { conversationActions } from "$lib/features/commands/commands.svelte";
  import { apiClient } from "@logit/core/api/client";
  import { coachApi, type CoachingRequest } from "@logit/core/api/coachApi";
  import { dmApi, type DmThread } from "@logit/core/api/dmApi";
  import { requestLine } from "@logit/core/domain/coachRequest";
  import { messagesApi } from "@logit/core/api/messagesApi";
  import { getWebCoachProgramRepo, getWebNutritionDeps } from "$lib/deps";
  import { smoothWeightSeries } from "@logit/core/nutrition/trend";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import MessageThread from "$lib/features/coaching/MessageThread.svelte";
  import DmChat from "$lib/features/social/DmChat.svelte";
  import { when, weekdayDate } from "$lib/features/coaching/format";

  type Row =
    | { kind: "client"; key: string; name: string; avatarUrl: string | null; at: number; unread: boolean; line: string; client: ClientSummary }
    | { kind: "dm"; key: string; name: string; avatarUrl: string | null; at: number; unread: boolean; line: string; thread: DmThread }
    | { kind: "request"; key: string; name: string; avatarUrl: string | null; at: number; unread: boolean; line: string; request: CoachingRequest };

  let rows = $state<Row[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let search = $state("");
  let filter = $state<"all" | "unread" | "requests">("all");
  // ?saved=1 (⌘K): Saved replies.
  // svelte-ignore state_referenced_locally
  let managing = $state(page.url.searchParams.get("saved") === "1");

  const activeKey = $derived(page.url.searchParams.get("c") ? `c:${page.url.searchParams.get("c")}` : page.url.searchParams.get("dm") ? `dm:${page.url.searchParams.get("dm")}` : (rows.find((r) => r.kind !== "request")?.key ?? null));
  const active = $derived(rows.find((r) => r.key === activeKey) ?? null);
  const draft = $derived(page.url.searchParams.get("draft") ?? "");
  const shown = $derived(rows.filter((r) => (filter === "unread" ? r.unread : filter === "requests" ? r.kind === "request" : true) && (!search.trim() || r.name.toLowerCase().includes(search.trim().toLowerCase()))));
  const unreadCount = $derived(rows.filter((r) => r.unread).length);
  const requestCount = $derived(rows.filter((r) => r.kind === "request").length);

  async function load() {
    try {
      const [overview, all, reqs, dms] = await Promise.all([
        loadCoachingOverview(),
        messagesApi.listAll(0).catch(() => []),
        coachApi.listRequests().catch(() => [] as CoachingRequest[]),
        dmApi.threads("chats").catch(() => [] as DmThread[]),
      ]);
      const clientRows: Row[] = overview.clients.map((c) => {
        const last = all.filter((m) => m.relationshipId === c.relationshipId).sort((a, b) => b.createdAtMs - a.createdAtMs)[0];
        const body = last ? last.body || (last.photoUrl ? "Photo" : last.voiceUrl ? "Voice message" : "") : "";
        return { kind: "client", key: `c:${c.relationshipId}`, name: c.name, avatarUrl: c.avatarUrl, at: last?.createdAtMs ?? 0, unread: c.unread > 0, line: last ? `${last.mine ? "You: " : ""}${body}` : "No messages yet", client: c };
      });
      const dmRows: Row[] = dms.filter((t) => t.other).map((t) => ({ kind: "dm", key: `dm:${t.id}`, name: t.other!.displayName || t.other!.username, avatarUrl: t.other!.avatarUrl, at: t.lastAtMs, unread: t.unread, line: `${t.lastMine ? "You: " : ""}${t.lastBody}`, thread: t }));
      const reqRows: Row[] = inView(reqs).map((r) => ({ kind: "request", key: `r:${r.relationshipId}`, name: r.client.displayName || r.client.username, avatarUrl: r.client.avatarUrl, at: Date.parse(r.requestedAt) || 0, unread: (r.stage ?? "asked") === "asked", line: requestLine(r.stage ?? "asked", r.offer ?? null, Date.now()), request: r }));
      rows = [...clientRows, ...dmRows, ...reqRows].sort((a, b) => b.at - a.at);
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load conversations";
    } finally {
      loading = false;
    }
  }
  onMount(() => onSampleActivity(() => void load()));
  onMount(() => {
    if (!canCoach()) void goto("/my-coach", { replaceState: true });
    else void load();
  });

  function open(r: Row) {
    if (r.kind === "request") return void goto(`/clients?tab=${r.request.stage === "waiting" ? "waiting" : "requests"}&r=${r.request.relationshipId}`);
    const u = new URL(page.url);
    u.searchParams.delete("c");
    u.searchParams.delete("dm");
    u.searchParams.delete("draft");
    if (r.kind === "client") u.searchParams.set("c", r.client.relationshipId);
    else u.searchParams.set("dm", r.thread.id);
    void goto(u, { replaceState: true, noScroll: true, keepFocus: true });
  }
  function sentInOpen(body: string, at: number) {
    rows = rows.map((r) => (r.key === activeKey ? { ...r, at, line: `You: ${body}` } : r)).sort((a, b) => b.at - a.at);
  }
  function markOpenRead() {
    rows = rows.map((r) => (r.key === activeKey ? { ...r, unread: false } : r));
  }

  // ── The client beside the chat (canvas W2) ──
  type Panel = { weightKg: number | null; rateKg: number | null; paidUntil: string | null; exercises: string[] };
  let panel = $state<Panel | null>(null);
  let panelFor = "";
  $effect(() => {
    const c = active?.kind === "client" ? active.client : null;
    if (!c || panelFor === c.id) return;
    panelFor = c.id;
    panel = null;
    void (async () => {
      const [weights, ending, programs] = await Promise.all([
        c.sharing.bodyweight ? getWebNutritionDeps(c.id).nutritionRepo.listWeightEntries().catch(() => []) : Promise.resolve([]),
        coachApi.endingPreview(c.relationshipId).catch(() => null),
        getWebCoachProgramRepo().listMyPrograms({ recipientId: c.id }).catch(() => []),
      ]);
      const trend = smoothWeightSeries(weights);
      const p = c.program?.program ?? programs.find((x) => !x.program.archived)?.program;
      const exercises = [...new Set((p?.weeks ?? []).flatMap((w) => w.days.flatMap((d) => d.blocks.filter((b) => b.type === "strength").map((b) => (b as { exerciseName: string }).exerciseName))))];
      if (panelFor === c.id) panel = { weightKg: trend.currentKg ?? null, rateKg: trend.weeklyRateKg ?? null, paidUntil: ending?.paidUntil ?? null, exercises };
    })();
  });
  const firstOf = (n: string) => n.split(" ")[0] || n;
  const me = apiClient.getUser()?.displayName || apiClient.getUser()?.username || null;
  /** {exercise}: one of their program's exercises named in their last message. */
  const exercise = $derived.by(() => {
    if (active?.kind !== "client" || !panel) return null;
    const last = active.line.startsWith("You: ") ? "" : active.line.toLowerCase();
    return panel.exercises.find((e) => last.includes(e.toLowerCase())) ?? null;
  });
  // ?swap=1 (a conversation's menu): swap an exercise in their program.
  // svelte-ignore state_referenced_locally
  let swapping = $state(page.url.searchParams.get("swap") === "1");
  let swapHint = $state("");
</script>

<div class="flex flex-col gap-4">
  <header class="flex items-center justify-between gap-3">
    <h1 class="text-[26px] font-bold tracking-tight">Messages</h1>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}<Button {...props} variant="ghost" size="icon" aria-label="More for Messages"><EllipsisIcon class="size-4" /></Button>{/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="w-48">
        <DropdownMenu.Item onSelect={() => (managing = true)}>Saved replies</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => void goto("/clients?tab=requests")}>Requests</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </header>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if loading}
    <div class="grid gap-4 lg:grid-cols-[280px_1fr]"><Skeleton class="h-80" /><Skeleton class="h-[480px]" /></div>
  {:else if rows.length === 0}
    <p class="text-[13px] text-muted-foreground">No conversations yet. <a href="/clients" class="text-primary hover:underline">Invite someone</a>.</p>
  {:else}
    <div class="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_240px]">
      <section aria-label="Conversations" data-guide="messages-list" class="flex flex-col gap-0.5 rounded-[10px] border border-border bg-card p-2">
        <Tabs.Root value={filter} onValueChange={(v) => (filter = v as typeof filter)} class="mx-0.5 mb-1">
          <Tabs.List aria-label="Which conversations" class="w-full">
            <Tabs.Trigger value="all">All</Tabs.Trigger>
            <Tabs.Trigger value="unread">Unread{unreadCount ? ` ${unreadCount}` : ""}</Tabs.Trigger>
            <Tabs.Trigger value="requests">Requests{requestCount ? ` ${requestCount}` : ""}</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
        <input bind:value={search} placeholder="Find someone" aria-label="Find someone"
          class="mx-0.5 mb-1.5 h-[34px] rounded-lg border border-input bg-background px-2.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring" />
        {#each shown as r (r.key)}
          <ActionMenu actions={conversationActions(r.kind === "client" ? { kind: "client", name: r.name, clientId: r.client.id, relationshipId: r.client.relationshipId } : r.kind === "dm" ? { kind: "dm", name: r.name, username: r.thread.other?.username, threadId: r.thread.id } : { kind: "request", name: r.name, relationshipId: r.request.relationshipId, stage: r.request.stage ?? "asked" })} label="More for {r.name}">
          {#snippet children({ props, more })}
          <div {...props} class="group relative flex items-center rounded-lg {r.key === activeKey ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/50'}">
          <button type="button" onclick={() => open(r)} aria-current={r.key === activeKey ? "true" : undefined}
            class="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left">
            <Avatar name={r.name} url={r.avatarUrl} />
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="flex justify-between gap-2">
                <span class="flex items-center gap-1.5 text-[13px] font-semibold">{r.name}{#if r.kind === "request"}<span class="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">{r.request.stage === "waiting" ? "Waiting list" : "Request"}</span>{:else if r.kind === "dm"}<span class="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Direct</span>{/if}</span>
                {#if r.at}<span class="text-[11px] text-muted-foreground">{when(r.at)}</span>{/if}
              </span>
              <span class="truncate text-xs {r.unread ? 'font-medium text-foreground' : 'text-muted-foreground'}">{r.line}</span>
            </span>
            {#if r.unread}<span class="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread"></span>{/if}
          </button>
          {@render more("mr-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100")}
          </div>
          {/snippet}
          </ActionMenu>
        {:else}
          <p class="px-3 py-4 text-[13px] text-muted-foreground">{filter === "unread" ? "Nothing unread." : filter === "requests" ? "No one's asking right now." : "Nobody by that name."}</p>
        {/each}
      </section>

      {#if active?.kind === "client"}
        {@const c = active.client}
        <section aria-label="Conversation with {c.name}" data-guide="messages-thread" class="flex min-w-0 flex-col rounded-[10px] border border-border bg-card">
          <div class="flex items-center justify-between gap-3 border-b border-border px-[18px] py-3.5">
            <span class="flex items-center gap-2.5"><Avatar name={c.name} url={c.avatarUrl} /><ClientHoverCard clientId={c.id} class="text-sm font-semibold hover:underline">{c.name}</ClientHoverCard></span>
            <Button variant="outline" size="sm" href="/clients/{c.id}">Open client</Button>
          </div>
          <div class="flex flex-1 flex-col px-[18px] pb-4 pt-2">
            {#key c.relationshipId}
              <MessageThread relationshipId={c.relationshipId} otherName={c.name} initialDraft={draft} onRead={markOpenRead} onSent={sentInOpen}
                fill={{ firstName: firstOf(c.name), exercise, coachName: me }}
                messageActions={(m) => [{ label: "Swap an exercise in their program…", run: () => { swapHint = m.body; swapping = true; } }]} />
              <SwapInProgramDialog bind:open={swapping} relationshipId={c.relationshipId} hint={swapHint} />
            {/key}
          </div>
        </section>
        <!-- Canvas W2: the client beside the chat. -->
        <aside aria-label="{c.name} at a glance" class="flex flex-col gap-2.5 rounded-[10px] lg:col-start-2 xl:col-start-auto border border-border bg-card px-4 py-3.5 text-[13px]">
          <h2 class="text-sm font-semibold">{firstOf(c.name)}</h2>
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            <dt class="text-muted-foreground">Program</dt><dd>{c.program ? `${c.program.program.name}${c.program.week ? `, week ${c.program.week} of ${c.program.totalWeeks}` : ""}` : "None from you"}</dd>
            {#if c.program?.state === "running"}<dt class="text-muted-foreground">This week</dt><dd>{c.sharing.workouts ? `${c.sessions7d} of ${c.program.daysPerWeek} sessions` : "Not shared"}</dd>{/if}
            <dt class="text-muted-foreground">Last check-in</dt><dd>{c.lastCheckinAtMs ? `${weekdayDate(c.lastCheckinAtMs)}${c.toReview.length ? " · to review" : " · reviewed"}` : "None yet"}</dd>
            {#if panel?.weightKg != null}<dt class="text-muted-foreground">Weight, 7-day</dt><dd>{panel.weightKg.toFixed(1)} kg{panel.rateKg != null ? ` ${panel.rateKg > 0 ? "+" : ""}${panel.rateKg.toFixed(1)}` : ""}</dd>{/if}
            {#if panel?.paidUntil}<dt class="text-muted-foreground">Paid until</dt><dd>{weekdayDate(Date.parse(panel.paidUntil))}</dd>{/if}
          </dl>
          <span class="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" href="/clients/{c.id}?tab=training">Their training</Button>
            {#if c.program}<Button variant="outline" size="sm" href="/clients/{c.id}/programs/{c.program.program.id}?u={c.username}">Edit their program</Button>{/if}
          </span>
        </aside>
      {:else if active?.kind === "dm"}
        <section aria-label="Conversation with {active.name}" class="flex min-h-[480px] min-w-0 flex-col rounded-[10px] xl:col-span-2 border border-border bg-card">
          {#key active.thread.id}
            <DmChat to={{ threadId: active.thread.id }} onchange={() => void load()} ondelete={() => { void goto("/messages"); void load(); }} />
          {/key}
        </section>
      {/if}
    </div>
  {/if}
</div>

<SavedRepliesDialog bind:open={managing} />
