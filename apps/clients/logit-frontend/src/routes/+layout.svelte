<script lang="ts">
  import "./layout.css";
  import favicon from "$lib/assets/favicon.svg";
  import BottomNav from "$lib/components/navigation/BottomNav/BottomNav.svelte";
  import TopBar from "$lib/components/ui/TopBar/TopBar.svelte";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { Toaster } from "$lib/components/ui/sonner/index";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { appInit } from "$lib/platform/appInit";
  import { appReady, appInitError } from "$lib/stores/appReady.store";
  import { onboarding } from "$lib/stores/onboarding.store";
  import { goto, onNavigate } from "$app/navigation";

  let { children } = $props();

  const isOnboarding = $derived(page.url.pathname.startsWith("/onboarding"));

  $effect(() => {
    if ($appReady && !$onboarding.completed && !isOnboarding) {
      void goto("/onboarding");
    }
  });

  onMount(async () => {
    void appInit();

    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.addListener("localNotificationActionPerformed", () => {
        void goto("/session/current");
      });
    } catch {
      // Not available on web
    }
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

{#if $appInitError}
  <div class="flex h-screen w-screen flex-col items-center justify-center gap-4 px-6 text-center">
    <p class="text-sm font-semibold text-destructive">Failed to start</p>
    <p class="text-xs text-muted-foreground max-w-xs">{$appInitError}</p>
    <p class="text-xs text-muted-foreground">Try closing and reopening the app. If this keeps happening, reinstall it.</p>
  </div>
{:else if $appReady}
  {#if isOnboarding}
    {@render children()}
  {:else}
    <div class="flex h-screen flex-col bg-background text-foreground">
      <header>
        <TopBar />
      </header>

      <main class="flex-1 overflow-y-auto overscroll-contain">
        {@render children()}
      </main>

      <footer
        class="border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
      >
        <BottomNav />
      </footer>
    </div>
  {/if}
{:else}
  <div class="flex h-screen w-screen items-center justify-center">
    <Spinner />
  </div>
{/if}

<Toaster position="top-center" richColors />
