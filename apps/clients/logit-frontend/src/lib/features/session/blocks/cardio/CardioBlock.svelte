<script lang="ts">
  import { Plus, Trash2, Timer, Ruler, GripVertical, ChevronDown, ChevronRight } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import { createId } from "$lib/domain/ids";
  import { get } from "svelte/store";
  import { profile } from "$lib/stores/profile.store";
  import type { CardioBlockData, CardioInterval, WorkoutSession } from "$lib/domain/workout";
  import type { BlockBaseProps } from "$lib/features/session/blocks/types";

  const {
    blockId,
    data,
    saving,
    gripAction,
    onDelete,
    onMutate,
  } = $props<BlockBaseProps<CardioBlockData>>();

  let collapsed = $state(get(profile).blocksCollapsedByDefault);

  function sortByOrder(a: { orderIndex: number }, b: { orderIndex: number }) {
    return a.orderIndex - b.orderIndex;
  }

  function formatDuration(ms: number | null): string {
    if (!ms) return "—";
    const totalSecs = Math.round(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function formatDistance(m: number | null): string {
    if (!m) return "—";
    return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m} m`;
  }

  function parseDuration(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Accept mm:ss or hh:mm:ss or plain seconds
    const parts = trimmed.split(":").map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 1) return parts[0] * 1000;
    if (parts.length === 2) return ((parts[0] ?? 0) * 60 + (parts[1] ?? 0)) * 1000;
    return ((parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)) * 1000;
  }

  function parseDistance(value: string): number | null {
    const n = parseFloat(value);
    if (!isFinite(n) || n <= 0) return null;
    // If user types a decimal number > 100 assume metres, otherwise km
    return value.includes(".") && n < 100 ? Math.round(n * 1000) : Math.round(n);
  }

  function durationInputValue(ms: number | null): string {
    if (!ms) return "";
    const totalSecs = Math.round(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function distanceInputValue(m: number | null): string {
    if (!m) return "";
    return m >= 1000 ? String((m / 1000).toFixed(2)) : String(m);
  }

  function updateCardioBlock(
    s: WorkoutSession,
    updater: (current: CardioBlockData) => CardioBlockData,
  ) {
    const idx = s.blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return s;
    const current = s.blocks[idx].data as CardioBlockData;
    return { ...s, blocks: s.blocks.map((b, i) => i === idx ? { ...b, data: updater(current) } : b) };
  }

  async function addInterval() {
    await onMutate((s) =>
      updateCardioBlock(s, (current) => {
        const newInterval: CardioInterval = {
          id: createId("ci"),
          orderIndex: current.intervals.length,
          durationMs: null,
          distanceM: null,
          note: null,
        };
        return { ...current, intervals: [...current.intervals, newInterval] };
      }),
    );
    if (collapsed) collapsed = false;
  }

  async function updateInterval(intervalId: string, patch: Partial<CardioInterval>) {
    await onMutate((s) =>
      updateCardioBlock(s, (current) => ({
        ...current,
        intervals: current.intervals.map((iv) => iv.id === intervalId ? { ...iv, ...patch } : iv),
      })),
    );
  }

  async function removeInterval(intervalId: string) {
    await onMutate((s) =>
      updateCardioBlock(s, (current) => {
        const filtered = current.intervals.filter((iv) => iv.id !== intervalId);
        return { ...current, intervals: filtered.map((iv, i) => ({ ...iv, orderIndex: i })) };
      }),
    );
  }

  async function renameActivity(name: string) {
    await onMutate((s) =>
      updateCardioBlock(s, (current) => ({ ...current, activityName: name.trim() })),
    );
  }

  const ui = $state({ editing: false, draft: "" });
  let nameInput = $state<HTMLInputElement | null>(null);
  $effect(() => { if (ui.editing) nameInput?.focus(); });

  function startEdit() { ui.draft = data.activityName; ui.editing = true; }
  async function commitEdit() {
    const next = ui.draft.trim();
    ui.editing = false;
    if (next && next !== data.activityName) await renameActivity(next);
  }

  // ── Interval drag-to-reorder ──────────────────────────────────────────────

  let ivDragId = $state<string | null>(null);
  let ivDragFromIdx = $state(-1);
  let ivDragToIdx = $state(-1);
  let ivDragStartY = $state(0);
  let ivListEl = $state<HTMLElement | null>(null);

  function liveIvOrder(sorted: CardioInterval[]): CardioInterval[] {
    if (!ivDragId || ivDragFromIdx === ivDragToIdx) return sorted;
    const result = [...sorted];
    const [item] = result.splice(ivDragFromIdx, 1);
    result.splice(ivDragToIdx, 0, item!);
    return result;
  }

  async function commitIvDrag() {
    const from = ivDragFromIdx;
    const to = ivDragToIdx;
    ivDragId = null;
    ivDragFromIdx = -1;
    ivDragToIdx = -1;
    if (from === to || from === -1) return;

    await onMutate((s) =>
      updateCardioBlock(s, (current) => {
        const sorted = [...current.intervals].sort(sortByOrder);
        const reordered = [...sorted];
        const [item] = reordered.splice(from, 1);
        reordered.splice(to, 0, item!);
        return {
          ...current,
          intervals: current.intervals.map((iv) => {
            const newIdx = reordered.findIndex((r) => r.id === iv.id);
            return newIdx !== -1 ? { ...iv, orderIndex: newIdx } : iv;
          }),
        };
      }),
    );
  }

  function ivGripAction(node: HTMLElement, ivId: string) {
    let currentId = ivId;

    function startDrag(clientY: number) {
      const sorted = [...data.intervals].sort(sortByOrder);
      const idx = sorted.findIndex((iv) => iv.id === currentId);
      if (idx === -1) return false;
      ivDragId = currentId;
      ivDragFromIdx = idx;
      ivDragToIdx = idx;
      ivDragStartY = clientY;
      return true;
    }

    function moveDrag(clientY: number) {
      if (ivDragId !== currentId) return;
      const total = data.intervals.length || 1;
      const rowH = ivListEl ? ivListEl.getBoundingClientRect().height / total : 44;
      const newIdx = Math.max(0, Math.min(total - 1, Math.round(ivDragFromIdx + (clientY - ivDragStartY) / rowH)));
      if (newIdx !== ivDragToIdx) ivDragToIdx = newIdx;
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      startDrag(e.touches[0]!.clientY);
    }
    function onTouchMove(e: TouchEvent) {
      if (ivDragId !== currentId) return;
      e.preventDefault();
      moveDrag(e.touches[0]!.clientY);
    }
    function onTouchEnd() {
      if (ivDragId !== currentId) return;
      void commitIvDrag();
    }
    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      e.preventDefault();
      if (!startDrag(e.clientY)) return;
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }
    function onMouseMove(e: MouseEvent) { moveDrag(e.clientY); }
    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (ivDragId !== currentId) return;
      void commitIvDrag();
    }

    node.addEventListener("touchstart", onTouchStart, { passive: false });
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    node.addEventListener("touchend", onTouchEnd, { passive: true });
    node.addEventListener("touchcancel", onTouchEnd, { passive: true });
    node.addEventListener("mousedown", onMouseDown);

    return {
      update(newId: string) { currentId = newId; },
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
  }

  const sortedIntervals = $derived([...data.intervals].sort(sortByOrder));

  const totalDistance = $derived(
    sortedIntervals.reduce((sum, iv) => sum + (iv.distanceM ?? 0), 0)
  );
  const totalDuration = $derived(
    sortedIntervals.reduce((sum, iv) => sum + (iv.durationMs ?? 0), 0)
  );
</script>

<!-- Block header -->
<div class="border-t border-border bg-muted/20">
  <div class="flex items-center gap-2 px-3 py-2">
    <!-- Grip handle -->
    <button
      type="button"
      class="shrink-0 h-7 w-7 flex items-center justify-center rounded text-muted-foreground cursor-grab active:cursor-grabbing"
      style="touch-action: none"
      use:gripAction
      aria-label="Drag to reorder"
      tabindex="-1"
      disabled={saving}
    >
      <GripVertical class="h-3.5 w-3.5" />
    </button>

    <!-- Collapse toggle -->
    <button
      type="button"
      class="shrink-0 h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
      onclick={() => (collapsed = !collapsed)}
      disabled={saving}
      aria-label={collapsed ? "Expand" : "Collapse"}
    >
      {#if collapsed}
        <ChevronRight class="h-3.5 w-3.5" />
      {:else}
        <ChevronDown class="h-3.5 w-3.5" />
      {/if}
    </button>

    {#if ui.editing}
      <input
        bind:this={nameInput}
        class="flex-1 min-w-0 bg-transparent text-sm font-semibold focus:outline-none border-b border-primary"
        bind:value={ui.draft}
        disabled={saving}
        onkeydown={(e) => { if (e.key === "Enter") void commitEdit(); if (e.key === "Escape") ui.editing = false; }}
        onblur={() => void commitEdit()}
      />
    {:else}
      <button type="button" class="flex-1 min-w-0 text-left" onclick={startEdit} disabled={saving}>
        <span class="text-sm font-semibold truncate block">{data.activityName}</span>
      </button>
    {/if}

    {#if !collapsed}
      <Button size="icon" class="h-7 w-7 shrink-0" onclick={addInterval} disabled={saving} aria-label="Add interval">
        <Plus class="h-3.5 w-3.5" />
      </Button>
    {/if}

    <ConfirmDialog
      title="Remove activity?"
      description="Removes this activity and all its intervals."
      confirmLabel="Remove"
      {saving}
      onConfirm={onDelete}
    >
      {#snippet child({ props })}
        <Button {...props} size="icon" variant="ghost" class="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" disabled={saving} aria-label="Delete">
          <Trash2 class="h-3.5 w-3.5" />
        </Button>
      {/snippet}
    </ConfirmDialog>
  </div>

  <!-- Totals summary line -->
  {#if !collapsed && (totalDistance > 0 || totalDuration > 0)}
    <p class="px-3 pb-1.5 text-xs text-muted-foreground -mt-1">
      {#if totalDistance > 0}<span class="inline-flex items-center gap-1"><Ruler class="h-3 w-3" />{formatDistance(totalDistance)}</span>{/if}
      {#if totalDistance > 0 && totalDuration > 0}<span class="mx-1">·</span>{/if}
      {#if totalDuration > 0}<span class="inline-flex items-center gap-1"><Timer class="h-3 w-3" />{formatDuration(totalDuration)}</span>{/if}
    </p>
  {/if}
</div>

<!-- Intervals -->
{#if !collapsed}
  {#if sortedIntervals.length > 0}
    <!-- Column headers -->
    <div class="grid grid-cols-[1.5rem_2rem_1fr_1fr_2rem] gap-2 px-3 py-1 text-xs text-muted-foreground border-b border-border">
      <span></span>
      <span>#</span>
      <span>Duration</span>
      <span>Distance</span>
      <span></span>
    </div>

    {@const liveIntervals = liveIvOrder(sortedIntervals)}
    <div bind:this={ivListEl}>
      {#each liveIntervals as iv, i (iv.id)}
        <div class="grid grid-cols-[1.5rem_2rem_1fr_1fr_2rem] gap-2 items-center px-3 py-1.5 {ivDragId === iv.id ? 'opacity-50' : ''}">

          <button
            type="button"
            class="h-6 w-6 flex items-center justify-center text-muted-foreground cursor-grab active:cursor-grabbing"
            style="touch-action: none"
            use:ivGripAction={iv.id}
            aria-label="Drag to reorder"
            tabindex="-1"
            disabled={saving}
          >
            <GripVertical class="h-3.5 w-3.5" />
          </button>

          <span class="text-xs text-muted-foreground">{i + 1}</span>

          <!-- Duration input: mm:ss -->
          <input
            class="w-full rounded border bg-background px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
            type="text"
            inputmode="numeric"
            placeholder="0:00"
            value={durationInputValue(iv.durationMs)}
            disabled={saving}
            onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
            onchange={(e) => {
              const ms = parseDuration((e.currentTarget as HTMLInputElement).value);
              void updateInterval(iv.id, { durationMs: ms });
            }}
          />

          <!-- Distance input: km or m -->
          <input
            class="w-full rounded border bg-background px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
            type="text"
            inputmode="decimal"
            placeholder="km / m"
            value={distanceInputValue(iv.distanceM)}
            disabled={saving}
            onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
            onchange={(e) => {
              const m = parseDistance((e.currentTarget as HTMLInputElement).value);
              void updateInterval(iv.id, { distanceM: m });
            }}
          />

          <button
            type="button"
            class="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive disabled:opacity-30 justify-self-center"
            disabled={saving}
            onclick={() => removeInterval(iv.id)}
            aria-label="Remove interval"
          >
            <Trash2 class="h-3 w-3" />
          </button>
        </div>
      {/each}
    </div>
  {:else}
    <button
      type="button"
      class="w-full px-3 py-3 text-sm text-muted-foreground text-left hover:bg-muted/30"
      disabled={saving}
      onclick={addInterval}
    >
      + Add first interval
    </button>
  {/if}
{/if}
