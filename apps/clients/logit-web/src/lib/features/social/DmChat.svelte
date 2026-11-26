<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
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
  import { photoSrc } from "@logit/core/api/photosApi";
  import ChatVoice from "./ChatVoice.svelte";
  import VoiceRecorder from "./VoiceRecorder.svelte";
  import MicIcon from "@lucide/svelte/icons/mic";
  import type { MessageVoice } from "@logit/core/api/voiceApi";
  import ReportDialog from "./ReportDialog.svelte";
  import { socialApi } from "@logit/core/api/socialApi";
  import { DM_EDIT_WINDOW_MS, unsent, type DmMessage } from "@logit/core/api/dmApi";
  import * as Message from "$lib/components/ui/message/index.js";
  import * as Bubble from "$lib/components/ui/bubble/index.js";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import SmilePlusIcon from "@lucide/svelte/icons/smile-plus";
  import RowMenuItems from "$lib/features/commands/RowMenuItems.svelte";
  import type { RowAction } from "$lib/features/commands/commands.svelte";
  import ChatReactions from "$lib/features/chat/ChatReactions.svelte";
  import StagedPhotoCard from "$lib/features/chat/StagedPhotoCard.svelte";
  import { StagedPhoto, imageFrom } from "$lib/features/chat/stagedPhoto.svelte";
  import { DM_REACTIONS } from "@logit/core/api/dmApi";
  import { nextReaction, withMyReaction } from "@logit/core/domain/dmReactions";
  import DumbbellIcon from "@lucide/svelte/icons/dumbbell";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import { cardTitle, readCard, readGroupInvite, readStoryPhoto, readStoryQuote, recordCard, workoutCard } from "@logit/core/domain/messageCard";

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

  const group = $derived(chat?.group ?? null);
  const name = $derived(group ? group.name : chat?.other ? chat.other.displayName || chat.other.username : chat ? "Deleted account" : "");
  const senderName = (m: DmMessage) => (m.from ? m.from.displayName || m.from.username : group ? "Someone" : name);
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
      staged.drop();
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

  // A photo waits in the box (picked, pasted or dropped) so a caption can go with it (canvas board 19).
  const staged = new StagedPhoto();

  async function send() {
    if (editing) return saveEdit();
    const body = draft.trim();
    const photo = staged.ready;
    if ((!body && !photo) || sending || !chat || (staged.current && !photo)) return;
    sending = true;
    sendError = null;
    try {
      await dmApi.send(chat.threadId ? { threadId: chat.threadId } : to, crypto.randomUUID(), body, photo ? { photoId: photo.id } : {});
      draft = "";
      if (photo) staged.drop();
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

  let recording = $state(false);
  async function sendVoice(voice: MessageVoice) {
    recording = false;
    if (!chat || !voice.id) return;
    try {
      await dmApi.send(chat.threadId ? { threadId: chat.threadId } : to, crypto.randomUUID(), "", { voice: { id: voice.id, peaks: voice.peaks } });
      await load(true);
      onchange?.();
    } catch (e) {
      sendError = e instanceof Error ? `${e.message} Try again.` : "Couldn't send. Try again.";
    }
  }
  // Each message's ⋯ (Instagram's long-press menu): Edit / Copy / Unsend on yours, Copy / Report on theirs.
  let editing = $state<DmMessage | null>(null);
  let confirmUnsend = $state<DmMessage | null>(null);
  let reportOpen = $state(false);
  let report = $state<{ type: "Message" | "User"; id: string; what: string }>({ type: "User", id: "", what: "" });
  const canEdit = (m: DmMessage) => m.mine && !!m.body && Date.now() - m.createdAtMs < DM_EDIT_WINDOW_MS;

  function startEdit(m: DmMessage) {
    editing = m;
    draft = m.body;
  }
  function stopEdit() {
    editing = null;
    draft = "";
  }
  async function saveEdit() {
    const m = editing;
    if (!m || !chat || !draft.trim()) return;
    try {
      const updated = await dmApi.edit(m.id, draft.trim());
      chat = { ...chat, messages: chat.messages.map((x) => (x.id === m.id ? updated : x)) };
      stopEdit();
      onchange?.();
    } catch (e) {
      sendError = e instanceof Error ? e.message : "Couldn't save that. Try again.";
    }
  }
  async function unsend(m: DmMessage) {
    if (!chat) return;
    try {
      await dmApi.unsend(m.id);
      chat = { ...chat, messages: chat.messages.map((x) => (x.id === m.id ? unsent(x) : x)) };
      onchange?.();
    } catch {
      sendError = "Couldn't unsend it. Try again.";
    }
  }
  function openReport(type: "Message" | "User", id: string, what: string) {
    report = { type, id, what };
    reportOpen = true;
  }
  // Double-click a message for ❤️, or pick from its menus; your own again takes it back.
  async function react(m: DmMessage, emoji: string) {
    if (!chat || m.deleted || !chat.accepted) return;
    const next = nextReaction(m.reactions, emoji);
    const before = m.reactions ?? null;
    const set = (reactions: DmMessage["reactions"]) => {
      if (chat) chat = { ...chat, messages: chat.messages.map((x) => (x.id === m.id ? { ...x, reactions } : x)) };
    };
    set(withMyReaction(before, next));
    try {
      const after = await dmApi.react(m.id, next);
      set(after.length ? after : null);
    } catch (e) {
      set(before);
      sendError = e instanceof Error && e.message ? e.message : "Couldn't react. Try again.";
    }
  }

  // One list for a message's ⋯ and its right-click menu (canvas board 16).
  function messageActions(m: DmMessage): RowAction[] {
    return [
      ...(canEdit(m) ? [{ id: "edit", label: "Edit", run: () => startEdit(m) }] : []),
      ...(m.body ? [{ id: "copy", label: "Copy text", run: () => void navigator.clipboard?.writeText(m.body) }] : []),
      m.mine
        ? { id: "unsend", label: "Unsend…", run: () => (confirmUnsend = m), danger: true, separatorBefore: true }
        : { id: "report", label: "Report…", run: () => openReport("Message", m.id, "message"), danger: true, separatorBefore: true },
    ];
  }

  // Runs of messages from one person (shadcn Message): one avatar, one name, joined corners.
  type Run = { key: string; mine: boolean; day: boolean; items: DmMessage[] };
  const runs = $derived.by(() => {
    const out: Run[] = [];
    const list = chat?.messages ?? [];
    list.forEach((m, i) => {
      const day = i === 0 || dayLabel(m.createdAtMs) !== dayLabel(list[i - 1]!.createdAtMs);
      const prev = out.at(-1);
      const near = prev && m.createdAtMs - prev.items.at(-1)!.createdAtMs < 3_600_000;
      if (prev && !day && near && prev.mine === m.mine && (m.mine || prev.items[0]!.from?.id === m.from?.id)) prev.items.push(m);
      else out.push({ key: m.id, mine: m.mine, day, items: [m] });
    });
    return out;
  });
  const joined = (mine: boolean, first: boolean, last: boolean) =>
    mine ? `${first ? "" : "rounded-tr-md!"} ${last ? "" : "rounded-br-md!"}` : `${first ? "" : "rounded-tl-md!"} ${last ? "" : "rounded-bl-md!"}`;
  const joinedKids = (mine: boolean, first: boolean, last: boolean) =>
    mine ? `${first ? "" : "*:rounded-tr-md!"} ${last ? "" : "*:rounded-br-md!"}` : `${first ? "" : "*:rounded-tl-md!"} ${last ? "" : "*:rounded-bl-md!"}`;

  function onPaste(e: ClipboardEvent) {
    const file = imageFrom(e.clipboardData);
    if (!file || !chat?.canSend) return;
    e.preventDefault();
    void staged.stage(file);
  }
  let dragging = $state(false);
  function onDrop(e: DragEvent) {
    dragging = false;
    const file = imageFrom(e.dataTransfer);
    if (!file || !chat?.canSend || !chat.accepted) return;
    e.preventDefault();
    void staged.stage(file);
  }

  function openShare() {
    sharing = true;
    if (!sources) void loadComposerSources().then((s) => (sources = s)).catch(() => (sources = { sessions: [], prs: [], splits: [], library: [], habits: [] }));
  }

  let confirmBlock = $state(false);
  async function block() {
    if (!chat?.other) return;
    try {
      await socialApi.blockUser(chat.other.username);
      ondelete?.();
    } catch {
      sendError = "Couldn't block. Try again.";
    }
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
    if (e.key === "Escape" && editing) return stopEdit();
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
      {#if group}
        <span class="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-muted text-[13px] font-bold">{#if group.photoUrl}<img src={photoSrc(group.photoUrl)} alt="" class="size-full object-cover" />{:else}{group.name.slice(0, 2).toUpperCase()}{/if}</span>
          <span class="min-w-0"><span class="block truncate text-sm font-semibold">{group.name}</span><span class="block truncate text-xs text-muted-foreground">Group · {group.members} {group.members === 1 ? "member" : "members"}</span></span>
        </span>
      {:else if chat.other}
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
            {#if chat.other?.id}<DropdownMenu.Item class="text-destructive" onclick={() => openReport("User", chat!.other!.id!, `@${chat!.other!.username}`)}>Report</DropdownMenu.Item>{/if}
            {#if chat.other}<DropdownMenu.Item class="text-destructive" onclick={() => (confirmBlock = true)}>Block {name}</DropdownMenu.Item>{/if}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/if}
    </header>
  {/if}

  <div bind:this={listEl} role="log" aria-label="Messages" class="relative flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-3 {dragging ? 'bg-muted/40' : ''}"
    ondragover={(e) => { if (chat?.canSend && chat.accepted && e.dataTransfer?.types.includes("Files")) { e.preventDefault(); dragging = true; } }}
    ondragleave={() => (dragging = false)} ondrop={onDrop}>
    {#if error}
      <p class="m-auto text-[13px] text-muted-foreground">{error}</p>
    {:else if !chat}
      <p class="m-auto text-[13px] text-muted-foreground">Loading…</p>
    {:else}
      {#if older}<button type="button" onclick={loadOlder} class="mx-auto mb-2 h-8 rounded-full border border-border px-3 text-xs">Earlier messages</button>{/if}
      {#if chat.messages.length === 0}
        <p class="m-auto max-w-[36ch] text-center text-[13px] text-muted-foreground">{chat.canSend ? `Say hello to ${name}. Messages to people who don't follow you go to their requests.` : chat.why}</p>
      {/if}
      {#each runs as run, r (run.key)}
        {@const lead = run.items[0]!}
        {#if run.day}<div class="py-1.5 text-center text-[11px] text-muted-foreground">{dayLabel(lead.createdAtMs)}</div>{/if}
        <Message.Root align={run.mine ? "end" : "start"} class="shrink-0 gap-2 text-[13px] {r > 0 && !run.day ? 'mt-1.5' : ''}">
          {#if !run.mine}
            <Message.Avatar class="min-w-6 bg-transparent">
              {#if group}<Avatar name={senderName(lead)} url={lead.from?.avatarUrl} size={24} />{:else}<Avatar name={name} url={chat.other?.avatarUrl} size={24} />{/if}
            </Message.Avatar>
          {/if}
          <Message.Content class="gap-1">
            {#if group && !run.mine}<Message.Header class="px-1 text-[11px] font-normal">{senderName(lead)}</Message.Header>{/if}
            {#each run.items as m, k (m.id)}
              {@const first = k === 0}
              {@const end = k === run.items.length - 1}
              {@const story = m.cardType === "Story"}
              {@const card = story ? readStoryQuote(m.cardJson) : readCard(m.cardType, m.cardJson)}
              {@const storyPhoto = story ? readStoryPhoto(m.cardJson) : null}
              {@const invite = m.cardType === "GroupInvite" ? readGroupInvite(m.cardJson) : null}
              {@const align = m.mine ? "end" : "start"}
              {@const actions = messageActions(m)}
              <ContextMenu.Root>
                <ContextMenu.Trigger disabled={m.deleted}>
                  {#snippet child({ props })}
                    <div {...props} ondblclick={() => void react(m, "❤️")} role="group" aria-label="{m.mine ? 'Your' : `${senderName(m)}'s`} message"
                      class="group/row relative flex w-full items-center gap-1 {m.mine ? 'flex-row-reverse' : ''} {editing?.id === m.id ? 'opacity-60' : ''} {m.reactions?.length && !m.deleted ? 'mb-3.5' : ''}">
                      <div class="relative flex min-w-0 max-w-[75%] flex-col gap-1 {m.mine ? 'items-end' : 'items-start'}">
                        {#if story}<span class="px-1 text-[11px] text-muted-foreground">{m.mine ? `Replied to ${name}'s story` : "Replied to your story"}{card || storyPhoto ? "" : " · no longer available"}</span>{/if}
                        {#if invite}
                          <div class="flex w-[260px] flex-col gap-1.5 rounded-[18px] border border-border bg-background px-3 py-2.5 {joined(m.mine, first, end)}">
                            <span class="text-[11px] text-muted-foreground">{m.mine ? "You sent an invite to a group" : "Invited you to a group"}</span>
                            <span class="text-[13px] font-semibold">{invite.name}</span>
                            <span class="text-xs text-muted-foreground">{[invite.kind, invite.place, `${invite.members} members`].filter(Boolean).join(" · ")}</span>
                            {#if !m.mine}<span class="text-xs text-muted-foreground">Open the chat in the LogIt app to join.</span>{/if}
                          </div>
                        {/if}
                        {#if storyPhoto}
                          <div class="aspect-[9/16] w-28 shrink-0 overflow-hidden rounded-xl bg-black"><img src={photoSrc(storyPhoto.url)} alt="The story" loading="lazy" class="size-full object-cover" /></div>
                        {:else if card}
                          <div class="flex w-[280px] flex-col gap-1 rounded-[18px] border border-border bg-background px-3 py-2.5 {joined(m.mine, first, end)}">
                            <span class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {#if card.type === "PersonalRecord"}<TrophyIcon class="size-3" />New record{:else}<DumbbellIcon class="size-3" />Workout{/if}
                            </span>
                            <span class="text-[13px] font-semibold tabular-nums">{cardTitle(card)}</span>
                            {#if card.type === "WorkoutSession" && card.data.exercises?.length}<span class="text-xs text-muted-foreground">{card.data.exercises.map((e) => `${e.name} (${e.sets})`).join(" · ")}</span>{/if}
                          </div>
                        {/if}
                        {#if m.photoUrl && m.body}
                          <!-- A photo and its caption: one bubble. -->
                          <Bubble.Root variant={m.mine ? "default" : "muted"} {align} class="max-w-full">
                            <Bubble.Content class="overflow-hidden rounded-[18px] p-0 text-[13px] {joined(m.mine, first, end)}">
                              <ChatPhoto url={m.photoUrl} width={m.photoWidth} height={m.photoHeight} mine={m.mine} bare />
                              <div class="whitespace-pre-wrap break-words px-3 py-2">{m.body}</div>
                            </Bubble.Content>
                          </Bubble.Root>
                        {:else}
                          {#if m.photoUrl || m.photoHidden}<div class={joinedKids(m.mine, first, end)}><ChatPhoto url={m.photoUrl} width={m.photoWidth} height={m.photoHeight} hidden={m.photoHidden} mine={m.mine} /></div>{/if}
                          {#if m.voiceUrl || m.voiceHidden}<div class={joinedKids(m.mine, first, end)}><ChatVoice voice={m.voiceUrl ? { url: m.voiceUrl, ms: m.voiceMs, peaks: m.voicePeaks ?? "" } : null} hidden={m.voiceHidden} mine={m.mine} /></div>{/if}
                          {#if m.body}
                            <Bubble.Root variant={m.mine ? "default" : "muted"} {align} class="max-w-full">
                              <Bubble.Content class="max-w-[520px] rounded-[18px] px-3 py-2 text-[13px] leading-relaxed {joined(m.mine, first, end)}"><span class="whitespace-pre-wrap break-words">{m.body}</span></Bubble.Content>
                            </Bubble.Root>
                          {/if}
                        {/if}
                        {#if m.deleted}
                          <span class="rounded-[18px] border border-dashed border-border px-3 py-2 text-[13px] italic text-muted-foreground">{m.removedByLogIt ? "Removed by LogIt" : m.removedByModerator ? "Removed by a moderator" : m.mine ? "You unsent a message" : `${senderName(m)} unsent a message`}</span>
                        {:else if m.edited}<span class="px-1 text-[10px] text-muted-foreground">Edited</span>{/if}
                        {#if m.reactions?.length && !m.deleted}<ChatReactions reactions={m.reactions} {align} onpick={(e) => void react(m, e)} />{/if}
                      </div>
                      {#if !m.deleted}
                        <!-- Hover bar: react and ⋯ (right-click opens the same menu). -->
                        <div class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 has-[[data-state=open]]:opacity-100">
                          {#if chat?.accepted}
                            <DropdownMenu.Root>
                              <DropdownMenu.Trigger>
                                {#snippet child({ props })}
                                  <button {...props} type="button" aria-label="React" class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><SmilePlusIcon class="size-4" /></button>
                                {/snippet}
                              </DropdownMenu.Trigger>
                              <DropdownMenu.Content side="top" align={m.mine ? "end" : "start"} class="flex w-auto min-w-0 gap-0.5 rounded-full p-1">
                                {#each DM_REACTIONS as e (e)}
                                  <DropdownMenu.Item onSelect={() => void react(m, e)} aria-label="React {e}" class="size-8 justify-center rounded-full p-0 text-lg {m.reactions?.find((x) => x.mine)?.emoji === e ? 'bg-primary/20' : ''}">{e}</DropdownMenu.Item>
                                {/each}
                              </DropdownMenu.Content>
                            </DropdownMenu.Root>
                          {/if}
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger>
                              {#snippet child({ props })}
                                <button {...props} type="button" aria-label="Message options" class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><MoreHorizontalIcon class="size-4" /></button>
                              {/snippet}
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Content align={m.mine ? "end" : "start"} class="w-auto min-w-44"><RowMenuItems {actions} kind="dropdown" /></DropdownMenu.Content>
                          </DropdownMenu.Root>
                        </div>
                      {/if}
                    </div>
                  {/snippet}
                </ContextMenu.Trigger>
                <ContextMenu.Content class="w-auto min-w-48">
                  {#if chat.accepted}
                    <ContextMenu.Group class="flex gap-0.5 p-0.5" aria-label="React">
                      {#each DM_REACTIONS as e (e)}
                        <ContextMenu.Item onSelect={() => void react(m, e)} aria-label="React {e}" class="size-8 justify-center rounded-full p-0 text-lg {m.reactions?.find((x) => x.mine)?.emoji === e ? 'bg-primary/20' : ''}">{e}</ContextMenu.Item>
                      {/each}
                    </ContextMenu.Group>
                    <ContextMenu.Separator />
                  {/if}
                  <RowMenuItems actions={actions.map((a, n) => (n === 0 ? { ...a, separatorBefore: false } : a))} kind="context" />
                </ContextMenu.Content>
              </ContextMenu.Root>
            {/each}
            {#if seen && r === runs.length - 1}<Message.Footer class="px-1 text-[11px] font-normal">Seen</Message.Footer>
            {:else if run.items.length}<Message.Footer class="px-1 text-[10px] font-normal opacity-0 transition-opacity group-hover/message:opacity-100">{time(run.items.at(-1)!.createdAtMs)}</Message.Footer>{/if}
          </Message.Content>
        </Message.Root>
      {/each}
      {#if dragging}<div class="pointer-events-none absolute inset-3 grid place-items-center rounded-xl border-2 border-dashed border-ring/60 text-sm text-muted-foreground">Drop the photo to add it</div>{/if}
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
      {#if editing}<div class="flex items-center justify-between text-xs text-muted-foreground"><span>Editing message · Enter saves</span><button type="button" class="font-medium text-foreground hover:underline" onclick={stopEdit}>Cancel</button></div>{/if}
      {#if recording}
        <VoiceRecorder onsend={sendVoice} oncancel={() => (recording = false)} onerror={(m) => (sendError = m)} />
      {:else}
      <StagedPhotoCard {staged} />
      <div class="flex items-end gap-2">
        <!-- One box (shadcn Input Group): photo and share inside, mic beside. Paste or drop a photo too. -->
        <InputGroup.Root class="flex-1 rounded-[12px]">
          <InputGroup.Addon align="inline-start" class="self-end pb-1.5">
            <button type="button" onclick={() => { sendError = null; staged.choose(); }} aria-label="Add a photo" class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><ImageIcon class="size-4" /></button>
            <button type="button" onclick={openShare} aria-label="Share a workout or record" class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><PlusIcon class="size-4" /></button>
          </InputGroup.Addon>
          <label for="dm-compose" class="sr-only">Message {name}</label>
          <InputGroup.Textarea id="dm-compose" bind:value={draft} onkeydown={onKey} onpaste={onPaste} rows={1} maxlength={2000}
            placeholder={staged.current ? "Add a caption…" : `Message ${name}`} class="max-h-40 min-h-9 py-2 text-[13px]" />
          <InputGroup.Addon align="inline-end" class="self-end pb-1.5">
            <button type="button" onclick={() => { sendError = null; recording = true; }} aria-label="Record a voice message" class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><MicIcon class="size-4" /></button>
          </InputGroup.Addon>
        </InputGroup.Root>
        <button type="submit" disabled={sending || (!draft.trim() && !staged.ready) || (!!staged.current && !staged.ready)} class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Send</button>
      </div>
      {/if}
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
    <Tabs.Root value={shareTab} onValueChange={(v) => (shareTab = v as "workouts" | "records")} class="self-start">
      <Tabs.List aria-label="What to share" class="h-8 w-auto rounded-[9px] p-0.5">
        {#each [["workouts", "Workouts"], ["records", "Records"]] as [v, label] (v)}<Tabs.Trigger value={v} class="flex-none rounded-[7px] text-xs">{label}</Tabs.Trigger>{/each}
      </Tabs.List>
    </Tabs.Root>
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

<AlertDialog.Root open={!!confirmUnsend} onOpenChange={(v) => { if (!v) confirmUnsend = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Unsend this message?</AlertDialog.Title>
      <AlertDialog.Description>It's removed for everyone in the chat.</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={() => { const m = confirmUnsend; confirmUnsend = null; if (m) void unsend(m); }}>Unsend</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
{#if report.id}<ReportDialog bind:open={reportOpen} targetType={report.type} targetId={report.id} what={report.what} />{/if}
<AlertDialog.Root bind:open={confirmBlock}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Block {name}?</AlertDialog.Title>
      <AlertDialog.Description>They can't message you, see your profile, stories or training, or find you. They aren't told. You can unblock them in Privacy.</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={block}>Block</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
