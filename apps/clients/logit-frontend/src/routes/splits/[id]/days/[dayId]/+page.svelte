<script lang="ts">
  import { onMount } from "svelte";
  import { back } from "$lib/navigation";

  import { Button } from "$lib/components/ui/button";

  import type { WorkoutSplit, SplitDay, PlannedExercise } from "$lib/domain/WorkoutSplit";
  import { touchSplit } from "$lib/domain/WorkoutSplit";
  import { createId } from "$lib/domain/ids";

  import { getSplit } from "$lib/usecases/Splits/getSplit";
  import { saveSplit } from "$lib/usecases/Splits/saveSplit";

  import { ArrowLeft, Plus, Trash, Check, X, GripVertical } from "lucide-svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import ExerciseSearchInput from "$lib/components/ExerciseSearchInput.svelte";

  const props = $props<{ params: { id: string; dayId: string } }>();
  const splitId = $derived(props.params.id);
  const dayId = $derived(props.params.dayId);

  const ui = $state({
    loading: true,
    saving: false,
    error: null as string | null,
    addOpen: false,
    renamingDay: false,
    dayNameDraft: "",
  });

  let split = $state<WorkoutSplit | null>(null);
  let dayNameInput = $state<HTMLInputElement | null>(null);
  let listEl = $state<HTMLUListElement | null>(null);

  const day = $derived<SplitDay | null>(
    split ? ((split.days ?? []).find((x) => x.id === dayId) ?? null) : null,
  );

  // Drag-to-reorder state
  let dragId = $state<string | null>(null);
  let dragFromIdx = $state(-1);
  let dragToIdx = $state(-1);
  let dragStartY = $state(0);

  function sortExercises(exs: PlannedExercise[]): PlannedExercise[] {
    return [...exs].sort((a, b) => a.orderIndex - b.orderIndex);
  }

  function liveOrder(sorted: PlannedExercise[]): PlannedExercise[] {
    if (dragId === null || dragFromIdx === dragToIdx) return sorted;
    const result = [...sorted];
    const [item] = result.splice(dragFromIdx, 1);
    result.splice(dragToIdx, 0, item!);
    return result;
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      split = await getSplit(splitId);
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load";
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
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to save";
    } finally {
      ui.saving = false;
    }
  }

  function startRenameDay() {
    if (!day) return;
    ui.dayNameDraft = day.name ?? "";
    ui.renamingDay = true;
    queueMicrotask(() => dayNameInput?.focus());
  }

  async function commitRenameDay() {
    if (!split || !day) return;
    const name = ui.dayNameDraft.trim();
    ui.renamingDay = false;
    if (name === (day.name ?? "")) return;
    const next: WorkoutSplit = {
      ...split,
      days: split.days.map((d) => (d.id === day.id ? { ...d, name } : d)),
    };
    await persist(next);
  }

  function cancelRenameDay() {
    ui.renamingDay = false;
    ui.dayNameDraft = day?.name ?? "";
  }

  async function addExercise(selection: { name: string; exerciseId?: string }) {
    if (!split || !day) return;
    const nextOrder =
      day.exercises.length === 0
        ? 0
        : Math.max(...day.exercises.map((e) => e.orderIndex)) + 1;
    const newEx: PlannedExercise = {
      id: createId("pex"),
      orderIndex: nextOrder,
      exerciseName: selection.name,
      exerciseId: selection.exerciseId,
      targets: {},
    };
    const next: WorkoutSplit = {
      ...split,
      days: split.days.map((d) =>
        d.id === day.id ? { ...d, exercises: [...d.exercises, newEx] } : d,
      ),
    };
    ui.addOpen = false;
    await persist(next);
  }

  async function commitDragReorder() {
    const from = dragFromIdx;
    const to = dragToIdx;
    dragId = null;
    dragFromIdx = -1;
    dragToIdx = -1;

    if (!split || !day || from === to || from === -1) return;

    const sorted = sortExercises(day.exercises);
    const reordered = [...sorted];
    const [item] = reordered.splice(from, 1);
    reordered.splice(to, 0, item!);

    const updatedExercises = day.exercises.map((e) => {
      const newIdx = reordered.findIndex((r) => r.id === e.id);
      return newIdx !== -1 ? { ...e, orderIndex: newIdx } : e;
    });

    const next: WorkoutSplit = {
      ...split,
      days: split.days.map((d) =>
        d.id === day.id ? { ...d, exercises: updatedExercises } : d,
      ),
    };
    await persist(next);
  }

  async function deleteExercise(exId: string) {
    if (!split || !day) return;
    const next: WorkoutSplit = {
      ...split,
      days: split.days.map((d) => {
        if (d.id !== day.id) return d;
        return { ...d, exercises: d.exercises.filter((e) => e.id !== exId) };
      }),
    };
    await persist(next);
  }

  async function deleteDay() {
    if (!split || !day) return;
    const next: WorkoutSplit = {
      ...split,
      days: split.days
        .filter((d) => d.id !== day.id)
        .map((d, i) => ({ ...d, orderIndex: i })),
    };
    await persist(next);
    back(`/splits/${splitId}`);
  }

  async function hapticLight() {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // Not available on web
    }
  }

  // Drag handle action — supports both touch (Android) and mouse (desktop browser).
  function gripAction(node: HTMLElement, exId: string) {
    function startDrag(clientY: number) {
      const sorted = sortExercises(day?.exercises ?? []);
      const idx = sorted.findIndex((ex) => ex.id === exId);
      if (idx === -1) return false;
      dragId = exId;
      dragFromIdx = idx;
      dragToIdx = idx;
      dragStartY = clientY;
      void hapticLight();
      return true;
    }

    function moveDrag(clientY: number) {
      if (dragId !== exId) return;
      const total = day?.exercises.length ?? 1;
      const rowH = listEl ? listEl.getBoundingClientRect().height / total : 48;
      const delta = clientY - dragStartY;
      const newIdx = Math.max(0, Math.min(total - 1, Math.round(dragFromIdx + delta / rowH)));
      if (newIdx !== dragToIdx) dragToIdx = newIdx;
    }

    // ── Touch handlers ────────────────────────────────────────────────────────
    function onTouchStart(e: TouchEvent) {
      if (ui.saving || e.touches.length !== 1) return;
      e.preventDefault();
      startDrag(e.touches[0]!.clientY);
    }
    function onTouchMove(e: TouchEvent) {
      if (dragId !== exId) return;
      e.preventDefault();
      moveDrag(e.touches[0]!.clientY);
    }
    function onTouchEnd() {
      if (dragId !== exId) return;
      void commitDragReorder();
    }

    // ── Mouse handlers (desktop browser) ─────────────────────────────────────
    function onMouseDown(e: MouseEvent) {
      if (ui.saving || e.button !== 0) return;
      e.preventDefault();
      if (!startDrag(e.clientY)) return;
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }
    function onMouseMove(e: MouseEvent) {
      moveDrag(e.clientY);
    }
    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (dragId !== exId) return;
      void commitDragReorder();
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
    <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={() => back(`/splits/${splitId}`)}>
      <ArrowLeft class="h-4 w-4" />
    </Button>

    {#if ui.renamingDay}
      <input
        bind:this={dayNameInput}
        class="flex-1 min-w-0 bg-transparent text-sm font-semibold focus:outline-none border-b border-primary"
        bind:value={ui.dayNameDraft}
        placeholder="Day name (optional)"
        disabled={ui.saving}
        onkeydown={(e) => {
          if (e.key === "Enter") void commitRenameDay();
          if (e.key === "Escape") cancelRenameDay();
        }}
        onblur={() => void commitRenameDay()}
      />
      <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" onclick={cancelRenameDay}>
        <X class="h-3.5 w-3.5" />
      </Button>
      <Button size="icon" class="h-7 w-7 shrink-0" onclick={() => void commitRenameDay()}>
        <Check class="h-3.5 w-3.5" />
      </Button>
    {:else}
      <button
        type="button"
        class="flex-1 min-w-0 text-left"
        onclick={startRenameDay}
        disabled={ui.loading || ui.saving || !day}
      >
        <span class="text-sm font-semibold">
          {#if day}
            Day {day.orderIndex + 1}{day.name ? ` — ${day.name}` : ""}
          {:else}
            Day
          {/if}
        </span>
      </button>

      <div class="flex items-center gap-1 shrink-0">
        <Button
          size="icon"
          class="h-7 w-7"
          disabled={!day || ui.saving}
          onclick={() => (ui.addOpen = !ui.addOpen)}
          aria-label="Add exercise"
        >
          <Plus class="h-3.5 w-3.5" />
        </Button>

        <ConfirmDialog
          title="Delete this day?"
          description="Removes the day and all its exercises. Cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          saving={ui.saving}
          onConfirm={deleteDay}
        >
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon" class="h-7 w-7 text-destructive" disabled={!day || ui.saving}>
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

  <!-- Add exercise inline search -->
  {#if ui.addOpen}
    <div class="px-3 py-2 border-b border-border bg-muted/30">
      <ExerciseSearchInput
        placeholder="Search or add exercise…"
        disabled={ui.saving}
        autofocus={ui.addOpen}
        onConfirm={(sel) => void addExercise(sel)}
      />
      <Button
        variant="ghost"
        class="mt-1 h-7 px-2 text-xs text-muted-foreground"
        onclick={() => (ui.addOpen = false)}
      >
        Cancel
      </Button>
    </div>
  {/if}

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if !split}
    <p class="px-3 py-4 text-sm text-muted-foreground">Split not found.</p>
  {:else if !day}
    <p class="px-3 py-4 text-sm text-muted-foreground">Day not found.</p>
  {:else if day.exercises.length === 0}
    <div class="px-3 py-6 flex flex-col items-center gap-2 text-center">
      <p class="text-sm text-muted-foreground">No exercises yet.</p>
      <Button variant="outline" size="sm" onclick={() => (ui.addOpen = true)}>
        Add first exercise
      </Button>
    </div>
  {:else}
    <div class="flex items-center justify-between px-3 py-2 border-b border-border">
      <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Exercises · {day.exercises.length}
      </span>
    </div>

    {@const sorted = sortExercises(day.exercises)}
    {@const ordered = liveOrder(sorted)}

    <ul bind:this={listEl} class="divide-y divide-border">
      {#each ordered as ex, i (ex.id)}
        {@const isDragging = dragId === ex.id}
        <!--
          The li is `position: relative` so the grip button can be absolutely
          positioned and cover the full row height — a much larger touch target.
        -->
        <li class="relative flex items-center py-2.5 pr-3 transition-colors {isDragging ? 'bg-primary/15' : ''}">
          <!--
            Full-height drag handle button.
            - `type="button"` makes this an interactive element, giving it
              priority over scroll gestures in Android WebView.
            - `style="touch-action: none"` (inline, not via Tailwind) ensures
              the browser never treats touches here as a pan/zoom gesture.
            - Absolute positioning stretches it top-to-bottom so the user has
              a tall, easy-to-hit drag zone on the left side of each row.
          -->
          <button
            type="button"
            class="absolute left-0 top-0 bottom-0 flex items-center gap-1 pl-3 pr-2 cursor-grab active:cursor-grabbing"
            style="touch-action: none; background: rgba(99,102,241,0.15); border-right: 2px solid rgba(99,102,241,0.4);"
            use:gripAction={ex.id}
            aria-label="Drag to reorder"
            tabindex="-1"
            disabled={ui.saving}
          >
            <GripVertical class="h-4 w-4 text-indigo-500" />
            <span class="text-xs w-5 text-right text-indigo-500 font-medium">{i + 1}</span>
          </button>

          <!-- Offset name so it doesn't sit under the grip button (~60px) -->
          <span class="flex-1 min-w-0 pl-16 text-sm truncate">{ex.exerciseName}</span>

          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
            disabled={ui.saving}
            onclick={() => void deleteExercise(ex.id)}
            aria-label="Remove {ex.exerciseName}"
          >
            <X class="h-3.5 w-3.5" />
          </Button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
