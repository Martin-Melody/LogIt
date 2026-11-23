<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { ArrowDownUp, ChevronsUpDown, FileText, MapPin, Music, Redo2, Timer, Trash2, Undo2 } from "lucide-svelte";
  import type { WorkoutHistory } from "$lib/stores/currentSession.store";
  import { menuRow } from "$lib/components/ui/choice";

  // The workout's ⋮ menu (design canvas S-workout-menu): Undo and Redo first, then what
  // changes the whole workout. Every row closes the sheet and then acts.
  const {
    open,
    onOpenChange,
    history = null,
    saving = false,
    onUndo,
    onRedo,
    onReorder,
    onOpenAll,
    onNote,
    placeName = null,
    onPlace,
    restLabel = null,
    onRest,
    onMusic,
    onDiscard,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    history?: WorkoutHistory | null;
    saving?: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onReorder: () => void;
    onOpenAll: () => void;
    onNote: () => void;
    /** Where today's workout is; the row shows only when there's a place to change. */
    placeName?: string | null;
    onPlace?: () => void;
    restLabel?: string | null;
    onRest: () => void;
    /** Music settings, on phones that can control music. */
    onMusic?: () => void;
    onDiscard: () => void;
  } = $props();

  // After the sheet has gone, so a sheet or screen it opens isn't caught in its closing.
  function run(fn: () => void) {
    onOpenChange(false);
    setTimeout(fn, 200);
  }

  const tile =
    "flex h-14 min-w-0 items-center gap-2.5 rounded-xl border border-input bg-muted px-3 text-left transition-colors disabled:opacity-45 [&_svg]:size-5 [&_svg]:shrink-0";
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content sheet showCloseButton={false} class="gap-1.5 bg-card px-3" aria-describedby={undefined}>
    <Dialog.Title class="sr-only">Workout menu</Dialog.Title>
    <div class="grid grid-cols-2 gap-2 px-1 pb-2">
      <button type="button" class={tile} disabled={!history?.undo || saving} data-testid="workout-undo" onclick={() => run(onUndo)}>
        <Undo2 />
        <span class="flex min-w-0 flex-col text-sm font-medium">Undo<small class="truncate text-[11px] font-normal text-muted-foreground">{history?.undo?.label ?? "Nothing to undo"}</small></span>
      </button>
      <button type="button" class={tile} disabled={!history?.redo || saving} data-testid="workout-redo" onclick={() => run(onRedo)}>
        <Redo2 />
        <span class="flex min-w-0 flex-col text-sm font-medium">Redo<small class="truncate text-[11px] font-normal text-muted-foreground">{history?.redo?.label ?? "Nothing to redo"}</small></span>
      </button>
    </div>
    <button type="button" class={menuRow} onclick={() => run(onReorder)}><ArrowDownUp /> Change the order</button>
    <button type="button" class={menuRow} onclick={() => run(onOpenAll)}><ChevronsUpDown /> Open every exercise</button>
    <button type="button" class={menuRow} onclick={() => run(onNote)}><FileText /> Workout note</button>
    {#if onPlace}
      <button type="button" class={menuRow} onclick={() => run(onPlace)}>
        <MapPin /> Where you're training
        {#if placeName}<span class="ml-auto truncate pl-2 text-[13px] text-muted-foreground">{placeName}</span>{/if}
      </button>
    {/if}
    <button type="button" class={menuRow} onclick={() => run(onRest)}>
      <Timer /> Rest timer and sounds
      {#if restLabel}<span class="ml-auto pl-2 text-[13px] text-muted-foreground tabular-nums">{restLabel}</span>{/if}
    </button>
    {#if onMusic}
      <button type="button" class={menuRow} onclick={() => run(onMusic)}><Music /> Music settings</button>
    {/if}
    <button type="button" class="{menuRow} text-destructive" disabled={saving} onclick={() => run(onDiscard)}><Trash2 /> Discard workout…</button>
  </Dialog.Content>
</Dialog.Root>
