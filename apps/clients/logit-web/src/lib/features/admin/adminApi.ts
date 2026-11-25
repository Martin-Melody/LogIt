import { apiClient } from "@logit/core/api/client";

/** The server's admin console API (/admin, /admin/api). Only admins get past /admin/api. */

export interface AdminAction {
  id: string;
  createdAt: string;
  actorUserId: string | null;
  actorName: string;
  action: string;
  targetUserId: string | null;
  targetName: string | null;
  detail: string | null;
}

export interface Overview {
  server: { registrationMode: "open" | "invite"; selfHosted: boolean; emailConfigured: boolean; webOrigin: string | null };
  people: number;
  trainedThisWeek: number;
  workouts30Days: number;
  days: { date: string; signUps: number; workouts: number; errors: number }[];
  openReports: number;
  newestReport: { id: string; targetType: string; reason: string; createdAt: string; reporter: string } | null;
  pluginsWaiting: number;
  invitesEndingSoon: { id: string; code: string; note: string | null; useCount: number; maxUses: number; expiresAt: string }[];
  recentActions: AdminAction[];
}

export interface PersonRow {
  id: string;
  username: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
  postCount: number;
  /** When the app last signed in or refreshed its login (not when they trained). */
  lastActive: string | null;
}

export interface SubscriptionRow {
  source: "Google" | "Apple" | "Stripe";
  plan: "Pro" | "Studio";
  state: string;
  expiresAt: string | null;
  autoRenewing: boolean;
  isTest: boolean;
  /** In its free trial: gives the plan, nothing paid yet. */
  isTrial?: boolean;
  productId: string;
  createdAt: string;
  checkedAt: string | null;
}

export interface Person extends PersonRow {
  bio: string | null;
  avatarUrl: string | null;
  activeTokens: number;
  inviteNote: string | null;
  tier: "Free" | "Pro" | "Studio";
  manualTier: "Pro" | "Studio" | null;
  subscriptions: SubscriptionRow[];
  devices: { label: string | null; lastSeen: string }[];
  diagnostics: { id: string; createdAt: string }[];
  adminActions: AdminAction[];
}

export interface Subscriptions {
  counts: { payingPro: number; payingStudio: number; newLast30Days: number; stopping: number; paymentProblems: number; givenByHand: number; test: number; onTrial: number };
  subscriptions: (Omit<SubscriptionRow, "checkedAt"> & { id: string; user: { id: string; username: string } })[];
}

export interface GrowthWeek {
  weekOf: string;
  signedUp: number;
  loggedWorkout: number;
  threeInWeekOne: number;
  backInWeekTwo: number | null;
  payingNow: number;
}

export interface DiagnosticsRow {
  id: string;
  createdAt: string;
  appVersion: string;
  platform: string;
  note: string | null;
  /** "crash": sent by a test build by itself; "report": sent by the person. */
  kind: "report" | "crash";
  /** The phone's random install id, for grouping crashes from one phone. */
  deviceId: string | null;
  chars: number;
  /** Null for a crash from a phone with no account signed in. */
  user: { id: string; username: string } | null;
}

export interface DiscoverRow {
  arm: string;
  recipe: string;
  kind: "post" | "person";
  shown: number;
  liked: number;
  commented: number;
  followed: number;
  followRate: number;
}

export interface Invite {
  id: string;
  code: string;
  note: string | null;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number;
  useCount: number;
  revokedAt: string | null;
  status: string;
  usedBy: { id: string; username: string }[];
}

export interface Report {
  id: string;
  targetType: "Post" | "Comment";
  targetId: string;
  reason: string;
  note: string | null;
  status: "Open" | "Actioned" | "Dismissed";
  createdAt: string;
  reviewedAt: string | null;
  reporter: { id: string; username: string; displayName: string };
}

export interface ReportPreview {
  kind: "post" | "comment" | "message" | "story";
  body: string;
  deleted: boolean;
  author: string;
  /** A reported message's photo. */
  photoUrl?: string | null;
}

export interface PluginReleaseRow {
  id: string;
  pluginId: string;
  family: string;
  name: string;
  version: string;
  status: "Pending" | "Approved" | "Rejected" | string;
  changeNote: string | null;
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  owner: string;
}

