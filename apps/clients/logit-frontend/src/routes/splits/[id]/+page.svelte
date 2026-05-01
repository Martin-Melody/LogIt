<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { back } from "$lib/navigation";

  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";

  import type { WorkoutSplit, SplitDay } from "$lib/domain/WorkoutSplit";
  import { touchSplit } from "$lib/domain/WorkoutSplit";

  import { splits } from "$lib/stores/splits.store";
  import { activeSplit } from "$lib/stores/activeSplit.store";

  import { getSplit } from "$lib/usecases/Splits/getSplit";
  import { saveSplit } from "$lib/usecases/Splits/saveSplit";
  import { deleteSplit } from "$lib/usecases/Splits/deleteSplit";
  import { createId } from "$lib/domain/ids";

  import { ArrowLeft, Trash, Check, X, Plus, GripVertical } from "lucide-svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";

  const props = $props<{ params: { id: string } }>();
  const splitId = $derived(props.params.id);

  const ui = $state({
    loading: true,
    saving: false,
    error: null as string | null,
    renaming: false,
    nameDraft: "",
  });

  let split = $state<WorkoutSplit | null>(null);
  let nameInput = $state<HTMLInputElement | null>(null);

  function sortDays(days: SplitDay[]): SplitDay[] {
    return [...days].sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      const s = await getSplit(splitId);
      split = s;
      ui.nameDraft = s?.name ?? "";
      await activeSplit.load();
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load split";
      split = null;
    } finally {
      ui.loading = false;
    }
  }

  async function persist(next: WorkoutSplit) {
    ui.saving = true;
    ui.error = null;
    try {
      const touched = touchSplit(next);
      await saveSplit(touched);
      split = touched;
      await splits.refresh({ limit: 50, sortBy: "updated", order: "desc" });
      await activeSplit.load();
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to save";
    } finally {
      ui.saving = false;
    }
  }

  function startRename() {
    if (!split) return;
    ui.nameDraft = split.name;
    ui.renaming = true;
    queueMicrotask(() => nameInput?.focus());
  }

  async function commitRename() {
    if (!split) return;
    const name = ui.nameDraft.trim() || "New Split";
    ui.renaming = false;
    if (name === split.name) return;
    await persist({ ...split, name });
  }

  function cancelRename() {
    ui.renaming = false;
    ui.nameDraft = split?.name ?? "";
  }

  async function addDay() {
    if (!split) return;
    const nextOrder =
      split.days.length === 0
        ? 0
        : Math.max(...split.days.map((d) => d.orderIndex)) + 1;
    const next: WorkoutSplit = {
      ...split,
      days: [
        ...split.days,
        { id: createId("day"), orderIndex: nextOrder, name: `Day ${nextOrder + 1}`, blocks: [] },
      ],
    };
    await persist(next);
  }

  async function setActive() {
    if (!split) return;
    ui.error = null;
    try {
      await splits.setActive(split.id);
      await activeSplit.load();
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to set active";
    }
  }

  async function deleteThisSplit() {
    if (!split) return;
    ui.saving = true;
    ui.error = null;
    try {
      await deleteSplit(split.id);
      await splits.refresh({ limit: 50, sortBy: "updated", order: "desc" });
      await activeSplit.load();
      back("/splits");
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to delete split";
    } finally {
      ui.saving = false;
    }
  }

  // ── Day drag-to-reorder ───────────────────────────────────────────────────

  let listEl = $state<HTMLUListElement | null>(null);
  let dragId = $state<string | null>(null);
  let dragFromIdx = $state(-1);
  let dragToIdx = $state(-1);
  let dragStartY = $state(0);

  function liveDayOrder(sorted: SplitDay[]): SplitDay[] {
    if (dragId === null || dragFromIdx === dragToIdx) return sorted;
    const result = [...sorted];
    const [item] = result.splice(dragFromIdx, 1);
    result.splice(dragToIdx, 0, item!);
    return result;
  }

  async function commitDayDrag() {
    const from = dragFromIdx;
    const to = dragToIdx;
    dragId = null;
    dragFromIdx = -1;
    dragToIdx = -1;
    if (!split || from === to || from === -1) return;

    const sorted = sortDays(split.days);
    const reordered = [...sorted];
    const [item] = reordered.splice(from, 1);
    reordered.splice(to, 0, item!);

    const next: WorkoutSplit = {
      ...split,
      days: split.days.map((d) => {
        const newIdx = reordered.findIndex((r) => r.id === d.id);
        return newIdx !== -1 ? { ...d, orderIndex: newIdx } : d;
      }),
    };
    await persist(next);
  }

  async function hapticLight() {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
  }

  function dayGripAction(node: HTMLElement, dayId: string) {
    function startDrag(clientY: number) {
      const sorted = sortDays(split?.days ?? []);
      const idx = sorted.findIndex((d) => d.id === dayId);
      if (idx === -1) return false;
      dragId = dayId;
      dragFromIdx = idx;
      dragToIdx = idx;
      dragStartY = clientY;
      void hapticLight();
      return true;
    }

    function moveDrag(clientY: number) {
      if (dragId !== dayId) return;
      const total = split?.days.length ?? 1;
      const rowH = listEl ? listEl.getBoundingClientRect().height / total : 56;
      const newIdx = Math.max(0, Math.min(total - 1, Math.round(dragFromIdx + (clientY - dragStartY) / rowH)));
      if (newIdx !== dragToIdx) dragToIdx = newIdx;
    }

    function onTouchStart(e: TouchEvent) {
      if (ui.saving || e.touches.length !== 1) return;
      e.preventDefault();
      startDrag(e.touches[0]!.clientY);
    }
    function onTouchMove(e: TouchEvent) {
      if (dragId !== dayId) return;
      e.preventDefault();
      moveDrag(e.touches[0]!.clientY);
    }
    function onTouchEnd() {
      if (dragId !== dayId) return;
      void commitDayDrag();
    }
    function onMouseDown(e: MouseEvent) {
      if (ui.saving || e.button !== 0) return;
      e.preventDefault();
      if (!startDrag(e.clientY)) return;
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }
    function onMouseMove(e: MouseEvent) { moveDrag(e.clientY); }
    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (dragId !== dayId) return;
      void commitDayDrag();
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
  }

  onMount(() => { void load(); });
