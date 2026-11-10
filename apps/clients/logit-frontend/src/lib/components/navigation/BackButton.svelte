<script lang="ts">
  import { ArrowLeft } from "lucide-svelte";

  // The one back button: a 44px tap target with the arrow aligned to the page
  // gutter (-ml) and no extra header height (-my), labelled for screen readers.
  const {
    onclick,
    disabled = false,
    class: className = "",
  }: { onclick: () => void; disabled?: boolean; class?: string } = $props();
</script>

<button
  type="button"
  aria-label="Back"
  class="-ml-2.5 -my-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent disabled:opacity-50 {className}"
  {onclick}
  {disabled}
>
  <ArrowLeft class="h-5 w-5" />
</button>
