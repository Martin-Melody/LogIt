<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Trash } from "@lucide/svelte";
  import { Pencil } from "lucide-svelte";

  const {
    actionsWidth = 128,
    disabled = false,
    onDelete,
    onEdit,
    children,
  } = $props<{
    actionsWidth?: number;
    disabled?: boolean;
    onDelete?: (() => void) | undefined;
    onEdit?: (() => void) | undefined;
    children?: import("svelte").Snippet;
  }>();

  let dx = $state(0);
  let open = $state(false);
  let dragging = $state(false);

  const LOCK_PX = 12;

  function close() {
    open = false;
    dx = 0;
  }

  function toggleOpen() {
    open = !open;
    dx = open ? -actionsWidth : 0;
  }

  function swipeAction(node: HTMLElement) {
    let startX = 0;
    let startY = 0;
    let dir: "h" | "v" | null = null;

    function onTouchStart(e: TouchEvent) {
      if (disabled || e.touches.length !== 1) return;
      const t = e.touches[0]!;
      startX = t.clientX;
      startY = t.clientY;
      dir = null;
      dragging = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (disabled) return;
      const t = e.touches[0];
      if (!t) return;

      const dX = t.clientX - startX;
      const dY = t.clientY - startY;

      if (!dir) {
        if (Math.abs(dX) + Math.abs(dY) < LOCK_PX) return;
        dir = Math.abs(dX) >= Math.abs(dY) ? "h" : "v";
      }

      if (dir === "v") return;

      e.preventDefault();
      dragging = true;
      const raw = open ? -actionsWidth + dX : dX;
      dx = Math.max(-actionsWidth, Math.min(0, raw));
    }

    function onTouchEnd() {
      if (dir === "h") {
        open = dx < -(actionsWidth * 0.35);
        dx = open ? -actionsWidth : 0;
      }
      dragging = false;
      dir = null;
    }

    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    node.addEventListener("touchend", onTouchEnd, { passive: true });
    node.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return {
      destroy() {
        node.removeEventListener("touchstart", onTouchStart);
        node.removeEventListener("touchmove", onTouchMove);
        node.removeEventListener("touchend", onTouchEnd);
        node.removeEventListener("touchcancel", onTouchEnd);
      },
    };
  }
</script>

<div class="relative overflow-hidden">
  <div class="absolute inset-0 flex justify-end items-stretch">
    <div class="flex h-full">
      {#if onEdit}
        <Button
          variant="ghost"
          size="icon-sm"
          {disabled}
          onclick={() => { onEdit?.(); close(); }}
        >
          <Pencil color="blue" />
        </Button>
      {/if}
      {#if onDelete}
        <Button
          variant="ghost"
          size="icon-sm"
          {disabled}
          onclick={() => { onDelete?.(); close(); }}
        >
          <Trash color="red" />
        </Button>
      {/if}
    </div>
  </div>

  <div
    use:swipeAction
    role="row"
    class="relative bg-background"
    style="transform: translate3d({dx}px, 0, 0); transition: {dragging ? 'none' : 'transform 140ms ease'};"
    onclick={() => { if (open) close(); }}
  >
    {@render children?.()}
  </div>

  {#if !disabled}
    <button
      type="button"
      class="absolute left-2 top-1/2 -translate-y-1/2 text-xs opacity-40"
      onclick={(e) => { e.stopPropagation(); toggleOpen(); }}
      aria-label="Toggle row actions"
    >
      ⋮
    </button>
  {/if}
</div>
