<script lang="ts">
  import { guideSignal } from "$lib/features/guide/signal";
  import { onSampleActivity } from "$lib/features/guide/sandbox.svelte";
  import { onDestroy, tick } from "svelte";
  import { messagesApi, type RemoteMessage } from "@logit/core/api/messagesApi";
  import { createId } from "@logit/core/domain/ids";
  import { coachBadges } from "./badges.svelte";
  import ImageIcon from "@lucide/svelte/icons/image";
  import ChatPhoto from "$lib/features/social/ChatPhoto.svelte";
  import ChatVoice from "$lib/features/social/ChatVoice.svelte";
  import VoiceRecorder from "$lib/features/social/VoiceRecorder.svelte";
  import MicIcon from "@lucide/svelte/icons/mic";
  import type { MessageVoice } from "@logit/core/api/voiceApi";
  import * as Message from "$lib/components/ui/message/index.js";
  import * as Bubble from "$lib/components/ui/bubble/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import StagedPhotoCard from "$lib/features/chat/StagedPhotoCard.svelte";
  import { StagedPhoto, imageFrom } from "$lib/features/chat/stagedPhoto.svelte";

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

  // A photo waits in the box (picked, pasted or dropped) so a caption can go with it (canvas board 20).
  const staged = new StagedPhoto();

  async function send() {
    const body = draft.trim();
    const photo = staged.ready;
    if ((!body && !photo) || sending || (staged.current && !photo)) return;
    sending = true;
    try {
      const at = Date.now();
      await messagesApi.send({ relationshipId, messageId: createId("msg"), body, createdAtMs: at, ...(photo ? { photoId: photo.id } : {}) });
      draft = "";
      if (photo) staged.drop();
      guideSignal("message.sent");
      onSent?.(body || "Sent a photo", at);
      await refresh(true);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't send";
    } finally {
      sending = false;
    }
  }

  let recording = $state(false);
  async function sendVoice(voice: MessageVoice) {
    recording = false;
    if (!voice.id) return;
    try {
      const at = Date.now();
      await messagesApi.send({ relationshipId, messageId: createId("msg"), body: "", createdAtMs: at, voiceId: voice.id, voicePeaks: voice.peaks });
      onSent?.("Voice message", at);
      await refresh(true);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't send the voice message";
    }
  }
  function onPaste(e: ClipboardEvent) {
    const file = imageFrom(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    void staged.stage(file);
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
  // Runs from one side (shadcn Message): joined corners, the time once under each run.
  const runs = $derived.by(() => {
    const out: { key: string; mine: boolean; day: boolean; items: RemoteMessage[] }[] = [];
    shown.forEach((m, i) => {
      const day = !compact && (i === 0 || dayLabel(m.createdAtMs) !== dayLabel(shown[i - 1]!.createdAtMs));
      const prev = out.at(-1);
      if (prev && !day && prev.mine === m.mine && m.createdAtMs - prev.items.at(-1)!.createdAtMs < 3_600_000) prev.items.push(m);
      else out.push({ key: m.messageId, mine: m.mine, day, items: [m] });
    });
    return out;
  });
  const lastMine = $derived(messages.findLast((m) => m.mine));
  const joined = (mine: boolean, first: boolean, last: boolean) =>
    mine ? `${first ? "" : "rounded-tr-md!"} ${last ? "" : "rounded-br-md!"}` : `${first ? "" : "rounded-tl-md!"} ${last ? "" : "rounded-bl-md!"}`;
  const joinedKids = (mine: boolean, first: boolean, last: boolean) =>
    mine ? `${first ? "" : "*:rounded-tr-md!"} ${last ? "" : "*:rounded-br-md!"}` : `${first ? "" : "*:rounded-tl-md!"} ${last ? "" : "*:rounded-bl-md!"}`;
  let dragging = $state(false);
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div bind:this={listEl} role="log" aria-label="Messages" class="relative flex flex-1 flex-col gap-1.5 overflow-y-auto {compact ? 'max-h-72' : 'min-h-[360px] max-h-[60vh]'} py-1"
    ondragover={(e) => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); dragging = true; } }}
    ondragleave={() => (dragging = false)}
    ondrop={(e) => { dragging = false; const f = imageFrom(e.dataTransfer); if (f) { e.preventDefault(); void staged.stage(f); } }}>
    {#if !loaded && !error}
      <p class="py-6 text-center text-[13px] text-muted-foreground">Loading…</p>
    {:else if messages.length === 0}
      <p class="py-6 text-center text-[13px] text-muted-foreground">No messages yet. Say hello to {otherName}.</p>
    {/if}
    {#each runs as run (run.key)}
      {#if run.day}<div class="py-1.5 text-center text-[11px] text-muted-foreground">{dayLabel(run.items[0]!.createdAtMs)}</div>{/if}
      <Message.Root align={run.mine ? "end" : "start"} class="shrink-0 text-[13px]">
        <Message.Content class="gap-1">
          {#each run.items as m, k (m.messageId)}
            {@const first = k === 0}
            {@const end = k === run.items.length - 1}
            {@const align = m.mine ? "end" : "start"}
            <div class="flex w-full flex-col gap-1 {m.mine ? 'items-end' : 'items-start'}">
              {#if m.photoUrl && m.body}
                <Bubble.Root variant={m.mine ? "default" : "muted"} {align} class="max-w-[78%]">
                  <Bubble.Content class="overflow-hidden rounded-[18px] p-0 text-[13px] {joined(m.mine, first, end)}">
                    <ChatPhoto url={m.photoUrl} width={m.photoWidth ?? 0} height={m.photoHeight ?? 0} mine={m.mine} bare />
                    <div class="whitespace-pre-wrap break-words px-3 py-2">{m.body}</div>
                  </Bubble.Content>
                </Bubble.Root>
              {:else}
                {#if m.photoUrl}<div class={joinedKids(m.mine, first, end)}><ChatPhoto url={m.photoUrl} width={m.photoWidth ?? 0} height={m.photoHeight ?? 0} mine={m.mine} /></div>{/if}
                {#if m.voiceUrl}<div class={joinedKids(m.mine, first, end)}><ChatVoice voice={{ url: m.voiceUrl, ms: m.voiceMs ?? 0, peaks: m.voicePeaks ?? "" }} mine={m.mine} /></div>{/if}
                {#if m.body || m.contextDateIso}
                  <Bubble.Root variant={m.mine ? "default" : "muted"} {align} class="max-w-[78%]">
                    <Bubble.Content class="rounded-[18px] px-3 py-2 text-[13px] leading-relaxed {joined(m.mine, first, end)}">
                      {#if m.contextDateIso}
                        <span class="mb-1 inline-block rounded-md bg-background/60 px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Diary · {contextLabel(m.contextDateIso)}</span><br />
                      {/if}
                      <span class="whitespace-pre-wrap break-words">{m.body}</span>
                    </Bubble.Content>
                  </Bubble.Root>
                {/if}
              {/if}
            </div>
          {/each}
          <Message.Footer class="px-1 text-[10px] font-normal">{time(run.items.at(-1)!.createdAtMs)}{#if run.mine && lastMine && run.items.includes(lastMine) && lastMine.readAtMs != null} · Seen{/if}</Message.Footer>
        </Message.Content>
      </Message.Root>
    {/each}
    {#if dragging}<div class="pointer-events-none absolute inset-2 grid place-items-center rounded-xl border-2 border-dashed border-ring/60 text-sm text-muted-foreground">Drop the photo to add it</div>{/if}
  </div>
  {#if error}<p class="pt-1 text-xs text-destructive">{error}</p>{/if}
  <form data-guide="message-compose" class="flex flex-col gap-1.5 border-t border-border pt-3" onsubmit={(e) => { e.preventDefault(); void send(); }}>
    {#if recording}
      <VoiceRecorder onsend={sendVoice} oncancel={() => (recording = false)} onerror={(m) => (error = m)} />
    {:else}
    <StagedPhotoCard {staged} />
    <div class="flex items-end gap-2">
      <!-- One box (shadcn Input Group): photo inside, mic beside. Paste or drop a photo too. -->
      <InputGroup.Root class="flex-1 rounded-[12px]">
        <InputGroup.Addon align="inline-start" class="self-end pb-1.5">
          <button type="button" onclick={() => { error = null; staged.choose(); }} aria-label="Add a photo" class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><ImageIcon class="size-4" /></button>
        </InputGroup.Addon>
        <label for="compose-{relationshipId}" class="sr-only">Message {otherName}</label>
        <InputGroup.Textarea id="compose-{relationshipId}" bind:value={draft} onkeydown={onKey} onpaste={onPaste} rows={1}
          placeholder={staged.current ? "Add a caption…" : `Message ${otherName}`} class="max-h-40 min-h-9 py-2 text-[13px]" />
        <InputGroup.Addon align="inline-end" class="self-end pb-1.5">
          <button type="button" onclick={() => { error = null; recording = true; }} aria-label="Record a voice message" class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><MicIcon class="size-4" /></button>
        </InputGroup.Addon>
      </InputGroup.Root>
      <button type="submit" disabled={sending || (!draft.trim() && !staged.ready) || (!!staged.current && !staged.ready)}
        class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Send</button>
    </div>
    {/if}
    {#if !compact}<span class="text-[11px] text-muted-foreground">Enter sends · Shift+Enter for a new line · it reaches their phone on its next sync</span>{/if}
  </form>
</div>
