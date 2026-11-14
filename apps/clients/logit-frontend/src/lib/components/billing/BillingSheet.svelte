<script lang="ts">
  import type { Snippet } from "svelte";
  import { fade } from "svelte/transition";
  import { sheetUp } from "$lib/transitions";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";

  // A bottom sheet for the plan screens' messages (account needed, purchase problems,
  // delete-account warning): icon, title, text and the actions as children.
  interface Props {
    open: boolean;
    title: string;
    tone?: "neutral" | "warning" | "info";
    onclose: () => void;
    icon: Snippet;
    children: Snippet;
  }
  const { open, title, tone = "neutral", onclose, icon, children }: Props = $props();

  $effect(() => {
    if (open) {
      openOverlay();
      return () => closeOverlay();
    }
  });

  const iconBg = $derived(
    tone === "warning" ? "bg-warning/15 text-warning" : tone === "info" ? "bg-info/15 text-info" : "bg-muted text-primary",
  );
</script>

{#if open}
  <button type="button" class="fixed inset-0 z-40 bg-black/55" aria-label="Close" onclick={onclose} transition:fade={{ duration: 150 }}></button>
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="billing-sheet-title"
    class="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-3 rounded-t-2xl border-t border-border bg-card px-5 pt-2.5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
    transition:sheetUp
  >
    <div class="mb-2 h-1 w-9 self-center rounded-full bg-foreground/20" aria-hidden="true"></div>
    <div class="flex size-11 items-center justify-center rounded-full {iconBg}">
      {@render icon()}
    </div>
    <h2 id="billing-sheet-title" class="text-[19px] font-bold">{title}</h2>
    {@render children()}
  </div>
{/if}
