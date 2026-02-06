<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Trash } from "@lucide/svelte";
  import { swipeable } from "@react2svelte/swipeable";
  import type { SwipeEventData } from "@react2svelte/swipeable";
  import { Pencil } from "lucide-svelte";

  export let actionsWidth = 128; // px revealed when open (tweak)
  export let disabled = false;

  export let onDelete: (() => void) | undefined;
  export let onEdit: (() => void) | undefined;

  let dx = 0; // current translateX
  let open = false; // snapped state

  function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
  }

  function onSwiping(e: CustomEvent<SwipeEventData>) {
    if (disabled) return;

    // Negative deltaX means finger moving left (reveal right-side actions)
    const next = open ? -actionsWidth + e.detail.deltaX : e.detail.deltaX;
    dx = clamp(next, -actionsWidth, 0);
  }

  function onSwiped(e: CustomEvent<SwipeEventData>) {
    if (disabled) return;

    // Decide snap based on how far it moved (or velocity if you want)
    const shouldOpen = dx < -actionsWidth * 0.35;
    open = shouldOpen;
    dx = open ? -actionsWidth : 0;
  }

  function close() {
    open = false;
    dx = 0;
  }

  function toggleOpen() {
    open = !open;
    dx = open ? -actionsWidth : 0;
  }

  // Optional: close if user taps the row while open
  function onTap() {
    if (open) close();
  }
</script>

<div class="relative overflow-hidden rounded-md">
  <!-- Back layer: actions -->
  <div class="absolute inset-0 flex justify-end items-stretch">
    <div class="flex h-full">
      {#if onEdit}
        <Button
          variant="ghost"
          size="icon-sm"
          {disabled}
          onclick={() => {
            onEdit?.();
            close();
          }}
        >
          <Pencil color="blue" />
        </Button>
      {/if}

      {#if onDelete}
        <Button
          variant="ghost"
          size="icon-sm"
          {disabled}
          onclick={() => {
            onDelete?.();
            close();
          }}
        >
          <Trash color="red" />
        </Button>
      {/if}
    </div>
  </div>

  <!-- Front layer: draggable content -->
  <div
    use:swipeable={{
      trackTouch: true,
      trackMouse: false,
      delta: 8,
      preventScrollOnSwipe: true,
      // important for iOS scroll + horizontal swipe feel
      touchEventOptions: { passive: false },
    }}
    on:swiping={onSwiping}
    on:swiped={onSwiped}
    on:tap={onTap}
    class="relative bg-background"
    style="transform: translate3d({dx}px, 0, 0); transition: {disabled
      ? 'none'
      : 'transform 140ms ease'}; touch-action: pan-y;"
  >
    <slot />
  </div>

  <!-- Optional: quick “grab” affordance or open toggle -->
  {#if !disabled}
    <button
      type="button"
      class="absolute left-2 top-1/2 -translate-y-1/2 text-xs opacity-40"
      on:click|stopPropagation={toggleOpen}
      aria-label="Toggle row actions"
    >
      ⋮
    </button>
  {/if}
</div>
