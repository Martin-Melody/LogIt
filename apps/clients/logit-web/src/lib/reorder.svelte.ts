/**
 * Drag to reorder with a live preview: while something is held, the list is shown in the
 * order it would end up in (the held item's spot is the gap where it will land), so nothing
 * changes for real until it's let go. Esc, or letting go anywhere outside the list, puts it
 * all back.
 *
 * Use it with a keyed `{#each}` over `reorder.arrange(items, key)` and `animate:flip` so the
 * others slide. Each item: `draggable`, `ondragstart={(e) => reorder.start(keys, key, e)}`,
 * `ondragover={(e) => reorder.over(key, e)}`, `ondragend={() => reorder.end()}`. The list:
 * `ondragenter` and `ondragover={(e) => reorder.allow(e)}`, and `ondrop={(e) => { const order = reorder.drop(e); ... }}`.
 */

/** How long the others take to slide (ms). Pass it to animate:flip. */
export const SLIDE_MS = 160;

/** Only our own drags; a text box on the page won't take one as text. */
const TYPE = "application/x-logit-reorder";

/** "y" for a list, "x" for a row, "grid" for a wrapping grid. */
export type Axis = "x" | "y" | "grid";

export function createReorder<K>(axis: Axis = "y") {
  let dragging = $state<K | null>(null);
  // Shown as the gap a moment after the drag starts, so the browser's drag image is the
  // real item rather than the gap.
  let held = $state<K | null>(null);
  let order = $state<K[] | null>(null);
  let start0: K[] = [];
  let heldRect: DOMRect | null = null;
  let heldEl: HTMLElement | null = null;
  let quietUntil = 0;

  function reset() {
    dragging = null;
    held = null;
    order = null;
    heldEl = null;
    heldRect = null;
    window.removeEventListener("mousemove", stray);
  }

  // If the held element got re-rendered the browser may never send dragend; the first plain
  // mouse move after the drag (no button down) tidies up then.
  function stray(e: MouseEvent) {
    if (e.buttons === 0) reset();
  }

  return {
    get dragging() { return dragging; },
    get held() { return held; },
    get active() { return order !== null; },

    start(keys: K[], key: K, e: DragEvent, image?: HTMLElement | null) {
      dragging = key;
      start0 = [...keys];
      order = [...keys];
      heldEl = (image ?? e.currentTarget) as HTMLElement;
      heldRect = heldEl.getBoundingClientRect();
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(TYPE, String(key));
        if (image) {
          const r = image.getBoundingClientRect();
          e.dataTransfer.setDragImage(image, e.clientX - r.left, e.clientY - r.top);
        }
      }
      setTimeout(() => {
        if (dragging === key) {
          held = key;
          window.addEventListener("mousemove", stray);
        }
      }, 0);
    },

    /** The pointer is over item `target`: move the held one there once it's past halfway. */
    over(target: K, e: DragEvent) {
      if (dragging === null || order === null) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      if (target === dragging || performance.now() < quietUntil) return;
      const from = order.indexOf(dragging);
      const to = order.indexOf(target);
      if (from < 0 || to < 0) return;
      // Past the middle of the target, on the far side from the gap, so it can't flick back
      // and forth when the two are different sizes.
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const gap = heldEl?.isConnected ? heldEl.getBoundingClientRect() : heldRect;
      const sameRow = gap ? r.top < gap.bottom - 4 && gap.top < r.bottom - 4 : false;
      const useX = axis === "x" || (axis === "grid" && sameRow);
      const mid = useX ? r.left + r.width / 2 : r.top + r.height / 2;
      const p = useX ? e.clientX : e.clientY;
      if (to > from ? p < mid : p > mid) return;
      const next = [...order];
      next.splice(from, 1);
      next.splice(to, 0, dragging);
      order = next;
      quietUntil = performance.now() + SLIDE_MS + 20;
    },

    /**
     * On the list, for dragenter and dragover, so letting go in a gap between items still
     * counts, and so does letting go right after the items slid (a new element is under the
     * pointer and the browser hasn't sent it a dragover yet).
     */
    allow(e: DragEvent) {
      if (order === null) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    },

    /** Let go over the list: the new order, or null if nothing moved. */
    drop(e: DragEvent): K[] | null {
      if (order === null) return null;
      e.preventDefault();
      const result = order;
      const moved = result.some((k, i) => k !== start0[i]);
      reset();
      return moved ? result : null;
    },

    /** The drag ended without a drop (Esc, or let go elsewhere): nothing changes. */
    end() {
      reset();
    },

    /** `items` in the previewed order (as they are when nothing is held). */
    arrange<T>(items: T[], keyOf: (item: T) => K): T[] {
      if (order === null) return items;
      const byKey = new Map(items.map((it) => [keyOf(it), it]));
      const out = order.map((k) => byKey.get(k)).filter((it): it is T => it !== undefined);
      // Anything added while dragging goes at the end.
      for (const it of items) if (!order.includes(keyOf(it))) out.push(it);
      return out;
    },
  };
}

export type Reorder<K> = ReturnType<typeof createReorder<K>>;
