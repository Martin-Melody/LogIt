<script lang="ts">
  import { Bell } from "lucide-svelte";
  import { page } from "$app/state";
  import { unreadNotifications } from "$lib/stores/notifications.store";
  import { localUnread } from "$lib/features/inbox/localInbox";

  // Shown signed out too: the inbox also holds the device's own notifications (PRs,
  // progression changes). The badge counts social (server) plus local unread.
  const href = "/inbox";
  const active = $derived(page.url.pathname === href);
  const unread = $derived($unreadNotifications + $localUnread);
</script>

{#if !active}
  <a
    {href}
    class="relative -mr-1.5 -my-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
    data-tour="header-bell"
  >
    <Bell class="h-[1.15rem] w-[1.15rem]" />
    {#if unread > 0}
      <span
        class="absolute top-1.5 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white"
      >
        {unread > 9 ? "9+" : unread}
      </span>
    {/if}
  </a>
{/if}
