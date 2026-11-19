<script lang="ts">
  import { onMount } from "svelte";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { ApiError } from "@logit/core/api/client";
  import { adminApi, behindCloudflare } from "$lib/features/admin/adminApi";
  import { adminState } from "$lib/features/admin/adminState.svelte";
  import ClaimAdminCard from "$lib/features/admin/ClaimAdminCard.svelte";

  let { children } = $props();
  let needsCloudflare = $state(false);
  let checked = $state(false);

  // Always ask the server: the cached answer may be from before someone removed this admin.
  onMount(async () => {
    await adminState.refresh();
    if (adminState.isAdmin && behindCloudflare()) {
      // Without a Cloudflare sign-in, admin calls are sent to Cloudflare's login (a failed fetch)
      // or refused by the API (403).
      try {
        await adminApi.ping();
      } catch (e) {
        needsCloudflare = !(e instanceof ApiError) || e.status === 403;
      }
    }
    checked = true;
    if (!needsCloudflare) void adminState.refreshCounts();
  });
</script>

{#if !adminState.loaded || !checked}
  <div class="flex flex-col gap-4"><Skeleton class="h-10 w-48" /><Skeleton class="h-40" /></div>
{:else if !adminState.isAdmin && adminState.claimOffered}
  <!-- Nobody runs this server yet. Offered here too, not only on the dashboard home: a Free
       account on getlogit.app never sees the home page. -->
  <div class="mx-auto max-w-xl py-10"><ClaimAdminCard always /></div>
{:else if !adminState.isAdmin}
  <div class="mx-auto flex max-w-md flex-col items-center gap-2 py-16 text-center">
    <h1 class="text-xl font-semibold">Page not found</h1>
    <p class="text-sm text-muted-foreground">There's nothing at this address.</p>
    <a href="/" class="mt-2 inline-flex h-9 items-center rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground">Go to your dashboard</a>
  </div>
{:else if needsCloudflare}
  <div class="mx-auto flex max-w-md flex-col items-center gap-2 py-16 text-center">
    <h1 class="text-xl font-semibold">Sign in to the admin console</h1>
    <p class="text-sm text-muted-foreground">On getlogit.app the admin console needs a second sign-in, through Cloudflare, before it opens.</p>
    <button type="button" onclick={() => location.assign(location.pathname)} class="mt-2 inline-flex h-9 items-center rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground">Sign in with Cloudflare</button>
  </div>
{:else}
  {@render children?.()}
{/if}
