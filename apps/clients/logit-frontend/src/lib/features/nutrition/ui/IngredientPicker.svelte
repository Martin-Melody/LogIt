<script lang="ts">
  import { onMount } from "svelte";
  import { fly } from "svelte/transition";
  import { X } from "lucide-svelte";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import FoodSearchPanel, { type Picked } from "./FoodSearchPanel.svelte";

  // Full-screen food search for a recipe ingredient: the same search, barcode and label
  // scanning as logging, minus meals and quick adds.
  interface Props {
    title?: string;
    onpick: (p: Picked) => void;
    onclose: () => void;
  }
  const { title = "Add ingredient", onpick, onclose }: Props = $props();

  onMount(() => {
    openOverlay();
    return () => closeOverlay();
  });
</script>

<div
  class="fixed inset-0 z-40 flex flex-col bg-background pt-[env(safe-area-inset-top)]"
  role="dialog"
  aria-modal="true"
  aria-label={title}
  transition:fly={{ y: 24, duration: 180 }}
>
  <div class="flex h-14 shrink-0 items-center gap-1 px-1">
    <button type="button" class="flex size-11 items-center justify-center rounded-lg" aria-label="Close" onclick={onclose}>
      <X class="size-5" />
    </button>
    <h1 class="text-lg font-bold">{title}</h1>
  </div>
  <div class="min-h-0 flex-1 overflow-y-auto pb-10">
    <FoodSearchPanel mode="ingredient" {onpick} autofocus />
  </div>
</div>
