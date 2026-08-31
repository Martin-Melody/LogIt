<script lang="ts">
  import { page } from "$app/state";
  import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
  import AppleIcon from "@lucide/svelte/icons/apple";
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
  import * as Sidebar from "$lib/components/ui/sidebar";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { useSidebar } from "$lib/components/ui/sidebar";
  import { viewingClient } from "$lib/viewingClient.svelte";

  let {
    isStudio = false,
    userName,
    onLogout,
  }: { isStudio?: boolean; userName: string; onLogout: () => void } = $props();

  const sidebar = useSidebar();

  type NavItem = { label: string; href: string; icon: typeof LayoutDashboardIcon; show: boolean };
  const items = $derived<NavItem[]>([
    { label: "Overview", href: "/", icon: LayoutDashboardIcon, show: true },
    { label: "Nutrition", href: "/nutrition", icon: AppleIcon, show: true },
    { label: "Roster", href: "/roster", icon: UsersIcon, show: isStudio },
    { label: "Clients", href: "/clients", icon: ContactIcon, show: true },
    { label: "Messages", href: "/messages", icon: MessageSquareIcon, show: true },
  ]);

  function isActive(href: string): boolean {
    return href === "/" ? page.url.pathname === "/" : page.url.pathname.startsWith(href);
  }

  function onNavClick() {
    if (sidebar.isMobile) sidebar.setOpenMobile(false);
  }

  function onSwitcherChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    viewingClient.set(value === "" ? null : value);
  }
</script>

<Sidebar.Root collapsible="icon">
  <Sidebar.Header>
    <div class="flex items-center gap-2 px-2 py-1.5">
      <div class="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground text-xs font-bold">
        L
      </div>
      <span class="text-sm font-semibold group-data-[collapsible=icon]:hidden">LogIt</span>
    </div>
  </Sidebar.Header>

  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupLabel>Navigation</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          {#each items as item (item.href)}
            {#if item.show}
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
            {/if}
          {/each}
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>

    {#if isStudio && viewingClient.clients.length > 0}
      <Sidebar.Group class="group-data-[collapsible=icon]:hidden">
        <Sidebar.GroupLabel>Viewing</Sidebar.GroupLabel>
        <Sidebar.GroupContent>
          <select
            class="w-full rounded border border-sidebar-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            value={viewingClient.id ?? ""}
            onchange={onSwitcherChange}
          >
            <option value="">My data</option>
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
                class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div class="flex size-7 items-center justify-center rounded bg-sidebar-accent text-sidebar-accent-foreground">
                  <UserRoundIcon class="size-4" />
                </div>
                <span class="flex-1 truncate text-left">{userName}</span>
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
