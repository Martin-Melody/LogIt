<script lang="ts">
  import "./layout.css";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { apiClient } from "@logit/core/api/client";
  import { coachApi } from "@logit/core/api/coachApi";
  import { Spinner } from "$lib/components/ui/spinner";
  import { viewingClient } from "$lib/viewingClient.svelte";
  import { ModeWatcher } from "mode-watcher";
  import { Toaster } from "$lib/components/ui/sonner";
  import * as Sidebar from "$lib/components/ui/sidebar";
  import AppSidebar from "$lib/components/app-sidebar.svelte";
  import { isCoachingPath } from "$lib/workspace";
  import { coachBadges } from "$lib/features/coaching/badges.svelte";
  import { socialBadge } from "$lib/features/social/socialData.svelte";

  let { children } = $props();

  // The page title in the slim top bar (phones and the collapsed sidebar).
  const PAGE_TITLES: Record<string, string> = {
    "/": "Overview",
    "/sessions": "Sessions",
    "/progress": "Progress",
    "/nutrition": "Nutrition",
    "/plan": "Plan",
    "/library": "Library",
    "/coaching/library": "Library",
    "/habits": "Habits & goals",
    "/social": "Social",
    "/plugins": "Plugins",
    "/coaching": "Today",
    "/coaching/programs": "Programs",
    "/coaching/checkins": "Check-ins",
    "/coaching/links": "Invite links",
    "/clients": "Clients",
    "/messages": "Messages",
    "/my-coach": "My coach",
    "/account": "Account",
    "/exercises": "Exercise",
  };
  const pageTitle = $derived.by(() => {
    const p = page.url.pathname;
    const key = Object.keys(PAGE_TITLES)
      .sort((a, b) => b.length - a.length)
      .find((k) => (k === "/" ? p === "/" : p.startsWith(k)));
    return key ? PAGE_TITLES[key] : "LogIt";
  });

  let ready = $state(false);

  const isLogin = $derived(
    page.url.pathname.startsWith("/login") ||
    page.url.pathname.startsWith("/forgot-password") ||
    page.url.pathname.startsWith("/reset-password"),
  );
  const isUpgrade = $derived(page.url.pathname.startsWith("/upgrade"));
  // An invite link from a coach: any account can open it (a Free account can be coached),
  // and someone logged out is sent to log in first and brought back.
  const isInviteLink = $derived(page.url.pathname.startsWith("/c/"));
  // A Free account on the hosted server can still reach these: the "plans are in the app"
  // page, and Account (password, deleting the account, which the store listing promises can
  // be done on the web).
  const isFreeAccount = $derived(page.url.pathname.startsWith("/account"));

  // apiClient holds plain (non-reactive) fields, not Svelte state — so these must be tied to
  // a value Svelte DOES track to get recomputed at all. page.url.pathname changes on every
  // login/logout navigation in this app, so reading it here (even unused) is what forces a
  // fresh read of apiClient's auth state each time it actually changes.
  const isStudio = $derived.by(() => {
    void page.url.pathname;
    return apiClient.getUser()?.tier === "Studio";
  });
  // Self-hosted deployments don't do billing — every local account gets full access
  // regardless of the `Free` tier the DB defaults to there. `isSelfHosted()` reflects what
  // the connected server itself declared at login, not a client-local guess.
  const isBlockedFreeTier = $derived.by(() => {
    void page.url.pathname;
    return !apiClient.isSelfHosted() && apiClient.getUser()?.tier === "Free";
  });

  async function guardRoute() {
    if (!apiClient.isAuthenticated()) {
      if (isInviteLink) await goto(`/login?next=${encodeURIComponent(page.url.pathname)}`);
      else if (!isLogin) await goto("/login");
      return;
    }
    if (isBlockedFreeTier) {
      if (!isUpgrade && !isFreeAccount && !isInviteLink) await goto("/upgrade");
      return;
    }
    if (isUpgrade) await goto("/");
  }

  onMount(async () => {
    await apiClient.init();
    // Reconcile the cached identity (who you are, tier, onboarding) against the server
    // before the guard below runs. The cache only updates on login, so it's stale right
    // after a Stripe checkout, and can even belong to a different account after a
    // cross-tab login on this origin — reconciling first makes the UI and the token agree.
    await apiClient.reconcileSession();
    ready = true;
    await guardRoute();
    if (apiClient.isAuthenticated() && !isBlockedFreeTier) {
      try {
        viewingClient.setClients(await coachApi.listClients());
      } catch {
        // Not fatal — the switcher just won't show. /clients surfaces the real error.
      }
    }
  });

  $effect(() => {
    // Re-run on every navigation, not just once at mount — apiClient's auth state isn't
    // tracked by Svelte, so page.url.pathname (which always changes on login/logout in this
    // app) is what actually triggers this guard to re-check after those transitions.
    void page.url.pathname;
    if (ready) void guardRoute();
    if (ready && apiClient.isAuthenticated() && !isBlockedFreeTier) {
      void coachBadges.refresh(isStudio);
      void socialBadge.refresh();
    }
  });

  function logout() {
    void apiClient.logout().then(() => goto("/login"));
  }
</script>

<ModeWatcher />
<Toaster />

{#if !ready}
  <div class="flex items-center justify-center min-h-screen">
    <Spinner class="size-6 text-muted-foreground" />
  </div>
{:else if isLogin}
  {@render children?.()}
{:else if isUpgrade && apiClient.isAuthenticated()}
  {@render children?.()}
{:else if isInviteLink && isBlockedFreeTier && apiClient.isAuthenticated()}
  <div class="p-4">{@render children?.()}</div>
{:else if isFreeAccount && isBlockedFreeTier && apiClient.isAuthenticated()}
  <div class="p-4">
    <div class="mx-auto mb-3 max-w-xl">
      <a href="/upgrade" class="text-sm text-muted-foreground hover:text-foreground">← Back</a>
    </div>
    {@render children?.()}
  </div>
{:else if apiClient.isAuthenticated() && !isBlockedFreeTier}
  <Sidebar.Provider>
    <AppSidebar
      {isStudio}
      userName={apiClient.getUser()?.displayName ?? apiClient.getUser()?.username ?? "Account"}
      tier={apiClient.getUser()?.tier ?? "Free"}
      onLogout={logout}
    />
    <Sidebar.Inset class="min-h-svh">
      <header class="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3 md:hidden">
        <Sidebar.Trigger class="-ml-1" />
        <span class="text-sm font-medium">{pageTitle}</span>
      </header>
      {#if viewingClient.current && !isCoachingPath(page.url.pathname, page.url.searchParams)}
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-primary px-4 py-2 text-sm text-primary-foreground sm:px-8">
          <span>Viewing <strong>{viewingClient.current.client.displayName || viewingClient.current.client.username}</strong>'s training</span>
          <button type="button" class="font-semibold underline underline-offset-4" onclick={() => viewingClient.set(null)}>Back to mine</button>
        </div>
      {/if}
      <main class="flex-1 px-4 py-6 sm:px-8 sm:py-7">
        <div class="mx-auto w-full max-w-[1120px]">
          {@render children?.()}
        </div>
      </main>
    </Sidebar.Inset>
  </Sidebar.Provider>
{/if}
