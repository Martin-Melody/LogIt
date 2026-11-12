<script lang="ts">
  import "./layout.css";
  import favicon from "$lib/assets/favicon.png";
  import BottomNav from "$lib/components/navigation/BottomNav/BottomNav.svelte";
  import AppHeader from "$lib/components/navigation/AppHeader/AppHeader.svelte";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { Toaster } from "$lib/components/ui/sonner/index";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { appInit } from "$lib/platform/appInit";
  import { appReady, appInitError, needsAccountAuth } from "$lib/stores/appReady.store";
  import { onboarding } from "$lib/stores/onboarding.store";
  import { goto, onNavigate } from "$app/navigation";
  import { ModeWatcher } from "mode-watcher";
  import { bottomNavHeight } from "$lib/stores/bottomNav.store";
  import { navConfig, NAV_ITEM_DEFS } from "$lib/stores/navConfig.store";
  import { authStore } from "$lib/api/authStore.svelte";
  import { overlayOpen } from "$lib/stores/overlay.store";
  import { tabHrefs, neighbourTab, tabDirection, tabSwipe } from "$lib/features/navigation/tabSwipe";

  let { children } = $props();

  let footerHeight = $state(0);
  $effect(() => bottomNavHeight.set(footerHeight));

  // Bottom-nav pages in bar order (Start in the middle), for swiping and slide direction.
  const tabs = $derived(tabHrefs($navConfig, NAV_ITEM_DEFS, authStore.isAuthenticated));
  const swipeOn = $derived($navConfig.swipe !== false);

  const swipeParams = $derived({
    target: (step: 1 | -1) =>
      swipeOn && !$overlayOpen ? neighbourTab(tabs, page.url.pathname, step) : null,
    onSwipe: (href: string) => void goto(href),
  });

  const isOnboarding = $derived(
    page.url.pathname.startsWith("/onboarding") ||
    page.url.pathname.startsWith("/auth") ||
    page.url.pathname.startsWith("/accounts"),
  );

  $effect(() => {
    if ($appReady && !$onboarding.completed && !isOnboarding) {
      void goto("/onboarding");
    }
    if ($appReady && $needsAccountAuth && !isOnboarding) {
      void goto("/auth");
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

    // Between two bar pages the page slides the way the bar goes; anything else cross-fades.
    const dir =
      navigation.from && navigation.to
        ? tabDirection(tabs, navigation.from.url.pathname, navigation.to.url.pathname)
        : null;
    if (dir) document.documentElement.dataset.navDir = dir;
    else delete document.documentElement.dataset.navDir;

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
    <div class="flex h-screen flex-col bg-background pt-[env(safe-area-inset-top)] text-foreground">
      <AppHeader />

      <main
        class="flex-1 overflow-y-auto overscroll-contain"
        use:tabSwipe={swipeParams}
      >
        {@render children()}
      </main>

      <footer
        class="bg-background pb-[env(safe-area-inset-bottom)]"
        bind:offsetHeight={footerHeight}
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
<ModeWatcher defaultMode="system" modeStorageKey="logit:mode" />
