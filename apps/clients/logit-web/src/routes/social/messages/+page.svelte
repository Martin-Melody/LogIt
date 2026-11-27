<script lang="ts">
  import { onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import MessageCircleIcon from "@lucide/svelte/icons/message-circle";
  import { dmApi, type DmThread, type DmTo } from "@logit/core/api/dmApi";
  import Avatar from "$lib/features/social/Avatar.svelte";
  import { photoSrc } from "@logit/core/api/photosApi";
  import DmChat from "$lib/features/social/DmChat.svelte";
  import PrivacyCard from "$lib/features/social/PrivacyCard.svelte";
  import { dmBadge } from "$lib/features/social/socialData.svelte";
  import { coachApi, type CoachRelationship, type MyCoachingRequest } from "@logit/core/api/coachApi";
  import { messagesApi } from "@logit/core/api/messagesApi";
  import { offerStateNow } from "@logit/core/domain/coachRequest";
  import CoachChat from "$lib/features/coaching/CoachChat.svelte";
  import { coachBadges } from "$lib/features/coaching/badges.svelte";

  // Me › Messages: the phone's Messages and Message requests (design canvas M1–M3) as two panes.
  // Every conversation lives in one place, by your role in it (canvas MS1): here are your chats,
  // groups, and conversations where you're the client (your coach, coaches you asked). Where you're
  // the coach, they're in Coaching › Messages.

  type Box = "all" | "friends" | "coaches" | "requests";
  let box = $state<Box>("all");
  let chats = $state<DmThread[] | null>(null);
  let requests = $state<DmThread[]>([]);
  let error = $state(false);
  let now = $state(Date.now());

  const to = $derived<DmTo | null>(
    page.url.searchParams.get("t")
      ? { threadId: page.url.searchParams.get("t")! }
      : page.url.searchParams.get("u")
        ? { username: page.url.searchParams.get("u")! }
        : null,
  );
  const selected = $derived(to && "threadId" in to ? to.threadId : null);
  const coachRel = $derived(page.url.searchParams.get("c"));

  // Your coaching conversations as the client.
  type CoachRow = { rel: string; name: string; avatarUrl: string | null; label: string; line: string; at: number; unread: boolean; coach: CoachRelationship | null; request: MyCoachingRequest | null };
  let coachRows = $state<CoachRow[]>([]);
  async function loadCoaching() {
    const [coaches, asked, all, unread] = await Promise.all([
      coachApi.listCoaches().catch(() => [] as CoachRelationship[]),
      coachApi.listMyRequests(true).catch(() => [] as MyCoachingRequest[]),
      messagesApi.listAll(0).catch(() => []),
      messagesApi.unreadCounts().catch(() => []),
    ]);
    const lastOf = (rel: string) => all.filter((m) => m.relationshipId === rel).sort((a, b) => b.createdAtMs - a.createdAtMs)[0];
    const row = (rel: string, who: { displayName: string; username: string; avatarUrl: string | null }, label: string, since: number, coach: CoachRelationship | null, request: MyCoachingRequest | null): CoachRow => {
      const last = lastOf(rel);
      const body = last ? last.body || (last.photoUrl ? "Photo" : last.voiceUrl ? "Voice message" : "") : "";
      return { rel, name: who.displayName || who.username, avatarUrl: who.avatarUrl, label, line: last ? `${last.mine ? "You: " : ""}${body}` : "No messages yet", at: last?.createdAtMs ?? since, unread: (unread.find((u) => u.relationshipId === rel)?.unread ?? 0) > 0, coach, request };
    };
    coachRows = [
      ...coaches.map((c) => row(c.relationshipId, c.coach, "Your coach", Date.parse(c.since ?? "") || 0, c, null)),
      ...asked.filter((q) => !coaches.some((c) => c.relationshipId === q.relationshipId)).map((q) => row(q.relationshipId, q.coach,
        q.closed ? "Closed" : q.stage === "waiting" ? "Waiting list" : q.stage === "offered" && q.offer && offerStateNow(q.offer, Date.now()) === "open" ? "Offer" : "Asked",
        Date.parse(q.requestedAt) || 0, null, q)),
    ];
  }
  const openCoach = $derived(coachRows.find((x) => x.rel === coachRel) ?? null);

  async function load() {
    try {
      [chats, requests] = await Promise.all([dmApi.threads("chats"), dmApi.threads("requests"), loadCoaching().catch(() => {})]);
      now = Date.now();
      error = false;
      void dmBadge.refresh(true);
      void coachBadges.refresh(undefined, true);
    } catch {
      error = true;
      chats ??= [];
    }
  }
  void load();
  const poll = setInterval(() => document.visibilityState === "visible" && void load(), 20_000);
  onDestroy(() => clearInterval(poll));

  function ago(ms: number): string {
    const s = (now - ms) / 1000;
    if (s < 60) return "now";
    if (s < 3600) return `${Math.floor(s / 60)} min`;
    if (s < 86400) return `${Math.floor(s / 3600)} h`;
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  // One list: chats and your coaching conversations, newest first; chips narrow it (canvas MS1).
  type Item = { kind: "dm"; at: number; t: DmThread } | { kind: "coach"; at: number; c: CoachRow };
  const shown = $derived.by((): Item[] => {
    if (box === "requests") return requests.map((t) => ({ kind: "dm" as const, at: t.lastAtMs, t }));
    const dms: Item[] = box === "coaches" ? [] : (chats ?? []).map((t) => ({ kind: "dm" as const, at: t.lastAtMs, t }));
    const cs: Item[] = box === "friends" ? [] : coachRows.filter((c) => box === "coaches" || c.label !== "Closed").map((c) => ({ kind: "coach" as const, at: c.at, c }));
    return [...dms, ...cs].sort((a, b) => b.at - a.at);
  });
  const coachUnread = $derived(coachRows.filter((c) => c.unread).length);
</script>

<svelte:head><title>Messages · LogIt</title></svelte:head>

<div class="mx-auto flex h-[calc(100svh-6.25rem)] w-full min-w-0 max-w-[1100px] overflow-hidden rounded-[10px] border border-border bg-card md:h-[calc(100svh-3.5rem)]">
  <aside class="flex w-full min-w-0 flex-col border-r border-border md:w-[clamp(220px,32%,320px)] md:shrink-0 {to || coachRel ? 'hidden md:flex' : ''}">
    <div role="tablist" aria-label="Which conversations" class="flex flex-wrap gap-1.5 border-b border-border p-2">
      {#each [["all", "All"], ["friends", "Friends"], ...(coachRows.length ? [["coaches", "Coaches"]] : []), ["requests", "Requests"]] as [v, l] (v)}
        <button type="button" role="tab" aria-selected={box === v} onclick={() => (box = v as Box)}
          class="h-8 rounded-full border px-3 text-[13px] transition-colors {box === v ? 'border-primary bg-primary font-semibold text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}">
          {l}{#if v === "requests" && requests.length}<span class="ml-1 tabular-nums">{requests.length}</span>{:else if v === "coaches" && coachUnread}<span class="ml-1 tabular-nums">{coachUnread}</span>{/if}
        </button>
      {/each}
    </div>
    {#if box === "requests"}
      <p class="px-4 pt-3 text-xs text-muted-foreground">From people you don't follow. They won't know you've seen a message until you accept.</p>
    {/if}
    <div class="min-h-0 flex-1 overflow-y-auto py-1">
      {#if chats === null}
        <p class="px-4 py-6 text-[13px] text-muted-foreground">Loading…</p>
      {:else if error && shown.length === 0}
        <p class="px-4 py-6 text-[13px] text-muted-foreground">Couldn't load your messages. <button type="button" class="underline" onclick={load}>Try again</button></p>
      {:else if shown.length === 0}
        <p class="px-4 py-10 text-center text-[13px] text-muted-foreground">{box === "requests" ? "No message requests." : box === "coaches" ? "No coaches yet." : "No messages yet. Open someone's profile and choose Message."}</p>
      {:else}
        {#each shown as it (it.kind === "dm" ? it.t.id : `c:${it.c.rel}`)}
          {#if it.kind === "coach"}
            {@const c = it.c}
            <button type="button" onclick={() => goto(`/social/messages?c=${c.rel}`)}
              class="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60 {coachRel === c.rel ? 'bg-muted' : ''}">
              <Avatar name={c.name} url={c.avatarUrl} size={40} />
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-1.5 text-[13px] {c.unread ? 'font-semibold' : 'font-medium'}"><span class="truncate">{c.name}</span><span class="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{c.label}</span></span>
                <span class="flex gap-1 text-xs {c.unread ? 'font-semibold text-foreground' : 'text-muted-foreground'}"><span class="truncate">{c.line}</span>{#if c.at}<span class="shrink-0 font-normal text-muted-foreground">· {ago(c.at)}</span>{/if}</span>
              </span>
              {#if c.unread}<span class="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread"></span>{/if}
            </button>
          {:else}
          {@const t = it.t}
          <button type="button" onclick={() => goto(`/social/messages?t=${t.id}`)}
            class="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60 {selected === t.id ? 'bg-muted' : ''}">
            {#if t.group}
              <span aria-hidden="true" class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-muted text-sm font-bold">{#if t.group.photoUrl}<img src={photoSrc(t.group.photoUrl)} alt="" class="size-full object-cover" />{:else}{t.group.name.slice(0, 2).toUpperCase()}{/if}</span>
            {:else}<Avatar name={t.other?.displayName ?? ""} url={t.other?.avatarUrl} size={40} />{/if}
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px] {t.unread ? 'font-semibold' : 'font-medium'}">{t.group ? t.group.name : t.other ? t.other.displayName || t.other.username : "Deleted account"}</span>
              <span class="flex gap-1 text-xs {t.unread ? 'font-semibold text-foreground' : 'text-muted-foreground'}"><span class="truncate">{t.lastMine ? "You: " : t.lastBy ? `${t.lastBy}: ` : ""}{t.lastBody || (t.group ? "New group" : "")}</span><span class="shrink-0 font-normal text-muted-foreground">· {ago(t.lastAtMs)}</span></span>
            </span>
            {#if t.unread}<span class="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread"></span>{/if}
          </button>
          {/if}
        {/each}
      {/if}
    </div>
  </aside>

  <section class="min-w-0 flex-1 flex-col {to || coachRel ? 'flex' : 'hidden md:flex'}">
    {#if coachRel && openCoach}
      <button type="button" onclick={() => goto("/social/messages")} class="border-b border-border px-4 py-2 text-left text-xs text-muted-foreground md:hidden">‹ All messages</button>
      <CoachChat coach={openCoach.coach} request={openCoach.request} />
    {:else if to}
      <button type="button" onclick={() => goto("/social/messages")} class="border-b border-border px-4 py-2 text-left text-xs text-muted-foreground md:hidden">‹ All messages</button>
      <DmChat {to} onchange={load} ondelete={() => { void goto("/social/messages"); void load(); }} />
    {:else}
      <div class="m-auto flex w-full max-w-[420px] flex-col gap-6 px-6">
        <div class="flex flex-col items-center gap-2 text-center text-muted-foreground">
          <MessageCircleIcon class="size-6" />
          <p class="text-[13px]">Choose a conversation. The same messages are in the app.</p>
        </div>
        <PrivacyCard />
      </div>
    {/if}
  </section>
</div>
