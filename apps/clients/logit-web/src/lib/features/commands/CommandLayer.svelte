<script lang="ts">
  import { untrack } from "svelte";
  import { goto } from "$app/navigation";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";
  import LinkIcon from "@lucide/svelte/icons/link";
  import ArrowLeftRightIcon from "@lucide/svelte/icons/arrow-left-right";
  import KeyboardIcon from "@lucide/svelte/icons/keyboard";
  import { page } from "$app/state";
  import { apiClient } from "@logit/core/api/client";
  import * as Command from "$lib/components/ui/command";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Kbd } from "$lib/components/ui/kbd";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import { coachBadges } from "$lib/features/coaching/badges.svelte";
  import { loadCoachingOverview, type ClientSummary } from "$lib/features/coaching/coachingData";
  import { when } from "$lib/features/coaching/format";
  import { navFor, workspaceOf, type NavItem } from "$lib/nav";
  import { clientActions, commands, isTyping, modKey } from "./commands.svelte";

  // ⌘K (go + find + do), the "?" shortcuts list, and G-then-a-letter page jumps, for the
  // whole dashboard. Mounted once by the root layout for signed-in pages with the sidebar.
  let { coach }: { coach: boolean } = $props();

  const ws = $derived(workspaceOf(page.url.pathname, page.url.searchParams, coach));
  const pages = $derived<NavItem[]>(navFor(ws, apiClient.isSelfHosted()).flatMap((g) => g.items));

  let search = $state("");
  let client = $state<ClientSummary | null>(null);
  let clients = $state<ClientSummary[]>([]);

  function loadClients() {
    loadCoachingOverview()
      .then((o) => (clients = [...o.clients].sort((a, b) => (b.lastSessionAtMs ?? 0) - (a.lastSessionAtMs ?? 0))))
      .catch(() => {});
  }
  // Loaded once on the first Coaching page, so typing straight after ⌘K finds them;
  // refreshed each time it opens (the Clients page loads the same thing).
  let loadedOnce = false;
  $effect(() => {
    if (ws === "coaching" && !loadedOnce) {
      loadedOnce = true;
      untrack(loadClients);
    }
  });
  $effect(() => {
    if (!commands.palette) {
      search = "";
      client = null;
    } else if (ws === "coaching") {
      untrack(loadClients);
    }
  });

  function go(href: string) {
    commands.palette = false;
    void goto(href);
  }

  function pick(c: ClientSummary) {
    client = c;
    search = "";
  }

  function clientLine(c: ClientSummary): string {
    const bits = [c.isSample ? "Sample" : `@${c.username}`];
    if (c.sharing.workouts) {
      bits.push(c.lastSessionAtMs ? `trained ${when(c.lastSessionAtMs)}` : "no workouts yet");
      bits.push(`${c.sessions7d} this week`);
    }
    return bits.join(" · ");
  }

  // Backspace in an empty box steps back from a client's actions to everything.
  function onInputKey(e: KeyboardEvent) {
    if (e.key === "Backspace" && search === "" && client) {
      e.preventDefault();
      client = null;
    }
  }

  let gAt = 0;
  function onKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      commands.shortcuts = false;
      commands.palette = !commands.palette;
      return;
    }
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return;
    // Not on top of an open dialog, menu or sheet.
    if (commands.palette || commands.shortcuts || document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
    if (e.key === "?") {
      e.preventDefault();
      commands.shortcuts = true;
      return;
    }
    const k = e.key.toLowerCase();
    if (k === "g") {
      gAt = Date.now();
      return;
    }
    if (Date.now() - gAt < 1500) {
      gAt = 0;
      const to = pages.find((p) => p.key?.toLowerCase() === k);
      if (to) {
        e.preventDefault();
        void goto(to.href);
      }
    }
  }

  const otherWs = $derived(ws === "me" && coach ? { label: "Switch to Coaching", href: "/coaching" } : ws === "coaching" ? { label: "Switch to Me", href: "/" } : null);
</script>

<svelte:window onkeydown={onKey} />

