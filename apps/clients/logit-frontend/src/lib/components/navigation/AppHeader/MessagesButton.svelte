<!-- Messages in the top bar (as Instagram's), with how many conversations are unread. Checks
     once a minute, when the app comes back to the front and on every page change. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { scale } from "svelte/transition";
  import { MessageCircle } from "lucide-svelte";
  import { page } from "$app/state";
  import { authStore } from "$lib/api/authStore.svelte";
  import { messagesUnread, refreshMessagesUnread } from "$lib/features/friends/messagesUnread.svelte";

  const href = "/messages";
  const active = $derived(page.url.pathname === href || page.url.pathname.startsWith(href + "/"));

  $effect(() => {
    void page.url.pathname;
    void refreshMessagesUnread();
  });
  onMount(() => {
    const visible = () => document.visibilityState === "visible" && void refreshMessagesUnread();
    document.addEventListener("visibilitychange", visible);
    const poll = setInterval(visible, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", visible);
      clearInterval(poll);
    };
  });
  const n = $derived(messagesUnread.count);
</script>

{#if authStore.isAuthenticated && !active}
  <a {href} class="relative -my-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    aria-label={n > 0 ? `Messages, ${n} unread` : "Messages"}>
    <MessageCircle class="h-[1.15rem] w-[1.15rem]" />
    {#if n > 0}
      <span transition:scale={{ duration: 150 }} class="absolute top-1.5 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">{n > 9 ? "9+" : n}</span>
    {/if}
  </a>
{/if}
