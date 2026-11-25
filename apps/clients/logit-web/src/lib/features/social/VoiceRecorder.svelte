<!-- Recording a voice message on the dashboard (design canvas C2): replaces the composer while
     it runs. Delete or send; stops by itself at a minute. -->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import { ApiError } from "@logit/core/api/client";
  import { startRecording, uploadVoice, voiceTime, type MessageVoice, type Recording } from "@logit/core/api/voiceApi";

  const { onsend, oncancel, onerror }: { onsend: (voice: MessageVoice) => void; oncancel: () => void; onerror: (message: string) => void } = $props();

  let rec: Recording | null = null;
  let ms = $state(0);
  let levels = $state<number[]>(Array(40).fill(0));
  let sending = $state(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  onMount(async () => {
    try {
      rec = await startRecording(() => void send());
    } catch {
      onerror("The browser didn't allow the microphone. Allow it for this site, then try again.");
      oncancel();
      return;
    }
    timer = setInterval(() => {
      if (!rec) return;
      ms = rec.elapsedMs();
      levels = [...levels.slice(1), rec.level()];
    }, 100);
  });
  onDestroy(() => {
    clearInterval(timer);
    if (!sending) rec?.cancel();
  });

  function discard() {
    rec?.cancel();
    rec = null;
    oncancel();
  }

  async function send() {
    if (!rec || sending) return;
    sending = true;
    clearInterval(timer);
    const r = rec;
    rec = null;
    try {
      const { blob, durationMs, peaks } = await r.stop();
      if (durationMs < 500) return oncancel();
      onsend(await uploadVoice(blob, durationMs, peaks));
    } catch (e) {
      onerror(e instanceof ApiError && e.message ? e.message : "Couldn't send the voice message. Try again.");
      oncancel();
    }
  }
</script>

<div class="flex items-center gap-2">
  <button type="button" aria-label="Delete recording" onclick={discard} disabled={sending} class="flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"><Trash2Icon class="size-4" /></button>
  <div class="flex h-9 flex-1 items-center gap-2.5 rounded-[10px] border border-input px-3" role="status" aria-label="Recording, {voiceTime(ms)}">
    <span class="size-2 shrink-0 rounded-full bg-destructive {sending ? '' : 'animate-pulse'}" aria-hidden="true"></span>
    <span class="w-8 shrink-0 text-[13px] font-semibold tabular-nums">{voiceTime(ms)}</span>
    <span aria-hidden="true" class="flex h-5 flex-1 items-center justify-end gap-[2px] overflow-hidden">
      {#each levels as l, i (i)}<span class="w-[3px] shrink-0 rounded-full bg-foreground/60" style="height: {2 + l * 16}px"></span>{/each}
    </span>
    <span class="text-[11px] text-muted-foreground">{sending ? "Sending…" : "up to 1 min"}</span>
  </div>
  <button type="button" onclick={send} disabled={sending} class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Send</button>
</div>
