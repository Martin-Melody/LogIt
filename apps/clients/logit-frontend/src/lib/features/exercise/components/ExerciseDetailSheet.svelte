<script lang="ts">
  import { X } from "lucide-svelte";
  import { fade } from "svelte/transition";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import { sheetUp } from "$lib/transitions";
  import type { Exercise } from "@logit/core/domain/exercise";
  import ExerciseDetailBody from "./ExerciseDetailBody.svelte";

  const { exerciseId = null, onClose = () => {} } = $props<{
    /** null closes the sheet. */
    exerciseId?: string | null;
    onClose?: () => void;
  }>();

  let title = $state("Exercise");

  $effect(() => {
    if (exerciseId) {
      openOverlay();
      return () => closeOverlay();
    }
  });
</script>

{#if exerciseId}
  <button
    type="button"
    class="fixed inset-0 bg-black/40 z-40"
    onclick={onClose}
    aria-label="Close"
    transition:fade={{ duration: 150 }}
  ></button>

  <div
    class="fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-w-[500px] flex-col rounded-t-xl border-t border-border bg-background max-h-[88dvh]"
    transition:sheetUp
  >
    <div class="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border shrink-0">
      <p class="text-sm font-semibold truncate">{title}</p>
      <button type="button" class="p-1 text-muted-foreground hover:text-foreground" onclick={onClose} aria-label="Close details">
        <X class="h-4 w-4" />
      </button>
    </div>

    <div class="flex-1 overflow-y-auto overscroll-contain">
      <ExerciseDetailBody
        {exerciseId}
        onExercise={(ex: Exercise | null) => (title = ex?.name ?? "Exercise")}
        onDeleted={onClose}
      />
    </div>
  </div>
{/if}
