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
