<!-- Ask a coach from their profile (canvas P2, K7, A4, R1). Its own page, signed in or not,
     like an invite link: people tap "Ask to be coached" on getlogit.app/@name before they have
     an account. Inside the app, a coach's profile opens the same panel in a dialog (AskDialog). -->
<script lang="ts">
  import { page } from "$app/state";
  import { apiClient } from "@logit/core/api/client";
  import AskPanel from "$lib/features/coaching/ask/AskPanel.svelte";
  import GetTheApp from "$lib/features/onboarding/GetTheApp.svelte";
  import Logo from "@logit/ui/Logo.svelte";

  const username = $derived(page.params.username ?? "");
  let sent = $state<{ relationshipId: string; waiting: boolean } | null>(null);
  let panel = $state<AskPanel | null>(null);
</script>

<svelte:head><title>{panel?.title() ?? "Ask to be coached"} · LogIt</title></svelte:head>

<header class="flex h-[52px] items-center justify-between border-b border-border px-4">
  <a href="/" class="flex items-center gap-2 text-[15px] font-bold"><Logo size={22} />LogIt</a>
  {#if apiClient.isAuthenticated()}
    <span class="truncate text-xs text-muted-foreground">Signed in as {apiClient.getUser()?.displayName || apiClient.getUser()?.username}</span>
  {/if}
</header>

<main class="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
  {#key username}
    <AskPanel bind:this={panel} {username} link={page.url.searchParams.get("l")} bind:sent />
  {/key}
  {#if sent}
    <GetTheApp title="Get LogIt on your phone">
      <span class="text-[13px] text-slate-400">Replies come as notifications, and coaching happens in the app.</span>
    </GetTheApp>
  {/if}
</main>
