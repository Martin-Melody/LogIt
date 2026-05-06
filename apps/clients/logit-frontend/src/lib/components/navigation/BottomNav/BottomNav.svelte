<script lang="ts">
  import { page } from "$app/stores";
  import { keyboard } from "$lib/stores/keybaord.store";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { authStore } from "$lib/api/authStore.svelte";
  import { House, List, Dumbbell, Rss, User, MoreHorizontal } from "lucide-svelte";
  import MoreSheet from "./MoreSheet.svelte";

  let showMore = $state(false);

  const hasSession = $derived(!!$currentSession);
  const hidden = $derived($keyboard.visible || $page.url.pathname.startsWith("/session/current"));

  function isActive(href: string) {
    if (href === "/") return $page.url.pathname === "/";
    return $page.url.pathname === href || $page.url.pathname.startsWith(href + "/");
  }
</script>

{#if !hidden}
  <nav class="flex items-end justify-around px-2 pt-0.5 pb-2" aria-label="Main navigation">

    <!-- Home -->
    <a
      href="/"
      data-tour="nav-home"
      aria-current={isActive("/") ? "page" : undefined}
      class="flex min-w-[52px] flex-col items-center gap-0.5 py-2 text-[11px] transition-colors
        {isActive('/') ? 'text-primary' : 'text-muted-foreground'}"
    >
      <House size={22} strokeWidth={isActive("/") ? 2.5 : 2} />
      <span>Home</span>
    </a>

    <!-- Sessions (offline) / Social (online) -->
    {#if authStore.isAuthenticated}
      <a
        href="/social"
        aria-current={isActive("/social") ? "page" : undefined}
        class="flex min-w-[52px] flex-col items-center gap-0.5 py-2 text-[11px] transition-colors
          {isActive('/social') ? 'text-primary' : 'text-muted-foreground'}"
      >
        <Rss size={22} strokeWidth={isActive("/social") ? 2.5 : 2} />
        <span>Social</span>
      </a>
    {:else}
      <a
        href="/sessions"
        data-tour="nav-sessions"
        aria-current={isActive("/sessions") ? "page" : undefined}
        class="flex min-w-[52px] flex-col items-center gap-0.5 py-2 text-[11px] transition-colors
          {isActive('/sessions') ? 'text-primary' : 'text-muted-foreground'}"
      >
        <List size={22} strokeWidth={isActive("/sessions") ? 2.5 : 2} />
        <span>Sessions</span>
      </a>
    {/if}

    <!-- FAB: Start / Resume session -->
    <a
      href="/session/current"
      aria-label={hasSession ? "Resume session" : "Start session"}
      class="relative flex -mt-4 flex-col items-center px-1 text-[11px]"
    >
      <div class="relative">
        {#if hasSession}
          <!-- Active session pulse ring -->
          <span class="absolute inset-0 rounded-full bg-primary opacity-20 animate-ping"></span>
          <!-- Green dot indicator -->
          <span class="absolute -top-0.5 -right-0.5 z-10 h-3 w-3 rounded-full border-2 border-background bg-green-500"></span>
        {/if}
        <div class="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
          <Dumbbell size={22} strokeWidth={2} />
        </div>
      </div>
      <span class="mt-1 text-muted-foreground">{hasSession ? "Resume" : "Start"}</span>
    </a>

    <!-- Profile -->
    <a
      href="/profile"
      data-tour="nav-profile"
      aria-current={isActive("/profile") ? "page" : undefined}
      class="flex min-w-[52px] flex-col items-center gap-0.5 py-2 text-[11px] transition-colors
        {isActive('/profile') ? 'text-primary' : 'text-muted-foreground'}"
    >
      <User size={22} strokeWidth={isActive("/profile") ? 2.5 : 2} />
      <span>Profile</span>
    </a>

    <!-- More -->
    <button
      type="button"
      data-tour="nav-more"
      class="flex min-w-[52px] flex-col items-center gap-0.5 py-2 text-[11px] transition-colors
        {showMore ? 'text-primary' : 'text-muted-foreground'}"
      onclick={() => (showMore = true)}
    >
      <MoreHorizontal size={22} strokeWidth={showMore ? 2.5 : 2} />
      <span>More</span>
    </button>

  </nav>

  <MoreSheet open={showMore} onclose={() => (showMore = false)} />
{/if}
