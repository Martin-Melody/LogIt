<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { ArrowLeft } from "lucide-svelte";
  import { isNativePlatform } from "$lib/platform/isNative";
  import AccountSwitcher from "$lib/components/AccountSwitcher.svelte";

  onMount(async () => {
    // The web has one account per browser: nothing to switch between.
    if (!isNativePlatform()) await goto("/settings", { replaceState: true });
  });
</script>

<div class="flex flex-col min-h-screen bg-background text-foreground px-5 pt-10 pb-8 max-w-sm mx-auto w-full gap-4">
  <button type="button" class="flex items-center gap-1 text-sm text-muted-foreground self-start min-h-11" onclick={() => history.back()}>
    <ArrowLeft class="h-4 w-4" /> Back
  </button>
  <div>
    <h1 class="text-xl font-bold">Accounts on this phone</h1>
    <p class="mt-1 text-sm text-muted-foreground">Each keeps its own training, settings and sign-in. Switching needs no password.</p>
  </div>
  <AccountSwitcher />
</div>
