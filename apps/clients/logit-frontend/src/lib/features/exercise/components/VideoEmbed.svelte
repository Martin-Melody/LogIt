<script lang="ts">
  // An exercise's video in How to (decision D3): YouTube or Vimeo, played here. Nothing loads
  // until it's tapped, so opening How to sends nothing to either; then it plays from
  // youtube-nocookie.com, or Vimeo with do-not-track (Phase 6.12).
  import { Play } from "lucide-svelte";
  import { parseVideoLink, videoEmbedUrl, videoLabel, type HowToVideo } from "@logit/core/domain/howTo";

  const { url, video, title }: { url?: string; video?: HowToVideo | null; title: string } = $props();
  const v = $derived(video ?? (url ? parseVideoLink(url) : null));
  let playing = $state(false);
</script>

{#if v}
  {#if playing}
    <iframe class="aspect-video w-full rounded-xl" src={videoEmbedUrl(v)} {title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
  {:else}
    <button type="button" class="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-left" onclick={() => (playing = true)}>
      <span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Play class="size-4" fill="currentColor" /></span>
      <span class="flex flex-col gap-0.5">
        <span class="text-[15px] font-semibold">Watch it done</span>
        <span class="text-xs text-muted-foreground">{videoLabel(v)}. Plays here; nothing loads until you tap.</span>
      </span>
    </button>
  {/if}
{/if}
