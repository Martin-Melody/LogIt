<script lang="ts">
  import "./layout.css";
  import favicon from "$lib/assets/favicon.svg";
  import BottomNav from "$lib/components/navigation/BottomNav/BottomNav.svelte";
  import TopBar from "$lib/components/ui/TopBar/TopBar.svelte";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { onMount } from "svelte";
  import { appInit } from "$lib/platform/appInit";
  import { appReady } from "$lib/stores/appReady.store";
  import { onNavigate } from "$app/navigation";

  let { children } = $props();

  onMount(() => {
    void appInit();
  });

  onNavigate((navigation) => {
    if (!document.startViewTransition) return;

    return new Promise<void>((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

<svelte:head>
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, viewport-fit=cover"
  />
  <link rel="icon" href={favicon} />
</svelte:head>

{#if $appReady}
  <div class="flex h-screen flex-col bg-background text-foreground">
    <TopBar />

    <main class="flex-1 overflow-y-auto overscroll-contain">
      {@render children()}
    </main>

    <footer
      class="border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <BottomNav />
    </footer>
  </div>
{:else}
  <div class="flex h-screen w-screen items-center justify-center">
    <Spinner />
  </div>
{/if}
