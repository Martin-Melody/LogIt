/**
 * Svelte action — smoothly animates height changes on an element.
 * Attach with `use:animateHeight` on any container whose content height may
 * change. Uses ResizeObserver + Web Animations API; no CSS required.
 *
 * Usage:
 *   <div use:animateHeight>...</div>
 */
export function animateHeight(node: HTMLElement, duration = 200) {
  let prev = node.offsetHeight;
  let animating = false;

  const ro = new ResizeObserver(() => {
    if (animating) return;
    const next = node.offsetHeight;
    if (next === prev) return;
    animating = true;
    const anim = node.animate(
      [{ height: `${prev}px` }, { height: `${next}px` }],
      { duration, easing: "ease", fill: "none" },
    );
    prev = next;
    anim.onfinish = () => { animating = false; };
  });

  ro.observe(node);
  return { destroy: () => ro.disconnect() };
}

/**
 * Svelte action — fires `handler` when the pointer is held still on `node` for
 * `delay` ms. Cancels on move beyond a small threshold, or on pointer up/leave.
 *
 * Usage:
 *   <li use:longpress={() => select(id)}>…</li>
 */
export function longpress(node: HTMLElement, handler: () => void, delay = 450) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;
  const MOVE_CANCEL = 10;

  function clear() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function down(e: PointerEvent) {
    startX = e.clientX;
    startY = e.clientY;
    clear();
    timer = setTimeout(() => {
      timer = null;
      handler();
    }, delay);
  }

  function move(e: PointerEvent) {
    if (
      timer &&
      (Math.abs(e.clientX - startX) > MOVE_CANCEL ||
        Math.abs(e.clientY - startY) > MOVE_CANCEL)
    ) {
      clear();
    }
  }

  node.addEventListener("pointerdown", down);
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerup", clear);
  node.addEventListener("pointercancel", clear);
  node.addEventListener("pointerleave", clear);

  return {
    update(next: () => void) {
      handler = next;
    },
    destroy() {
      clear();
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", clear);
      node.removeEventListener("pointercancel", clear);
      node.removeEventListener("pointerleave", clear);
    },
  };
}

export interface SwipeHandlers {
  onpointerdown: (e: PointerEvent) => void;
  onpointerup: (e: PointerEvent) => void;
  style: string;
}

/**
 * Returns pointer event handlers and a required `style` string to spread onto
 * the target element. Horizontal swipes beyond `threshold` px trigger the
 * callbacks; a 2:1 dx/dy ratio guard prevents accidental triggers during
 * vertical scrolls.
 *
 * Usage:
 *   const swipe = createSwipeHandlers(() => prev(), () => next());
 *   <div {...swipe}>...</div>
 */
export function createSwipeHandlers(
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  threshold = 40,
): SwipeHandlers {
  let startX = 0;
  let startY = 0;

  return {
    style: "touch-action: pan-y;",
    onpointerdown(e: PointerEvent) {
      startX = e.clientX;
      startY = e.clientY;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onpointerup(e: PointerEvent) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 2) return;
      if (dx < 0) onSwipeLeft();
      else onSwipeRight();
    },
  };
}
