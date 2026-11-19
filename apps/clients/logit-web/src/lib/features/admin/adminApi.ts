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
  sessionCount: number;
  lastActive: string | null;
}

export interface Person extends PersonRow {
  bio: string | null;
  avatarUrl: string | null;
  postCount: number;
  activeTokens: number;
  inviteNote: string | null;
  adminActions: AdminAction[];
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
  kind: "post" | "comment";
  body: string;
  deleted: boolean;
  author: string;
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
}

const f = <T>(path: string, init?: RequestInit) => apiClient.fetch<T>(path, init);
const send = <T>(path: string, method: string, body?: unknown) =>
  f<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const adminApi = {
  me: () => f<{ isAdmin: boolean; claimOffered: boolean }>("/admin/me"),
  claim: (key: string) => send<void>("/admin/claim", "POST", { key }),

  overview: () => f<Overview>("/admin/api/overview"),

  people: (search = "") =>
    f<{ total: number; users: PersonRow[] }>(`/admin/api/users?pageSize=500${search ? `&search=${encodeURIComponent(search)}` : ""}`),
  person: (id: string) => f<Person>(`/admin/api/users/${id}`),
  updatePerson: (id: string, changes: { displayName?: string; email?: string; isAdmin?: boolean }) =>
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
  sendTestEmail: () => send<{ sentTo: string }>("/admin/api/server/test-email", "POST"),
  backup: () => f<Blob>("/admin/api/server/backup"),

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
