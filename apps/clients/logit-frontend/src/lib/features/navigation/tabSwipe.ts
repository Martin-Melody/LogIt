import type { NavConfig, NavItemDef } from "$lib/stores/navConfig.store";

/**
 * Swiping between the bottom-nav pages, in bar order with Start in the middle:
 * bar[0] ↔ bar[1] ↔ Start ↔ bar[2]. Only on the tab pages themselves (exact paths), so
 * detail pages keep their own gestures. Swipe left = the page to the right in the bar.
 */

export const START_HREF = "/session/current";

/** Tab page paths in bar order. Items needing an account are skipped while signed out. */
export function tabHrefs(config: Pick<NavConfig, "bar">, defs: NavItemDef[], signedIn: boolean): string[] {
  const href = (i: number) => {
    const d = defs.find((def) => def.id === config.bar[i]);
    return d && (!d.authRequired || signedIn) ? d.href : null;
  };
  return [href(0), href(1), START_HREF, href(2)].filter((h): h is string => h !== null);
}

/** The tab next to `pathname` in direction `step` (+1 right, -1 left), or null at an end or off the tabs. */
export function neighbourTab(hrefs: string[], pathname: string, step: 1 | -1): string | null {
  const i = hrefs.indexOf(pathname);
  if (i < 0) return null;
  return hrefs[i + step] ?? null;
}

/** "forward" when moving right along the bar, "back" when left, null unless both are tab pages. */
export function tabDirection(hrefs: string[], from: string, to: string): "forward" | "back" | null {
  const a = hrefs.indexOf(from);
  const b = hrefs.indexOf(to);
  if (a < 0 || b < 0 || a === b) return null;
  return b > a ? "forward" : "back";
}

/** Horizontal distance (px) a swipe needs, and how much more horizontal than vertical it must be. */
export const SWIPE_MIN_PX = 70;
export const SWIPE_RATIO = 2;
/** Touches starting this close to a screen edge belong to the system back gesture. */
export const EDGE_PX = 20;

/** Decide a finished gesture: -1 = swiped left (go right), 1 = swiped right (go left), 0 = not a swipe. */
export function swipeOutcome(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return 0;
  return dx < 0 ? -1 : 1;
}

const CLAIMING_SELECTOR =
  "[data-no-tab-swipe], input, textarea, select, [contenteditable], [role=slider], [data-slot=chart]";

/**
 * True when something between the touched element and `root` handles sideways touches
 * itself: opted-out elements, form fields, charts, horizontal scrollers, elements with a
 * restricted `touch-action` (drag grips, swipe cards), and fixed overlays inside the page
 * (finish bar, recap screen, circuit overlay).
 */
export function gestureClaimed(target: EventTarget | null, root: HTMLElement): boolean {
  let el = target instanceof Element ? target : null;
  if (!el) return true;
  if (el.closest(CLAIMING_SELECTOR)) return true;
  while (el && el !== root) {
    const style = getComputedStyle(el);
    if (style.position === "fixed") return true;
    if (style.touchAction && style.touchAction !== "auto" && style.touchAction !== "manipulation") return true;
    const ox = style.overflowX;
    if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1) return true;
    el = el.parentElement;
  }
  return false;
}

export type TabSwipeParams = {
  /** Called on each touch start: where a swipe would go, or null to ignore this touch. */
  target: (step: 1 | -1) => string | null;
  onSwipe: (href: string) => void;
};

/**
 * Svelte action for the layout's <main>. Passive touch listeners only: the page keeps
 * scrolling normally, and the swipe is decided when the finger lifts. Anything inside
 * that takes the gesture (preventDefault on touchmove, as the set rows and drag grips
 * do) cancels it.
 */
export function tabSwipe(node: HTMLElement, params: TabSwipeParams) {
  let p = params;
  let tracking = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;

  function onStart(e: TouchEvent) {
    tracking = false;
    if (e.touches.length !== 1) return;
    const t = e.touches[0]!;
    if (t.clientX < EDGE_PX || t.clientX > window.innerWidth - EDGE_PX) return;
    if (!p.target(1) && !p.target(-1)) return;
    if (gestureClaimed(e.target, node)) return;
    tracking = true;
    startX = lastX = t.clientX;
    startY = lastY = t.clientY;
  }

  function onMove(e: TouchEvent) {
    if (!tracking) return;
    if (e.defaultPrevented || e.touches.length !== 1) {
      tracking = false;
      return;
    }
    lastX = e.touches[0]!.clientX;
    lastY = e.touches[0]!.clientY;
  }

  function onEnd() {
    if (!tracking) return;
    tracking = false;
    const outcome = swipeOutcome(lastX - startX, lastY - startY);
    if (outcome === 0) return;
    const href = p.target(outcome === -1 ? 1 : -1);
    if (href) p.onSwipe(href);
  }

  function onCancel() {
    tracking = false;
  }

  node.addEventListener("touchstart", onStart, { passive: true });
  node.addEventListener("touchmove", onMove, { passive: true });
  node.addEventListener("touchend", onEnd, { passive: true });
  node.addEventListener("touchcancel", onCancel, { passive: true });

  return {
    update(next: TabSwipeParams) {
      p = next;
    },
    destroy() {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onCancel);
    },
  };
}
