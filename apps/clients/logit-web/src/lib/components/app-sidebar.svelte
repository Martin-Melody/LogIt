<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
  import ListIcon from "@lucide/svelte/icons/list";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import AppleIcon from "@lucide/svelte/icons/apple";
  import CalendarDaysIcon from "@lucide/svelte/icons/calendar-days";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import UsersIcon from "@lucide/svelte/icons/users";
  import ContactIcon from "@lucide/svelte/icons/contact";
  import MessageSquareIcon from "@lucide/svelte/icons/message-square";
  import UserRoundIcon from "@lucide/svelte/icons/user-round";
  import LogOutIcon from "@lucide/svelte/icons/log-out";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import SunIcon from "@lucide/svelte/icons/sun";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import MonitorIcon from "@lucide/svelte/icons/monitor";
  import { resetMode, setMode } from "mode-watcher";
  import Logo from "@logit/ui/Logo.svelte";
  import * as Sidebar from "$lib/components/ui/sidebar";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { useSidebar } from "$lib/components/ui/sidebar";
  import { viewingClient } from "$lib/viewingClient.svelte";
  import { isCoachingPath } from "$lib/workspace";

  let {
    isStudio = false,
    userName,
    tier,
    onLogout,
  }: { isStudio?: boolean; userName: string; tier: string; onLogout: () => void } = $props();

  const sidebar = useSidebar();

  type NavItem = { label: string; href: string; icon: typeof LayoutDashboardIcon };
  type NavGroup = { label: string | null; items: NavItem[] };

  // "Me": your own training. Pages that aren't built yet (Insights, Social, Plugins,
  // My coach) join this list as they land.
  const meGroups: NavGroup[] = [
    { label: null, items: [{ label: "Overview", href: "/", icon: LayoutDashboardIcon }] },
    {
      label: "Training",
      items: [
        { label: "Sessions", href: "/sessions", icon: ListIcon },
        { label: "Progress", href: "/progress", icon: TrendingUpIcon },
        { label: "Plan", href: "/plan", icon: CalendarDaysIcon },
      ],
    },
    {
      label: "Body",
      items: [
        { label: "Nutrition", href: "/nutrition", icon: AppleIcon },
        { label: "Habits & goals", href: "/habits", icon: CircleCheckIcon },
      ],
    },
  ];

  // "Coaching": a separate workspace, Studio accounts only. Today/Programs/Check-ins come
  // with the coaching phase; until then these are the existing coaching pages.
  const coachGroups: NavGroup[] = [
    {
      label: null,
      items: [
        { label: "Clients", href: "/clients", icon: ContactIcon },
        { label: "Roster", href: "/roster", icon: UsersIcon },
        { label: "Messages", href: "/messages", icon: MessageSquareIcon },
      ],
    },
  ];

  // Without Studio there's no Coaching workspace, but a coach can still invite you and
  // message you: those pages sit under Me until the "My coach" page replaces them.
  const clientGroup: NavGroup = {
    label: "Coach",
    items: [
      { label: "My coach", href: "/clients", icon: ContactIcon },
      { label: "Messages", href: "/messages", icon: MessageSquareIcon },
    ],
  };

  const coaching = $derived(isStudio && isCoachingPath(page.url.pathname));
  const groups = $derived(coaching ? coachGroups : isStudio ? meGroups : [...meGroups, clientGroup]);

  function isActive(href: string): boolean {
    return href === "/" ? page.url.pathname === "/" : page.url.pathname.startsWith(href);
  }

  function onNavClick() {
    if (sidebar.isMobile) sidebar.setOpenMobile(false);
  }

  function switchTo(mode: "me" | "coaching") {
    if (mode === (coaching ? "coaching" : "me")) return;
    if (mode === "me") viewingClient.set(null);
    void goto(mode === "me" ? "/" : "/clients");
    onNavClick();
  }

  function viewClientTraining(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    if (!value) return;
    viewingClient.set(value);
    void goto("/progress");
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
    {#if isStudio}
      <div role="tablist" aria-label="Workspace"
        class="grid grid-cols-2 gap-[3px] rounded-[9px] bg-sidebar-accent p-[3px] group-data-[collapsible=icon]:hidden">
        <button type="button" role="tab" aria-selected={!coaching}
          class="{segBase} {coaching ? segOff : segOn}" onclick={() => switchTo("me")}>Me</button>
        <button type="button" role="tab" aria-selected={coaching}
          class="{segBase} {coaching ? segOn : segOff}" onclick={() => switchTo("coaching")}>Coaching</button>
      </div>
    {/if}
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
                    </a>
                  {/snippet}
                </Sidebar.MenuButton>
              </Sidebar.MenuItem>
            {/each}
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      </Sidebar.Group>
    {/each}

    {#if coaching && viewingClient.clients.length > 0}
      <Sidebar.Group class="group-data-[collapsible=icon]:hidden">
        <Sidebar.GroupLabel class="uppercase tracking-wider text-[11px]">A client's training</Sidebar.GroupLabel>
        <Sidebar.GroupContent>
          <label for="client-training" class="sr-only">Open a client's training</label>
          <select id="client-training"
            class="h-9 w-full rounded-md border border-sidebar-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            value="" onchange={viewClientTraining}>
            <option value="">Choose a client…</option>
            {#each viewingClient.clients as c (c.relationshipId)}
              <option value={c.client.id}>{c.client.displayName || c.client.username}</option>
            {/each}
          </select>
        </Sidebar.GroupContent>
      </Sidebar.Group>
    {/if}
  </Sidebar.Content>

  <Sidebar.Footer>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Sidebar.MenuButton
                {...props}
                size="lg"
                class="border border-sidebar-border bg-card data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-semibold">
                  {userName.slice(0, 1).toUpperCase()}
                </div>
                <span class="flex min-w-0 flex-1 flex-col text-left leading-tight">
                  <span class="truncate text-sm font-medium">{userName}</span>
                  <span class="truncate text-xs text-muted-foreground">{tier} · Account</span>
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
