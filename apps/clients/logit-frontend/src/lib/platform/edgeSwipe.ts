// Android's back gesture starts at the screen edge. A sideways swipe on a set row that begins
// right at the edge is taken by Android as "back" before the app can use it: the app only sees
// the touch start, a cancel, then the back (Martin, 2026-11-18: it left the workout). A back
// that arrives just after a touch started at the edge of such a row was meant as the swipe,
// so the row gets it ("edgeswipe" event) and the app stays where it is.
//
// Rows opt in with `data-edge-swipe` and listen for "edgeswipe" (detail.fromRight: true when
// the finger started at the right edge, i.e. a swipe to the left).

const EDGE_PX = 40;
const WINDOW_MS = 700;

let pending: { at: number; el: Element; fromRight: boolean } | null = null;
let watching = false;

function onTouchStart(e: TouchEvent) {
  const t = e.touches[0];
  if (!t || e.touches.length !== 1) {
    pending = null;
    return;
  }
  const fromRight = t.clientX >= window.innerWidth - EDGE_PX;
  const fromLeft = t.clientX <= EDGE_PX;
  if (!fromRight && !fromLeft) {
    pending = null;
    return;
  }
  // Right at the edge the finger can land on the page around the rows, so also look for the
  // row at that height across the middle of the screen.
  const target = e.target as Element | null;
  const row =
    target?.closest?.("[data-edge-swipe]") ??
    document.elementFromPoint?.(window.innerWidth / 2, t.clientY)?.closest?.("[data-edge-swipe]") ??
    null;
  pending = row ? { at: performance.now(), el: row, fromRight } : null;
}

/** Start noticing touches that begin at a screen edge (once, on the phone). */
export function watchEdgeSwipes(): void {
  if (watching || typeof document === "undefined") return;
  watching = true;
  document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
}

/**
 * Called first by Android's back: true when the back was really a swipe on a row that started
 * at the edge; the row has been told, and the back should do nothing else.
 */
export function takeEdgeSwipe(now = performance.now()): boolean {
  const p = pending;
  pending = null;
  if (!p || now - p.at > WINDOW_MS || !p.el.isConnected) return false;
  p.el.dispatchEvent(new CustomEvent("edgeswipe", { detail: { fromRight: p.fromRight } }));
  return true;
}
