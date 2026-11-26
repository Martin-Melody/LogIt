<!-- Someone's profile picture, big (Instagram's "view profile picture"): a dimmed screen with the
     photo in the middle, round for people, a rounded square for groups. Tap anywhere or back to close. -->
<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import { photoSrc } from "@logit/core/api/photosApi";
  import { backDismiss } from "$lib/components/sheet/sheet";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";

  const { src, name, group = false, onclose }: { src: string; name: string; group?: boolean; onclose: () => void } = $props();

  $effect(() => {
    openOverlay();
    return () => closeOverlay();
  });
</script>

<button type="button" aria-label="Close {name}'s {group ? 'photo' : 'profile picture'}" transition:fade={{ duration: 150 }}
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
  use:backDismiss={onclose} onclick={onclose}>
  <img in:scale={{ start: 0.6, duration: 180 }} src={photoSrc(src)} alt="{name}'s {group ? 'photo' : 'profile picture'}"
    class="aspect-square w-[min(80vw,340px)] object-cover {group ? 'rounded-[18%]' : 'rounded-full'}" />
</button>