</script>

<div class="flex flex-col pb-24">
  <!-- Header -->
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={() => back("/splits")}>
      <ArrowLeft class="h-4 w-4" />
    </Button>

    {#if ui.renaming}
      <input
        bind:this={nameInput}
        class="flex-1 min-w-0 bg-transparent text-sm font-semibold focus:outline-none border-b border-primary"
        bind:value={ui.nameDraft}
        disabled={ui.saving}
        onkeydown={(e) => {
          if (e.key === "Enter") void commitRename();
          if (e.key === "Escape") cancelRename();
        }}
        onblur={() => void commitRename()}
      />
      <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" onclick={cancelRename}>
        <X class="h-3.5 w-3.5" />
      </Button>
      <Button size="icon" class="h-7 w-7 shrink-0" onclick={() => void commitRename()}>
        <Check class="h-3.5 w-3.5" />
      </Button>
    {:else}
      <button
        type="button"
        class="flex-1 min-w-0 flex items-center gap-2 text-left"
        onclick={startRename}
        disabled={ui.loading || ui.saving}
      >
        <span class="text-sm font-semibold truncate">
          {split?.name ?? "Split"}
        </span>
        {#if split && $activeSplit?.id === split.id}
          <Badge variant="secondary" class="text-xs px-1.5 py-0 shrink-0">Active</Badge>
        {/if}
      </button>

      <div class="flex items-center gap-1 shrink-0">
        {#if split && $activeSplit?.id !== split.id}
          <Button
            variant="outline"
            class="h-7 px-2 text-xs"
            disabled={ui.saving}
            onclick={() => void setActive()}
          >
            Set active
          </Button>
        {/if}

        <ConfirmDialog
          title="Delete this split?"
          description="Permanently removes the split and all its days. Cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          saving={ui.saving}
          onConfirm={deleteThisSplit}
        >
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon" class="h-7 w-7 text-destructive" disabled={!split || ui.saving}>
              <Trash class="h-3.5 w-3.5" />
            </Button>
          {/snippet}
        </ConfirmDialog>
      </div>
    {/if}
  </div>

  {#if ui.error}
    <p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>
  {/if}

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if !split}
    <p class="px-3 py-4 text-sm text-muted-foreground">Split not found.</p>
  {:else}
    <!-- Days section header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-border">
      <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Days · {split.days.length}
      </span>
      <Button
        variant="ghost"
        class="h-7 px-2 text-xs gap-1"
        disabled={ui.saving}
        onclick={() => void addDay()}
      >
        <Plus class="h-3 w-3" />
        Add day
      </Button>
    </div>

    {#if split.days.length === 0}
      <div class="px-3 py-6 flex flex-col items-center gap-2 text-center">
        <p class="text-sm text-muted-foreground">No days yet.</p>
        <Button variant="outline" size="sm" onclick={() => void addDay()}>Add first day</Button>
      </div>
    {:else}
      {@const sorted = sortDays(split.days)}
      {@const ordered = liveDayOrder(sorted)}
      <ul bind:this={listEl} class="divide-y divide-border">
        {#each ordered as d, i (d.id)}
          {@const isDragging = dragId === d.id}
          <li class="relative flex items-center transition-colors {isDragging ? 'opacity-50' : ''}">
            <button
              type="button"
              class="shrink-0 flex items-center gap-1 pl-3 pr-2 self-stretch cursor-grab active:cursor-grabbing"
              style="touch-action: none;"
              use:dayGripAction={d.id}
              aria-label="Drag to reorder"
              tabindex="-1"
              disabled={ui.saving}
            >
              <GripVertical class="h-4 w-4 text-muted-foreground" />
            </button>

            <button
              type="button"
              class="flex-1 min-w-0 flex items-center gap-3 py-3 pr-3 text-left hover:bg-muted/40 active:bg-muted/60 transition-colors"
              onclick={() => void goto(`/splits/${splitId}/days/${d.id}`)}
            >
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium">
                  Day {i + 1}{d.name ? ` — ${d.name}` : ""}
                </p>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {d.blocks.length} item{d.blocks.length === 1 ? "" : "s"}
                </p>
              </div>
              <span class="text-muted-foreground text-sm shrink-0">›</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>
