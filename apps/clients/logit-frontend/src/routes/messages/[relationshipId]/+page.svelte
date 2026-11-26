<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { onMount, onDestroy, tick } from "svelte";
  import { page } from "$app/state";
  import { Camera, Image as ImageIcon, Mic, Plus, Send } from "lucide-svelte";
  import VoiceMessage from "$lib/components/social/VoiceMessage.svelte";
  import VoiceRecorderBar from "$lib/components/social/VoiceRecorderBar.svelte";
  import type { MessageVoice } from "@logit/core/api/voiceApi";
  import { toast } from "svelte-sonner";
  import ActionSheet from "$lib/components/ActionSheet.svelte";
  import MessagePhoto from "$lib/components/social/MessagePhoto.svelte";
  import * as Message from "$lib/components/ui/message/index.js";
  import * as Bubble from "$lib/components/ui/bubble/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import ChatText from "$lib/components/social/ChatText.svelte";
  import StagedPhotoCard from "$lib/components/social/StagedPhotoCard.svelte";
  import { StagedPhoto } from "$lib/features/chat/stagedPhoto.svelte";
  import { back } from "$lib/navigation";
  import type { CoachMessage } from "@logit/core/domain/CoachMessage";
  import { getMessagesRepo } from "$lib/data/repoProvider";
  import { pullAndMergeMessages, markThreadRead } from "$lib/sync/syncService";
  import { sendMessage } from "$lib/usecases/messages/sendMessage";

  const props = $props<{ params: { relationshipId: string } }>();
  const relationshipId = $derived(props.params.relationshipId);
  const name = $derived(page.url.searchParams.get("name") ?? "Conversation");

  const ui = $state({ loading: true, sending: false, error: null as string | null });
  let messages = $state<CoachMessage[]>([]);
  let draft = $state("");
  let attachOpen = $state(false);
  // A picked photo waits above the box so a caption can go with it (canvas boards 18 and 20).
  const staged = new StagedPhoto();
  let recording = $state(false);

  async function sendVoice(voice: MessageVoice) {
    recording = false;
    await sendMessage(relationshipId, "", undefined, voice);
    await refresh(false);
  }
  let listEl = $state<HTMLDivElement | null>(null);
  let poll: ReturnType<typeof setInterval> | undefined;

  function fmt(ms: number): string {
    return new Date(ms).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
  }

  async function refresh(pull = true) {
    try {
      if (pull) await pullAndMergeMessages();
      messages = await getMessagesRepo().listThread(relationshipId);
      const last = messages.at(-1)?.createdAtMs ?? 0;
      if (last) await markThreadRead(relationshipId, last);
      await tick();
      listEl?.scrollTo({ top: listEl.scrollHeight });
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load messages";
    }
  }

  async function send() {
    const body = draft.trim();
    const photo = staged.ready;
    if ((!body && !photo) || ui.sending || (staged.current && !photo)) return;
    ui.sending = true;
    draft = "";
    if (photo) staged.drop();
    try {
      await sendMessage(relationshipId, body, photo);
      await refresh(false);
    } finally {
      ui.sending = false;
    }
  }

  // Runs of messages from one side (shadcn Message): joined corners, one time under the run.
  const runs = $derived.by(() => {
    const out: { key: string; mine: boolean; time: boolean; items: CoachMessage[] }[] = [];
    messages.forEach((m, i) => {
      const time = i === 0 || m.createdAtMs - messages[i - 1]!.createdAtMs > 3_600_000;
      const prev = out.at(-1);
      if (prev && !time && prev.mine === m.mine) prev.items.push(m);
      else out.push({ key: m.id, mine: m.mine, time, items: [m] });
    });
    return out;
  });
  const joined = (mine: boolean, first: boolean, last: boolean) =>
    mine ? `${first ? "" : "rounded-tr-md!"} ${last ? "" : "rounded-br-md!"}` : `${first ? "" : "rounded-tl-md!"} ${last ? "" : "rounded-bl-md!"}`;
  const joinedKids = (mine: boolean, first: boolean, last: boolean) =>
    mine ? `${first ? "" : "*:rounded-tr-md!"} ${last ? "" : "*:rounded-br-md!"}` : `${first ? "" : "*:rounded-tl-md!"} ${last ? "" : "*:rounded-bl-md!"}`;

  onMount(async () => {
    await refresh();
    ui.loading = false;
    poll = setInterval(() => void refresh(), 15_000);
  });
  onDestroy(() => clearInterval(poll));
</script>

