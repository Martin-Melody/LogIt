<script lang="ts">
  import { toast } from "$lib/components/ui/sonner";
  import * as Dialog from "$lib/components/ui/dialog";
  import { discoverApi, socialApi, type ApiProfile, type SocialSettings } from "@logit/core/api/socialApi";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import Avatar from "./Avatar.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox";

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

  // Closed until you want it: the one line says how you're set up.
  let open = $state(false);
  const summary = $derived(
    !settings ? "" : settings.isPrivate ? "Private account" : settings.showInDiscover === true ? "Public · in Discover" : "Public · not in Discover",
  );

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
    { key: "isPrivate", label: "Private account", help: "Off: anyone can see your profile and posts, in LogIt and on the web at getlogit.app, and find them on Google. On: people ask to follow you, only followers you accept see your posts, and nothing is on the web." },
    { key: "showInDiscover", label: "Show my posts in Discover", help: "Off: only your followers see them in a feed. Always off for a private account." },
    { key: "hideFromSuggestions", label: "Suggest me to people", help: "Your name in other people's \"People you might know\".", invert: true },
    { key: "hidePeopleSuggestions", label: "Show \"People you might know\"", help: "Turn back on here after hiding it.", invert: true },
  ];
</script>

<section data-guide="social-privacy" class="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-[18px] py-3.5">
  <h2 class="m-0">
    <button type="button" onclick={() => (open = !open)} aria-expanded={open} aria-controls="privacy-body"
      class="flex w-full items-center justify-between gap-2 text-left">
      <span>
        <span class="block text-sm font-semibold">Privacy, suggestions and messages</span>
        {#if summary}<span class="block text-xs font-normal text-muted-foreground">{summary}</span>{/if}
      </span>
      <ChevronDownIcon class="size-4 shrink-0 text-muted-foreground transition-transform {open ? 'rotate-180' : ''}" />
    </button>
  </h2>
  {#if !open}
    <!-- collapsed -->
  {:else if settings}
    <div id="privacy-body" class="contents">
    {#each ROWS as row (row.key)}
      {@const raw = settings[row.key] === true}
      {@const on = row.invert ? !raw : raw}
      {@const disabled = row.key === "showInDiscover" && settings.isPrivate}
      <label class="flex items-start gap-2.5 text-[13px] leading-snug {disabled ? 'opacity-60' : ''}">
        <Checkbox checked={on && !disabled} {disabled} class="mt-0.5"
          onCheckedChange={(v) => set({ [row.key]: row.invert ? v !== true : v === true })} />
        <span>{row.label}<span class="block text-xs text-muted-foreground">{row.help}</span></span>
      </label>
    {/each}
    <!-- Message controls (the phone's Privacy › Messages): two choices each, as one segmented pair. -->
    {#snippet pair(label: string, help: string, value: string, options: [string, string][], onpick: (v: string) => void)}
      <div class="flex flex-col gap-1.5 text-[13px] leading-snug">
        <span>{label}<span class="block text-xs text-muted-foreground">{help}</span></span>
        <div class="flex gap-1 self-start rounded-[9px] bg-muted p-0.5" role="radiogroup" aria-label={label}>
          {#each options as [v, text] (v)}
            <button type="button" role="radio" aria-checked={value === v} onclick={() => onpick(v)}
              class="h-7 rounded-[7px] px-2.5 text-xs font-medium {value === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}">{text}</button>
          {/each}
        </div>
      </div>
    {/snippet}
    <span class="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Messages</span>
    {@render pair("People who follow you", "People you follow always reach your chats.", settings.dmFromFollowers, [["Chats", "Straight to chats"], ["Requests", "Message requests"]], (v) => set({ dmFromFollowers: v as SocialSettings["dmFromFollowers"] }))}
    {@render pair("Everyone else", "Group members you don't follow count as everyone else.", settings.dmFromOthers, [["Requests", "Message requests"], ["Off", "Don't receive"]], (v) => set({ dmFromOthers: v as SocialSettings["dmFromOthers"] }))}
    <label class="flex items-start gap-2.5 text-[13px] leading-snug">
      <Checkbox checked={settings.showReadReceipts} class="mt-0.5" onCheckedChange={(v) => set({ showReadReceipts: v === true })} />
      <span>Show when you've read a message<span class="block text-xs text-muted-foreground">Off, and you won't see when others have read yours either.</span></span>
    </label>
    {#if settings.notInterestedCount > 0}
      <button type="button" onclick={openHidden} class="self-start text-xs text-muted-foreground hover:text-foreground">{settings.notInterestedCount} {settings.notInterestedCount === 1 ? "person" : "people"} hidden from Discover ›</button>
    {/if}
    </div>
  {:else}
    <p id="privacy-body" class="text-xs text-muted-foreground">Loading…</p>
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
