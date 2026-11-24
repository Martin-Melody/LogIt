<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { onMount, onDestroy, tick } from "svelte";
  import { page } from "$app/state";
  import { Camera, Image as ImageIcon, Loader2, Plus, Send } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import ActionSheet from "$lib/components/ActionSheet.svelte";
  import MessagePhoto from "$lib/components/social/MessagePhoto.svelte";
  import { pickImageFile } from "$lib/platform/filePick";
  import { resizeImageFile } from "$lib/platform/imageResize";
  import { uploadPhoto } from "@logit/core/api/photosApi";
  import { ApiError } from "@logit/core/api/client";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
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
  let uploading = $state(0);
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
    if (!body || ui.sending) return;
    ui.sending = true;
    draft = "";
    try {
      await sendMessage(relationshipId, body);
      await refresh(false);
    } finally {
      ui.sending = false;
    }
  }

  // A form-check or progress photo (design canvas C1): uploaded first, so it needs a connection.
  async function sendPhoto(from: "photos" | "camera") {
    let file: File;
    try {
      file = await pickImageFile(from);
    } catch {
      return; // cancelled
    }
    uploading++;
    try {
      const photo = await uploadPhoto(await resizeImageFile(file, 2048, 0.85));
      await sendMessage(relationshipId, "", photo);
      await refresh(false);
    } catch (e) {
      toast.error(e instanceof ApiError && e.status < 500 && e.message ? e.message : "Photos need a connection. Try again when you're online.");
    } finally {
      uploading--;
    }
  }

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

  <div bind:this={listEl} class="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
    {#if ui.loading}
      <p class="text-sm text-muted-foreground">Loading…</p>
    {:else if messages.length === 0}
      <p class="text-sm text-muted-foreground text-center py-8">No messages yet. Say hello 👋</p>
    {:else}
      {#each messages as m (m.id)}
        <div class="flex flex-col gap-1 {m.mine ? 'items-end' : 'items-start'}">
          {#if m.photo}
            <div class="flex flex-col gap-0.5 {m.mine ? 'items-end' : 'items-start'}">
              <MessagePhoto url={m.photo.url} width={m.photo.width} height={m.photo.height} mine={m.mine} dim={m.mine && !m.synced} />
              {#if !m.body}<p class="px-1 text-[11px] text-muted-foreground">{fmt(m.createdAtMs)}{#if m.mine && !m.synced} · sending…{/if}</p>{/if}
            </div>
          {/if}
          {#if m.body}
          <div class="max-w-[80%] rounded-lg px-3 py-2 text-sm {m.mine ? 'bg-primary text-primary-foreground' : 'bg-muted'}">
            <p class="whitespace-pre-wrap break-words">{m.body}</p>
            <p class="text-[11px] opacity-80 mt-0.5">{fmt(m.createdAtMs)}{#if m.mine && !m.synced} · sending…{/if}</p>
          </div>
          {/if}
        </div>
      {/each}
    {/if}
    {#if uploading > 0}
      <div class="flex h-40 w-40 items-center justify-center gap-2 self-end rounded-2xl bg-muted text-[13px] text-muted-foreground"><Loader2 class="size-4 animate-spin" />Sending photo</div>
    {/if}
  </div>

  <form class="flex items-end gap-2 px-3 py-2 border-t border-border shrink-0" onsubmit={(e) => { e.preventDefault(); void send(); }}>
    <button type="button" aria-label="Send a photo" class="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground" onclick={() => (attachOpen = true)}><Plus class="size-5" /></button>
    <textarea
      bind:value={draft}
      rows="1"
      placeholder="Message…"
      class="flex-1 resize-none rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring max-h-32"
      onkeydown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
    ></textarea>
    <Button type="submit" size="icon" class="h-11 w-11 shrink-0" disabled={ui.sending || !draft.trim()}>
      <Send class="h-4 w-4" />
    </Button>
  </form>
</div>

<ActionSheet
  open={attachOpen}
  onOpenChange={(v) => (attachOpen = v)}
  title="Send a photo"
  items={[
    { icon: ImageIcon, label: "Photo", onSelect: () => void sendPhoto("photos") },
    { icon: Camera, label: "Camera", onSelect: () => void sendPhoto("camera") },
  ]}
/>
