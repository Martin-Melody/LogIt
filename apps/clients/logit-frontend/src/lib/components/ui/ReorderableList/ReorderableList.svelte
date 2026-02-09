<script lang="ts">
  const {
    ids,
    disabled = false,
    onReorder = async (_from: number, _to: number) => {},
    children,
  } = $props<{
    ids: string[];
    disabled?: boolean;
    onReorder?: (fromIndex: number, toIndex: number) => void | Promise<void>;
    children: (args: {
      id: string;
      index: number;
      bindHandle: (el: HTMLElement | null) => void;
      draggingId: string | null;
    }) => unknown;
  }>();

  let draggingId = $state<string | null>(null);
  let fromIndex = $state<number | null>(null);

  const itemEls = new Map<string, HTMLElement>();
  const handleEls = new Map<string, HTMLElement>();

  // Svelte action to register item elements
  function itemRef(node: HTMLElement, id: string) {
    itemEls.set(id, node);
    return {
      destroy() {
        itemEls.delete(id);
      },
    };
  }

  // callback for children to register their handle element
  function bindHandle(id: string) {
    return (el: HTMLElement | null) => {
      if (!el) handleEls.delete(id);
      else handleEls.set(id, el);
    };
  }

  function indexFromY(clientY: number) {
    let bestId: string | null = null;
    let bestDist = Infinity;

    for (const id of ids) {
      const el = itemEls.get(id);
      if (!el) continue;

      const r = el.getBoundingClientRect();
      const centerY = r.top + r.height / 2;
      const dist = Math.abs(centerY - clientY);

      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }

    return bestId ? ids.indexOf(bestId) : -1;
  }

  function onPointerDown(e: PointerEvent, id: string) {
    if (disabled) return;
    if (e.button !== 0) return;

    const handle = handleEls.get(id);
    if (!handle) return;

    if (!(e.target instanceof Node) || !handle.contains(e.target)) return;

    draggingId = id;
    fromIndex = ids.indexOf(id);

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  async function onPointerMove(e: PointerEvent) {
    if (!draggingId || fromIndex === null) return;

    const over = indexFromY(e.clientY);
    if (over < 0 || over === fromIndex) return;

    await onReorder(fromIndex, over);
    fromIndex = over;
  }

  function onPointerUp(e: PointerEvent) {
    if (!draggingId) return;

    draggingId = null;
    fromIndex = null;

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  }
</script>

<div
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
>
  {#each ids as id, i (id)}
    <div
      use:itemRef={id}
      onpointerdown={(e) => onPointerDown(e, id)}
      class={draggingId === id ? "opacity-70" : ""}
    >
      {@render children({
        id,
        index: i,
        bindHandle: bindHandle(id),
        draggingId,
      })}
    </div>
  {/each}
</div>
