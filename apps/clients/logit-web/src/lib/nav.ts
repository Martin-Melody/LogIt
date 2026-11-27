import AppleIcon from "@lucide/svelte/icons/apple";
import CalendarDaysIcon from "@lucide/svelte/icons/calendar-days";
import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";
import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
import CompassIcon from "@lucide/svelte/icons/compass";
import ContactIcon from "@lucide/svelte/icons/contact";
import FlagIcon from "@lucide/svelte/icons/flag";
import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
import LibraryIcon from "@lucide/svelte/icons/library";
import LightbulbIcon from "@lucide/svelte/icons/lightbulb";
import LinkIcon from "@lucide/svelte/icons/link";
import ListIcon from "@lucide/svelte/icons/list";
import MessageCircleIcon from "@lucide/svelte/icons/message-circle";
import MessageSquareIcon from "@lucide/svelte/icons/message-square";
import PuzzleIcon from "@lucide/svelte/icons/puzzle";
import ServerIcon from "@lucide/svelte/icons/server";
import StethoscopeIcon from "@lucide/svelte/icons/stethoscope";
import SunriseIcon from "@lucide/svelte/icons/sunrise";
import TicketIcon from "@lucide/svelte/icons/ticket";
import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
import UserRoundIcon from "@lucide/svelte/icons/user-round";
import UsersRoundIcon from "@lucide/svelte/icons/users-round";
import WalletIcon from "@lucide/svelte/icons/wallet";
import { isCoachingPath } from "$lib/workspace";
import { adminState } from "$lib/features/admin/adminState.svelte";
import { coachBadges } from "$lib/features/coaching/badges.svelte";
import IdCardIcon from "@lucide/svelte/icons/id-card";
import { dmBadge, socialBadge } from "$lib/features/social/socialData.svelte";

// The dashboard's pages, per workspace: the sidebar draws them, and ⌘K and the G-key
// shortcuts (key: G then this letter) use the same list.
export type NavItem = { label: string; href: string; icon: typeof LayoutDashboardIcon; badge?: () => number; key?: string };
export type NavGroup = { label: string | null; items: NavItem[] };

// "Me": your own training.
export const meGroups: NavGroup[] = [
  { label: null, items: [{ label: "Overview", href: "/", icon: LayoutDashboardIcon, key: "O" }] },
  {
    label: "Training",
    items: [
      { label: "Sessions", href: "/sessions", icon: ListIcon, key: "S" },
      { label: "Progress", href: "/progress", icon: TrendingUpIcon, key: "R" },
      { label: "Plan", href: "/plan", icon: CalendarDaysIcon, key: "P" },
      { label: "Library", href: "/library", icon: LibraryIcon, key: "L" },
    ],
  },
  {
    label: "Body",
    items: [
      { label: "Nutrition", href: "/nutrition", icon: AppleIcon, key: "N" },
      { label: "Habits & goals", href: "/habits", icon: CircleCheckIcon, key: "H" },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Social", href: "/social", icon: UsersRoundIcon, key: "F", badge: () => socialBadge.count },
      { label: "Messages", href: "/social/messages", icon: MessageCircleIcon, key: "M", badge: () => dmBadge.count },
    ],
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
export const coachGroups: NavGroup[] = [
  {
    label: null,
    items: [
      { label: "Today", href: "/coaching", icon: SunriseIcon, key: "T", badge: () => coachBadges.today },
      { label: "Clients", href: "/clients", icon: ContactIcon, key: "C" },
      // Next to Clients: ordered by how often coaches use them (canvas N).
      { label: "Messages", href: "/messages", icon: MessageSquareIcon, key: "M", badge: () => coachBadges.messages },
      { label: "Programs", href: "/coaching/programs", icon: ClipboardListIcon, key: "P" },
      { label: "Library", href: "/coaching/library", icon: LibraryIcon, key: "L" },
      { label: "Check-ins", href: "/coaching/checkins", icon: ClipboardCheckIcon, key: "K", badge: () => coachBadges.checkins },
    ],
  },
  {
    // What people outside see: the profile, the links that open it, and what they pay.
    label: "Your coaching",
    items: [
      { label: "Profile", href: "/coaching/profile", icon: IdCardIcon },
      { label: "Invite links", href: "/coaching/links", icon: LinkIcon, badge: () => coachBadges.links },
      { label: "Payments", href: "/coaching/payments", icon: WalletIcon, badge: () => coachBadges.payments },
    ],
  },
];

// Your own coach (if you have one): program, messages, check-ins and what they can see.
export const clientGroup: NavGroup = {
  label: "Coach",
  items: [{ label: "My coach", href: "/my-coach", icon: UserRoundIcon, badge: () => coachBadges.myCoach }],
};

// "Admin": the server's admin console, its own space like Coaching (admins only; the
// pages themselves check with the server).
export function adminNav(selfHosted: boolean): NavGroup[] {
  return [
  { label: null, items: [{ label: "Overview", href: "/admin", icon: LayoutDashboardIcon }] },
  {
    label: "People",
    items: [
      { label: "People", href: "/admin/people", icon: UsersRoundIcon },
      { label: "Invites", href: "/admin/invites", icon: TicketIcon },
    ],
  },
  {
    label: "Community",
    items: [
      { label: "Reports", href: "/admin/reports", icon: FlagIcon, badge: () => adminState.openReports },
      { label: "Plugin reviews", href: "/admin/plugins", icon: PuzzleIcon, badge: () => adminState.pluginsWaiting },
    ],
  },
  // getlogit.app only (the server refuses these on self-hosted servers too).
  ...(selfHosted ? [] : [{
    label: "getlogit.app",
    items: [
      { label: "Subscriptions", href: "/admin/subscriptions", icon: WalletIcon },
      { label: "Growth", href: "/admin/growth", icon: TrendingUpIcon },
      { label: "Diagnostics", href: "/admin/diagnostics", icon: StethoscopeIcon },
      { label: "Discover tests", href: "/admin/discover", icon: CompassIcon },
    ],
  }]),
  {
    label: "Server",
    items: [{ label: "Server", href: "/admin/server", icon: ServerIcon, badge: () => adminState.serverWarnings }],
  },
];
}

export type Workspace = "me" | "coaching" | "admin";

/** Which workspace a page belongs to: admin pages, Coaching (accounts that can coach), or Me. */
export function workspaceOf(pathname: string, search: URLSearchParams, coach: boolean): Workspace {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  return coach && isCoachingPath(pathname, search) ? "coaching" : "me";
}

export function navFor(ws: Workspace, selfHosted: boolean): NavGroup[] {
  return ws === "admin" ? adminNav(selfHosted) : ws === "coaching" ? coachGroups : [...meGroups, clientGroup];
}
