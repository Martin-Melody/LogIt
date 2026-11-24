<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { dmApi, type DmChat, type DmTo } from "@logit/core/api/dmApi";
  import Avatar from "./Avatar.svelte";
  import { dmBadge } from "./socialData.svelte";

  // One conversation between people (the phone's chat screen, design canvas M2), by username
  // or thread. Same server rules as the phone: a request you received shows Accept / Delete;
  // "Seen" only with read receipts on for both. Polls while open; no push on the web.

  let { to, onchange }: { to: DmTo; onchange?: () => void } = $props();

  let chat = $state<DmChat | null>(null);
  let error = $state<string | null>(null);
  let draft = $state("");
  let sending = $state(false);
  let sendError = $state<string | null>(null);
  let older = $state(false);
  let listEl = $state<HTMLDivElement | null>(null);
  let currentKey = "";

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
        <div class="max-w-[70%] rounded-xl px-3 py-2 text-[13px] leading-relaxed {m.mine ? 'self-end bg-primary/15' : 'self-start bg-muted'}">
          <span class="whitespace-pre-wrap break-words">{m.body}</span>
          <span class="mt-0.5 block text-right text-[10px] text-muted-foreground">{time(m.createdAtMs)}</span>
        </div>
      {/each}
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
        <label for="dm-compose" class="sr-only">Message {name}</label>
        <textarea id="dm-compose" bind:value={draft} onkeydown={onKey} rows={2} maxlength={2000} placeholder="Message {name}"
          class="flex-1 resize-y rounded-[10px] border border-input bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"></textarea>
        <button type="submit" disabled={sending || !draft.trim()} class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Send</button>
      </div>
      {#if sendError}<p class="text-xs text-destructive">{sendError}</p>{:else}<span class="text-[11px] text-muted-foreground">Enter sends · Shift+Enter for a new line</span>{/if}
    </form>
  {/if}
</div>
