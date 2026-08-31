<script lang="ts">
  import "./layout.css";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { apiClient } from "@logit/core/api/client";
  import { coachApi } from "@logit/core/api/coachApi";
  import { Spinner } from "$lib/components/ui/spinner";
  import { viewingClient } from "$lib/viewingClient.svelte";

  let { children } = $props();

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

  function onSwitcherChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    viewingClient.set(value === "" ? null : value);
  }
</script>

{#if !ready}
  <div class="flex items-center justify-center min-h-screen">
    <Spinner class="size-6 text-muted-foreground" />
  </div>
{:else if isLogin}
  {@render children?.()}
{:else if isUpgrade && apiClient.isAuthenticated()}
  {@render children?.()}
{:else if apiClient.isAuthenticated() && !isBlockedFreeTier}
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-border px-4 py-2 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-4">
        <span class="text-sm font-semibold">LogIt</span>
        <nav class="flex items-center gap-3 text-sm text-muted-foreground">
          <a href="/" class="hover:text-foreground">Overview</a>
          <a href="/nutrition" class="hover:text-foreground">Nutrition</a>
          {#if isStudio}
            <a href="/roster" class="hover:text-foreground">Roster</a>
          {/if}
          <a href="/clients" class="hover:text-foreground">Clients</a>
          <a href="/messages" class="hover:text-foreground">Messages</a>
          <a href="/account" class="hover:text-foreground">Account</a>
        </nav>
        {#if isStudio && viewingClient.clients.length > 0}
          <select
            class="text-xs rounded border border-border bg-background px-2 py-1"
            value={viewingClient.id ?? ""}
            onchange={onSwitcherChange}
          >
            <option value="">My data</option>
            {#each viewingClient.clients as c (c.relationshipId)}
              <option value={c.client.id}>{c.client.displayName || c.client.username}</option>
            {/each}
          </select>
        {/if}
      </div>
      <div class="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{apiClient.getUser()?.displayName ?? apiClient.getUser()?.username}</span>
        <button type="button" class="hover:text-foreground" onclick={logout}>Log out</button>
      </div>
    </header>
    <main class="flex-1 p-4">
      {@render children?.()}
    </main>
  </div>
{/if}
