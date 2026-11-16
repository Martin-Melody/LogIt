<script lang="ts">
  import type { Snippet } from "svelte";
  import { fade } from "svelte/transition";
  import { sheetUp } from "$lib/transitions";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";

  // A plain bottom sheet: dimmed backdrop (tap to close), grab bar, scrollable body,
  // footer pinned above the keyboard / home bar.
  interface Props {
    label: string;
    onclose: () => void;
    children: Snippet;
    footer?: Snippet;
    /** Taller cap for sheets that hold a list. */
    tall?: boolean;
  }
  const { label, onclose, children, footer, tall = false }: Props = $props();

  $effect(() => {
    openOverlay();
    return () => closeOverlay();
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }
</script>

<svelte:window {onkeydown} />

<button
  type="button"
  class="fixed inset-0 z-40 bg-black/55"
  aria-label="Close"
  onclick={onclose}
  transition:fade={{ duration: 150 }}
></button>

<div
  role="dialog"
  aria-modal="true"
  aria-label={label}
  class="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-lg flex-col rounded-t-2xl border-t border-border bg-card shadow-2xl {tall ? 'max-h-[92dvh]' : 'max-h-[88dvh]'}"
  transition:sheetUp
>
  <div class="mx-auto mt-2 mb-1 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true"></div>
  <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
    {@render children()}
  </div>
  {#if footer}
    <div class="shrink-0 px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      {@render footer()}
    </div>
  {:else}
    <div class="h-[env(safe-area-inset-bottom)] shrink-0"></div>
  {/if}
</div>
