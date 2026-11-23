<!-- Settings: on a wide screen the list of pages stays on the left and the open page is on the
     right. A link with #id (from search) scrolls to that setting and highlights it briefly. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { afterNavigate } from "$app/navigation";
  import { MediaQuery } from "svelte/reactivity";
  import SettingsNav from "$lib/features/settings/SettingsNav.svelte";

  const { children }: { children: Snippet } = $props();
  // Matches Tailwind's lg: the sidebar only exists (and loads its values) on a wide screen.
  const wide = new MediaQuery("min-width: 1024px");

  afterNavigate(({ to }) => {
    const id = to?.url.hash.slice(1);
    if (!id) return;
    // After the page has drawn (its sections may load first).
    setTimeout(() => {
      const el = document.getElementById(decodeURIComponent(id));
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("setting-flash");
      void el.offsetWidth;
      el.classList.add("setting-flash");
    }, 150);
  });
</script>

<div class="lg:mx-auto lg:grid lg:max-w-[1120px] lg:grid-cols-[260px_minmax(0,720px)] lg:gap-10 lg:px-6">
  {#if wide.current}
    <aside>
      <div class="sticky top-0 max-h-[calc(100vh-8rem)] overflow-y-auto py-4 pr-1">
        <SettingsNav compact />
      </div>
    </aside>
  {/if}
  <div class="min-w-0">
    {@render children()}
  </div>
</div>

<style>
  :global(.setting-flash) {
    animation: setting-flash 1.6s ease-out;
    border-radius: 10px;
  }
  @keyframes setting-flash {
    0%, 30% { background-color: color-mix(in oklab, var(--primary) 14%, transparent); }
    100% { background-color: transparent; }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.setting-flash) { animation-duration: 2.4s; animation-timing-function: steps(1, end); }
  }
</style>
