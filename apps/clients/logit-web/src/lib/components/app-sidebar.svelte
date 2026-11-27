<script lang="ts">
  import { Switch } from "$lib/components/ui/switch";
  import { practice, sandbox } from "$lib/features/guide/sandbox.svelte";
  import { photoSrc } from "@logit/core/api/photosApi";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import UserRoundIcon from "@lucide/svelte/icons/user-round";
  import LogOutIcon from "@lucide/svelte/icons/log-out";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import SunIcon from "@lucide/svelte/icons/sun";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import MonitorIcon from "@lucide/svelte/icons/monitor";
  import CompassIcon from "@lucide/svelte/icons/compass";
  import BookOpenIcon from "@lucide/svelte/icons/book-open";
  import ShieldIcon from "@lucide/svelte/icons/shield";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import { adminState } from "$lib/features/admin/adminState.svelte";
  import { guide, walkthroughsFor, chaptersOf } from "$lib/features/guide/guide.svelte";
  import { docsUrl } from "$lib/features/guide/docs";
  import { apiClient } from "@logit/core/api/client";
  import { resetMode, setMode } from "mode-watcher";
  import Logo from "@logit/ui/Logo.svelte";
  import * as Sidebar from "$lib/components/ui/sidebar";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { useSidebar } from "$lib/components/ui/sidebar";
  import { viewingClient } from "$lib/viewingClient.svelte";
  import { isCoachingPath } from "$lib/workspace";
  import { adminNav, clientGroup, coachGroups, meGroups } from "$lib/nav";
  import SearchIcon from "@lucide/svelte/icons/search";
  import { Kbd } from "$lib/components/ui/kbd";
  import { commands, modKey } from "$lib/features/commands/commands.svelte";
  import { coachBadges } from "$lib/features/coaching/badges.svelte";

  let {
    isStudio = false,
    userName,
    userAvatar = null,
    tier,
    onLogout,
  }: { isStudio?: boolean; userName: string; userAvatar?: string | null; tier: string; onLogout: () => void } = $props();

  const sidebar = useSidebar();

  // "3 of 8" on the Guide button: chapters done across this plan's walkthroughs.
  const guideCount = $derived.by(() => {
    const ws = walkthroughsFor(tier, apiClient.isSelfHosted());
    const total = ws.reduce((n, w) => n + chaptersOf(w).length, 0);
    const done = ws.reduce((n, w) => n + guide.doneCount(w), 0);
    return total > 0 && done < total ? `${done} of ${total}` : null;
  });

  const adminGroups = $derived(adminNav(apiClient.isSelfHosted()));

  const admin = $derived(page.url.pathname === "/admin" || page.url.pathname.startsWith("/admin/"));
  const coaching = $derived(!admin && isStudio && isCoachingPath(page.url.pathname, page.url.searchParams));
  const groups = $derived(admin ? adminGroups : coaching ? coachGroups : [...meGroups, clientGroup]);
  const serverHost = $derived.by(() => {
    try { return new URL(apiClient.getBaseUrl()).host; } catch { return ""; }
  });

  // The longest matching href wins, so /coaching/programs doesn't also light up Today.
  const allHrefs = $derived(groups.flatMap((g) => g.items.map((i) => i.href)));
  function isActive(href: string): boolean {
    const p = page.url.pathname;
    const matches = (h: string) => (h === "/" ? p === "/" : p === h || p.startsWith(h + "/"));
    if (!matches(href)) return false;
    return !allHrefs.some((h) => h.length > href.length && matches(h));
  }

  function onNavClick() {
    if (sidebar.isMobile) sidebar.setOpenMobile(false);
  }

  function switchTo(mode: "me" | "coaching") {
    if (mode === (coaching ? "coaching" : "me")) return;
    if (mode === "me") viewingClient.set(null);
    void goto(mode === "me" ? "/" : "/coaching");
    onNavClick();
  }


  const segBase = "h-[30px] rounded-[7px] text-xs transition-colors";
  const segOn = "bg-primary text-primary-foreground font-semibold";
  const segOff = "text-sidebar-foreground/70 hover:text-sidebar-foreground";
</script>

