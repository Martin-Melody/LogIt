<script lang="ts">
  import { sendBoardWeekOnce } from "$lib/features/groups/boardSync";
  import CheerPill from "$lib/components/social/CheerPill.svelte";
  import InviteFriendSheet from "$lib/components/social/InviteFriendSheet.svelte";
  import { holdInvite, inviteSheet, takeHeldInvite } from "$lib/features/friends/invite.svelte";
  import StoryViewer from "$lib/components/social/StoryViewer.svelte";
  import AddStorySheet from "$lib/components/social/AddStorySheet.svelte";
  import ShareCardSheet from "$lib/components/social/ShareCardSheet.svelte";
  import { stories } from "$lib/features/friends/stories.svelte";
  import "./layout.css";
  import favicon from "$lib/assets/favicon.png";
  import BottomNav from "$lib/components/navigation/BottomNav/BottomNav.svelte";
  import WorkoutPill from "$lib/features/session/ui/WorkoutPill.svelte";
  import AppHeader from "$lib/components/navigation/AppHeader/AppHeader.svelte";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { Toaster } from "$lib/components/ui/sonner/index";
  import PhotoChooserHost from "$lib/features/photos/PhotoChooserHost.svelte";
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
  import { launchRedirect, isAccountScreen } from "$lib/platform/launchRedirect";

  let { children } = $props();

  let footerHeight = $state(0);
  $effect(() => bottomNavHeight.set(footerHeight));

  // Bottom-nav pages in bar order (Start in the middle), for swiping and slide direction.
  const tabs = $derived(tabHrefs($navConfig, NAV_ITEM_DEFS, authStore.ready ? authStore.isAuthenticated : null));
  const swipeOn = $derived($navConfig.swipe !== false);

  const swipeParams = $derived({
    target: (step: 1 | -1) =>
      swipeOn && !$overlayOpen ? neighbourTab(tabs, page.url.pathname, step) : null,
    onSwipe: (href: string) => void goto(href),
  });

  const isOnboarding = $derived(isAccountScreen(page.url.pathname));

  $effect(() => {
    const to = launchRedirect({
      ready: $appReady,
      onboardingCompleted: $onboarding.completed,
      needsAccountAuth: $needsAccountAuth,
      path: page.url.pathname,
    });
    // A friend's invite opened before there's an account: keep it for after onboarding.
    const invite = page.url.pathname === "/social/invite" ? page.url.searchParams.get("c") : null;
    if (to && invite) holdInvite(invite);
    if (to) void goto(to);
    else if ($appReady && $onboarding.completed && authStore.isAuthenticated && !isOnboarding) {
      sendBoardWeekOnce();
      const held = takeHeldInvite();
      if (held && page.url.pathname !== "/social/invite") void goto(held);
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

    // The page is its own transition layer only while it animates (layout.css): named all the
    // time, it trapped every sheet and dialog opened from a page under the bottom bar.
    document.documentElement.dataset.pageTransition = "";
    return new Promise<void>((resolve) => {
      const t = document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
      void t.finished.finally(() => delete document.documentElement.dataset.pageTransition);
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
        class="relative z-30 bg-background pb-[env(safe-area-inset-bottom)]"
        bind:offsetHeight={footerHeight}
      >
        <WorkoutPill />
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
<PhotoChooserHost />
<CheerPill />
{#if inviteSheet.open}<InviteFriendSheet onclose={() => (inviteSheet.open = false)} />{/if}
{#if stories.watching !== null}<StoryViewer training={stories.training} onclose={() => (stories.watching = null)} />{/if}
{#if stories.picking}
  <ShareCardSheet title="Add to your story" onclose={() => (stories.picking = false)}
    onpick={(card) => { stories.picking = false; stories.adding = { cards: [{ label: "", ...card }], fromWorkout: false }; }}
    onphoto={(photo) => { stories.picking = false; stories.adding = { cards: [], fromWorkout: false, photo }; }} />
{/if}
{#if stories.adding}<AddStorySheet cards={stories.adding.cards} fromWorkout={stories.adding.fromWorkout} photo={stories.adding.photo} onclose={() => (stories.adding = null)} />{/if}
<ModeWatcher defaultMode="system" modeStorageKey="logit:mode" />
