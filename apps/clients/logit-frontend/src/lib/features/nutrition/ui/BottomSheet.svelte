<script lang="ts">
  import type { Snippet } from "svelte";
  import { fade } from "svelte/transition";
  import { sheetUp } from "$lib/transitions";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";

  // A bottom sheet: dimmed backdrop (tap to close), grab bar, scrollable body, footer pinned
  // above the home bar. It follows a finger down and closes past a distance or a flick,
  // from the grab bar or from anywhere once the body is scrolled to the top.
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

  let sheet = $state<HTMLDivElement | null>(null);
  let body = $state<HTMLDivElement | null>(null);
  let offset = $state(0); // px the sheet is pulled down
  let settling = $state(false); // animating back up or away after a release
  let closedByDrag = $state(false);

  // Gesture state (not reactive).
  let startY = 0;
  let startedOnBar = false;
  let tracking = false; // a touch is down that may become a drag
  let dragging = false;
  let samples: { y: number; t: number }[] = [];

  const CLOSE_DISTANCE = 120;
  const CLOSE_VELOCITY = 0.6; // px per ms, downwards

  function begin(y: number, onBar: boolean) {
    startY = y;
    startedOnBar = onBar;
    tracking = true;
    dragging = false;
    settling = false;
    samples = [{ y, t: performance.now() }];
  }

  /** Returns true when the move is being used to drag the sheet. */
  function move(y: number): boolean {
    if (!tracking) return false;
    const dy = y - startY;
    if (!dragging) {
      // Only a downward pull, and only when the body can't scroll up any further.
      const atTop = !body || body.scrollTop <= 0;
      if (dy > 6 && (startedOnBar || atTop)) {
        dragging = true;
        startY = y; // start from here so the sheet doesn't jump by the slop
      } else if (Math.abs(dy) > 6) {
        tracking = false; // a scroll, leave it alone
        return false;
      } else {
        return false;
      }
    }
    offset = Math.max(0, y - startY);
    samples.push({ y, t: performance.now() });
    if (samples.length > 5) samples.shift();
    return true;
  }

  function end() {
    if (!tracking) return;
    tracking = false;
    if (!dragging) return;
    dragging = false;
    const a = samples[0];
    const b = samples[samples.length - 1];
    const velocity = b && a && b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0;
    settling = true;
    if (offset > CLOSE_DISTANCE || velocity > CLOSE_VELOCITY) {
      closedByDrag = true;
      offset = (sheet?.offsetHeight ?? 600) + 40;
      setTimeout(onclose, 180);
    } else {
      offset = 0;
      setTimeout(() => (settling = false), 200);
    }
  }

  function isBar(el: EventTarget | null): boolean {
    return el instanceof Element && !!el.closest("[data-sheet-bar]");
  }

  function isTextField(el: EventTarget | null): boolean {
    return el instanceof Element && !!el.closest("textarea, input[type=range]");
  }

  // Touch: listeners are added by hand so touchmove can be non-passive and stop the page
  // scrolling while the sheet is being pulled.
  function touchGesture(node: HTMLElement) {
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || isTextField(e.target)) return;
      begin(e.touches[0].clientY, isBar(e.target));
    };
    const onMove = (e: TouchEvent) => {
      if (move(e.touches[0].clientY) && e.cancelable) e.preventDefault();
    };
    node.addEventListener("touchstart", onStart, { passive: true });
    node.addEventListener("touchmove", onMove, { passive: false });
    node.addEventListener("touchend", end);
    node.addEventListener("touchcancel", end);
    return {
      destroy() {
        node.removeEventListener("touchstart", onStart);
        node.removeEventListener("touchmove", onMove);
        node.removeEventListener("touchend", end);
        node.removeEventListener("touchcancel", end);
      },
    };
  }

  // Mouse: drag by the grab bar only.
  function onBarPointerDown(e: PointerEvent) {
    if (e.pointerType !== "mouse") return;
    begin(e.clientY, true);
    const mv = (ev: PointerEvent) => move(ev.clientY);
    const up = () => {
      end();
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  }

  const backdropOpacity = $derived(Math.max(0, 1 - offset / 400));
</script>

<svelte:window {onkeydown} />

<button
  type="button"
  class="fixed inset-0 z-40 bg-black/55"
  style="opacity: {backdropOpacity}"
  aria-label="Close"
  onclick={onclose}
  transition:fade={{ duration: closedByDrag ? 0 : 150 }}
></button>

<div
  bind:this={sheet}
  use:touchGesture
  role="dialog"
  aria-modal="true"
  aria-label={label}
  class="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-lg flex-col rounded-t-2xl border-t border-border bg-card shadow-2xl {tall ? 'max-h-[92dvh]' : 'max-h-[88dvh]'}"
  style="transform: translateY({offset}px); transition: {settling ? 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none'}"
  transition:sheetUp={{ duration: closedByDrag ? 0 : 220 }}
>
  <div
    data-sheet-bar
    class="flex h-6 shrink-0 cursor-grab touch-none items-start justify-center pt-2 active:cursor-grabbing"
    aria-hidden="true"
    onpointerdown={onBarPointerDown}
  >
    <div class="h-1 w-10 rounded-full bg-muted-foreground/30"></div>
  </div>
  <div bind:this={body} class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
