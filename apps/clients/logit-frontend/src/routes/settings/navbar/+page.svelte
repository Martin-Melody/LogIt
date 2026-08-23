<script lang="ts">
  import { get } from "svelte/store";
  import { ArrowLeft, ArrowRight, ArrowLeftRight, GripVertical } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { authStore } from "$lib/api/authStore.svelte";
  import { navConfig, NAV_ITEM_DEFS, BAR_SLOTS } from "$lib/stores/navConfig.store";

  function isAvailable(def: { authRequired: boolean }): boolean {
    return !def.authRequired || authStore.isAuthenticated;
  }

  const visibleBarCount = $derived(
    $navConfig.bar.filter((id) => {
      const def = NAV_ITEM_DEFS.find((d) => d.id === id);
      return !!def && isAvailable(def);
    }).length,
  );
  const barFull = $derived(visibleBarCount >= BAR_SLOTS);

  // ── Bar drag state ────────────────────────────────────────────────────────────
  let barDragId = $state<string | null>(null);
  let barDragFromIdx = $state(-1);
  let barDragToIdx = $state(-1);
  let barDragStartY = $state(0);
  let barListEl: HTMLElement | null = null;

  // ── More drag state ───────────────────────────────────────────────────────────
  let moreDragId = $state<string | null>(null);
  let moreDragFromIdx = $state(-1);
  let moreDragToIdx = $state(-1);
  let moreDragStartY = $state(0);
  let moreListEl: HTMLElement | null = null;

  function liveOrder<T>(items: T[], dragId: string | null, from: number, to: number): T[] {
    if (!dragId || from === to || from === -1) return items;
    const result = [...items];
    const [item] = result.splice(from, 1);
    result.splice(to, 0, item!);
    return result;
  }

  const liveBar = $derived(liveOrder($navConfig.bar, barDragId, barDragFromIdx, barDragToIdx));
  const liveMore = $derived(liveOrder($navConfig.more, moreDragId, moreDragFromIdx, moreDragToIdx));

  function commitBarDrag() {
    const from = barDragFromIdx;
    const to = barDragToIdx;
    barDragId = null;
    barDragFromIdx = -1;
    barDragToIdx = -1;
    if (from !== to && from !== -1) navConfig.reorderBar(from, to);
  }

  function commitMoreDrag() {
    const from = moreDragFromIdx;
    const to = moreDragToIdx;
    moreDragId = null;
    moreDragFromIdx = -1;
    moreDragToIdx = -1;
    if (from !== to && from !== -1) navConfig.reorderMore(from, to);
  }

  function makeGripAction(section: "bar" | "more", id: string) {
    return (node: HTMLElement) => {
      const isBar = section === "bar";

      function startDrag(clientY: number) {
        const cfg = get(navConfig);
        const items = isBar ? cfg.bar : cfg.more;
        const idx = items.indexOf(id as typeof items[number]);
        if (idx === -1) return;
        if (isBar) {
          barDragId = id;
          barDragFromIdx = idx;
          barDragToIdx = idx;
          barDragStartY = clientY;
        } else {
          moreDragId = id;
          moreDragFromIdx = idx;
          moreDragToIdx = idx;
          moreDragStartY = clientY;
        }
      }

      function moveDrag(clientY: number) {
        const cfg = get(navConfig);
        if (isBar) {
          if (barDragId !== id) return;
          const total = cfg.bar.length || 1;
          const rowH = barListEl ? barListEl.getBoundingClientRect().height / total : 48;
          const newIdx = Math.max(0, Math.min(total - 1, Math.round(barDragFromIdx + (clientY - barDragStartY) / rowH)));
          if (newIdx !== barDragToIdx) barDragToIdx = newIdx;
        } else {
          if (moreDragId !== id) return;
          const total = cfg.more.length || 1;
          const rowH = moreListEl ? moreListEl.getBoundingClientRect().height / total : 48;
          const newIdx = Math.max(0, Math.min(total - 1, Math.round(moreDragFromIdx + (clientY - moreDragStartY) / rowH)));
          if (newIdx !== moreDragToIdx) moreDragToIdx = newIdx;
        }
      }

      function onTouchStart(e: TouchEvent) {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        startDrag(e.touches[0]!.clientY);
      }
      function onTouchMove(e: TouchEvent) {
        e.preventDefault();
        moveDrag(e.touches[0]!.clientY);
      }
      function onTouchEnd() {
        if (isBar) { if (barDragId === id) commitBarDrag(); }
        else { if (moreDragId === id) commitMoreDrag(); }
      }
      function onMouseDown(e: MouseEvent) {
        if (e.button !== 0) return;
        e.preventDefault();
        startDrag(e.clientY);
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
      }
      function onMouseMove(e: MouseEvent) { moveDrag(e.clientY); }
      function onMouseUp() {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        if (isBar) { if (barDragId === id) commitBarDrag(); }
        else { if (moreDragId === id) commitMoreDrag(); }
      }

      node.addEventListener("touchstart", onTouchStart, { passive: false });
      node.addEventListener("touchmove", onTouchMove, { passive: false });
      node.addEventListener("touchend", onTouchEnd, { passive: true });
      node.addEventListener("touchcancel", onTouchEnd, { passive: true });
      node.addEventListener("mousedown", onMouseDown);

      return {
        destroy() {
          node.removeEventListener("touchstart", onTouchStart);
          node.removeEventListener("touchmove", onTouchMove);
          node.removeEventListener("touchend", onTouchEnd);
          node.removeEventListener("touchcancel", onTouchEnd);
          node.removeEventListener("mousedown", onMouseDown);
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
        },
      };
    };
  }
