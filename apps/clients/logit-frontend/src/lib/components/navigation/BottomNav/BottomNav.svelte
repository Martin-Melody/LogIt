<script lang="ts">
  import { page } from "$app/stores";
  import { keyboard } from "$lib/stores/keybaord.store";
  import { overlayOpen } from "$lib/stores/overlay.store";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { authStore } from "$lib/api/authStore.svelte";
  import { Dumbbell, MoreHorizontal } from "lucide-svelte";
  import { navConfig, NAV_ITEM_DEFS } from "$lib/stores/navConfig.store";
  import { unreadNotifications } from "$lib/stores/notifications.store";
  import MoreSheet from "./MoreSheet.svelte";

  let showMore = $state(false);

  const hasSession = $derived(!!$currentSession);
  const hidden = $derived($keyboard.visible || $overlayOpen || $page.url.pathname.startsWith("/session/current"));

  // Filter bar items by auth availability
  const visibleBar = $derived(
    $navConfig.bar
      .map((id) => NAV_ITEM_DEFS.find((d) => d.id === id))
      .filter((d): d is NonNullable<typeof d> =>
        !!d && (!d.authRequired || authStore.isAuthenticated)
      )
  );

  function isActive(href: string) {
    if (href === "/") return $page.url.pathname === "/";
    return $page.url.pathname === href || $page.url.pathname.startsWith(href + "/");
  }
</script>

{#snippet barItem(item: NonNullable<(typeof visibleBar)[number]>)}
  <a
    href={item.href}
    data-tour={item.tourId}
    aria-current={isActive(item.href) ? "page" : undefined}
    class="relative flex min-w-[52px] flex-col items-center gap-0.5 py-2 text-[11px] transition-colors
      {isActive(item.href) ? 'text-primary' : 'text-muted-foreground'}"
  >
    <item.icon size={22} strokeWidth={isActive(item.href) ? 2.5 : 2} />
    {#if item.id === "social" && $unreadNotifications > 0}
      <span class="absolute top-1 right-2 h-2 w-2 rounded-full bg-rose-500 border border-background"></span>
    {/if}
    <span>{item.label}</span>
  </a>
{/snippet}

{#if !hidden}
  <nav class="flex items-end justify-around px-2 pt-0.5 pb-2" aria-label="Main navigation">

    <!-- Left bar slots (indices 0 and 1) -->
    {#each visibleBar.slice(0, 2) as item}
      {@render barItem(item)}
    {/each}

    <!-- FAB: Start / Resume session (fixed center) -->
    <a
      href="/session/current"
      aria-label={hasSession ? "Resume session" : "Start session"}
      class="relative flex -mt-4 flex-col items-center px-1 text-[11px]"
    >
      <div class="relative">
        {#if hasSession}
          <span class="absolute inset-0 rounded-full bg-primary opacity-20 animate-ping"></span>
          <span class="absolute -top-0.5 -right-0.5 z-10 h-3 w-3 rounded-full border-2 border-background bg-green-500"></span>
        {/if}
        <div class="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
          <Dumbbell size={22} strokeWidth={2} />
        </div>
      </div>
      <span class="mt-1 text-muted-foreground">{hasSession ? "Resume" : "Start"}</span>
    </a>

    <!-- Right bar slot (index 2) -->
    {#if visibleBar[2]}
      {@render barItem(visibleBar[2])}
    {/if}

    <!-- More (fixed rightmost) -->
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
