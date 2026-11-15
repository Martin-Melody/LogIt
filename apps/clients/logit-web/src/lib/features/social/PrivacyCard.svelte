<script lang="ts">
  import { toast } from "$lib/components/ui/sonner";
  import * as Dialog from "$lib/components/ui/dialog";
  import { discoverApi, socialApi, type ApiProfile, type SocialSettings } from "@logit/core/api/socialApi";
  import Avatar from "./Avatar.svelte";

  // The same switches as the phone's Social settings, saved to the account.
  let { settings = $bindable(null) }: { settings?: SocialSettings | null } = $props();

  $effect(() => {
    if (settings === null) void socialApi.getSettings().then((s) => (settings = s)).catch(() => {});
  });

  async function set(change: Partial<SocialSettings>) {
    if (!settings) return;
    const before = settings;
    settings = { ...settings, ...change };
    try {
      settings = await socialApi.updateSettings(change);
      if (change.isPrivate === false && before.pendingRequests > 0)
        toast.success(`${before.pendingRequests} waiting ${before.pendingRequests === 1 ? "request was" : "requests were"} accepted`);
    } catch (e) {
      settings = before;
      toast.error(e instanceof Error ? e.message : "Couldn't save that");
    }
  }

  let hiddenOpen = $state(false);
  let hiddenPeople = $state<ApiProfile[] | null>(null);

  async function openHidden() {
    hiddenOpen = true;
    hiddenPeople = null;
    try {
      hiddenPeople = (await discoverApi.listNotInterested()).map((r) => r.user);
    } catch {
      hiddenPeople = [];
    }
  }

  async function showAgain(u: ApiProfile) {
    try {
      await discoverApi.undoNotInterested(u.username);
      hiddenPeople = (hiddenPeople ?? []).filter((x) => x.id !== u.id);
      if (settings) settings = { ...settings, notInterestedCount: Math.max(0, settings.notInterestedCount - 1) };
    } catch {
      toast.error("Couldn't do that");
    }
  }

  type Row = { key: "isPrivate" | "showInDiscover" | "hideFromSuggestions" | "hidePeopleSuggestions"; label: string; help: string; invert?: boolean };
  const ROWS: Row[] = [
    { key: "isPrivate", label: "Private account", help: "People ask to follow you, and only followers you accept see your posts and profile cards." },
    { key: "showInDiscover", label: "Show my posts in Discover", help: "Off: only your followers see them in a feed. Always off for a private account." },
    { key: "hideFromSuggestions", label: "Suggest me to people", help: "Your name in other people's \"People you might know\".", invert: true },
    { key: "hidePeopleSuggestions", label: "Show \"People you might know\"", help: "Turn back on here after hiding it.", invert: true },
  ];
</script>

<section class="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-[18px] py-4" aria-labelledby="privacy-title">
  <h2 id="privacy-title" class="text-sm font-semibold">Privacy</h2>
  {#if settings}
    {#each ROWS as row (row.key)}
      {@const raw = settings[row.key] === true}
      {@const on = row.invert ? !raw : raw}
      {@const disabled = row.key === "showInDiscover" && settings.isPrivate}
      <label class="flex items-start gap-2.5 text-[13px] leading-snug {disabled ? 'opacity-60' : ''}">
        <input type="checkbox" checked={on && !disabled} {disabled} class="mt-0.5 size-4 accent-primary"
          onchange={(e) => set({ [row.key]: row.invert ? !e.currentTarget.checked : e.currentTarget.checked })} />
        <span>{row.label}<span class="block text-xs text-muted-foreground">{row.help}</span></span>
      </label>
    {/each}
    {#if settings.notInterestedCount > 0}
      <button type="button" onclick={openHidden} class="self-start text-xs text-muted-foreground hover:text-foreground">{settings.notInterestedCount} {settings.notInterestedCount === 1 ? "person" : "people"} hidden from Discover ›</button>
    {/if}
  {:else}
    <p class="text-xs text-muted-foreground">Loading…</p>
  {/if}
</section>

<Dialog.Root bind:open={hiddenOpen}>
  <Dialog.Content class="sm:max-w-[420px]">
    <Dialog.Header>
      <Dialog.Title>Hidden from Discover</Dialog.Title>
      <Dialog.Description>You marked these people "Not interested". You can still find them by name.</Dialog.Description>
    </Dialog.Header>
    {#if hiddenPeople === null}
      <p class="text-sm text-muted-foreground">Loading…</p>
    {:else if hiddenPeople.length === 0}
      <p class="text-sm text-muted-foreground">Nobody.</p>
    {:else}
      <div class="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {#each hiddenPeople as u (u.id)}
          <div class="flex items-center gap-2.5">
            <Avatar name={u.displayName} url={u.avatarUrl} size={30} />
            <span class="min-w-0 flex-1 truncate text-[13px]">{u.displayName} <span class="text-muted-foreground">@{u.username}</span></span>
            <button type="button" onclick={() => showAgain(u)} class="h-8 rounded-[9px] border border-border px-3 text-xs">Show again</button>
          </div>
        {/each}
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
