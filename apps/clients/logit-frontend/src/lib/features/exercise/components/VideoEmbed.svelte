<script lang="ts">
  // An exercise's video in How to (decision D3). Nothing loads until it's tapped, so opening
  // How to sends nothing to YouTube; then it plays here, from youtube-nocookie.com.
  import { Play } from "lucide-svelte";
  import { youtubeEmbedUrl } from "./video";

  const { url, title }: { url: string; title: string } = $props();
  const embed = $derived(youtubeEmbedUrl(url));
  let playing = $state(false);
</script>

{#if embed}
  {#if playing}
    <iframe class="aspect-video w-full rounded-xl" src={embed} {title} allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
  {:else}
    <button type="button" class="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-left" onclick={() => (playing = true)}>
      <span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Play class="size-4" fill="currentColor" /></span>
      <span class="flex flex-col gap-0.5">
        <span class="text-[15px] font-semibold">Watch it done</span>
        <span class="text-xs text-muted-foreground">Plays here from YouTube. Nothing loads until you tap.</span>
      </span>
    </button>
  {/if}
{/if}
