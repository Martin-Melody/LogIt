<script lang="ts">
  import { Music, Pause, Play, SkipBack, SkipForward } from "lucide-svelte";
  import { musicSettings } from "./musicSettings";
  import { music, musicControls, watchMusic } from "./nowPlaying.svelte";
  import MusicSheet from "./MusicSheet.svelte";
  import MusicSetupSheet from "./MusicSetupSheet.svelte";

  /** Whether anything is drawn, so the page can leave room for it. */
  let { visible = $bindable(false) }: { visible?: boolean } = $props();

  let sheetOpen = $state(false);
  let setupOpen = $state(false);

  $effect(() => {
    if (!$musicSettings.barEnabled) return;
    return watchMusic();
  });

  const mode = $derived.by<"hidden" | "setup" | "idle" | "playing">(() => {
    if (!music.supported || !$musicSettings.barEnabled) return "hidden";
    if (music.granted === null) return "hidden";
    if (!music.granted) return $musicSettings.setupDismissed ? "hidden" : "setup";
    if (music.np.available && (music.np.title || music.np.isPlaying)) return "playing";
    return $musicSettings.playlists.length > 0 ? "idle" : "hidden";
  });

  $effect(() => {
    visible = mode !== "hidden";
  });

  const progress = $derived(
    music.np.durationMs ? Math.min(100, (music.positionMs / music.np.durationMs) * 100) : 0,
  );
  const subtitle = $derived(
    [music.np.artist, music.np.appName].filter(Boolean).join(" · "),
  );
</script>

{#if mode === "setup"}
  <button
    type="button"
    class="mb-3 flex h-[52px] w-full items-center gap-2.5 rounded-xl border border-dashed border-border px-3 text-left"
    onclick={() => (setupOpen = true)}
  >
    <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
      <Music class="size-4" />
    </span>
    <span class="flex-1 text-[13px] font-medium">Control your music from here</span>
    <span class="text-xs text-muted-foreground">Set up</span>
  </button>
{:else if mode === "idle"}
  <button
    type="button"
    class="mb-3 flex h-[52px] w-full items-center gap-2.5 rounded-xl border border-border bg-muted/60 px-3 text-left"
    onclick={() => (sheetOpen = true)}
  >
    <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background">
      <Music class="size-4" />
    </span>
    <span class="flex-1 text-[13px] font-medium">Nothing playing</span>
    <span class="text-xs text-muted-foreground">Your playlists</span>
  </button>
{:else if mode === "playing"}
  <div class="relative mb-3 flex h-[60px] items-center gap-1 overflow-hidden rounded-[14px] border border-border bg-muted/60 pl-2 pr-1.5">
    <button
      type="button"
      class="flex min-w-0 flex-1 items-center gap-2.5 self-stretch text-left"
      aria-label="Open music controls"
      onclick={() => (sheetOpen = true)}
    >
      {#if music.np.artwork}
        <img src={music.np.artwork} alt="" class="size-11 shrink-0 rounded-lg object-cover" />
      {:else}
        <span class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Music class="size-5" />
        </span>
      {/if}
      <span class="flex min-w-0 flex-col gap-0.5">
        <span class="truncate text-sm font-semibold">{music.np.title ?? "Unknown track"}</span>
        {#if subtitle}
          <span class="truncate text-xs text-muted-foreground">{subtitle}</span>
        {/if}
      </span>
    </button>
    <button
      type="button"
      class="flex h-11 w-10 shrink-0 items-center justify-center disabled:opacity-40"
      aria-label="Previous"
      disabled={music.np.canSkipPrevious === false}
      onclick={musicControls.previous}
    >
      <SkipBack class="size-5 fill-current" />
    </button>
    <button
      type="button"
      class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
      aria-label={music.np.isPlaying ? "Pause" : "Play"}
      onclick={musicControls.togglePlay}
    >
      {#if music.np.isPlaying}
        <Pause class="size-[18px] fill-current" />
      {:else}
        <Play class="ml-0.5 size-[18px] fill-current" />
      {/if}
    </button>
    <button
      type="button"
      class="flex h-11 w-10 shrink-0 items-center justify-center disabled:opacity-40"
      aria-label="Next"
      disabled={music.np.canSkipNext === false}
      onclick={musicControls.next}
    >
      <SkipForward class="size-5 fill-current" />
    </button>
    {#if progress > 0}
      <span class="absolute bottom-0 left-0 h-0.5 bg-primary" style="width: {progress}%" aria-hidden="true"></span>
    {/if}
  </div>
{/if}

<MusicSheet open={sheetOpen} onOpenChange={(v) => (sheetOpen = v)} />
<MusicSetupSheet open={setupOpen} onOpenChange={(v) => (setupOpen = v)} />
