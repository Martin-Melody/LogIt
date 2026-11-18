<!-- The exercise over a workout (design canvas E1–E3): tap the name on the card. A tall sheet
     with the three tabs; closing it lands back on the same set. -->
<script lang="ts">
  import { X } from "lucide-svelte";
  import type { Snippet } from "svelte";
  import { fade } from "svelte/transition";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import { sheetUp } from "$lib/transitions";
  import { backDismiss, sheetDrag } from "$lib/components/sheet/sheet";
  import { EQUIPMENT_LABEL } from "@logit/core/domain/library";
  import type { Exercise } from "@logit/core/domain/exercise";
  import type { Place } from "@logit/core/domain/place";
  import ExerciseView, { type ExerciseTab } from "./ExerciseView.svelte";

  let {
    exerciseId = null,
    tab = "auto",
    today,
    excludeSessionId,
    onClose = () => {},
    onMachine,
  }: {
    /** null closes the sheet. */
    exerciseId?: string | null;
    tab?: ExerciseTab | "auto";
    today?: Snippet;
    excludeSessionId?: string;
    onClose?: () => void;
    onMachine?: (place: Place, machineId: string | null) => void;
  } = $props();

  let ex = $state<Exercise | null>(null);
  const cap = (m: string) => m.charAt(0).toUpperCase() + m.slice(1).replace(/_/g, " ");
  const subline = $derived(
    ex
      ? [ex.primaryMuscles.map(cap).join(", "), ex.equipment ? cap(EQUIPMENT_LABEL[ex.equipment]) : ""].filter(Boolean).join(" · ")
      : "",
  );

  $effect(() => {
    if (exerciseId) {
      openOverlay();
      return () => closeOverlay();
    }
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && exerciseId) onClose();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if exerciseId}
  <button type="button" class="fixed inset-0 z-40 bg-black/40" onclick={onClose} aria-label="Close" tabindex="-1"
    transition:fade={{ duration: 150 }}></button>

  <div role="dialog" aria-modal="true" aria-labelledby="exercise-sheet-title"
    class="fixed bottom-0 left-0 right-0 z-50 mx-auto flex h-[92dvh] max-w-[500px] flex-col rounded-t-2xl border-t border-border bg-background"
    use:sheetDrag={{ onDismiss: onClose }} use:backDismiss={onClose}
    transition:sheetUp>
    <span data-sheet-bar class="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true"></span>
    <div class="flex shrink-0 items-start gap-2 px-4 pt-2">
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 id="exercise-sheet-title" class="truncate text-[22px] font-bold tracking-tight">{ex?.name ?? "Exercise"}</h2>
        {#if subline}<span class="text-[13px] text-muted-foreground">{subline}</span>{/if}
      </div>
      <button type="button" class="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground" onclick={onClose} aria-label="Close details">
        <X class="h-5 w-5" />
      </button>
    </div>
    <div class="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
      {#key exerciseId}
        <ExerciseView {exerciseId} {tab} {today} {excludeSessionId} {onMachine}
          onExercise={(e) => (ex = e)} onDeleted={onClose} />
      {/key}
    </div>
  </div>
{/if}
