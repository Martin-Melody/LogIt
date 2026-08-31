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

  let { children } = $props();

  const PAGE_TITLES: Record<string, string> = {
    "/": "Overview",
    "/nutrition": "Nutrition",
    "/roster": "Roster",
    "/clients": "Clients",
    "/messages": "Messages",
    "/account": "Account",
    "/exercises": "Exercise",
  };
  const pageTitle = $derived.by(() => {
    const p = page.url.pathname;
    const key = Object.keys(PAGE_TITLES).find((k) => (k === "/" ? p === "/" : p.startsWith(k)));
    return key ? PAGE_TITLES[key] : "LogIt";
  });

  let ready = $state(false);

  const isLogin = $derived(
    page.url.pathname.startsWith("/login") ||
    page.url.pathname.startsWith("/forgot-password") ||
    page.url.pathname.startsWith("/reset-password"),
  );
  const isUpgrade = $derived(page.url.pathname.startsWith("/upgrade"));

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
      if (!isLogin) await goto("/login");
      return;
    }
    if (isBlockedFreeTier) {
      if (!isUpgrade) await goto("/upgrade");
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
{:else if apiClient.isAuthenticated() && !isBlockedFreeTier}
  <Sidebar.Provider>
    <AppSidebar
      {isStudio}
      userName={apiClient.getUser()?.displayName ?? apiClient.getUser()?.username ?? "Account"}
      onLogout={logout}
    />
    <Sidebar.Inset>
      <header class="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <Sidebar.Trigger class="-ml-1" />
        <span class="text-sm font-medium">{pageTitle}</span>
      </header>
      <main class="flex-1 p-4">
        {@render children?.()}
      </main>
    </Sidebar.Inset>
  </Sidebar.Provider>
{/if}
