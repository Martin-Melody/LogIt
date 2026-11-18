// How every sheet in the app behaves (Martin, 2026-11-18): anything that looks like a sheet
// closes by dragging it down, not only by tapping outside, and Android's back closes the top
// sheet or dialog before it leaves the page, one step at a time.
//
// sheetDrag: the sheet follows a finger down from its grab bar, or from anywhere once whatever
// is scrolling under the finger is at its top; past 120 px or a flick it slides away and
// onDismiss runs. A mouse drags it by the grab bar. A sheet without a grab bar gets one.
//
// backDismiss / handleBack: open sheets and dialogs stack up; back closes the newest.

import { motionOK } from "$lib/transitions";

const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 0.6; // px per ms, downwards

type DragOptions = { onDismiss: () => void; disabled?: boolean };

function scrollerAt(target: EventTarget | null, root: HTMLElement): HTMLElement | null {
  let el = target instanceof Element ? (target as HTMLElement) : null;
  while (el && el !== root.parentElement) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) return el;
    if (el === root) break;
    el = el.parentElement;
  }
  return null;
}

function skip(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest("textarea, input[type=range], [data-no-sheet-drag]");
}

export function sheetDrag(node: HTMLElement, options: DragOptions) {
  let opts = options;
  let startY = 0;
  let startX = 0;
  let onBar = false;
  let scroller: HTMLElement | null = null;
  let tracking = false;
  let dragging = false;
  let offset = 0;
  let samples: { y: number; t: number }[] = [];

  if (!node.querySelector("[data-sheet-bar]")) {
    const bar = document.createElement("div");
    bar.setAttribute("data-sheet-bar", "");
    bar.setAttribute("aria-hidden", "true");
    bar.className = "flex h-5 w-full shrink-0 cursor-grab touch-none items-start justify-center pt-2 col-span-full";
    bar.innerHTML = '<div class="h-1 w-10 rounded-full bg-muted-foreground/30"></div>';
    node.prepend(bar);
  }

  const set = (px: number, animate: boolean) => {
    offset = px;
    node.style.transition = animate ? "transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)" : "none";
    node.style.transform = px ? `translateY(${px}px)` : "";
  };

  function begin(x: number, y: number, target: EventTarget | null) {
    if (opts.disabled) return;
    startX = x;
    startY = y;
    onBar = target instanceof Element && !!target.closest("[data-sheet-bar]");
    scroller = scrollerAt(target, node);
    tracking = true;
    dragging = false;
    samples = [{ y, t: performance.now() }];
  }

  function move(x: number, y: number): boolean {
    if (!tracking) return false;
    const dy = y - startY;
    if (!dragging) {
      const atTop = !scroller || scroller.scrollTop <= 0;
      if (dy > 6 && Math.abs(dy) > Math.abs(x - startX) && (onBar || atTop)) {
        dragging = true;
        startY = y;
      } else if (Math.abs(dy) > 6 || Math.abs(x - startX) > 6) {
        tracking = false;
        return false;
      } else return false;
    }
    set(Math.max(0, y - startY), false);
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
    const velocity = a && b && b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0;
    if (offset > CLOSE_DISTANCE || velocity > CLOSE_VELOCITY) {
      set(node.offsetHeight + 40, motionOK());
      // Already off screen: hide it so its own closing animation doesn't play over again.
      setTimeout(() => {
        node.style.visibility = "hidden";
        opts.onDismiss();
      }, motionOK() ? 180 : 0);
    } else {
      set(0, true);
    }
  }

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1 || skip(e.target)) return;
    begin(e.touches[0]!.clientX, e.touches[0]!.clientY, e.target);
  };
  const onTouchMove = (e: TouchEvent) => {
    const t = e.touches[0];
    if (t && move(t.clientX, t.clientY) && e.cancelable) e.preventDefault();
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || !(e.target instanceof Element) || !e.target.closest("[data-sheet-bar]")) return;
    begin(e.clientX, e.clientY, e.target);
    const mv = (ev: PointerEvent) => move(ev.clientX, ev.clientY);
    const up = () => {
      end();
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  node.addEventListener("touchstart", onTouchStart, { passive: true });
  node.addEventListener("touchmove", onTouchMove, { passive: false });
  node.addEventListener("touchend", end);
  node.addEventListener("touchcancel", end);
  node.addEventListener("pointerdown", onPointerDown);

  return {
    update(next: DragOptions) {
      opts = next;
    },
    destroy() {
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchmove", onTouchMove);
      node.removeEventListener("touchend", end);
      node.removeEventListener("touchcancel", end);
      node.removeEventListener("pointerdown", onPointerDown);
    },
  };
}

// ── Back closes the newest sheet first ──────────────────────────────────────────

const stack: { close: () => void }[] = [];

/** Register something back should close while it's open; returns the unregister. */
export function onBack(close: () => void): () => void {
  const entry = { close };
  stack.push(entry);
  return () => {
    const i = stack.lastIndexOf(entry);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Android back: closes the newest open sheet or dialog. False when none is open. */
export function handleBack(): boolean {
  const top = stack.at(-1);
  if (!top) return false;
  top.close();
  return true;
}

/** Svelte action: while mounted, back closes this. */
export function backDismiss(_node: HTMLElement, close: () => void) {
  let current = close;
  const off = onBack(() => current());
  return {
    update(next: () => void) {
      current = next;
    },
    destroy: off,
  };
}
