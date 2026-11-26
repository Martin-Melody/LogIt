<!-- Recording a voice message (design canvas M6): starts when it appears (the mic was tapped), a
     red dot, the time and a live waveform; delete or send. Stops by itself at a minute. Tap, not
     hold, so it works with chalk on your hands. -->
<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { onDestroy, onMount } from "svelte";
  import { Send, Trash2 } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { ApiError } from "@logit/core/api/client";
  import { startRecording, uploadVoice, voiceTime, type MessageVoice, type Recording } from "@logit/core/api/voiceApi";

  const { onsend, oncancel }: { onsend: (voice: MessageVoice) => void; oncancel: () => void } = $props();

  let rec: Recording | null = null;
  let ms = $state(0);
  let levels = $state<number[]>(Array(28).fill(0));
  let sending = $state(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  onMount(async () => {
    try {
      rec = await startRecording(() => void send());
    } catch {
      toast.error("LogIt needs the microphone to record. Allow it in your phone's settings, then try again.");
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
      if (durationMs < 500) {
        oncancel();
        return;
      }
      onsend(await uploadVoice(blob, durationMs, peaks));
    } catch (e) {
      toast.error(e instanceof ApiError && e.status < 500 && e.message ? e.message : "Voice messages need a connection. Try again when you're online.");
      oncancel();
    }
  }
</script>

<div class="flex shrink-0 flex-col gap-1.5 border-t border-border px-3 pb-2 pt-2.5">
  <div class="flex items-center gap-2">
    <button type="button" aria-label="Delete recording" onclick={discard} disabled={sending} class="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground disabled:opacity-50"><Trash2 class="size-5" /></button>
    <div class="flex h-11 flex-1 items-center gap-2.5 rounded-full border border-border px-3.5" role="status" aria-label="Recording, {voiceTime(ms)}">
      <span class="size-2.5 shrink-0 rounded-full bg-destructive {sending ? '' : 'animate-pulse'}" aria-hidden="true"></span>
      <span class="w-9 shrink-0 text-[14px] font-semibold tabular-nums">{voiceTime(ms)}</span>
      <span aria-hidden="true" class="flex h-6 flex-1 items-center justify-end gap-[2px] overflow-hidden">
        {#each levels as l, i (i)}<span class="w-[3px] shrink-0 rounded-full bg-foreground/70 transition-[height] duration-100" style="height: {3 + l * 20}px"></span>{/each}
      </span>
    </div>
    <button type="button" aria-label="Send voice message" onclick={send} disabled={sending} class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-60">
      {#if sending}<Spinner class="size-[18px]" />{:else}<Send class="size-[18px]" />{/if}
    </button>
  </div>
  <p class="text-center text-[12px] text-muted-foreground">{sending ? "Sending…" : "Recording · up to 1 minute"}</p>
</div>
