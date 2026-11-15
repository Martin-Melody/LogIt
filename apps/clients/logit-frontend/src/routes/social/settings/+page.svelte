<script lang="ts">
  import { onMount } from "svelte";
  import { Loader2 } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import BlockedAccounts from "$lib/components/social/BlockedAccounts.svelte";
  import { discoverApi, socialApi, type ApiProfile, type SocialSettings } from "@logit/core/api/socialApi";

  // Who sees your posts, and what Discover shows you. Saved to your account, so the web
  // dashboard has the same switches.
  let settings = $state<SocialSettings | null>(null);
  let error = $state(false);
  let hidden = $state<ApiProfile[] | null>(null);
  let showHidden = $state(false);

  onMount(async () => {
    try {
      settings = await socialApi.getSettings();
    } catch {
      error = true;
    }
  });

  async function set(change: Partial<SocialSettings>) {
    if (!settings) return;
    const before = settings;
    settings = { ...settings, ...change };
    try {
      settings = await socialApi.updateSettings(change);
      if (change.isPrivate === false && before.pendingRequests > 0)
        toast.success(`${before.pendingRequests} waiting ${before.pendingRequests === 1 ? "request was" : "requests were"} accepted`);
    } catch {
      settings = before;
      toast.error("Couldn't save that. Try again.");
    }
  }

  async function openHidden() {
    showHidden = !showHidden;
    if (showHidden && hidden === null) {
      try {
        hidden = (await discoverApi.listNotInterested()).map((r) => r.user);
      } catch {
        hidden = [];
      }
    }
  }

  async function showAgain(u: ApiProfile) {
    try {
      await discoverApi.undoNotInterested(u.username);
      hidden = (hidden ?? []).filter((x) => x.id !== u.id);
      if (settings) settings = { ...settings, notInterestedCount: Math.max(0, settings.notInterestedCount - 1) };
    } catch {
      toast.error("Couldn't do that");
    }
  }
</script>

{#snippet row(label: string, help: string, checked: boolean, onchange: (v: boolean) => void, disabled = false)}
  <div class="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 {disabled ? 'opacity-60' : ''}">
    <div class="min-w-0">
      <p class="text-[15px]">{label}</p>
      <p class="mt-0.5 text-xs leading-snug text-muted-foreground">{help}</p>
    </div>
    <Switch {checked} {label} {disabled} {onchange} />
  </div>
{/snippet}

<div class="flex min-h-full flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => history.back()} />
    <h1 class="page-title">Social settings</h1>
  </PageHeader>

  {#if error}
    <p class="px-6 py-16 text-center text-sm text-muted-foreground">Couldn't load your settings. Check your connection.</p>
  {:else if !settings}
    <div class="flex justify-center py-16"><Loader2 class="h-5 w-5 animate-spin text-muted-foreground" /></div>
  {:else}
    <p class="px-4 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Privacy</p>
    {@render row("Private account", "People ask to follow you. Only followers you accept see your posts and profile cards.", settings.isPrivate, (v) => set({ isPrivate: v }))}
    {@render row("Show my posts in Discover", "People who don't follow you can find them there. Always off for a private account.", settings.showInDiscover === true && !settings.isPrivate, (v) => set({ showInDiscover: v }), settings.isPrivate)}
    {@render row("Suggest me to people", "Show your name in \"People you might know\"", !settings.hideFromSuggestions, (v) => set({ hideFromSuggestions: !v }))}

    <p class="px-4 pt-6 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Discover</p>
    {@render row("Show \"People you might know\"", "Turn back on after hiding it", !settings.hidePeopleSuggestions, (v) => set({ hidePeopleSuggestions: !v }))}
    <button type="button" class="flex w-full items-center justify-between gap-3 border-t border-border px-4 py-3 text-left" onclick={openHidden} aria-expanded={showHidden}>
      <span>
        <span class="block text-[15px]">Not interested</span>
        <span class="mt-0.5 block text-xs text-muted-foreground">{settings.notInterestedCount} {settings.notInterestedCount === 1 ? "person" : "people"} hidden from Discover</span>
      </span>
      <span class="text-muted-foreground" aria-hidden="true">{showHidden ? "⌄" : "›"}</span>
    </button>
    {#if showHidden}
      {#if hidden === null}
        <div class="flex justify-center py-4"><Loader2 class="h-4 w-4 animate-spin text-muted-foreground" /></div>
      {:else if hidden.length === 0}
        <p class="px-4 pb-3 text-xs text-muted-foreground">Nobody.</p>
      {:else}
        {#each hidden as u (u.id)}
          <div class="flex items-center justify-between gap-3 px-4 py-2">
            <span class="min-w-0 truncate text-sm">{u.displayName} <span class="text-muted-foreground">@{u.username}</span></span>
            <button type="button" class="h-9 shrink-0 rounded-md border border-border px-3 text-xs" onclick={() => showAgain(u)}>Show again</button>
          </div>
        {/each}
      {/if}
    {/if}

    <div class="px-4 pt-6">
      <BlockedAccounts />
    </div>
    <p class="px-4 pt-5 text-xs leading-relaxed text-muted-foreground">The same switches are on the web, on the Discover tab, and they apply on both.</p>
  {/if}
</div>