export interface PluginRelease {
  id: string;
  pluginId: string;
  family: string;
  version: string;
  status: string;
  manifestJson: string;
  source: string;
  changeNote: string | null;
  reviewNote: string | null;
  submittedAt: string;
  owner: string;
  previous: { version: string; source: string } | null;
}

export interface ServerInfo {
  registrationMode: "open" | "invite";
  registrationModeSource: "env" | "console";
  selfHosted: boolean;
  emailConfigured: boolean;
  emailFrom: string | null;
  webOrigin: string | null;
  version: { commit: string | null; builtAt: string };
  startedAt: string;
  database: { provider: "SQLite" | "Postgres"; sizeBytes: number | null };
  holds: { people: number; workouts: number; posts: number };
  errors: { date: string; count: number; topRoute: string | null }[];
  canDownloadBackup: boolean;
  /** "firebase": this server sends with its own key; "relay": it can hand pushes to getlogit.app. */
  push: { mode: "firebase" | "relay"; relayOn: boolean };
}

/** On getlogit.app the admin API is reached through the dashboard's own domain (/admin-api,
 * behind Cloudflare Access) rather than api.getlogit.app; elsewhere directly. */
function adminPath(path: string): string {
  const via = (globalThis as { __LOGIT_ADMIN_API__?: unknown }).__LOGIT_ADMIN_API__;
  return typeof via === "string" && via && path.startsWith("/admin/api/") ? `${location.origin}${via}${path.slice(10)}` : path;
}

/** On getlogit.app, the Cloudflare sign-in has to happen in a full page load before admin calls work. */
export const behindCloudflare = () => typeof (globalThis as { __LOGIT_ADMIN_API__?: unknown }).__LOGIT_ADMIN_API__ === "string";

const f = <T>(path: string, init?: RequestInit) => apiClient.fetch<T>(adminPath(path), init);
const send = <T>(path: string, method: string, body?: unknown) =>
  f<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const adminApi = {
  me: () => f<{ isAdmin: boolean; claimOffered: boolean }>("/admin/me"),
  claim: (key: string) => send<void>("/admin/claim", "POST", { key }),

  overview: () => f<Overview>("/admin/api/overview"),
  ping: () => f<unknown>("/admin/api/stats"),

  people: (search = "") =>
    f<{ total: number; users: PersonRow[] }>(`/admin/api/users?pageSize=500${search ? `&search=${encodeURIComponent(search)}` : ""}`),
  person: (id: string) => f<Person>(`/admin/api/users/${id}`),
  updatePerson: (id: string, changes: { displayName?: string; email?: string; isAdmin?: boolean; tier?: "Free" | "Pro" | "Studio" }) =>
    send<void>(`/admin/api/users/${id}`, "PATCH", changes),
  resetPassword: (id: string, newPassword: string) => send<void>(`/admin/api/users/${id}/reset-password`, "POST", { newPassword }),
  signOutEverywhere: (id: string) => send<{ revokedCount: number }>(`/admin/api/users/${id}/tokens`, "DELETE"),
  deletePerson: (id: string) => send<void>(`/admin/api/users/${id}`, "DELETE"),

  invites: () => f<Invite[]>("/admin/api/invites"),
  createInvite: (input: { note: string | null; maxUses: number; expiresInDays: number | null }) =>
    send<{ id: string; code: string; expiresAt: string | null; maxUses: number }>("/admin/api/invites", "POST", input),
  cancelInvite: (id: string) => send<void>(`/admin/api/invites/${id}`, "DELETE"),
  extendInvite: (id: string, days: number) => send<{ expiresAt: string }>(`/admin/api/invites/${id}/extend`, "POST", { days }),

  reports: () => f<{ reports: Report[]; previews: Record<string, ReportPreview> }>("/admin/api/reports?status=all"),
  resolveReport: (id: string, action: "dismiss" | "delete-target") => send<void>(`/admin/api/reports/${id}/resolve`, "POST", { action }),

  server: () => f<ServerInfo>("/admin/api/server"),
  setRegistration: (mode: "open" | "invite") => send<void>("/admin/api/server/registration", "PUT", { mode }),
  setPushRelay: (on: boolean) => send<void>("/admin/api/server/push-relay", "PUT", { on }),
  sendTestEmail: () => send<{ sentTo: string }>("/admin/api/server/test-email", "POST"),
  backup: () => f<Blob>("/admin/api/server/backup"),

  subscriptions: () => f<Subscriptions>("/admin/api/subscriptions"),
  growth: () => f<{ weeks: GrowthWeek[] }>("/admin/api/growth"),
  diagnostics: () => f<{ reports: DiagnosticsRow[] }>("/admin/api/diagnostics"),
  diagnosticsReport: (id: string) => f<DiagnosticsRow & { log: string }>(`/admin/api/diagnostics/${id}`),
  deleteDiagnostics: (id: string) => send<void>(`/admin/api/diagnostics/${id}`, "DELETE"),
  discover: (days: number) => f<DiscoverRow[]>(`/admin/api/discover?days=${days}`),

  pluginReleases: () => f<{ releases: PluginReleaseRow[] }>("/admin/api/plugins?status=all"),
  pluginRelease: (id: string) => f<PluginRelease>(`/admin/api/plugins/releases/${id}`),
  reviewPlugin: (id: string, approve: boolean, note: string) =>
    send<void>(`/admin/api/plugins/releases/${id}/review`, "POST", { approve, note }),
};

