<script lang="ts">
  import { canCoach, coachTrial } from "$lib/workspace";
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
  import GuideLayer from "$lib/features/guide/GuideLayer.svelte";
  import GuidePanel from "$lib/features/guide/GuidePanel.svelte";
  import StudioModeDialog from "$lib/features/guide/StudioModeDialog.svelte";
  import StudioFinishDialog from "$lib/features/guide/StudioFinishDialog.svelte";
  import SandboxBanner from "$lib/features/guide/SandboxBanner.svelte";
  import StudioNeeded from "$lib/features/onboarding/StudioNeeded.svelte";
  import { guide, walkthroughsFor } from "$lib/features/guide/guide.svelte";
  import { sandbox } from "$lib/features/guide/sandbox.svelte";
  import { adminState } from "$lib/features/admin/adminState.svelte";

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
    "/admin": "Admin",
    "/admin/people": "People",
    "/admin/invites": "Invites",
    "/admin/reports": "Reports",
    "/admin/plugins": "Plugin reviews",
    "/admin/server": "Server",
    "/admin/subscriptions": "Subscriptions",
    "/admin/growth": "Growth",
    "/admin/diagnostics": "Diagnostics",
    "/admin/discover": "Discover tests",
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
    return canCoach();
  });
  // Self-hosted deployments don't do billing — every local account gets full access
  // regardless of the `Free` tier the DB defaults to there. `isSelfHosted()` reflects what
  // the connected server itself declared at login, not a client-local guess.
  const isBlockedFreeTier = $derived.by(() => {
    void page.url.pathname;
    return !apiClient.isSelfHosted() && apiClient.getUser()?.tier === "Free";
  });
  // A Free account trying coaching with sample clients gets the Coaching workspace (W3);
  // its own training dashboard still needs Pro, so "Me" lands on /upgrade.
  const isTrialCoaching = $derived.by(() => {
    void page.url.pathname;
    return isBlockedFreeTier && coachTrial() && isCoachingPath(page.url.pathname, page.url.searchParams);
  });
  // Trying coaching below Studio on any plan (Pro too): invite links and payments say Studio.
  const isTrialCoachingAnyTier = $derived.by(() => {
    void page.url.pathname;
    return coachTrial();
  });
  // The admin console: open to any signed-in account whatever its plan; the server decides
  // who is an admin, and the page says "not found" to everyone else.
  const isAdminPath = $derived(page.url.pathname === "/admin" || page.url.pathname.startsWith("/admin/"));
  // "What brings you here?" right after signing up on the web (W2).
  const isWelcome = $derived(page.url.pathname.startsWith("/welcome"));

  async function guardRoute() {
    if (!apiClient.isAuthenticated()) {
      // Come back to where you were going after signing in: an invite link, or a docs page's
      // "Show me in the app" (/?guide=<chapter>), or any other page.
      const here = page.url.pathname + page.url.search;
      if (!isLogin) await goto(here === "/" ? "/login" : `/login?next=${encodeURIComponent(here)}`);
      return;
    }
    if (isBlockedFreeTier) {
      if (!isUpgrade && !isFreeAccount && !isInviteLink && !isWelcome && !isTrialCoaching && !isAdminPath) await goto("/upgrade");
      return;
    }
    if (isUpgrade) await goto("/");
  }

  onMount(async () => {
    await apiClient.forgetPickedServer();
    await apiClient.init();
    // Reconcile the cached identity (who you are, tier, onboarding) against the server
    // before the guard below runs. The cache only updates on login, so it's stale right
    // after a Stripe checkout, and can even belong to a different account after a
    // cross-tab login on this origin — reconciling first makes the UI and the token agree.
    await apiClient.reconcileSession();
    // A Free or Pro account may be trying coaching with sample clients: know that before the guard.
    if (apiClient.isAuthenticated() && apiClient.getUser()?.tier !== "Studio" && !apiClient.isSelfHosted()) {
      await sandbox.refresh();
    }
    ready = true;
    await guardRoute();
    if (apiClient.isAuthenticated() && (!isBlockedFreeTier || coachTrial())) {
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
    if (ready && apiClient.isAuthenticated() && (!isBlockedFreeTier || isTrialCoaching)) {
      void coachBadges.refresh(isStudio);
      // Once per signed-in account (load() ignores repeat calls for the same account).
      if (page.url.searchParams.has("guide")) void guide.startFromLink(page.url);
      else void guide.load();
      if ((isStudio || apiClient.isSelfHosted()) && !sandbox.loaded) void sandbox.refresh();
      void socialBadge.refresh();
    }
    // Once per signed-in account: is it an admin, or may it claim admin?
    const userId = apiClient.isAuthenticated() ? apiClient.getUser()?.id ?? null : null;
    if (ready && userId !== adminCheckedFor) {
      adminCheckedFor = userId;
      if (userId) void adminState.refresh();
      else adminState.reset();
    }
  });
  let adminCheckedFor: string | null = null;

  const walkthroughs = $derived.by(() => {
    void page.url.pathname;
    return walkthroughsFor(apiClient.getUser()?.tier, apiClient.isSelfHosted());
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
{:else if (isUpgrade || isWelcome) && apiClient.isAuthenticated()}
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
{:else if apiClient.isAuthenticated() && (!isBlockedFreeTier || isTrialCoaching || isAdminPath)}
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
      {#if isCoachingPath(page.url.pathname, page.url.searchParams)}<SandboxBanner />{/if}
      {#if viewingClient.current && !isCoachingPath(page.url.pathname, page.url.searchParams)}
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-primary px-4 py-2 text-sm text-primary-foreground sm:px-8">
          <span>Viewing <strong>{viewingClient.current.client.displayName || viewingClient.current.client.username}</strong>'s training</span>
          <button type="button" class="font-semibold underline underline-offset-4" onclick={() => viewingClient.set(null)}>Back to mine</button>
        </div>
      {/if}
      <main class="flex-1 px-4 py-6 sm:px-8 sm:py-7">
        <div class="mx-auto w-full {isAdminPath ? 'max-w-[1280px]' : 'max-w-[1120px]'}">
          {#if isTrialCoachingAnyTier && page.url.pathname.startsWith("/coaching/links")}
            <StudioNeeded what="links" />
          {:else if isTrialCoachingAnyTier && page.url.pathname.startsWith("/coaching/payments")}
            <StudioNeeded what="payments" />
          {:else}
            {@render children?.()}
          {/if}
        </div>
      </main>
    </Sidebar.Inset>
  </Sidebar.Provider>
  <GuidePanel {walkthroughs} />
  <GuideLayer />
  <StudioModeDialog />
  <StudioFinishDialog />
{/if}
