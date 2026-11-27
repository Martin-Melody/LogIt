<script lang="ts">
  import { guideSignal } from "$lib/features/guide/signal";
  import { onSampleActivity } from "$lib/features/guide/sampleActivity";
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
  import ChatReactions from "$lib/features/chat/ChatReactions.svelte";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
  import MessageSquareQuoteIcon from "@lucide/svelte/icons/message-square-quote";
  import SavedReplyPicker from "./SavedReplyPicker.svelte";
  import { checkinReplyLabel, parseCheckinReply } from "@logit/core/domain/savedReplies";
  import { parseMonthReport } from "@logit/core/domain/monthReport";
  import MonthReportCard from "./MonthReportCard.svelte";
  import SmilePlusIcon from "@lucide/svelte/icons/smile-plus";
  import { DM_REACTIONS } from "@logit/core/api/dmApi";
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
    card,
    closedNote = null,
    messageActions,
    fill = null,
  }: {
    relationshipId: string;
    otherName: string;
    initialDraft?: string;
    /** Fewer messages shown, shorter box (cards on overview pages). */
    compact?: boolean;
    onRead?: () => void;
    onSent?: (body: string, atMs: number) => void;
    /** Draws a request step (a message with a kind: an offer, the waiting list…) as a card. */
    card?: import("svelte").Snippet<[RemoteMessage]>;
    /** A closed request: read-only, with this note where the composer was (canvas A3). */
    closedNote?: string | null;
    /** More things to do with a message from the other person (right-click, or ⋯). */
    messageActions?: (m: RemoteMessage) => { label: string; run: () => void }[];
    /** A coach's box (canvas W10): saved replies with / and what fills them in. */
    fill?: { firstName?: string | null; exercise?: string | null; coachName?: string | null } | null;
  } = $props();

  let messages = $state<RemoteMessage[]>([]);
  let loaded = $state(false);
  let error = $state<string | null>(null);
  // svelte-ignore state_referenced_locally
  let draft = $state(initialDraft);
  // Saved replies (canvas W10): "/" at the start of the box, or the button.
  let repliesOpen = $state(false);
  let picker = $state<SavedReplyPicker | null>(null);
  let sending = $state(false);
  let listEl = $state<HTMLDivElement | null>(null);
  let currentId = "";
  let poll: ReturnType<typeof setInterval> | undefined;

  /** Also called by the page after it changes something (an offer taken, a message it sent). */
  export async function refresh(scroll = false) {
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
  // Their messages: react from the hover bar, right-click or a double-click (❤️). One each.
  async function react(m: RemoteMessage, emoji: string) {
    if (m.mine) return;
    const next = m.reaction === emoji ? null : emoji;
    const before = m.reaction ?? null;
    const set = (reaction: string | null) => (messages = messages.map((x) => (x.messageId === m.messageId ? { ...x, reaction } : x)));
    set(next);
    try {
      await messagesApi.react(relationshipId, m.messageId, next);
    } catch (e) {
      set(before);
      error = e instanceof Error ? e.message : "Couldn't react";
    }
  }
  const reactionsOf = (m: RemoteMessage) => (m.reaction ? [{ emoji: m.reaction, count: 1, mine: !m.mine }] : []);

  function onPaste(e: ClipboardEvent) {
    const file = imageFrom(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    void staged.stage(file);
  }

  function onKey(e: KeyboardEvent) {
    if (picker?.key(e)) return;
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
    const out: { key: string; mine: boolean; day: boolean; event: boolean; items: RemoteMessage[] }[] = [];
    shown.forEach((m, i) => {
      const day = !compact && (i === 0 || dayLabel(m.createdAtMs) !== dayLabel(shown[i - 1]!.createdAtMs));
      // Swap messages ("lasting-swap", "program-swap") and check-in replies are ordinary bubbles; only request steps are cards.
      const event = !!m.kind && !m.kind.endsWith("swap") && m.kind !== "checkin-reply" && m.kind !== "month-report" && !!card;
      const prev = out.at(-1);
      if (prev && !day && !event && !prev.event && prev.mine === m.mine && m.createdAtMs - prev.items.at(-1)!.createdAtMs < 3_600_000) prev.items.push(m);
      else out.push({ key: m.messageId, mine: m.mine, day, event, items: [m] });
    });
    return out;
  });
  const lastMine = $derived(messages.findLast((m) => m.mine && !m.kind));
  const joined = (mine: boolean, first: boolean, last: boolean) =>
    mine ? `${first ? "" : "rounded-tr-md!"} ${last ? "" : "rounded-br-md!"}` : `${first ? "" : "rounded-tl-md!"} ${last ? "" : "rounded-bl-md!"}`;
  const joinedKids = (mine: boolean, first: boolean, last: boolean) =>
    mine ? `${first ? "" : "*:rounded-tr-md!"} ${last ? "" : "*:rounded-br-md!"}` : `${first ? "" : "*:rounded-tl-md!"} ${last ? "" : "*:rounded-bl-md!"}`;
  let dragging = $state(false);
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div bind:this={listEl} role="log" aria-label="Messages" class="relative flex flex-1 flex-col gap-1.5 overflow-y-auto {compact ? 'max-h-72' : 'min-h-[320px] max-h-[max(360px,calc(100svh-20rem))]'} py-1"
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
      {#if run.event && card}
        <div class="shrink-0 py-1">{@render card(run.items[0]!)}</div>
      {:else}
      <Message.Root align={run.mine ? "end" : "start"} class="shrink-0 text-[13px]">
        <Message.Content class="gap-1">
          {#each run.items as m, k (m.messageId)}
            {@const first = k === 0}
            {@const end = k === run.items.length - 1}
            {@const align = m.mine ? "end" : "start"}
            <ContextMenu.Root>
            <ContextMenu.Trigger disabled={m.mine && !m.body}>
            {#snippet child({ props })}
            <div {...props} role="group" aria-label="{m.mine ? 'Your' : `${otherName}'s`} message" ondblclick={() => void react(m, "❤️")}
              class="group/row flex w-full items-center gap-1 {m.mine ? 'flex-row-reverse' : ''} {m.reaction ? 'mb-3.5' : ''}">
            <div class="relative flex min-w-0 max-w-[78%] flex-col gap-1 {m.mine ? 'items-end' : 'items-start'}">
              {#if m.photoUrl && m.body}
                <Bubble.Root variant={m.mine ? "default" : "muted"} {align} class="max-w-full">
                  <Bubble.Content class="overflow-hidden rounded-[18px] p-0 text-[13px] {joined(m.mine, first, end)}">
                    <ChatPhoto url={m.photoUrl} width={m.photoWidth ?? 0} height={m.photoHeight ?? 0} mine={m.mine} bare />
                    <div class="whitespace-pre-wrap break-words px-3 py-2">{m.body}</div>
                  </Bubble.Content>
                </Bubble.Root>
              {:else}
                {#if m.photoUrl}<div class={joinedKids(m.mine, first, end)}><ChatPhoto url={m.photoUrl} width={m.photoWidth ?? 0} height={m.photoHeight ?? 0} mine={m.mine} /></div>{/if}
                {#if m.voiceUrl}<div class={joinedKids(m.mine, first, end)}><ChatVoice voice={{ url: m.voiceUrl, ms: m.voiceMs ?? 0, peaks: m.voicePeaks ?? "" }} mine={m.mine} /></div>{/if}
                {@const replyTo = m.kind === "checkin-reply" ? parseCheckinReply(m.cardJson) : null}
                {@const report = m.kind === "month-report" ? parseMonthReport(m.cardJson) : null}
                {#if report}
                  <MonthReportCard {report} mine={m.mine} from={m.mine ? "you" : otherName} />
                {:else if m.body || m.contextDateIso}
                  <Bubble.Root variant={m.mine ? "default" : "muted"} {align} class="max-w-full">
                    <Bubble.Content class="rounded-[18px] px-3 py-2 text-[13px] leading-relaxed {joined(m.mine, first, end)}">
                      {#if m.contextDateIso}
                        <span class="mb-1 inline-block rounded-md bg-background/60 px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Diary · {contextLabel(m.contextDateIso)}</span><br />
                      {/if}
                      {#if replyTo}
                        <span class="mb-1 inline-block rounded-md bg-background/60 px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Check-in · {checkinReplyLabel(replyTo)}</span><br />
                      {/if}
                      <span class="whitespace-pre-wrap break-words">{m.body}</span>
                    </Bubble.Content>
                  </Bubble.Root>
                {/if}
              {/if}
              {#if m.reaction}<ChatReactions reactions={reactionsOf(m)} {align} onpick={(e) => void react(m, e)} />{/if}
            </div>
            {#if !m.mine && !compact}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  {#snippet child({ props: p })}
                    <button {...p} type="button" aria-label="React" class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"><SmilePlusIcon class="size-4" /></button>
                  {/snippet}
                </DropdownMenu.Trigger>
                <DropdownMenu.Content side="top" align="start" class="flex w-auto min-w-0 gap-0.5 rounded-full p-1">
                  {#each DM_REACTIONS as e (e)}
                    <DropdownMenu.Item onSelect={() => void react(m, e)} aria-label="React {e}" class="size-8 justify-center rounded-full p-0 text-lg {m.reaction === e ? 'bg-primary/20' : ''}">{e}</DropdownMenu.Item>
                  {/each}
                </DropdownMenu.Content>
              </DropdownMenu.Root>
              {#if messageActions}
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    {#snippet child({ props: p })}
                      <button {...p} type="button" aria-label="More for this message" class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"><EllipsisIcon class="size-4" /></button>
                    {/snippet}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content side="top" align="start" class="w-60">
                    {#each messageActions(m) as a (a.label)}<DropdownMenu.Item onSelect={a.run}>{a.label}</DropdownMenu.Item>{/each}
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              {/if}
            {/if}
            </div>
            {/snippet}
            </ContextMenu.Trigger>
            <ContextMenu.Content class="w-auto min-w-44">
              {#if !m.mine}
                <ContextMenu.Group class="flex gap-0.5 p-0.5" aria-label="React">
                  {#each DM_REACTIONS as e (e)}
                    <ContextMenu.Item onSelect={() => void react(m, e)} aria-label="React {e}" class="size-8 justify-center rounded-full p-0 text-lg {m.reaction === e ? 'bg-primary/20' : ''}">{e}</ContextMenu.Item>
                  {/each}
                </ContextMenu.Group>
                {#if m.body}<ContextMenu.Separator />{/if}
              {/if}
              {#if m.body}<ContextMenu.Item onSelect={() => void navigator.clipboard?.writeText(m.body)}>Copy text</ContextMenu.Item>{/if}
              {#if !m.mine && messageActions}
                {#each messageActions(m) as a (a.label)}<ContextMenu.Item onSelect={a.run}>{a.label}</ContextMenu.Item>{/each}
              {/if}
            </ContextMenu.Content>
            </ContextMenu.Root>
          {/each}
          <Message.Footer class="px-1 text-[10px] font-normal">{time(run.items.at(-1)!.createdAtMs)}{#if run.mine && lastMine && run.items.includes(lastMine) && lastMine.readAtMs != null} · Seen{/if}</Message.Footer>
        </Message.Content>
      </Message.Root>
      {/if}
    {/each}
    {#if dragging}<div class="pointer-events-none absolute inset-2 grid place-items-center rounded-xl border-2 border-dashed border-ring/60 text-sm text-muted-foreground">Drop the photo to add it</div>{/if}
  </div>
  {#if error}<p class="pt-1 text-xs text-destructive">{error}</p>{/if}
  {#if closedNote}
    <p class="border-t border-border pt-3 text-center text-[13px] text-muted-foreground">{closedNote}</p>
  {:else}
  <form data-guide="message-compose" class="flex flex-col gap-1.5 border-t border-border pt-3" onsubmit={(e) => { e.preventDefault(); void send(); }}>
    {#if recording}
      <VoiceRecorder onsend={sendVoice} oncancel={() => (recording = false)} onerror={(m) => (error = m)} />
    {:else}
    <StagedPhotoCard {staged} />
    {#if fill}<SavedReplyPicker bind:this={picker} bind:draft bind:open={repliesOpen} {fill} />{/if}
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
          {#if fill}<button type="button" onclick={() => (repliesOpen = !repliesOpen)} aria-label="Saved replies" aria-expanded={repliesOpen} class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><MessageSquareQuoteIcon class="size-4" /></button>{/if}
          <button type="button" onclick={() => { error = null; recording = true; }} aria-label="Record a voice message" class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><MicIcon class="size-4" /></button>
        </InputGroup.Addon>
      </InputGroup.Root>
      <button type="submit" disabled={sending || (!draft.trim() && !staged.ready) || (!!staged.current && !staged.ready)}
        class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Send</button>
    </div>
    {/if}
    {#if !compact}<span class="text-[11px] text-muted-foreground">Enter sends · Shift+Enter for a new line{fill ? " · / for a saved reply" : ""} · it reaches their phone on its next sync</span>{/if}
  </form>
  {/if}
</div>
