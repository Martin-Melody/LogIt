<!-- A chat with one person (design canvas M2), by ?u=<username> (also before the first message)
     or ?t=<thread id>. A request you received shows Accept / Delete instead of the box until you
     accept or reply. "Seen" only with read receipts on for both. A message sent offline waits,
     marked "Not sent yet", and goes when the connection is back. -->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { fade } from "svelte/transition";
  import { Ban, Camera, Copy, Dumbbell, Flag, Image as ImageIcon, Loader2, MoreHorizontal, Pencil, Plus, Send, Trash2, Undo2, User, X } from "lucide-svelte";
  import ReportSheet from "$lib/components/social/ReportSheet.svelte";
  import { socialApi } from "@logit/core/api/socialApi";
  import { longpress } from "$lib/swipe";
  import { DM_EDIT_WINDOW_MS, unsent } from "@logit/core/api/dmApi";
  import MessagePhoto from "$lib/components/social/MessagePhoto.svelte";
  import { pickImageFile } from "$lib/platform/filePick";
  import { resizeImageFile } from "$lib/platform/imageResize";
  import { uploadPhoto } from "@logit/core/api/photosApi";
  import { ApiError } from "@logit/core/api/client";
  import MessageCard from "$lib/components/social/MessageCard.svelte";
  import ShareCardSheet from "$lib/components/social/ShareCardSheet.svelte";
  import ActionSheet from "$lib/components/ActionSheet.svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import { readCard, readStoryQuote } from "@logit/core/domain/messageCard";
  import { toast } from "svelte-sonner";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import PersonAvatar from "$lib/components/social/PersonAvatar.svelte";
  import { Textarea } from "$lib/components/ui/textarea";
  import { back } from "$lib/navigation";
  import { dmApi, type DmChat, type DmMessage, type DmTo } from "@logit/core/api/dmApi";
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
  let uploading = $state(0);
  // Long-press a message (Instagram): Edit / Copy / Unsend on yours, Copy / Report on theirs.
  let picked = $state<DmMessage | null>(null);
  let editing = $state<DmMessage | null>(null);
  let confirmUnsend = $state<DmMessage | null>(null);
  let confirmBlock = $state(false);

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
      ...(m.mine
        ? [{ icon: Undo2, label: "Unsend", destructive: true, onSelect: () => (confirmUnsend = m) }]
        : [{ icon: Flag, label: "Report", destructive: true, onSelect: () => (reporting = { type: "Message", id: m.id, what: "message" }) }]),
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

  const name = $derived(chat?.other ? chat.other.displayName || chat.other.username : chat ? "Deleted account" : "");
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
    if (!body || !chat || !to) return;
    draft = "";
    const target: DmTo = chat.threadId ? { threadId: chat.threadId } : to;
    const sending = queueDm(target, body);
    await scrollDown();
    await sending;
    await load();
  }

  async function sendCard(card: { type: string; json: string }) {
    sharing = false;
    if (!chat || !to) return;
    const sending = queueDm(chat.threadId ? { threadId: chat.threadId } : to, "", card);
    await scrollDown();
    await sending;
    await load();
  }

  // Photos are uploaded first, so they need a connection; the message itself then waits in the
  // outbox like any other.
  async function sendPhoto(from: "photos" | "camera") {
    if (!chat || !to) return;
    let file: File;
    try {
      file = await pickImageFile(from);
    } catch {
      return; // cancelled
    }
    uploading++;
    await scrollDown();
    try {
      const photo = await uploadPhoto(await resizeImageFile(file, 2048, 0.85));
      const sending = queueDm(chat.threadId ? { threadId: chat.threadId } : to, "", undefined, photo);
      await sending;
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError && e.status < 500 && e.message ? e.message : "Photos need a connection. Try again when you're online.");
    } finally {
      uploading--;
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

<div class="flex h-full flex-col">
  <PageHeader>
    <BackButton onclick={() => back("/messages")} />
    {#if chat?.other}
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

  <div bind:this={listEl} class="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-3">
    {#if error}
      <p class="py-10 text-center text-sm text-muted-foreground">{error}</p>
    {:else if !chat}
      <div class="flex justify-center py-10"><Loader2 class="size-5 animate-spin text-muted-foreground" /></div>
    {:else}
      {#if older}
        <button type="button" class="mx-auto mb-2 h-9 rounded-full border border-border px-4 text-[13px] font-medium" onclick={loadOlder}>Earlier messages</button>
      {/if}
      {#if chat.messages.length === 0 && pending.length === 0}
        <div class="m-auto flex flex-col items-center gap-2 text-center">
          <PersonAvatar name={name} src={chat.other?.avatarUrl} size={72} />
          <p class="text-[15px] font-semibold">{name}</p>
          <p class="max-w-[30ch] text-sm text-muted-foreground">{chat.canSend ? "Say hello. Messages to people who don't follow you go to their requests." : chat.why}</p>
        </div>
      {/if}
      {#each chat.messages as m, i (m.id)}
        {#if gap(chat.messages, i)}<p class="py-2 text-center text-[12px] text-muted-foreground">{dayTime(m.createdAtMs, now)}</p>{/if}
        {@const story = m.cardType === "Story"}
        {@const card = story ? readStoryQuote(m.cardJson) : readCard(m.cardType, m.cardJson)}
        <div in:fade={{ duration: 150 }} use:longpress={() => { if (!m.deleted) picked = m; }} class="flex shrink-0 select-none flex-col gap-1 {m.mine ? 'items-end' : 'items-start'} {editing?.id === m.id ? 'opacity-60' : ''}">
          {#if story}<span class="px-1 text-[12px] text-muted-foreground">{m.mine ? `Replied to ${name}'s story` : "Replied to your story"}{card ? "" : " · no longer available"}</span>{/if}
          {#if card}<MessageCard {card} mine={m.mine} />{/if}
          {#if m.photoUrl || m.photoHidden}<MessagePhoto url={m.photoUrl} width={m.photoWidth} height={m.photoHeight} hidden={m.photoHidden} mine={m.mine} />{/if}
          {#if m.body}<p class="max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug {m.mine ? 'bg-primary text-primary-foreground' : 'bg-muted'}">{m.body}</p>{/if}
          {#if m.deleted}
            <p class="rounded-2xl border border-border px-3.5 py-2 text-[14px] italic text-muted-foreground">{m.removedByLogIt ? "Removed by LogIt" : m.mine ? "You unsent a message" : `${name} unsent a message`}</p>
          {:else if m.edited}<span class="px-1 text-[11px] text-muted-foreground">Edited</span>{/if}
        </div>
      {/each}
      {#if seen}<p transition:fade={{ duration: 150 }} class="pr-1 text-right text-[12px] text-muted-foreground">Seen</p>{/if}
      {#each pending as p (p.clientId)}
        <div in:fade={{ duration: 150 }} class="flex shrink-0 flex-col items-end gap-1">
          {#if p.card?.type === "Story"}<span class="px-1 text-[12px] text-muted-foreground">Replying to {name}'s story</span>{/if}
          {#if p.card && readCard(p.card.type, p.card.json)}<div class="opacity-60"><MessageCard card={readCard(p.card.type, p.card.json)!} mine /></div>{/if}
          {#if p.photo}<MessagePhoto url={p.photo.url} width={p.photo.width} height={p.photo.height} mine dim />{/if}
          {#if p.body}<p class="max-w-[78%] whitespace-pre-wrap break-words rounded-2xl bg-primary/60 px-3.5 py-2 text-[15px] leading-snug text-primary-foreground">{p.body}</p>{/if}
          {#if p.error}
            <span class="flex items-center gap-2 text-[12px] text-destructive">{p.error}
              <button type="button" class="h-8 rounded-md border border-border px-2 text-foreground" onclick={() => discardDm(p.clientId)}>Remove</button>
            </span>
          {:else}
            <span class="flex items-center gap-2 text-[12px] text-muted-foreground">Not sent yet
              <button type="button" class="h-8 rounded-md border border-border px-2 text-foreground" onclick={() => void retryDm(p.clientId)}>Try now</button>
            </span>
          {/if}
        </div>
      {/each}
      {#if uploading > 0}
        <div in:fade={{ duration: 150 }} class="flex h-40 w-40 items-center justify-center gap-2 self-end rounded-2xl bg-muted text-[13px] text-muted-foreground"><Loader2 class="size-4 animate-spin" />Sending photo</div>
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
  {:else if chat && !chat.canSend}
    {#if chat.messages.length > 0}<p class="shrink-0 border-t border-border px-4 py-3 text-center text-[13px] text-muted-foreground">{chat.why}</p>{/if}
  {:else if chat}
    {#if editing}
      <div transition:fade={{ duration: 120 }} class="flex shrink-0 items-center gap-2 border-t border-border px-4 pt-2 text-[13px] text-muted-foreground">
        <Pencil class="size-3.5" /><span class="flex-1">Editing message</span>
        <button type="button" aria-label="Stop editing" class="flex size-9 items-center justify-center" onclick={() => { editing = null; draft = ""; }}><X class="size-4" /></button>
      </div>
    {/if}
    <form class="flex shrink-0 items-end gap-2 {editing ? '' : 'border-t'} border-border px-3 py-2" onsubmit={(e) => { e.preventDefault(); void send(); }}>
      <button type="button" aria-label="Send a photo, workout or record" class="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground" onclick={() => (attachOpen = true)}><Plus class="size-5" /></button>
      <Textarea
        bind:value={draft}
        rows={1}
        maxlength={2000}
        placeholder="Message {name}…"
        aria-label="Message {name}"
        class="max-h-32 min-h-11 flex-1 resize-none rounded-2xl"
        onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
      />
      <button type="submit" aria-label="Send" class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40" disabled={!draft.trim()}>
        <Send class="size-[18px]" />
      </button>
    </form>
  {/if}
</div>

{#if sharing}<ShareCardSheet onpick={sendCard} onclose={() => (sharing = false)} />{/if}
<ActionSheet
  open={attachOpen}
  onOpenChange={(v) => (attachOpen = v)}
  title="Send"
  items={[
    { icon: ImageIcon, label: "Photo", onSelect: () => void sendPhoto("photos") },
    { icon: Camera, label: "Camera", onSelect: () => void sendPhoto("camera") },
    { icon: Dumbbell, label: "Workout or record", onSelect: () => (sharing = true) },
  ]}
/>
<ActionSheet
  open={menuOpen}
  onOpenChange={(v) => (menuOpen = v)}
  title={name}
  items={[
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
<ActionSheet open={!!picked} onOpenChange={(v) => { if (!v) picked = null; }} title={picked?.mine ? "Your message" : `${name}'s message`} items={messageActions} />
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
  open={confirmBlock}
  onOpenChange={(v) => (confirmBlock = v)}
  title="Block {name}?"
  description="They can't message you, see your profile, stories or training, or find you. They aren't told. You can unblock them in Settings › Privacy."
  confirmLabel="Block"
  onConfirm={block}
/>
