<!-- A voice message (design canvas M5): play / pause, the sender's waveform filling as it plays,
     the time left. One plays at a time. Locked in a request you haven't accepted (M8). -->
<script lang="ts" module>
  let playing: HTMLAudioElement | null = null;
</script>

<script lang="ts">
  import { Lock, Pause, Play } from "lucide-svelte";
  import { voiceSrc, voiceTime, type MessageVoice } from "@logit/core/api/voiceApi";

  const { voice, hidden = false, mine = false, dim = false }: { voice: MessageVoice | null; hidden?: boolean; mine?: boolean; dim?: boolean } = $props();

  let audio = $state<HTMLAudioElement | null>(null);
  let on = $state(false);
  let at = $state(0);
  let failed = $state(false);
  const bars = $derived((voice?.peaks || "3".repeat(32)).split("").map(Number));
  const done = $derived(voice && voice.ms ? Math.min(1, (at * 1000) / voice.ms) : 0);

  function toggle() {
    if (!audio) return;
    if (on) audio.pause();
    else {
      if (playing && playing !== audio) playing.pause();
      playing = audio;
      void audio.play().catch(() => (failed = true));
    }
  }
</script>

{#if hidden}
  <div class="flex w-56 shrink-0 items-center gap-2.5 rounded-2xl bg-muted px-2.5 py-2 text-[13px] text-muted-foreground">
    <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-background/60"><Lock class="size-4" /></span>Voice message · accept to play
  </div>
{:else if voice}
  <div role="group" aria-label="Voice message, {voiceTime(voice.ms)}"
    class="flex w-64 max-w-[78vw] shrink-0 items-center gap-2.5 py-2 pl-2 pr-3 transition-opacity {mine ? 'self-end rounded-[18px_18px_4px_18px] bg-primary text-primary-foreground' : 'self-start rounded-[18px_18px_18px_4px] bg-muted'} {dim ? 'opacity-60' : ''}">
    <button type="button" aria-label={on ? "Pause" : "Play voice message"} onclick={toggle} disabled={failed || dim}
      class="flex size-9 shrink-0 items-center justify-center rounded-full {mine ? 'bg-primary-foreground text-primary' : 'bg-foreground text-background'}">
      {#if on}<Pause class="size-4 fill-current" />{:else}<Play class="size-4 translate-x-px fill-current" />{/if}
    </button>
    <span aria-hidden="true" class="flex h-7 min-w-0 flex-1 items-center gap-px overflow-hidden">
      {#each bars as b, i (i)}
        <span class="w-[3px] shrink-0 rounded-full transition-colors {i / bars.length < done ? (mine ? 'bg-primary-foreground' : 'bg-foreground') : mine ? 'bg-primary-foreground/35' : 'bg-foreground/30'}" style="height: {4 + b * 2.4}px"></span>
      {/each}
    </span>
    <span class="shrink-0 text-[12px] tabular-nums opacity-80">{failed ? "Can't play" : voiceTime(on || at > 0 ? voice.ms - at * 1000 : voice.ms)}</span>
    <audio bind:this={audio} src={voiceSrc(voice.url)} preload="none" ontimeupdate={() => (at = audio?.currentTime ?? 0)}
      onplay={() => (on = true)} onpause={() => (on = false)} onended={() => { on = false; at = 0; }} onerror={() => (failed = true)}></audio>
  </div>
{/if}
