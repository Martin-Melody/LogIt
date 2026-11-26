<!-- A chat with one person (design canvas M2), by ?u=<username> (also before the first message)
     or ?t=<thread id>, or a group's chat (G3, by its thread id): names and faces on others'
     messages, the header opens the group's page, no "Seen". A request you received shows Accept / Delete instead of the box until you
     accept or reply. "Seen" only with read receipts on for both. A message sent offline waits,
     marked "Not sent yet", and goes when the connection is back. -->
<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { muteItems } from "$lib/features/groups/muteItems";
  import { onMount, tick } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { fade } from "svelte/transition";
  import { groupsApi } from "@logit/core/api/groupsApi";
  import { VolumeX } from "lucide-svelte";
  import { Ban, Calendar, Camera, Copy, Dumbbell, Flag, Image as ImageIcon, Mic, MoreHorizontal, Pencil, Plus, Send, Settings2, Trash2, Undo2, User, Users, X } from "lucide-svelte";
  import GroupAvatar from "$lib/components/social/GroupAvatar.svelte";
  import { eventsApi, type GroupEvent } from "@logit/core/api/eventsApi";
  import { eventShort } from "$lib/features/groups/eventTime";
  import ReportSheet from "$lib/components/social/ReportSheet.svelte";
  import { socialApi } from "@logit/core/api/socialApi";
  import { longpress } from "$lib/swipe";
  import { DM_EDIT_WINDOW_MS, unsent } from "@logit/core/api/dmApi";
  import VoiceMessage from "$lib/components/social/VoiceMessage.svelte";
  import VoiceRecorderBar from "$lib/components/social/VoiceRecorderBar.svelte";
  import type { MessageVoice } from "@logit/core/api/voiceApi";
  import MessagePhoto from "$lib/components/social/MessagePhoto.svelte";
  import { photoSrc } from "@logit/core/api/photosApi";
  import { ApiError } from "@logit/core/api/client";
  import MessageCard from "$lib/components/social/MessageCard.svelte";
  import ShareCardSheet from "$lib/components/social/ShareCardSheet.svelte";
  import ActionSheet from "$lib/components/ActionSheet.svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import { readCard, readGroupInvite, readStoryPhoto, readStoryQuote } from "@logit/core/domain/messageCard";
  import GroupInviteCard from "$lib/components/social/GroupInviteCard.svelte";
  import { toast } from "svelte-sonner";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import PersonAvatar from "$lib/components/social/PersonAvatar.svelte";
  import * as Message from "$lib/components/ui/message/index.js";
  import * as Bubble from "$lib/components/ui/bubble/index.js";
  import StagedPhotoCard from "$lib/components/social/StagedPhotoCard.svelte";
  import { StagedPhoto } from "$lib/features/chat/stagedPhoto.svelte";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import ChatText from "$lib/components/social/ChatText.svelte";
  import ChatReactions from "$lib/components/social/ChatReactions.svelte";
  import { nextReaction, withMyReaction } from "@logit/core/domain/dmReactions";
  import { back } from "$lib/navigation";
  import { DM_REACTIONS, dmApi, type DmChat, type DmMessage, type DmTo } from "@logit/core/api/dmApi";
  import { trainingApi, type TrainingFriend } from "@logit/core/api/trainingApi";
  import { dayTime } from "$lib/features/friends/dmTime";
  import { discardDm, outbox, queueDm, retryDm, sameChat } from "$lib/features/friends/dmOutbox.svelte";
  import { minutesIn } from "$lib/features/friends/trainingPresence";

  const to = $derived<DmTo | null>(
    page.url.searchParams.get("t")
      ? { threadId: page.url.searchParams.get("t")! }
      : page.url.searchParams.get("u")
        ? { username: page.url.searchParams.get("u")! }
        : null,
  );

  let chat = $state<DmChat | null>(null);
  let error = $state<string | null>(null);
  let draft = $state("");
  let older = $state(false);
  let training = $state<TrainingFriend | null>(null);
  let listEl = $state<HTMLDivElement | null>(null);
  let now = $state(Date.now());
  let sharing = $state(false);
  let attachOpen = $state(false);
  // A picked photo waits above the box while it uploads, so a caption can go with it (canvas board 18).
  const staged = new StagedPhoto();
  let recording = $state(false);

  // A voice message is uploaded by the recording bar; the message then waits in the outbox.
  async function sendVoice(voice: MessageVoice) {
    recording = false;
    if (!chat || !to) return;
    const sending = queueDm(chat.threadId ? { threadId: chat.threadId } : to, "", { voice });
    await scrollDown();
    await sending;
    await load();
  }

  // Long-press a message (Instagram): Edit / Copy / Unsend on yours, Copy / Report on theirs.
  let picked = $state<DmMessage | null>(null);
  let editing = $state<DmMessage | null>(null);
  let confirmUnsend = $state<DmMessage | null>(null);
  let confirmBlock = $state(false);
  let confirmRemove = $state<DmMessage | null>(null);
  let muting = $state<DmMessage | null>(null);

  async function removeAsModerator(m: DmMessage) {
    if (!chat || !group) return;
    try {
      await groupsApi.removeMessage(group.id, m.id);
      chat = { ...chat, messages: chat.messages.map((x) => (x.id === m.id ? { ...unsent(x), removedByModerator: true } : x)) };
    } catch {
      toast.error("Couldn't remove it. Try again.");
    }
  }

  async function muteSender(m: DmMessage, minutes: number) {
    if (!group || !m.from) return;
    try {
      await groupsApi.mute(group.id, m.from.username, minutes);
      toast.success(`${senderName(m)} is muted in the chat`);
    } catch (e) {
      toast.error(e instanceof ApiError && e.status === 403 ? "Only organisers can mute other moderators or organisers." : "Couldn't do that. Try again.");
    }
  }

  async function block() {
    if (!chat?.other) return;
    try {
      await socialApi.blockUser(chat.other.username);
      toast.success(`Blocked ${name}`);
      await goto("/messages", { replaceState: true });
    } catch {
      toast.error("Couldn't block. Try again.");
    }
  }
  let reporting = $state<{ type: "Message" | "User"; id: string; what: string } | null>(null);

  const canEdit = (m: DmMessage) => m.mine && !!m.body && Date.now() - m.createdAtMs < DM_EDIT_WINDOW_MS;
  const messageActions = $derived.by(() => {
    const m = picked;
    if (!m) return [];
    return [
      ...(canEdit(m) ? [{ icon: Pencil, label: "Edit", onSelect: () => { editing = m; draft = m.body; } }] : []),
      ...(m.body ? [{ icon: Copy, label: "Copy text", onSelect: () => void navigator.clipboard?.writeText(m.body).then(() => toast.success("Copied")) }] : []),
      // A group's organisers and moderators (canvas D2): remove it for everyone, mute the sender.
      ...(!m.mine && group && chat?.canModerate
        ? [
            { icon: Trash2, label: "Remove message", destructive: true, onSelect: () => (confirmRemove = m) },
            ...(m.from ? [{ icon: VolumeX, label: `Mute ${senderName(m)} in the chat`, onSelect: () => (muting = m) }] : []),
          ]
        : []),
      ...(m.mine
        ? [{ icon: Undo2, label: "Unsend", destructive: true, onSelect: () => (confirmUnsend = m) }]
        : [{ icon: Flag, label: group ? "Report to LogIt" : "Report", destructive: true, onSelect: () => (reporting = { type: "Message", id: m.id, what: "message" }) }]),
    ];
  });

  async function saveEdit() {
    const m = editing;
    const body = draft.trim();
    if (!m || !body || !chat) return;
    try {
      const updated = await dmApi.edit(m.id, body);
      chat = { ...chat, messages: chat.messages.map((x) => (x.id === m.id ? updated : x)) };
      editing = null;
      draft = "";
    } catch (e) {
      toast.error(e instanceof ApiError && e.message ? e.message : "Couldn't save that. Try again.");
    }
  }

  async function unsend(m: DmMessage) {
    if (!chat) return;
    try {
      await dmApi.unsend(m.id);
      chat = { ...chat, messages: chat.messages.map((x) => (x.id === m.id ? unsent(x) : x)) };
    } catch {
      toast.error("Couldn't unsend it. Try again.");
    }
  }
  let menuOpen = $state(false);
  let confirmDelete = $state(false);

  const group = $derived(chat?.group ?? null);
  // The group's next event, above its chat (G3).
  let nextEvent = $state<GroupEvent | null>(null);
  $effect(() => {
    const id = group?.id;
    if (!id) return;
    void eventsApi.list(id).then((list) => (nextEvent = list.find((e) => !e.cancelled && e.startsAtMs > Date.now()) ?? null)).catch(() => {});
  });
  const name = $derived(group ? group.name : chat?.other ? chat.other.displayName || chat.other.username : chat ? "Deleted account" : "");
  const senderName = (m: DmMessage) => (m.from ? m.from.displayName || m.from.username : group ? "Someone" : name);
  // In a group, a run of messages from one person gets their name at the top and face at the bottom.
  const sameRun = (list: DmMessage[], i: number, j: number) =>
    j >= 0 && j < list.length && !list[j]!.mine && list[j]!.from?.id === list[i]!.from?.id && !gap(list, Math.max(i, j));
  // Waiting messages for this chat: by username or thread, whichever the page was opened with.
  const pending = $derived(
    outbox.items.filter(
      (p) =>
        (to && sameChat(p.to, to)) ||
        (chat?.threadId && "threadId" in p.to && p.to.threadId === chat.threadId) ||
        (chat?.other && "username" in p.to && p.to.username === chat.other.username),
    ),
  );
  const lastMine = $derived(chat?.messages.findLast((m) => m.mine) ?? null);
  // Runs of messages from one person (shadcn Message.Group): one avatar, one name, joined corners.
  type Run = { key: string; mine: boolean; time: boolean; items: DmMessage[] };
  const runs = $derived.by(() => {
    const out: Run[] = [];
    const list = chat?.messages ?? [];
    list.forEach((m, i) => {
      const time = gap(list, i);
      const prev = out.at(-1);
      if (prev && !time && prev.mine === m.mine && (m.mine || prev.items[0]!.from?.id === m.from?.id)) prev.items.push(m);
      else out.push({ key: m.id, mine: m.mine, time, items: [m] });
    });
    return out;
  });
  // Stacked bubbles get tight corners on the side they join (theirs on the left, yours on the right).
  const joined = (mine: boolean, first: boolean, last: boolean) =>
    mine ? `${first ? "" : "rounded-tr-md!"} ${last ? "" : "rounded-br-md!"}` : `${first ? "" : "rounded-tl-md!"} ${last ? "" : "rounded-bl-md!"}`;
  const joinedKids = (mine: boolean, first: boolean, last: boolean) =>
    mine ? `${first ? "" : "*:rounded-tr-md!"} ${last ? "" : "*:rounded-br-md!"}` : `${first ? "" : "*:rounded-tl-md!"} ${last ? "" : "*:rounded-bl-md!"}`;
  const seen = $derived(!!chat?.seenAtMs && !!lastMine && chat.seenAtMs >= lastMine.createdAtMs && chat.messages.at(-1)?.mine);

  // Opening a chat lands on the newest message at once (a long history would mean a long
  // animation every time); a message arriving while it's open glides into view.
  async function scrollDown(smooth = true) {
    await tick();
    listEl?.scrollTo({ top: listEl.scrollHeight, behavior: smooth ? "smooth" : "instant" });
  }

  async function load(first = false) {
    if (!to) return;
    try {
      const before = chat?.messages.length ?? 0;
      const next = await dmApi.chat(to);
      // Keep older pages already loaded.
      if (chat && chat.threadId === next.threadId) {
        const known = new Set(next.messages.map((m) => m.id));
        next.messages = [...chat.messages.filter((m) => !known.has(m.id) && m.createdAtMs < (next.messages[0]?.createdAtMs ?? Infinity)), ...next.messages];
      }
      chat = next;
      now = Date.now();
      error = null;
      if (first) older = next.messages.length >= 50;
      if (next.threadId && next.accepted && next.messages.some((m) => !m.mine)) void dmApi.read(next.threadId).catch(() => {});
      if (first || next.messages.length > before) await scrollDown(!first);
    } catch (e) {
      if (!chat) error = e instanceof Error && "status" in e && (e as { status: number }).status === 404 ? "This conversation isn't available." : "Couldn't load this conversation.";
    }
  }

  async function loadOlder() {
    if (!to || !chat?.messages.length) return;
    const first = chat.messages[0]!.createdAtMs;
    try {
      const page = await dmApi.chat(to, first);
      chat = { ...chat, messages: [...page.messages, ...chat.messages] };
      older = page.messages.length >= 50;
    } catch {
      toast.error("Couldn't load earlier messages.");
    }
  }

  async function send() {
    if (editing) return saveEdit();
    const body = draft.trim();
    const photo = staged.ready;
    if ((!body && !photo) || !chat || !to || (staged.current && !photo)) return;
    draft = "";
    if (photo) staged.drop();
    const target: DmTo = chat.threadId ? { threadId: chat.threadId } : to;
    const sending = queueDm(target, body, photo ? { photo } : {});
    await scrollDown();
    await sending;
    await load();
  }

  async function sendCard(card: { type: string; json: string }) {
    sharing = false;
    if (!chat || !to) return;
    const sending = queueDm(chat.threadId ? { threadId: chat.threadId } : to, "", { card });
    await scrollDown();
    await sending;
    await load();
  }

  // Photos are uploaded first, so they need a connection; the message itself then waits in the
  // outbox like any other.
  // Double-tap a message for ❤️, or pick from the long-press sheet; your own again takes it back.
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
      toast.error(e instanceof ApiError && e.status < 500 && e.message ? e.message : "Couldn't react. Try again.");
    }
  }

  async function deleteChat() {
    if (!chat?.threadId) return;
    try {
      await dmApi.remove(chat.threadId);
      toast.success("Chat deleted");
      await goto("/messages", { replaceState: true });
    } catch {
      toast.error("Couldn't delete. Try again.");
    }
  }

  async function accept() {
    if (!chat?.threadId) return;
    try {
      await dmApi.accept(chat.threadId);
      chat = { ...chat, accepted: true };
    } catch {
      toast.error("Couldn't accept. Try again.");
    }
  }

  async function remove() {
    if (!chat?.threadId) return;
    try {
      await dmApi.remove(chat.threadId);
      await goto("/messages/requests", { replaceState: true });
    } catch {
      toast.error("Couldn't delete. Try again.");
    }
  }

  onMount(() => {
    void load(true);
    void trainingApi.friends().then((f) => (training = f.find((x) => x.username === (to && "username" in to ? to.username : chat?.other?.username)) ?? null)).catch(() => {});
    const poll = setInterval(() => document.visibilityState === "visible" && void load(), 5_000);
    return () => clearInterval(poll);
  });

  // A time line when more than an hour passed since the message before.
  const gap = (list: DmMessage[], i: number) => i === 0 || list[i]!.createdAtMs - list[i - 1]!.createdAtMs > 3_600_000;
