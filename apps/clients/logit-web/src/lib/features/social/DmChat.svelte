<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { dmApi, type DmChat, type DmTo } from "@logit/core/api/dmApi";
  import Avatar from "./Avatar.svelte";
  import { dmBadge, loadComposerSources, type ComposerSources } from "./socialData.svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import * as Dialog from "$lib/components/ui/dialog";
  import MoreHorizontalIcon from "@lucide/svelte/icons/more-horizontal";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import ImageIcon from "@lucide/svelte/icons/image";
  import ChatPhoto from "./ChatPhoto.svelte";
  import { pickAndUploadPhoto } from "./chatPhoto";
  import DumbbellIcon from "@lucide/svelte/icons/dumbbell";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import { cardTitle, readCard, readStoryQuote, recordCard, workoutCard } from "@logit/core/domain/messageCard";

  // One conversation between people (the phone's chat screen, design canvas M2), by username
  // or thread. Same server rules as the phone: a request you received shows Accept / Delete;
  // "Seen" only with read receipts on for both. Polls while open; no push on the web.

  let { to, onchange, ondelete }: { to: DmTo; onchange?: () => void; ondelete?: () => void } = $props();

  let chat = $state<DmChat | null>(null);
  let error = $state<string | null>(null);
  let draft = $state("");
  let sending = $state(false);
  let sendError = $state<string | null>(null);
  let older = $state(false);
  let listEl = $state<HTMLDivElement | null>(null);
  let currentKey = "";
  let confirmDelete = $state(false);
  let sharing = $state(false);
  let shareTab = $state<"workouts" | "records">("workouts");
  let sources = $state<ComposerSources | null>(null);

  const name = $derived(chat?.other ? chat.other.displayName || chat.other.username : chat ? "Deleted account" : "");
  const lastMine = $derived(chat?.messages.findLast((m) => m.mine) ?? null);
  const seen = $derived(!!chat?.seenAtMs && !!lastMine && chat.seenAtMs >= lastMine.createdAtMs && !!chat.messages.at(-1)?.mine);

  async function load(scroll = false) {
    const key = JSON.stringify(to);
    try {
      const before = chat?.messages.length ?? 0;
      const next = await dmApi.chat(to);
      if (key !== JSON.stringify(to)) return;
      if (chat && chat.threadId === next.threadId) {
        const firstNew = next.messages[0]?.createdAtMs ?? Infinity;
        next.messages = [...chat.messages.filter((m) => m.createdAtMs < firstNew), ...next.messages];
      } else older = next.messages.length >= 50;
      chat = next;
      error = null;
      if (next.threadId && next.accepted && next.messages.some((m) => !m.mine)) {
        await dmApi.read(next.threadId).catch(() => {});
        void dmBadge.refresh(true);
      }
      if (before > 0 && next.messages.length > before) onchange?.(); // the list's preview and order
      if (scroll || next.messages.length > before) {
        await tick();
        listEl?.scrollTo({ top: listEl.scrollHeight });
      }
    } catch (e) {
      error = e instanceof Error && "status" in e && (e as { status: number }).status === 404 ? "This conversation isn't available." : "Couldn't load this conversation.";
    }
  }

  $effect(() => {
    const key = JSON.stringify(to);
    if (key !== currentKey) {
      currentKey = key;
      chat = null;
      draft = "";
      sendError = null;
      void load(true);
    }
  });
  const poll = setInterval(() => document.visibilityState === "visible" && void load(), 6_000);
  onDestroy(() => clearInterval(poll));

  async function loadOlder() {
    if (!chat?.messages.length) return;
    const page = await dmApi.chat(to, chat.messages[0]!.createdAtMs).catch(() => null);
    if (!page) return;
    chat = { ...chat, messages: [...page.messages, ...chat.messages] };
    older = page.messages.length >= 50;
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending || !chat) return;
    sending = true;
    sendError = null;
    try {
      await dmApi.send(chat.threadId ? { threadId: chat.threadId } : to, crypto.randomUUID(), body);
      draft = "";
      await load(true);
      onchange?.();
    } catch (e) {
      sendError = e instanceof Error ? `${e.message} Try again.` : "Couldn't send. Try again.";
    } finally {
      sending = false;
    }
  }

  async function sendCard(card: { type: string; json: string }) {
    sharing = false;
    if (!chat) return;
    try {
      await dmApi.send(chat.threadId ? { threadId: chat.threadId } : to, crypto.randomUUID(), "", { card });
      await load(true);
      onchange?.();
    } catch (e) {
      sendError = e instanceof Error ? `${e.message} Try again.` : "Couldn't send. Try again.";
    }
  }

  let uploading = $state(false);
  async function sendPhoto() {
    if (!chat) return;
    sendError = null;
    try {
      const photo = await pickAndUploadPhoto();
      if (!photo) return;
      uploading = true;
      await dmApi.send(chat.threadId ? { threadId: chat.threadId } : to, crypto.randomUUID(), "", { photoId: photo.id });
      await load(true);
      onchange?.();
    } catch (e) {
      sendError = e instanceof Error ? `${e.message} Try again.` : "Couldn't send the photo. Try again.";
    } finally {
      uploading = false;
    }
  }

  function openShare() {
    sharing = true;
    if (!sources) void loadComposerSources().then((s) => (sources = s)).catch(() => (sources = { sessions: [], prs: [], splits: [], library: [], habits: [] }));
  }

  async function deleteChat() {
    if (!chat?.threadId) return;
    try {
      await dmApi.remove(chat.threadId);
      ondelete?.();
    } catch {
      sendError = "Couldn't delete. Try again.";
    }
  }

  async function answer(accept: boolean) {
    if (!chat?.threadId) return;
    try {
      if (accept) {
        await dmApi.accept(chat.threadId);
        chat = { ...chat, accepted: true };
      } else {
        await dmApi.remove(chat.threadId);
        chat = null;
        error = "Deleted. A new message from them shows up in your requests again.";
      }
      onchange?.();
    } catch {
      sendError = "Couldn't do that. Try again.";
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function dayLabel(ms: number): string {
    const d = new Date(ms);
    if (d.toDateString() === new Date().toDateString()) return "Today";
    if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
  }
  const time = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
</script>

<div class="flex min-h-0 flex-1 flex-col">
  {#if chat}
    <header class="flex items-center gap-3 border-b border-border px-4 py-3">
      {#if chat.other}
        <a href="/social/{chat.other.username}" class="flex min-w-0 items-center gap-3 hover:opacity-90">
          <Avatar name={name} url={chat.other.avatarUrl} size={36} />
          <span class="min-w-0"><span class="block truncate text-sm font-semibold">{name}</span><span class="block truncate text-xs text-muted-foreground">@{chat.other.username}</span></span>
        </a>
      {:else}
        <Avatar name="" size={36} /><span class="text-sm font-semibold">{name}</span>
      {/if}
      {#if chat.threadId}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <button {...props} type="button" aria-label="Chat options" class="ml-auto flex size-9 items-center justify-center rounded-[9px] border border-border"><MoreHorizontalIcon class="size-4" /></button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end">
            <DropdownMenu.Item class="text-destructive" onclick={() => (confirmDelete = true)}>Delete chat</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/if}
    </header>
  {/if}

  <div bind:this={listEl} class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-3">
    {#if error}
      <p class="m-auto text-[13px] text-muted-foreground">{error}</p>
    {:else if !chat}
      <p class="m-auto text-[13px] text-muted-foreground">Loading…</p>
    {:else}
      {#if older}<button type="button" onclick={loadOlder} class="mx-auto mb-2 h-8 rounded-full border border-border px-3 text-xs">Earlier messages</button>{/if}
      {#if chat.messages.length === 0}
        <p class="m-auto max-w-[36ch] text-center text-[13px] text-muted-foreground">{chat.canSend ? `Say hello to ${name}. Messages to people who don't follow you go to their requests.` : chat.why}</p>
      {/if}
      {#each chat.messages as m, i (m.id)}
        {#if i === 0 || dayLabel(m.createdAtMs) !== dayLabel(chat.messages[i - 1]!.createdAtMs)}
          <div class="py-1.5 text-center text-[11px] text-muted-foreground">{dayLabel(m.createdAtMs)}</div>
        {/if}
        {@const story = m.cardType === "Story"}
        {@const card = story ? readStoryQuote(m.cardJson) : readCard(m.cardType, m.cardJson)}
        {#if story}<span class="px-1 text-[11px] text-muted-foreground {m.mine ? 'self-end' : 'self-start'}">{m.mine ? `Replied to ${name}'s story` : "Replied to your story"}{card ? "" : " · no longer available"}</span>{/if}
        {#if card}
          <div class="flex w-[280px] max-w-[70%] flex-col gap-1 rounded-xl border border-border bg-background px-3 py-2.5 {m.mine ? 'self-end' : 'self-start'}">
            <span class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {#if card.type === "PersonalRecord"}<TrophyIcon class="size-3" />New record{:else}<DumbbellIcon class="size-3" />Workout{/if}
            </span>
            <span class="text-[13px] font-semibold tabular-nums">{cardTitle(card)}</span>
            {#if card.type === "WorkoutSession" && card.data.exercises?.length}<span class="text-xs text-muted-foreground">{card.data.exercises.map((e) => `${e.name} (${e.sets})`).join(" · ")}</span>{/if}
            <span class="text-right text-[10px] text-muted-foreground">{time(m.createdAtMs)}</span>
          </div>
        {/if}
        {#if m.photoUrl || m.photoHidden}<ChatPhoto url={m.photoUrl} width={m.photoWidth} height={m.photoHeight} hidden={m.photoHidden} mine={m.mine} />{/if}
        {#if m.body}
          <div class="max-w-[70%] rounded-xl px-3 py-2 text-[13px] leading-relaxed {m.mine ? 'self-end bg-primary/15' : 'self-start bg-muted'}">
            <span class="whitespace-pre-wrap break-words">{m.body}</span>
            <span class="mt-0.5 block text-right text-[10px] text-muted-foreground">{time(m.createdAtMs)}</span>
          </div>
        {/if}
      {/each}
      {#if uploading}<span class="self-end text-[11px] text-muted-foreground">Sending photo…</span>{/if}
      {#if seen}<span class="self-end text-[11px] text-muted-foreground">Seen</span>{/if}
    {/if}
  </div>

  {#if chat && !chat.accepted}
    <div class="flex flex-col gap-2 border-t border-border px-4 py-3">
      <p class="text-xs text-muted-foreground">{name} wants to send you a message. They won't know you've seen it until you accept. Block or report from their profile.</p>
      <div class="flex gap-2">
        <button type="button" onclick={() => answer(false)} class="h-9 rounded-[9px] border border-border px-4 text-[13px] font-medium hover:bg-muted">Delete</button>
        <button type="button" onclick={() => answer(true)} class="h-9 rounded-[9px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground">Accept</button>
      </div>
      {#if sendError}<p class="text-xs text-destructive">{sendError}</p>{/if}
    </div>
  {:else if chat && !chat.canSend}
    {#if chat.messages.length > 0}<p class="border-t border-border px-4 py-3 text-center text-xs text-muted-foreground">{chat.why}</p>{/if}
  {:else if chat}
    <form class="flex flex-col gap-1.5 border-t border-border px-4 py-3" onsubmit={(e) => { e.preventDefault(); void send(); }}>
      <div class="flex items-end gap-2">
        <button type="button" onclick={sendPhoto} disabled={uploading} aria-label="Send a photo" class="flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"><ImageIcon class="size-4" /></button>
        <button type="button" onclick={openShare} aria-label="Share a workout or record" class="flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-border text-muted-foreground hover:text-foreground"><PlusIcon class="size-4" /></button>
        <label for="dm-compose" class="sr-only">Message {name}</label>
        <textarea id="dm-compose" bind:value={draft} onkeydown={onKey} rows={2} maxlength={2000} placeholder="Message {name}"
          class="flex-1 resize-y rounded-[10px] border border-input bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"></textarea>
        <button type="submit" disabled={sending || !draft.trim()} class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Send</button>
      </div>
      {#if sendError}<p class="text-xs text-destructive">{sendError}</p>{:else}<span class="text-[11px] text-muted-foreground">Enter sends · Shift+Enter for a new line</span>{/if}
    </form>
  {/if}
</div>

<AlertDialog.Root bind:open={confirmDelete}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Delete this chat?</AlertDialog.Title>
      <AlertDialog.Description>It's removed for you only. {name} keeps their copy, and a new message from them starts it again.</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={deleteChat}>Delete</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<Dialog.Root bind:open={sharing}>
  <Dialog.Content class="sm:max-w-[440px]">
    <Dialog.Header>
      <Dialog.Title>Share a workout or record</Dialog.Title>
      <Dialog.Description>It goes into the chat as a card.</Dialog.Description>
    </Dialog.Header>
    <div class="flex gap-1 self-start rounded-[9px] bg-muted p-0.5" role="tablist" aria-label="What to share">
      {#each [["workouts", "Workouts"], ["records", "Records"]] as [v, label] (v)}
        <button type="button" role="tab" aria-selected={shareTab === v} onclick={() => (shareTab = v as "workouts" | "records")}
          class="h-7 rounded-[7px] px-3 text-xs font-medium {shareTab === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}">{label}</button>
      {/each}
    </div>
    <div class="flex max-h-80 flex-col overflow-y-auto">
      {#if !sources}
        <p class="py-6 text-center text-[13px] text-muted-foreground">Loading…</p>
      {:else if shareTab === "workouts"}
        {#each sources.sessions as { session, title } (session.id)}
          <button type="button" onclick={() => sendCard({ type: "WorkoutSession", json: workoutCard(session) })} class="flex items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] hover:bg-muted">
            <DumbbellIcon class="size-4 shrink-0 text-muted-foreground" /><span class="min-w-0 flex-1 truncate">{title}</span>
          </button>
        {:else}<p class="py-6 text-center text-[13px] text-muted-foreground">Finished workouts show here.</p>{/each}
      {:else}
        {#each sources.prs as pr (pr.exerciseName + pr.atMs)}
          {@const json = recordCard(pr)}
          <button type="button" onclick={() => sendCard({ type: "PersonalRecord", json })} class="flex items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] hover:bg-muted">
            <TrophyIcon class="size-4 shrink-0 text-muted-foreground" /><span class="min-w-0 flex-1 truncate tabular-nums">{cardTitle(readCard("PersonalRecord", json)!)}</span>
          </button>
        {:else}<p class="py-6 text-center text-[13px] text-muted-foreground">Your records show here once you've logged some.</p>{/each}
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
