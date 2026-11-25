<!-- A photo full screen: swipe down, back or × to close. -->
<script lang="ts">
  import { X } from "lucide-svelte";
  import { fade } from "svelte/transition";
  import { sheetDrag, backDismiss } from "$lib/components/sheet/sheet";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";

  const { src, onclose }: { src: string; onclose: () => void } = $props();

  $effect(() => {
    openOverlay();
    return () => closeOverlay();
  });
</script>

<div role="dialog" aria-modal="true" aria-label="Photo" transition:fade={{ duration: 150 }}
  class="dark fixed inset-0 z-50 flex flex-col bg-black pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-white"
  use:sheetDrag={{ onDismiss: onclose }} use:backDismiss={onclose}>
  <div data-sheet-bar class="flex justify-end p-1">
    <button type="button" aria-label="Close" class="flex size-11 items-center justify-center" onclick={onclose}><X class="size-5" /></button>
  </div>
  <div class="flex min-h-0 flex-1 items-center justify-center p-2">
    <img {src} alt="" class="max-h-full max-w-full object-contain" />
  </div>
</div>