{#snippet keys(letter: string)}
  <Command.Shortcut class="flex gap-1 tracking-normal"><Kbd>G</Kbd><Kbd>{letter}</Kbd></Command.Shortcut>
{/snippet}

<Command.Dialog bind:open={commands.palette} title="Search or jump to" description="Find a page{ws === 'coaching' ? ', a client' : ''} or something to do"
  class="top-[12vh] sm:max-w-[640px]" shouldFilter={true}>
  {#if client}
    {@const c = client}
    <div class="flex items-center gap-2 px-3 pt-3 text-[13px]">
      <span class="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pr-2.5 pl-1 font-medium"><Avatar name={c.name} url={c.avatarUrl} size={20} />{c.name}</span>
      <span class="truncate text-xs text-muted-foreground">{clientLine(c)}</span>
    </div>
  {/if}
  <Command.Input bind:value={search} onkeydown={onInputKey}
    placeholder={client ? "What do you want to do?" : ws === "coaching" ? "Search clients and pages, or type what to do" : "Search pages, or type what to do"} />
  <Command.List class="max-h-[min(60vh,520px)]">
    <Command.Empty>Nothing matches “{search}”.</Command.Empty>
    {#if client}
      <Command.Group heading="Actions">
        {#each clientActions(client) as a (a.id)}
          <Command.Item value={a.label} disabled={!!a.disabled} onSelect={() => go(a.href)} class="min-h-10">
            <span class="flex-1">{a.label}</span>
            {#if a.disabled}<Command.Shortcut class="tracking-normal">{a.disabled}</Command.Shortcut>{:else if a.id === "open"}<Command.Shortcut><Kbd>↵</Kbd></Command.Shortcut>{/if}
          </Command.Item>
        {/each}
      </Command.Group>
    {:else}
      {#if ws === "coaching" && clients.length}
        <Command.Group heading="Clients">
          {#each clients as c (c.relationshipId)}
            <Command.Item value="client {c.name} {c.username}" onSelect={() => pick(c)} class="min-h-11">
              <Avatar name={c.name} url={c.avatarUrl} size={26} />
              <span class="font-medium">{c.name}</span>
              <span class="truncate text-xs text-muted-foreground">{clientLine(c)}</span>
              <Command.Shortcut class="tracking-normal">Actions ›</Command.Shortcut>
            </Command.Item>
          {/each}
        </Command.Group>
      {/if}
      {#if ws === "coaching"}
        <Command.Group heading="Do">
          <Command.Item value="New program" onSelect={() => go("/coaching/programs?new=1")}><PlusIcon class="text-muted-foreground" />New program</Command.Item>
          <Command.Item value="Review check-ins" onSelect={() => go("/coaching/checkins")}>
            <ClipboardCheckIcon class="text-muted-foreground" />
            <span class="flex-1">Review check-ins</span>
            <Command.Shortcut class="tracking-normal">{coachBadges.checkins ? `${coachBadges.checkins} waiting` : "None waiting"}</Command.Shortcut>
          </Command.Item>
          <Command.Item value="Invite a client invite link" onSelect={() => go("/coaching/links")}><LinkIcon class="text-muted-foreground" />Invite a client</Command.Item>
        </Command.Group>
      {/if}
      <Command.Group heading="Go to">
        {#each pages as p (p.href)}
          <Command.Item value="go {p.label}" onSelect={() => go(p.href)}>
            <p.icon class="text-muted-foreground" />
            <span class="flex-1">{p.label}</span>
            {#if p.key}{@render keys(p.key)}{/if}
          </Command.Item>
        {/each}
        {#if otherWs}
          <Command.Item value={otherWs.label} onSelect={() => go(otherWs.href)}><ArrowLeftRightIcon class="text-muted-foreground" />{otherWs.label}</Command.Item>
        {/if}
        <Command.Item value="Keyboard shortcuts help" onSelect={() => { commands.palette = false; commands.shortcuts = true; }}>
          <KeyboardIcon class="text-muted-foreground" />
          <span class="flex-1">Keyboard shortcuts</span>
          <Command.Shortcut><Kbd>?</Kbd></Command.Shortcut>
        </Command.Item>
      </Command.Group>
    {/if}
  </Command.List>
  <div class="flex gap-4 border-t border-border px-3 py-2 text-xs text-muted-foreground">
    <span class="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
    <span class="flex items-center gap-1.5"><Kbd>↵</Kbd> {client ? "run" : "open"}</span>
    {#if client}<span class="flex items-center gap-1.5"><Kbd>⌫</Kbd> back</span>{/if}
    <span class="ml-auto flex items-center gap-1.5"><Kbd>Esc</Kbd> close</span>
  </div>
</Command.Dialog>

<Dialog.Root bind:open={commands.shortcuts}>
  <Dialog.Content class="sm:max-w-[600px]">
    <Dialog.Header><Dialog.Title>Keyboard shortcuts</Dialog.Title></Dialog.Header>
    <div class="grid gap-5 text-[13px] sm:grid-cols-2">
      <dl class="flex flex-col gap-2">
        <dt class="text-[11px] tracking-wider text-muted-foreground uppercase">Anywhere</dt>
        <div class="flex justify-between"><dd>Search or jump to</dd><span class="flex gap-1"><Kbd>{modKey}</Kbd><Kbd>K</Kbd></span></div>
        <div class="flex justify-between"><dd>This list</dd><Kbd>?</Kbd></div>
        <dt class="mt-2 text-[11px] tracking-wider text-muted-foreground uppercase">On a row with ⋯</dt>
        <div class="flex justify-between"><dd>Its menu</dd><span class="text-muted-foreground">Right-click</span></div>
      </dl>
      <dl class="flex flex-col gap-2">
        <dt class="text-[11px] tracking-wider text-muted-foreground uppercase">Go to</dt>
        {#each pages.filter((p) => p.key) as p (p.href)}
          <div class="flex justify-between"><dd>{p.label}</dd><span class="flex gap-1"><Kbd>G</Kbd><Kbd>{p.key}</Kbd></span></div>
        {/each}
      </dl>
    </div>
    <p class="text-xs text-muted-foreground">Keys don't work while you're typing in a box.</p>
  </Dialog.Content>
</Dialog.Root>
