<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
  import ListIcon from "@lucide/svelte/icons/list";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import AppleIcon from "@lucide/svelte/icons/apple";
  import CalendarDaysIcon from "@lucide/svelte/icons/calendar-days";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import LibraryIcon from "@lucide/svelte/icons/library";
  import SunriseIcon from "@lucide/svelte/icons/sunrise";
  import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
  import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";
  import LinkIcon from "@lucide/svelte/icons/link";
  import WalletIcon from "@lucide/svelte/icons/wallet";
  import ContactIcon from "@lucide/svelte/icons/contact";
  import MessageSquareIcon from "@lucide/svelte/icons/message-square";
  import UserRoundIcon from "@lucide/svelte/icons/user-round";
  import UsersRoundIcon from "@lucide/svelte/icons/users-round";
  import PuzzleIcon from "@lucide/svelte/icons/puzzle";
  import LightbulbIcon from "@lucide/svelte/icons/lightbulb";
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
  import { coachBadges } from "$lib/features/coaching/badges.svelte";
  import { socialBadge } from "$lib/features/social/socialData.svelte";

  let {
    isStudio = false,
    userName,
    tier,
    onLogout,
  }: { isStudio?: boolean; userName: string; tier: string; onLogout: () => void } = $props();

  const sidebar = useSidebar();

  type NavItem = { label: string; href: string; icon: typeof LayoutDashboardIcon; badge?: () => number };
  type NavGroup = { label: string | null; items: NavItem[] };

  // "Me": your own training.
  const meGroups: NavGroup[] = [
    { label: null, items: [{ label: "Overview", href: "/", icon: LayoutDashboardIcon }] },
    {
      label: "Training",
      items: [
        { label: "Sessions", href: "/sessions", icon: ListIcon },
        { label: "Progress", href: "/progress", icon: TrendingUpIcon },
        { label: "Plan", href: "/plan", icon: CalendarDaysIcon },
        { label: "Library", href: "/library", icon: LibraryIcon },
      ],
    },
    {
      label: "Body",
      items: [
        { label: "Nutrition", href: "/nutrition", icon: AppleIcon },
        { label: "Habits & goals", href: "/habits", icon: CircleCheckIcon },
      ],
    },
    {
      label: "People",
      items: [{ label: "Social", href: "/social", icon: UsersRoundIcon, badge: () => socialBadge.count }],
    },
    {
      label: "Extras",
      items: [
        { label: "Insights", href: "/insights", icon: LightbulbIcon },
        { label: "Plugins", href: "/plugins", icon: PuzzleIcon },
      ],
    },
  ];

  // "Coaching": a separate workspace, Studio accounts only.
  const coachGroups: NavGroup[] = [
    {
      label: null,
      items: [
        { label: "Today", href: "/coaching", icon: SunriseIcon, badge: () => coachBadges.today },
        { label: "Clients", href: "/clients", icon: ContactIcon },
        { label: "Programs", href: "/coaching/programs", icon: ClipboardListIcon },
        { label: "Library", href: "/coaching/library", icon: LibraryIcon },
        { label: "Check-ins", href: "/coaching/checkins", icon: ClipboardCheckIcon, badge: () => coachBadges.checkins },
        { label: "Messages", href: "/messages", icon: MessageSquareIcon, badge: () => coachBadges.messages },
      ],
    },
    {
      label: "Studio",
      items: [
        { label: "Invite links", href: "/coaching/links", icon: LinkIcon, badge: () => coachBadges.links },
        { label: "Payments", href: "/coaching/payments", icon: WalletIcon, badge: () => coachBadges.payments },
      ],
    },
  ];

  // Your own coach (if you have one): program, messages, check-ins and what they can see.
  const clientGroup: NavGroup = {
    label: "Coach",
    items: [{ label: "My coach", href: "/my-coach", icon: UserRoundIcon, badge: () => coachBadges.myCoach }],
  };

  const coaching = $derived(isStudio && isCoachingPath(page.url.pathname, page.url.searchParams));
  const groups = $derived(coaching ? coachGroups : [...meGroups, clientGroup]);

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
          class="{segBase} {coaching ? segOn : segOff}" onclick={() => switchTo("coaching")}>{!coaching && coachBadges.today > 0 ? `Coaching · ${coachBadges.today}` : "Coaching"}</button>
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
