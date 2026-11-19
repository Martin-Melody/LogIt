<script lang="ts">
  import { onMount } from "svelte";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { adminState } from "$lib/features/admin/adminState.svelte";

  let { children } = $props();

  // Always ask the server: the cached answer may be from before someone removed this admin.
  onMount(async () => {
    await adminState.refresh();
    void adminState.refreshCounts();
  });
</script>

{#if !adminState.loaded}
  <div class="flex flex-col gap-4"><Skeleton class="h-10 w-48" /><Skeleton class="h-40" /></div>
{:else if !adminState.isAdmin}
  <div class="mx-auto flex max-w-md flex-col items-center gap-2 py-16 text-center">
    <h1 class="text-xl font-semibold">Page not found</h1>
    <p class="text-sm text-muted-foreground">There's nothing at this address.</p>
    <a href="/" class="mt-2 inline-flex h-9 items-center rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground">Go to your dashboard</a>
  </div>
{:else}
  {@render children?.()}
{/if}