</script>

{#snippet content(m: DmMessage, first: boolean, last: boolean)}
  {@const story = m.cardType === "Story"}
  {@const card = story ? readStoryQuote(m.cardJson) : readCard(m.cardType, m.cardJson)}
  {@const storyPhoto = story ? readStoryPhoto(m.cardJson) : null}
  {@const invite = m.cardType === "GroupInvite" ? readGroupInvite(m.cardJson) : null}
  {@const kids = joinedKids(m.mine, first, last)}
  {@const align = m.mine ? "end" : "start"}
  <div class="relative flex w-full flex-col gap-1 {m.mine ? 'items-end' : 'items-start'} {m.reactions?.length && !m.deleted ? 'mb-4' : ''}">
    {#if invite}<div class={kids}><GroupInviteCard {invite} mine={m.mine} /></div>{/if}
    {#if story}<span class="px-1 text-[12px] text-muted-foreground">{m.mine ? `Replied to ${name}'s story` : "Replied to your story"}{card || storyPhoto ? "" : " · no longer available"}</span>{/if}
    {#if storyPhoto}
      <div class="relative aspect-[9/16] w-28 shrink-0 overflow-hidden rounded-xl bg-black"><img src={photoSrc(storyPhoto.url)} alt="The story" loading="lazy" class="size-full object-cover" /></div>
    {:else if card}<div class={kids}><MessageCard {card} mine={m.mine} /></div>{/if}
    {#if m.photoUrl && m.body}
      <!-- A photo and its caption: one bubble (Attachment media inside Bubble). -->
      <Bubble.Root variant={m.mine ? "default" : "muted"} {align} class="max-w-[78%]">
        <Bubble.Content class="overflow-hidden rounded-[20px] p-0 text-[15px] leading-snug {joined(m.mine, first, last)}">
          <MessagePhoto url={m.photoUrl} width={m.photoWidth} height={m.photoHeight} mine={m.mine} bare />
          <div class="px-3.5 py-2"><ChatText text={m.body} /></div>
        </Bubble.Content>
      </Bubble.Root>
    {:else}
      {#if m.photoUrl || m.photoHidden}<div class={kids}><MessagePhoto url={m.photoUrl} width={m.photoWidth} height={m.photoHeight} hidden={m.photoHidden} mine={m.mine} /></div>{/if}
      {#if m.voiceUrl || m.voiceHidden}<div class={kids}><VoiceMessage voice={m.voiceUrl ? { url: m.voiceUrl, ms: m.voiceMs, peaks: m.voicePeaks ?? "" } : null} hidden={m.voiceHidden} mine={m.mine} /></div>{/if}
      {#if m.body}
        <Bubble.Root variant={m.mine ? "default" : "muted"} {align} class="max-w-[78%]">
          <Bubble.Content class="rounded-[20px] px-3.5 py-2 text-[15px] leading-snug {joined(m.mine, first, last)}"><ChatText text={m.body} /></Bubble.Content>
        </Bubble.Root>
      {/if}
    {/if}
    {#if m.deleted}
      <Bubble.Root variant="outline" {align}>
        <Bubble.Content class="rounded-[20px] border-dashed bg-transparent px-3.5 py-2 text-[14px] italic text-muted-foreground">{m.removedByLogIt ? "Removed by LogIt" : m.removedByModerator ? "Removed by a moderator" : m.mine ? "You unsent a message" : `${senderName(m)} unsent a message`}</Bubble.Content>
      </Bubble.Root>
    {:else if m.edited}<span class="px-1 text-[11px] text-muted-foreground">Edited</span>{/if}
    {#if m.reactions?.length && !m.deleted}<ChatReactions reactions={m.reactions} {align} onpick={(e) => void react(m, e)} />{/if}
  </div>
{/snippet}

<div class="flex h-full flex-col">
  <PageHeader>
    <BackButton onclick={() => back("/messages")} />
    {#if group}
      <a href="/groups/{group.id}" class="flex min-w-0 flex-1 items-center gap-2.5 text-inherit no-underline">
        <GroupAvatar name={group.name} src={group.photoUrl} size={36} />
        <span class="flex min-w-0 flex-col">
          <span class="truncate text-[15px] font-semibold leading-tight">{group.name}</span>
          <span class="truncate text-[12px] text-muted-foreground">{group.members} {group.members === 1 ? "member" : "members"}</span>
        </span>
      </a>
    {:else if chat?.other}
      <a href="/social/{chat.other.username}" class="flex min-w-0 flex-1 items-center gap-2.5 text-inherit no-underline">
        <PersonAvatar name={name} src={chat.other.avatarUrl} size={34} training={!!training} />
        <span class="flex min-w-0 flex-col">
          <span class="truncate text-[15px] font-semibold leading-tight">{name}</span>
          <span class="truncate text-[12px] text-muted-foreground">{training ? `Training now${training.what ? ` · ${training.what}` : ""} · ${minutesIn(training, now)} min in` : `@${chat.other.username}`}</span>
        </span>
      </a>
    {:else}
      <h1 class="page-title">{name}</h1>
    {/if}
    {#if chat?.threadId}
      <button type="button" aria-label="Chat options" class="flex size-11 shrink-0 items-center justify-center text-muted-foreground" onclick={() => (menuOpen = true)}><MoreHorizontal class="size-5" /></button>
    {/if}
  </PageHeader>

  {#if nextEvent}
    <a href="/events/{nextEvent.id}" transition:fade={{ duration: 150 }} class="mx-3 mt-1 flex min-h-12 shrink-0 items-center gap-2.5 rounded-xl border border-border bg-card px-3 text-inherit no-underline">
      <Calendar class="size-4 shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate text-[14px]">Next: <strong class="font-semibold">{nextEvent.title}</strong> · {eventShort(nextEvent.startsAtMs)}</span>
      <span class="shrink-0 text-[13px] {nextEvent.answer === true ? 'text-success' : 'text-muted-foreground'}">{nextEvent.answer === true ? "Going" : nextEvent.answer === false ? "Can't make it" : `${nextEvent.going} going`}</span>
    </a>
  {/if}
  <div bind:this={listEl} class="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-3">
    {#if error}
      <p class="py-10 text-center text-sm text-muted-foreground">{error}</p>
    {:else if !chat}
      <div class="flex justify-center py-10"><Spinner class="size-5 text-muted-foreground" /></div>
    {:else}
      {#if older}
        <button type="button" class="mx-auto mb-2 h-9 rounded-full border border-border px-4 text-[13px] font-medium" onclick={loadOlder}>Earlier messages</button>
      {/if}
      {#if chat.messages.length === 0 && pending.length === 0}
        <div class="m-auto flex flex-col items-center gap-2 text-center">
          {#if group}<GroupAvatar name={group.name} src={group.photoUrl} size={72} />{:else}<PersonAvatar name={name} src={chat.other?.avatarUrl} size={72} />{/if}
          <p class="text-[15px] font-semibold">{name}</p>
          <p class="max-w-[30ch] text-sm text-muted-foreground">{group ? "Nothing here yet. Say hello to the group." : chat.canSend ? "Say hello. Messages to people who don't follow you go to their requests." : chat.why}</p>
        </div>
      {/if}
      {#each runs as run, r (run.key)}
        {@const lead = run.items[0]!}
        {#if run.time}<p class="py-2 text-center text-[12px] text-muted-foreground">{dayTime(lead.createdAtMs, now)}</p>{/if}
        <Message.Root align={run.mine ? "end" : "start"} class="shrink-0 gap-2 text-[15px] {r > 0 && !run.time ? 'mt-1.5' : ''}">
          {#if !run.mine}
            <Message.Avatar class="min-w-7 bg-transparent">
              {#if group}
                {#if lead.from}<a href="/social/{lead.from.username}" aria-label={senderName(lead)}><PersonAvatar name={senderName(lead)} src={lead.from.avatarUrl} size={28} /></a>{:else}<PersonAvatar name={null} size={28} />{/if}
              {:else}<PersonAvatar name={name} src={chat.other?.avatarUrl} size={28} />{/if}
            </Message.Avatar>
          {/if}
          <Message.Content class="gap-1">
            {#if group && !run.mine}<Message.Header class="px-1 text-[12px] font-normal">{senderName(lead)}</Message.Header>{/if}
            {#each run.items as m, k (m.id)}
              <div in:fade={{ duration: 150 }} use:longpress={() => { if (!m.deleted) picked = m; }} ondblclick={() => void react(m, "❤️")} role="presentation"
                class="flex w-full select-none flex-col {run.mine ? 'items-end' : 'items-start'} {editing?.id === m.id ? 'opacity-60' : ''}">
                {@render content(m, k === 0, k === run.items.length - 1)}
              </div>
            {/each}
            {#if seen && r === runs.length - 1}<div transition:fade={{ duration: 150 }}><Message.Footer class="px-1 text-[12px] font-normal">Seen</Message.Footer></div>{/if}
          </Message.Content>
        </Message.Root>
      {/each}
      {#if pending.length}
        <Message.Root align="end" class="mt-1.5 shrink-0 text-[15px]">
          <Message.Content class="gap-1">
            {#each pending as p (p.clientId)}
              <div in:fade={{ duration: 150 }} class="flex w-full flex-col items-end gap-1">
                {#if p.card?.type === "Story"}<span class="px-1 text-[12px] text-muted-foreground">Replying to {name}'s story</span>{/if}
                {#if p.card && readCard(p.card.type, p.card.json)}<div class="opacity-60"><MessageCard card={readCard(p.card.type, p.card.json)!} mine /></div>{/if}
                {#if p.photo}<MessagePhoto url={p.photo.url} width={p.photo.width} height={p.photo.height} mine dim />{/if}
                {#if p.voice}<VoiceMessage voice={p.voice} mine dim />{/if}
                {#if p.body}
                  <Bubble.Root variant="default" align="end" class="max-w-[78%] opacity-60">
                    <Bubble.Content class="rounded-[20px] px-3.5 py-2 text-[15px] leading-snug"><ChatText text={p.body} /></Bubble.Content>
                  </Bubble.Root>
                {/if}
                <!-- Not sent: says why, with what to do (canvas board 18). -->
                <Message.Footer class="flex-wrap gap-2 px-1 text-[12px] font-normal {p.error ? 'text-destructive' : ''}">
                  {p.error ?? "Not sent yet"}
                  {#if p.error}
                    <button type="button" class="h-8 rounded-md border border-border px-2.5 text-foreground" onclick={() => discardDm(p.clientId)}>Remove</button>
                  {:else}
                    <button type="button" class="h-8 rounded-md border border-border px-2.5 text-foreground" onclick={() => void retryDm(p.clientId)}>Try now</button>
                  {/if}
                </Message.Footer>
              </div>
            {/each}
          </Message.Content>
        </Message.Root>
      {/if}
    {/if}
  </div>

  {#if chat && !chat.accepted}
    <div class="flex shrink-0 flex-col gap-2 border-t border-border px-4 pb-3 pt-3">
      <p class="text-[13px] leading-snug text-muted-foreground">{name} wants to send you a message. They won't know you've seen it until you accept. Block or report from their profile.</p>
      <div class="grid grid-cols-2 gap-2">
        <button type="button" class="h-11 rounded-lg border border-border text-sm font-medium" onclick={remove}>Delete</button>
        <button type="button" class="h-11 rounded-lg bg-primary text-sm font-semibold text-primary-foreground" onclick={accept}>Accept</button>
      </div>
    </div>
  {:else if chat && chat.mutedUntilMs}
    <p class="flex shrink-0 items-center gap-2.5 border-t border-border px-4 pb-5 pt-3.5 text-[14px] leading-snug text-muted-foreground">
      <VolumeX class="size-[18px] shrink-0" />A moderator muted you in this chat until {new Date(chat.mutedUntilMs).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}. You can still read it, and everything else in the group works.
    </p>
  {:else if chat && !chat.canSend}
    {#if chat.messages.length > 0}<p class="shrink-0 border-t border-border px-4 py-3 text-center text-[13px] text-muted-foreground">{chat.why}</p>{/if}
  {:else if chat && recording}
    <VoiceRecorderBar onsend={sendVoice} oncancel={() => (recording = false)} />
  {:else if chat}
    {#if editing}
      <div transition:fade={{ duration: 120 }} class="flex shrink-0 items-center gap-2 border-t border-border px-4 pt-2 text-[13px] text-muted-foreground">
        <Pencil class="size-3.5" /><span class="flex-1">Editing message</span>
        <button type="button" aria-label="Stop editing" class="flex size-9 items-center justify-center" onclick={() => { editing = null; draft = ""; }}><X class="size-4" /></button>
      </div>
    {/if}
    <StagedPhotoCard {staged} bordered={!editing} />
    <form class="flex shrink-0 items-end gap-2 {editing || staged.current ? '' : 'border-t'} border-border px-3 py-2" onsubmit={(e) => { e.preventDefault(); void send(); }}>
      <!-- One rounded box (shadcn Input Group): + and camera inside, mic or Send beside it. -->
      <InputGroup.Root class="min-h-11 flex-1 rounded-[22px] dark:bg-transparent">
        <InputGroup.Addon align="inline-start" class="self-end pb-0.5">
          <button type="button" aria-label="Send a photo, workout or record" class="flex size-10 items-center justify-center rounded-full text-muted-foreground" onclick={() => (attachOpen = true)}><Plus class="size-5" /></button>
        </InputGroup.Addon>
        <InputGroup.Textarea
          bind:value={draft}
          rows={1}
          maxlength={2000}
          placeholder={staged.current ? "Add a caption…" : group ? "Message the group…" : `Message ${name.split(" ")[0]}…`}
          aria-label="Message {name}"
          class="max-h-32 min-h-10 py-2.5 text-[15px]"
          onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
        />
        {#if !staged.current && !editing}
          <InputGroup.Addon align="inline-end" class="self-end pb-0.5">
            <button type="button" aria-label="Take a photo" class="flex size-10 items-center justify-center rounded-full text-muted-foreground" onclick={() => void staged.pick("camera")}><Camera class="size-5" /></button>
          </InputGroup.Addon>
        {/if}
      </InputGroup.Root>
      {#if draft.trim() || staged.current}
        <button type="submit" aria-label="Send" disabled={!!staged.current && !staged.ready} class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50">
          {#if staged.current?.state === "uploading"}<Spinner class="size-[18px]" />{:else}<Send class="size-[18px]" />{/if}
        </button>
      {:else}
        <button type="button" aria-label="Record a voice message" class="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground" onclick={() => (recording = true)}>
          <Mic class="size-5" />
        </button>
      {/if}
    </form>
  {/if}
</div>

{#if sharing}<ShareCardSheet onpick={sendCard} onclose={() => (sharing = false)} />{/if}
<ActionSheet
  open={attachOpen}
  onOpenChange={(v) => (attachOpen = v)}
  title="Send"
  items={[
    { icon: ImageIcon, label: "Photo", onSelect: () => void staged.pick("photos") },
    { icon: Camera, label: "Camera", onSelect: () => void staged.pick("camera") },
    { icon: Dumbbell, label: "Workout or record", onSelect: () => (sharing = true) },
  ]}
/>
<ActionSheet
  open={menuOpen}
  onOpenChange={(v) => (menuOpen = v)}
  title={name}
  items={group ? [
    { icon: Users, label: "Group page", onSelect: () => void goto(`/groups/${group.id}`) },
    { icon: Settings2, label: "Your settings", onSelect: () => void goto(`/groups/${group.id}/settings`) },
  ] : [
    ...(chat?.other ? [{ icon: User, label: "View profile", onSelect: () => void goto(`/social/${chat!.other!.username}`) }] : []),
    { icon: Trash2, label: "Delete chat", destructive: true, onSelect: () => (confirmDelete = true) },
    ...(chat?.other ? [{ icon: Flag, label: "Report", destructive: true, onSelect: () => (reporting = { type: "User", id: chat!.other!.id!, what: `@${chat!.other!.username}` }) }] : []),
    ...(chat?.other ? [{ icon: Ban, label: `Block ${name}`, destructive: true, onSelect: () => (confirmBlock = true) }] : []),
  ]}
/>
<ConfirmDialog
  open={confirmDelete}
  onOpenChange={(v) => (confirmDelete = v)}
  title="Delete this chat?"
  description="It's removed for you only. {name} keeps their copy, and a new message from them starts it again."
  confirmLabel="Delete"
  onConfirm={deleteChat}
/>
<ActionSheet open={!!picked} onOpenChange={(v) => { if (!v) picked = null; }} title={picked?.mine ? "Your message" : `${picked ? senderName(picked) : name}'s message`} items={messageActions}>
  {#snippet header()}
    {#if picked && chat?.accepted}
      {@const m = picked}
      {@const mineNow = m.reactions?.find((r) => r.mine)?.emoji}
      <div role="group" aria-label="React" class="mb-1 flex justify-between gap-1 rounded-2xl bg-muted/60 p-1.5">
        {#each DM_REACTIONS as e (e)}
          <button type="button" aria-label="React {e}" aria-pressed={mineNow === e}
            class="flex size-11 items-center justify-center rounded-full text-[24px] transition-transform active:scale-90 {mineNow === e ? 'bg-primary/25' : ''}"
            onclick={() => { const target = m; picked = null; void react(target, e); }}>{e}</button>
        {/each}
      </div>
    {/if}
  {/snippet}
</ActionSheet>
<ConfirmDialog
  open={!!confirmUnsend}
  onOpenChange={(v) => { if (!v) confirmUnsend = null; }}
  title="Unsend this message?"
  description="It's removed for everyone in the chat."
  confirmLabel="Unsend"
  onConfirm={() => { const m = confirmUnsend; confirmUnsend = null; if (m) void unsend(m); }}
/>
{#if reporting}
  <ReportSheet open targetType={reporting.type} targetId={reporting.id} what={reporting.what} onclose={() => (reporting = null)} />
{/if}
<ConfirmDialog
  open={!!confirmRemove}
  onOpenChange={(v) => { if (!v) confirmRemove = null; }}
  title="Remove this message?"
  description="It's removed for everyone in the group and shows as removed by a moderator."
  confirmLabel="Remove"
  onConfirm={() => { const m = confirmRemove; confirmRemove = null; if (m) void removeAsModerator(m); }}
/>
<ActionSheet
  open={!!muting}
  onOpenChange={(v) => { if (!v) muting = null; }}
  title={muting ? `Mute ${senderName(muting)} in the chat` : ""}
  items={muteItems(muting, (m, min) => void muteSender(m, min))}
/>
<ConfirmDialog
  open={confirmBlock}
  onOpenChange={(v) => (confirmBlock = v)}
  title="Block {name}?"
  description="They can't message you, see your profile, stories or training, or find you. They aren't told. You can unblock them in Settings › Privacy."
  confirmLabel="Block"
  onConfirm={block}
/>
