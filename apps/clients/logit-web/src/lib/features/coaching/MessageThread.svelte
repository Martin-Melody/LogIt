<script lang="ts">
  import { guideSignal } from "$lib/features/guide/signal";
  import { onSampleActivity } from "$lib/features/guide/sandbox.svelte";
  import { onDestroy, tick } from "svelte";
  import { messagesApi, type RemoteMessage } from "@logit/core/api/messagesApi";
  import { createId } from "@logit/core/domain/ids";
  import { coachBadges } from "./badges.svelte";
  import ImageIcon from "@lucide/svelte/icons/image";
  import ChatPhoto from "$lib/features/social/ChatPhoto.svelte";
  import { pickAndUploadPhoto } from "$lib/features/social/chatPhoto";

  // One coach↔client conversation: messages, read marks, a composer. Used by Messages (coach),
  // a client's Messages tab and My coach. Polls while open; the phone gets messages on sync.

  let {
    relationshipId,
    otherName,
    initialDraft = "",
    compact = false,
    onRead,
    onSent,
  }: {
    relationshipId: string;
    otherName: string;
    initialDraft?: string;
    /** Fewer messages shown, shorter box (cards on overview pages). */
    compact?: boolean;
    onRead?: () => void;
    onSent?: (body: string, atMs: number) => void;
  } = $props();

  let messages = $state<RemoteMessage[]>([]);
  let loaded = $state(false);
  let error = $state<string | null>(null);
  // svelte-ignore state_referenced_locally
  let draft = $state(initialDraft);
  let sending = $state(false);
  let listEl = $state<HTMLDivElement | null>(null);
  let currentId = "";
  let poll: ReturnType<typeof setInterval> | undefined;

  async function refresh(scroll = false) {
    const id = relationshipId;
    try {
      // In the order they were sent. The server lists them by when they last changed, and
      // being read is a change, so its order moves a message to the end once it's read.
      const list = (await messagesApi.list(id, 0)).sort(
        (a, b) => a.createdAtMs - b.createdAtMs || a.messageId.localeCompare(b.messageId),
      );
      if (id !== relationshipId) return;
      messages = list;
      loaded = true;
      error = null;
      const lastTheirs = list.filter((m) => !m.mine && m.readAtMs == null).at(-1)?.createdAtMs;
      if (lastTheirs) {
        await messagesApi.markRead(id, lastTheirs).catch(() => {});
        onRead?.();
        void coachBadges.refresh(undefined, true);
      }
      if (scroll) {
        await tick();
        listEl?.scrollTo({ top: listEl.scrollHeight });
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load messages";
    }
  }

  $effect(() => {
    if (relationshipId !== currentId) {
      currentId = relationshipId;
      messages = [];
      loaded = false;
      void refresh(true);
    }
  });
  poll = setInterval(() => void refresh(false), 12_000);
  // A sandbox sample client's reply shows straight away rather than at the next poll.
  const stopSampleWatch = onSampleActivity(() => void refresh(true));
  onDestroy(stopSampleWatch);
  onDestroy(() => clearInterval(poll));

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    sending = true;
    try {
      const at = Date.now();
      await messagesApi.send({ relationshipId, messageId: createId("msg"), body, createdAtMs: at });
      draft = "";
      guideSignal("message.sent");
      onSent?.(body, at);
      await refresh(true);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't send";
    } finally {
      sending = false;
    }
  }

  let uploading = $state(false);
  // A form-check or progress photo (design canvas C2).
  async function sendPhoto() {
    error = null;
    try {
      const photo = await pickAndUploadPhoto();
      if (!photo) return;
      uploading = true;
      const at = Date.now();
      await messagesApi.send({ relationshipId, messageId: createId("msg"), body: "", createdAtMs: at, photoId: photo.id });
      onSent?.("Sent a photo", at);
      await refresh(true);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't send the photo";
    } finally {
      uploading = false;
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
    const today = new Date();
    const y = new Date(Date.now() - 86_400_000);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
  }
  const time = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const contextLabel = (iso: string) =>
    new Date(iso + "T12:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

  const shown = $derived(compact ? messages.slice(-4) : messages);
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div bind:this={listEl} class="flex flex-1 flex-col gap-2 overflow-y-auto {compact ? 'max-h-72' : 'min-h-[360px] max-h-[60vh]'} py-1">
    {#if !loaded && !error}
      <p class="py-6 text-center text-[13px] text-muted-foreground">Loading…</p>
    {:else if messages.length === 0}
      <p class="py-6 text-center text-[13px] text-muted-foreground">No messages yet. Say hello to {otherName}.</p>
    {/if}
    {#each shown as m, i (m.messageId)}
      {#if !compact && (i === 0 || dayLabel(m.createdAtMs) !== dayLabel(shown[i - 1].createdAtMs))}
        <div class="py-1.5 text-center text-[11px] text-muted-foreground">{dayLabel(m.createdAtMs)}</div>
      {/if}
      {#if m.photoUrl}
        <ChatPhoto url={m.photoUrl} width={m.photoWidth ?? 0} height={m.photoHeight ?? 0} mine={m.mine} />
        {#if !m.body}<span class="shrink-0 px-1 text-[10px] text-muted-foreground {m.mine ? 'self-end' : 'self-start'}">{time(m.createdAtMs)}</span>{/if}
      {/if}
      {#if m.body || m.contextDateIso}
      <div class="max-w-[78%] rounded-xl px-3 py-2 text-[13px] leading-relaxed {m.mine ? 'self-end bg-primary/15' : 'self-start bg-muted'}">
        {#if m.contextDateIso}
          <span class="mb-1 inline-block rounded-md bg-background/60 px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Diary · {contextLabel(m.contextDateIso)}</span><br />
        {/if}
        <span class="whitespace-pre-wrap break-words">{m.body}</span>
        <span class="mt-0.5 block text-right text-[10px] text-muted-foreground">{time(m.createdAtMs)}</span>
      </div>
      {/if}
    {/each}
    {#if uploading}<span class="self-end text-[11px] text-muted-foreground">Sending photo…</span>{/if}
  </div>
  {#if error}<p class="pt-1 text-xs text-destructive">{error}</p>{/if}
  <form data-guide="message-compose" class="flex flex-col gap-1.5 border-t border-border pt-3" onsubmit={(e) => { e.preventDefault(); void send(); }}>
    <div class="flex items-end gap-2">
      <button type="button" onclick={sendPhoto} disabled={uploading} aria-label="Send a photo" class="flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"><ImageIcon class="size-4" /></button>
      <label for="compose-{relationshipId}" class="sr-only">Message {otherName}</label>
      <textarea id="compose-{relationshipId}" bind:value={draft} onkeydown={onKey} rows={compact ? 1 : 2} placeholder="Message {otherName}"
        class="flex-1 resize-y rounded-[10px] border border-input bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"></textarea>
      <button type="submit" disabled={sending || !draft.trim()}
        class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Send</button>
    </div>
    {#if !compact}<span class="text-[11px] text-muted-foreground">Enter sends · Shift+Enter for a new line · it reaches their phone on its next sync</span>{/if}
  </form>
</div>