/** One line for the action log: "alex reset sarah's password". */
export function describeAction(a: AdminAction): string {
  const who = a.actorUserId ? a.actorName : "Someone with the admin key";
  const them = a.targetName ?? "someone";
  const detail = a.detail ? ` (${a.detail})` : "";
  switch (a.action) {
    case "admin.claim": return `${who} became an admin with the server's key`;
    case "admin.grant": return `${who} made ${them} an admin`;
    case "admin.remove": return `${who} removed ${them} as an admin`;
    case "user.update": return `${who} changed ${them}'s account${detail}`;
    case "user.reset-password": return `${who} reset ${them}'s password`;
    case "user.sign-out": return `${who} signed ${them} out everywhere${detail}`;
    case "user.delete": return `${who} deleted ${them}'s account`;
    case "invite.create": return `${who} created invite ${a.detail ?? ""}`.trim();
    case "invite.revoke": return `${who} cancelled invite ${a.detail ?? ""}`.trim();
    case "invite.extend": return `${who} extended invite ${a.detail ?? ""}`.trim();
    case "report.dismiss": return `${who} dismissed a report`;
    case "report.delete-target": return `${who} deleted a reported ${a.detail?.split(" ")[0]?.toLowerCase() ?? "post"}`;
    case "plugin.approve": return `${who} approved ${a.detail ?? "a plugin"}`;
    case "plugin.changes": return `${who} asked for changes to ${a.detail ?? "a plugin"}`;
    case "server.registration": return `${who} set sign-ups to ${a.detail ?? "a new mode"}`;
    case "server.test-email": return `${who} sent a test email`;
    case "server.backup": return `${who} downloaded a backup`;
    case "diagnostics.view": return `${who} read ${them}'s diagnostics log`;
    case "diagnostics.delete": return `${who} deleted a diagnostics report from ${them}`;
    default: return `${who}: ${a.action}${detail}`;
  }
}

// 32 words: four of them plus four digits is about 33 bits, enough while it's only temporary.
const WORDS = [
  "plate", "ridge", "chalk", "iron", "squat", "bench", "cable", "rack", "tempo", "grip", "deload", "sprint",
  "rowing", "barbell", "kettle", "lunge", "press", "curl", "plank", "hinge", "carry", "swing", "pause", "brace",
  "strap", "belt", "spot", "lift", "pull", "push", "climb", "stride",
];

/** A temporary password that's easy to read out or type: "plate-ridge-curl-swing-4471". */
export function temporaryPassword(): string {
  const r = new Uint32Array(5);
  crypto.getRandomValues(r);
  const words = Array.from(r.slice(0, 4), (n) => WORDS[n % WORDS.length]);
  return `${words.join("-")}-${String(r[4] % 10000).padStart(4, "0")}`;
}

/** Where emails link to (WEB_ORIGIN) doesn't match where the dashboard is open, e.g. localhost. */
export function webOriginMismatch(webOrigin: string | null): boolean {
  if (!webOrigin || typeof location === "undefined") return false;
  try { return new URL(webOrigin).origin !== location.origin; } catch { return true; }
}

/** A server time in ms. SQLite servers send UTC times without a "Z", which Date.parse would
 * read as local time; every time the API stores is UTC. */
export function at(iso: string): number {
  return Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
}
