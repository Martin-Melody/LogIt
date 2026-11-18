<script lang="ts">
  import { Loader2 } from "lucide-svelte";
  import { authStore } from "$lib/api/authStore.svelte";
  import { firstDownloadAt, planIncludesSync, syncRunning } from "$lib/sync/syncService";

  /**
   * A routine sync (the 5-minute timer, coming back to the app) in the shared header: a small
   * spinner, only when it takes long enough to notice. The first download after signing in
   * has its own card on Home and Nutrition (FirstDownloadNotice.svelte) instead.
   */
  const SHOW_AFTER_MS = 800;

  let show = $state(false);

  $effect(() => {
    const routine = $syncRunning && $firstDownloadAt > 0 && authStore.isAuthenticated && planIncludesSync();
    if (!routine) {
      show = false;
      return;
    }
    const t = setTimeout(() => (show = true), SHOW_AFTER_MS);
    return () => clearTimeout(t);
  });
</script>

{#if show}
  <span role="status" class="flex size-6 shrink-0 items-center justify-center text-muted-foreground" title="Updating…">
    <Loader2 class="size-4 animate-spin" aria-hidden="true" />
    <span class="sr-only">Updating</span>
  </span>
{/if}
