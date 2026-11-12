<script lang="ts">
  import { ArrowLeft } from "lucide-svelte";
  import { page } from "$app/state";
  import { authStore } from "$lib/api/authStore.svelte";
  import { navConfig, NAV_ITEM_DEFS } from "$lib/stores/navConfig.store";
  import { tabHrefs } from "$lib/features/navigation/tabSwipe";

  // The one back button: a 44px tap target with the arrow aligned to the page
  // gutter (-ml) and no extra header height (-my), labelled for screen readers.
  const {
    onclick,
    disabled = false,
    class: className = "",
  }: { onclick: () => void; disabled?: boolean; class?: string } = $props();

  // Bottom-bar pages are top level: no back button there (e.g. Exercises or Settings
  // when they're in the bar). Reached from More they keep it.
  const onTab = $derived(
    tabHrefs($navConfig, NAV_ITEM_DEFS, authStore.isAuthenticated).includes(page.url.pathname),
  );
</script>

{#if !onTab}
<button
  type="button"
  aria-label="Back"
  class="-ml-2.5 -my-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent disabled:opacity-50 {className}"
  {onclick}
  {disabled}
>
  <ArrowLeft class="h-5 w-5" />
</button>
{/if}