<Sidebar.Root collapsible="icon">
  <Sidebar.Header class="gap-2">
    <a href="/" class="flex items-center gap-2.5 px-2 pt-1.5 pb-1" onclick={onNavClick}>
      <Logo size={24} />
      <span class="text-base font-bold tracking-tight group-data-[collapsible=icon]:hidden">LogIt</span>
    </a>
    {#if admin}
      <div class="flex flex-col gap-1 px-2 group-data-[collapsible=icon]:hidden">
        <span class="flex items-center gap-1.5 text-sm font-semibold"><ShieldIcon class="size-4" />Admin</span>
        <span class="truncate text-xs text-muted-foreground">{serverHost}</span>
      </div>
    {:else if isStudio}
      <div role="tablist" aria-label="Workspace"
        class="grid grid-cols-2 gap-[3px] rounded-[9px] bg-sidebar-accent p-[3px] group-data-[collapsible=icon]:hidden">
        <button type="button" role="tab" aria-selected={!coaching}
          class="{segBase} {coaching ? segOff : segOn}" onclick={() => switchTo("me")}>Me</button>
        <button type="button" role="tab" aria-selected={coaching}
          class="{segBase} {coaching ? segOn : segOff}" onclick={() => switchTo("coaching")}>{!coaching && coachBadges.today > 0 ? `Coaching · ${coachBadges.today}` : "Coaching"}</button>
      </div>
    {/if}
    <button type="button" onclick={() => { commands.palette = true; onNavClick(); }}
      class="flex h-9 items-center gap-2 rounded-lg border border-sidebar-border bg-background px-2.5 text-left text-[13px] text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:hidden">
      <SearchIcon class="size-4" />
      <span class="flex-1 truncate">{admin ? "Find a person or page…" : "Search or jump to…"}</span>
      <Kbd>{modKey} K</Kbd>
    </button>
  </Sidebar.Header>

  <Sidebar.Content>
    {#each groups as group, gi (gi)}
      <Sidebar.Group class="py-1">
        {#if group.label}<Sidebar.GroupLabel class="uppercase tracking-wider text-[11px]">{group.label}</Sidebar.GroupLabel>{/if}
        <Sidebar.GroupContent>
          <Sidebar.Menu>
            {#each group.items as item (item.href)}
              <Sidebar.MenuItem>
                <Sidebar.MenuButton isActive={isActive(item.href)} tooltipContent={item.label}>
                  {#snippet child({ props })}
                    <a href={item.href} onclick={onNavClick} {...props}>
                      <item.icon />
                      <span>{item.label}</span>
                      {#if (item.badge?.() ?? 0) > 0}
                        <span class="ml-auto rounded-full bg-primary px-[7px] py-px text-[11px] font-semibold text-primary-foreground group-data-[collapsible=icon]:hidden">{item.badge?.()}</span>
                      {/if}
                    </a>
                  {/snippet}
                </Sidebar.MenuButton>
              </Sidebar.MenuItem>
            {/each}
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      </Sidebar.Group>
    {/each}

  </Sidebar.Content>

  <Sidebar.Footer>
    {#if coaching && sandbox.on}
      <!-- Practice view (V1): show only the sample clients. Locked on while trying Studio. -->
      <label class="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 group-data-[collapsible=icon]:hidden">
        <span class="flex flex-col">
          <span class="text-[13px] font-medium">Practice view</span>
          <span class="text-[11px] text-muted-foreground">{practice.locked ? "Studio, then real clients" : "Sample clients only"}</span>
        </span>
        <Switch checked={practice.on} disabled={practice.locked} onCheckedChange={(v) => practice.set(v)} aria-label="Practice view" />
      </label>
    {/if}
    <Sidebar.Menu>
      {#if admin}
        <Sidebar.MenuItem>
          <Sidebar.MenuButton tooltipContent="Back to my training">
            {#snippet child({ props })}
              <a href="/" onclick={onNavClick} {...props}>
                <ArrowLeftIcon />
                <span>Back to my training</span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      {/if}
      <Sidebar.MenuItem>
        <Sidebar.MenuButton tooltipContent="Guide" onclick={() => { guide.panelOpen = true; onNavClick(); }}>
          {#snippet child({ props })}
            <button type="button" data-guide="sidebar-guide" {...props}>
              <CompassIcon />
              <span>Guide</span>
              {#if guideCount}
                <span class="ml-auto rounded-full bg-primary px-[7px] py-px text-[11px] font-semibold text-primary-foreground group-data-[collapsible=icon]:hidden">{guideCount}</span>
              {/if}
            </button>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton tooltipContent="Help and docs">
          {#snippet child({ props })}
            <a href={docsUrl()} target="_blank" rel="noopener" {...props}>
              <BookOpenIcon />
              <span>Help and docs</span>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
      <Sidebar.MenuItem>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Sidebar.MenuButton
                {...props}
                size="lg"
                class="border border-sidebar-border bg-card data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                {#if userAvatar}
                  <img src={photoSrc(userAvatar)} alt="" class="size-8 shrink-0 rounded-full object-cover" />
                {:else}
                  <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-semibold">
                    {userName.slice(0, 1).toUpperCase()}
                  </div>
                {/if}
                <span class="flex min-w-0 flex-1 flex-col text-left leading-tight">
                  <span class="truncate text-sm font-medium">{userName}</span>
                  <span class="truncate text-xs text-muted-foreground">{apiClient.isSelfHosted() ? "Own server" : tier} · Account</span>
                </span>
                <ChevronsUpDownIcon class="size-4" />
              </Sidebar.MenuButton>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            side={sidebar.isMobile ? "bottom" : "right"}
            align="end"
            class="w-[--bits-dropdown-menu-anchor-width] min-w-56"
          >
            <DropdownMenu.Label class="truncate font-normal text-muted-foreground">{userName}</DropdownMenu.Label>
            <DropdownMenu.Separator />
            <DropdownMenu.Item>
              {#snippet child({ props })}
                <a href="/account" onclick={onNavClick} {...props}>
                  <UserRoundIcon class="size-4" />
                  Account
                </a>
              {/snippet}
            </DropdownMenu.Item>
            {#if adminState.isAdmin && !admin}
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <!-- A full page load: on getlogit.app Cloudflare asks for its sign-in first. -->
                  <a href="/admin" data-sveltekit-reload onclick={onNavClick} {...props}>
                    <ShieldIcon class="size-4" />
                    Admin
                  </a>
                {/snippet}
              </DropdownMenu.Item>
            {/if}
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger>
                <SunIcon class="size-4 dark:hidden" />
                <MoonIcon class="hidden size-4 dark:block" />
                Theme
              </DropdownMenu.SubTrigger>
              <DropdownMenu.SubContent>
                <DropdownMenu.Item onclick={() => setMode("light")}>
                  <SunIcon class="size-4" /> Light
                </DropdownMenu.Item>
                <DropdownMenu.Item onclick={() => setMode("dark")}>
                  <MoonIcon class="size-4" /> Dark
                </DropdownMenu.Item>
                <DropdownMenu.Item onclick={() => resetMode()}>
                  <MonitorIcon class="size-4" /> System
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Sub>
            <DropdownMenu.Separator />
            <DropdownMenu.Item onclick={onLogout}>
              <LogOutIcon class="size-4" />
              Log out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Footer>
  <Sidebar.Rail />
</Sidebar.Root>