<div class="flex h-full flex-col">
  <PageHeader>
    <BackButton onclick={() => back("/messages")} />
    <h1 class="page-title">{name}</h1>
  </PageHeader>

  {#if ui.error}<p class="px-3 py-2 text-sm text-destructive shrink-0">{ui.error}</p>{/if}

  <div bind:this={listEl} class="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-3">
    {#if ui.loading}
      <p class="text-sm text-muted-foreground">Loading…</p>
    {:else if messages.length === 0}
      <p class="text-sm text-muted-foreground text-center py-8">No messages yet. Say hello 👋</p>
    {:else}
      {#each runs as run (run.key)}
        {@const last = run.items.at(-1)!}
        {#if run.time}<p class="py-2 text-center text-[12px] text-muted-foreground">{fmt(run.items[0]!.createdAtMs)}</p>{/if}
        <Message.Root align={run.mine ? "end" : "start"} class="shrink-0 text-[15px]">
          <Message.Content class="gap-1">
            {#each run.items as m, k (m.id)}
              {@const first = k === 0}
              {@const end = k === run.items.length - 1}
              <div class="flex w-full flex-col gap-1 {m.mine ? 'items-end' : 'items-start'} {m.mine && !m.synced ? 'opacity-60' : ''}">
                {#if m.photo && m.body}
                  <Bubble.Root variant={m.mine ? "default" : "muted"} align={m.mine ? "end" : "start"} class="max-w-[78%]">
                    <Bubble.Content class="overflow-hidden rounded-[20px] p-0 text-[15px] leading-snug {joined(m.mine, first, end)}">
                      <MessagePhoto url={m.photo.url} width={m.photo.width} height={m.photo.height} mine={m.mine} bare />
                      <div class="px-3.5 py-2"><ChatText text={m.body} /></div>
                    </Bubble.Content>
                  </Bubble.Root>
                {:else}
                  {#if m.photo}<div class={joinedKids(m.mine, first, end)}><MessagePhoto url={m.photo.url} width={m.photo.width} height={m.photo.height} mine={m.mine} /></div>{/if}
                  {#if m.voice}<div class={joinedKids(m.mine, first, end)}><VoiceMessage voice={m.voice} mine={m.mine} /></div>{/if}
                  {#if m.body}
                    <Bubble.Root variant={m.mine ? "default" : "muted"} align={m.mine ? "end" : "start"} class="max-w-[78%]">
                      <Bubble.Content class="rounded-[20px] px-3.5 py-2 text-[15px] leading-snug {joined(m.mine, first, end)}"><ChatText text={m.body} /></Bubble.Content>
                    </Bubble.Root>
                  {/if}
                {/if}
              </div>
            {/each}
            <Message.Footer class="px-1 text-[12px] font-normal">{new Date(last.createdAtMs).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}{#if run.items.some((m) => m.mine && !m.synced)} · sending…{/if}</Message.Footer>
          </Message.Content>
        </Message.Root>
      {/each}
    {/if}
  </div>

  {#if recording}
    <VoiceRecorderBar onsend={sendVoice} oncancel={() => (recording = false)} />
  {:else}
  <StagedPhotoCard {staged} />
  <form class="flex shrink-0 items-end gap-2 {staged.current ? '' : 'border-t'} border-border px-3 py-2" onsubmit={(e) => { e.preventDefault(); void send(); }}>
    <InputGroup.Root class="min-h-11 flex-1 rounded-[22px] dark:bg-transparent">
      <InputGroup.Addon align="inline-start" class="self-end pb-0.5">
        <button type="button" aria-label="Send a photo" class="flex size-10 items-center justify-center rounded-full text-muted-foreground" onclick={() => (attachOpen = true)}><Plus class="size-5" /></button>
      </InputGroup.Addon>
      <InputGroup.Textarea
        bind:value={draft}
        rows={1}
        placeholder={staged.current ? "Add a caption…" : `Message ${name}…`}
        aria-label="Message {name}"
        class="max-h-32 min-h-10 py-2.5 text-[15px]"
        onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
      />
      {#if !staged.current}
        <InputGroup.Addon align="inline-end" class="self-end pb-0.5">
          <button type="button" aria-label="Take a photo" class="flex size-10 items-center justify-center rounded-full text-muted-foreground" onclick={() => void staged.pick("camera")}><Camera class="size-5" /></button>
        </InputGroup.Addon>
      {/if}
    </InputGroup.Root>
    {#if draft.trim() || staged.current}
      <button type="submit" aria-label="Send" disabled={ui.sending || (!!staged.current && !staged.ready)} class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50">
        {#if staged.current?.state === "uploading"}<Spinner class="size-[18px]" />{:else}<Send class="size-[18px]" />{/if}
      </button>
    {:else}
      <button type="button" aria-label="Record a voice message" class="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground" onclick={() => (recording = true)}><Mic class="size-5" /></button>
    {/if}
  </form>
  {/if}
</div>

<ActionSheet
  open={attachOpen}
  onOpenChange={(v) => (attachOpen = v)}
  title="Send a photo"
  items={[
    { icon: ImageIcon, label: "Photo", onSelect: () => void staged.pick("photos") },
    { icon: Camera, label: "Camera", onSelect: () => void staged.pick("camera") },
  ]}
/>
