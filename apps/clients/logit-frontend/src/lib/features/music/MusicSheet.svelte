<script lang="ts">
  import { Separator } from "$lib/components/ui/separator/index.js";
  import { Slider } from "$lib/components/ui/slider/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { ArrowUpRight, Music, Pause, Play, SkipBack, SkipForward } from "lucide-svelte";
  import { musicSettings } from "./musicSettings";
  import { music, musicControls, startPlaylist } from "./nowPlaying.svelte";
  import { APP_LABEL } from "./playlistLinks";
  import type { WorkoutPlaylist } from "./workoutPlaylists";
  import { formatTrackTime } from "./formatTrackTime";

  const { open = false, onOpenChange = (_v: boolean) => {} } = $props<{
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
  }>();

  const np = $derived(music.np);
  const playing = $derived(np.available && (!!np.title || !!np.isPlaying));
  const duration = $derived(np.durationMs ?? 0);
  // While dragging, the thumb follows the finger rather than the app.
  let dragMs = $state<number | null>(null);
  const shownMs = $derived(dragMs ?? music.positionMs);

  async function play(p: WorkoutPlaylist) {
    const r = await startPlaylist(p);
    if (r === "opened") toast(`Opened ${p.name}. Press play there, then come back.`);
    else if (r === "failed") toast.error(`Couldn't open ${p.name}. Is ${APP_LABEL[p.app]} installed?`);
    else onOpenChange(false);
  }

  function editPlaylists() {
    onOpenChange(false);
    void goto("/settings/music");
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content sheet
    class="top-auto bottom-0 left-0 max-w-full translate-x-0 translate-y-0 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom gap-0 rounded-t-2xl rounded-b-none border-x-0 border-b-0 p-0 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:max-w-full max-h-[90dvh] overflow-y-auto"
  >
    <div class="mx-auto mt-2.5 h-1 w-10 rounded-full bg-border" aria-hidden="true"></div>

    <div class="flex flex-col gap-5 px-5 pt-4">
      <Dialog.Header class="sr-only">
        <Dialog.Title>Music</Dialog.Title>
        <Dialog.Description>Control the music app that's playing.</Dialog.Description>
      </Dialog.Header>

      {#if playing}
        <div class="flex items-center justify-between gap-3 pr-8">
          <span class="text-xs text-muted-foreground">
            Playing in <strong class="font-semibold text-foreground">{np.appName ?? "your music app"}</strong>
          </span>
          <button
            type="button"
            class="flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium"
            onclick={musicControls.openApp}
          >
            Open app <ArrowUpRight class="size-3.5" />
          </button>
        </div>

        <div class="flex items-center gap-3.5">
          {#if np.artwork}
            <img src={np.artwork} alt="" class="size-24 shrink-0 rounded-xl object-cover" />
          {:else}
            <span class="flex size-24 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Music class="size-9" />
            </span>
          {/if}
          <div class="flex min-w-0 flex-col gap-1">
            <span class="text-lg font-semibold leading-snug">{np.title ?? "Unknown track"}</span>
            {#if np.artist}<span class="text-sm text-muted-foreground">{np.artist}</span>{/if}
            {#if np.album}<span class="truncate text-xs text-muted-foreground">{np.album}</span>{/if}
          </div>
        </div>

        {#if duration > 0}
          <div class="flex flex-col gap-1">
            <Slider
              type="single"
              min={0}
              max={duration}
              step={1000}
              value={shownMs}
              disabled={!np.canSeek}
              aria-label="Position in track"
              class="py-3"
              onValueChange={(v) => (dragMs = v)}
              onValueCommit={(v) => {
                dragMs = null;
                void musicControls.seekTo(v);
              }}
            />
            <div class="flex justify-between text-[11px] tabular-nums text-muted-foreground">
              <span>{formatTrackTime(shownMs)}</span>
              <span>{formatTrackTime(duration)}</span>
            </div>
          </div>
        {/if}

        <div class="flex items-center justify-center gap-5">
          <button
            type="button"
            class="flex size-11 items-center justify-center text-[11px] font-semibold text-muted-foreground disabled:opacity-40"
            aria-label="Back 15 seconds"
            disabled={!np.canSeek}
            onclick={() => musicControls.seekBy(-15_000)}
          >−15</button>
          <button
            type="button"
            class="flex size-12 items-center justify-center disabled:opacity-40"
            aria-label="Previous"
            disabled={np.canSkipPrevious === false}
            onclick={musicControls.previous}
          >
            <SkipBack class="size-6 fill-current" />
          </button>
          <button
            type="button"
            class="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground"
            aria-label={np.isPlaying ? "Pause" : "Play"}
            onclick={musicControls.togglePlay}
          >
            {#if np.isPlaying}
              <Pause class="size-6 fill-current" />
            {:else}
              <Play class="ml-1 size-6 fill-current" />
            {/if}
          </button>
          <button
            type="button"
            class="flex size-12 items-center justify-center disabled:opacity-40"
            aria-label="Next"
            disabled={np.canSkipNext === false}
            onclick={musicControls.next}
          >
            <SkipForward class="size-6 fill-current" />
          </button>
          <button
            type="button"
            class="flex size-11 items-center justify-center text-[11px] font-semibold text-muted-foreground disabled:opacity-40"
            aria-label="Forward 15 seconds"
            disabled={!np.canSeek}
            onclick={() => musicControls.seekBy(15_000)}
          >+15</button>
        </div>

        <Separator />
      {:else}
        <p class="pr-8 text-sm text-muted-foreground">
          Nothing's playing. Start one of your playlists, or play something in your music app.
        </p>
      {/if}

      <div class="flex flex-col gap-2.5">
        <div class="flex items-baseline justify-between">
          <h2 class="text-sm font-semibold">Your workout playlists</h2>
          <button type="button" class="min-h-8 text-xs text-muted-foreground" onclick={editPlaylists}>Edit</button>
        </div>
        {#each $musicSettings.playlists as p (p.id)}
          <button
            type="button"
            class="flex h-[52px] items-center gap-3 rounded-[10px] border border-border px-3 text-left"
            onclick={() => play(p)}
          >
            {#if p.imageUrl}
              <img src={p.imageUrl} alt="" class="size-8 shrink-0 rounded-md object-cover" />
            {:else}
              <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted"><Music class="size-4" /></span>
            {/if}
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-sm font-medium">{p.name}</span>
              <span class="truncate text-[11px] text-muted-foreground">
                {APP_LABEL[p.app]}{p.day ? ` · ${p.day.dayName}` : ""}
              </span>
            </span>
            <Play class="size-[18px] fill-current" />
          </button>
        {/each}
        <button
          type="button"
          class="h-11 rounded-[10px] border border-dashed border-border text-[13px] font-medium text-muted-foreground"
          onclick={editPlaylists}
        >
          + Paste a playlist link
        </button>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
