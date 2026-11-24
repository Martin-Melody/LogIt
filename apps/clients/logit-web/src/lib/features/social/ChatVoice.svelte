<!-- A voice message on the dashboard (people or coaching): play / pause, the sender's waveform,
     the time left. One plays at a time. Locked in a request you haven't accepted. -->
<script lang="ts" module>
  let playing: HTMLAudioElement | null = null;
</script>

<script lang="ts">
  import PlayIcon from "@lucide/svelte/icons/play";
  import PauseIcon from "@lucide/svelte/icons/pause";
  import LockIcon from "@lucide/svelte/icons/lock";
  import { voiceSrc, voiceTime, type MessageVoice } from "@logit/core/api/voiceApi";

  const { voice, hidden = false, mine = false }: { voice: MessageVoice | null; hidden?: boolean; mine?: boolean } = $props();

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
  <div class="flex w-60 shrink-0 items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground {mine ? 'self-end' : 'self-start'}"><LockIcon class="size-4" />Voice message · accept to play</div>
{:else if voice}
  <div role="group" aria-label="Voice message, {voiceTime(voice.ms)}" class="flex w-64 shrink-0 items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-3 {mine ? 'self-end bg-primary/15' : 'self-start bg-muted'}">
    <button type="button" aria-label={on ? "Pause" : "Play voice message"} onclick={toggle} disabled={failed}
      class="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-50">
      {#if on}<PauseIcon class="size-3.5 fill-current" />{:else}<PlayIcon class="size-3.5 translate-x-px fill-current" />{/if}
    </button>
    <span aria-hidden="true" class="flex h-6 min-w-0 flex-1 items-center gap-px overflow-hidden">
      {#each bars as b, i (i)}<span class="w-[3px] shrink-0 rounded-full {i / bars.length < done ? 'bg-foreground' : 'bg-foreground/30'}" style="height: {3 + b * 2}px"></span>{/each}
    </span>
    <span class="shrink-0 text-[11px] tabular-nums text-muted-foreground">{failed ? "Can't play" : voiceTime(on || at > 0 ? voice.ms - at * 1000 : voice.ms)}</span>
    <audio bind:this={audio} src={voiceSrc(voice.url)} preload="none" ontimeupdate={() => (at = audio?.currentTime ?? 0)}
      onplay={() => (on = true)} onpause={() => (on = false)} onended={() => { on = false; at = 0; }} onerror={() => (failed = true)}></audio>
  </div>
{/if}