</script>

<div class="flex flex-col gap-3 p-3 pb-24">
  <div class="flex items-center gap-2">
    <Button variant="ghost" size="icon" class="h-8 w-8" onclick={() => back("/settings")}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <h1 class="text-base font-semibold">Customise navigation</h1>
  </div>

  <!-- Bottom bar -->
  <Card.Root>
    <Card.Header class="pb-2">
      <Card.Title class="text-sm">Bottom bar</Card.Title>
      <Card.Description class="text-xs">
        Up to {BAR_SLOTS} items shown alongside the Start button.
      </Card.Description>
    </Card.Header>
    <Card.Content class="pt-0">
      <ul class="flex flex-col divide-y divide-border" bind:this={barListEl}>
        {#each liveBar as id (id)}
          {@const def = NAV_ITEM_DEFS.find((d) => d.id === id)}
          {@const gripAction = makeGripAction("bar", id)}
          {#if def && isAvailable(def)}
            <li class="py-2 flex items-center gap-2 transition-opacity {barDragId === id ? 'opacity-40' : ''}">
              <button
                type="button"
                class="touch-none cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing -ml-1 p-1"
                aria-label="Drag to reorder"
                use:gripAction
              >
                <GripVertical class="h-4 w-4" />
              </button>
              <def.icon size={16} class="shrink-0 text-muted-foreground" />
              <span class="text-sm font-medium flex-1 min-w-0">{def.label}</span>
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7 shrink-0 text-muted-foreground"
                aria-label="Move to More"
                onclick={() => navConfig.moveToMore(id)}
              >
                <ArrowRight class="h-3.5 w-3.5" />
              </Button>
            </li>
          {/if}
        {/each}
        {#if $navConfig.bar.length === 0}
          <li class="py-3 text-sm text-muted-foreground text-center">No items in bar</li>
        {/if}
      </ul>
    </Card.Content>
  </Card.Root>

  <!-- More drawer -->
  <Card.Root>
    <Card.Header class="pb-2">
      <Card.Title class="text-sm">More drawer</Card.Title>
      <Card.Description class="text-xs">
        Items accessible via the More button.
      </Card.Description>
    </Card.Header>
    <Card.Content class="pt-0">
      <ul class="flex flex-col divide-y divide-border" bind:this={moreListEl}>
        {#each liveMore as id (id)}
          {@const def = NAV_ITEM_DEFS.find((d) => d.id === id)}
          {@const gripAction = makeGripAction("more", id)}
          {#if def && isAvailable(def)}
            <li class="py-2 flex items-center gap-2 transition-opacity {moreDragId === id ? 'opacity-40' : ''}">
              <button
                type="button"
                class="touch-none cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing -ml-1 p-1"
                aria-label="Drag to reorder"
                use:gripAction
              >
                <GripVertical class="h-4 w-4" />
              </button>
              <def.icon size={16} class="shrink-0 text-muted-foreground" />
              <span class="text-sm font-medium flex-1 min-w-0">{def.label}</span>
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7 shrink-0 text-muted-foreground"
                disabled={barFull}
                aria-label="Move to bar"
                onclick={() => navConfig.moveToBar(id)}
              >
                <ArrowLeft class="h-3.5 w-3.5" />
              </Button>
            </li>
          {/if}
        {/each}
      </ul>
    </Card.Content>
  </Card.Root>

  <p class="text-xs text-muted-foreground px-1 flex items-center gap-1.5">
    <ArrowLeftRight class="h-3 w-3 shrink-0" />
    Drag to reorder within each section. Use the arrows to move items between the bar and More drawer.
  </p>
</div>
