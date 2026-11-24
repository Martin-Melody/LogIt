<!-- Settings › Privacy (friends overhaul, design canvas P1): one place for who sees you and who
     can reach you. Saved to your account, so the web dashboard has the same switches. Rows for
     messages, comments, mentions and boards arrive with those features. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { ChevronRight, Loader2 } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import SettingsPage from "$lib/features/settings/SettingsPage.svelte";
  import SettingsSection, { settingRow } from "$lib/features/settings/SettingsSection.svelte";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import BlockedAccounts from "$lib/components/social/BlockedAccounts.svelte";
  import { reveal } from "$lib/transitions";
  import { discoverApi, socialApi, type ApiProfile, type SocialSettings } from "@logit/core/api/socialApi";

  let settings = $state<SocialSettings | null>(null);
  let error = $state(false);
  let hidden = $state<ApiProfile[] | null>(null);
  let showHidden = $state(false);

  async function load() {
    try {
      settings = await socialApi.getSettings();
      error = false;
    } catch {
      error = true;
    }
  }
  onMount(load);

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

  const link = `${settingRow} w-full text-left text-inherit no-underline hover:bg-muted/40`;
</script>

{#snippet toggle(id: string, label: string, help: string, checked: boolean, onchange: (v: boolean) => void, disabled = false)}
  <div {id} class="{settingRow} {disabled ? 'opacity-60' : ''}">
    <span class="flex flex-1 flex-col gap-0.5">
      <span class="text-[15px] font-medium">{label}</span>
      <span class="text-[13px] leading-snug text-muted-foreground">{help}</span>
    </span>
    <Switch {checked} {label} {disabled} {onchange} />
  </div>
{/snippet}

<SettingsPage title="Privacy">
  {#if error}
    <p class="px-1 text-sm text-muted-foreground">Couldn't load your settings. <button type="button" class="font-medium text-foreground underline underline-offset-4" onclick={load}>Try again</button></p>
  {:else if !settings}
    <div class="flex justify-center py-16"><Loader2 class="size-5 animate-spin text-muted-foreground" /></div>
  {:else}
    <SettingsSection title="Account">
      {@render toggle("private", "Private account", "People ask to follow you. Only followers you accept see your posts and profile.", settings.isPrivate, (v) => set({ isPrivate: v }))}
    </SettingsSection>

    <SettingsSection title="Who can reach you">
      <a href="/settings/privacy/training" class={link}>
        <span class="flex-1 text-[15px] font-medium">Training now and cheers</span>
        <span class="flex items-center gap-1.5 text-sm text-muted-foreground">{settings.showTraining ? "Showing" : "Off"}<ChevronRight class="size-4" /></span>
      </a>
    </SettingsSection>

    <SettingsSection title="Discover">
      {@render toggle("discover", "Show my posts in Discover", "People who don't follow you can find them there. Always off for a private account.", settings.showInDiscover === true && !settings.isPrivate, (v) => set({ showInDiscover: v }), settings.isPrivate)}
      {@render toggle("suggest-me", "Suggest me to people", "Show your name in \"People you might know\"", !settings.hideFromSuggestions, (v) => set({ hideFromSuggestions: !v }))}
      {@render toggle("people-you-might-know", "Show \"People you might know\"", "Turn back on after hiding it", !settings.hidePeopleSuggestions, (v) => set({ hidePeopleSuggestions: !v }))}
      <button type="button" class={link} onclick={openHidden} aria-expanded={showHidden}>
        <span class="flex flex-1 flex-col gap-0.5">
          <span class="text-[15px] font-medium">Not interested</span>
          <span class="text-[13px] text-muted-foreground">{settings.notInterestedCount} {settings.notInterestedCount === 1 ? "person" : "people"} hidden from Discover</span>
        </span>
        <ChevronRight class="size-4 text-muted-foreground transition-transform {showHidden ? 'rotate-90' : ''}" />
      </button>
      {#if showHidden}
        <div transition:reveal>
          {#if hidden === null}
            <div class="flex justify-center py-4"><Loader2 class="size-4 animate-spin text-muted-foreground" /></div>
          {:else if hidden.length === 0}
            <p class="px-3 pb-3 text-[13px] text-muted-foreground">Nobody.</p>
          {:else}
            {#each hidden as u (u.id)}
              <div class="flex items-center justify-between gap-3 px-3 py-2">
                <span class="min-w-0 truncate text-sm">{u.displayName} <span class="text-muted-foreground">@{u.username}</span></span>
                <button type="button" class="h-9 shrink-0 rounded-md border border-border px-3 text-xs" onclick={() => showAgain(u)}>Show again</button>
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    </SettingsSection>

    <BlockedAccounts />
    <p class="px-1 text-[13px] leading-snug text-muted-foreground">What your profile shows (workouts, records, body stats, progress photo) is in Profile › Customise. The same switches are on the web and apply on both.</p>
  {/if}
</SettingsPage>
