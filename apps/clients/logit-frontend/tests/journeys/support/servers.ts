// The two local APIs started by scripts/journey-apis.sh, and direct calls to them for setting
// up and checking a journey from the server's side (giving an account a plan, reading what
// actually reached the server).

/** Stands in for getlogit.app: plans are enforced. The app's built-in server in these tests. */
export const CLOUD = process.env.JOURNEY_CLOUD_URL ?? "http://127.0.0.1:5219";
/** A self-hosted server: every account gets everything. */
export const SELF_HOST = process.env.JOURNEY_SELF_HOST_URL ?? "http://127.0.0.1:5218";
const ADMIN_KEY = process.env.JOURNEY_ADMIN_KEY ?? "dev-admin-key";
// Taken before any phone swaps in its own fetch: these calls are the test's, not the phone's,
// so a phone with no signal mustn't stop them.
const fetch = globalThis.fetch;

export type ServerName = "cloud" | "self-host";
export type Tier = "Free" | "Pro" | "Studio";

const base = (s: ServerName) => (s === "cloud" ? CLOUD : SELF_HOST);

let n = 0;
/** A username/email/password nobody has used on either server yet. */
export function newUser(label = "user") {
  const id = `${label}${Date.now().toString(36)}${(++n).toString(36)}${Math.random().toString(36).slice(2, 5)}`.toLowerCase().slice(0, 30);
  return { username: id, email: `${id}@journey.test`, password: "journey-pass-123" };
}

export async function serversUp(): Promise<boolean> {
  try {
    const [a, b] = await Promise.all([fetch(`${CLOUD}/health`), fetch(`${SELF_HOST}/health`)]);
    return a.ok && b.ok;
  } catch {
    return false;
  }
}

async function call<T>(server: ServerName, path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init.headers as Record<string, string>) };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const res = await fetch(`${base(server)}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} on ${server}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Creates an account straight on the server (not through a phone). */
export async function createAccount(server: ServerName, user = newUser(), tier: Tier = "Free") {
  const r = await call<{ accessToken: string; user: { id: string } }>(server, "/auth/register", {
    method: "POST",
    body: JSON.stringify({ ...user, displayName: user.username }),
  });
  if (tier !== "Free") await setTier(server, r.user.id, tier);
  return { ...user, id: r.user.id };
}

/** Gives an account a plan by hand, as the admin page does (a store purchase works the same way server-side). */
export async function setTier(server: ServerName, userId: string, tier: Tier): Promise<void> {
  await call(server, `/admin/api/users/${userId}`, {
    method: "PATCH",
    headers: { "X-Admin-Key": ADMIN_KEY },
    body: JSON.stringify({ tier }),
  });
}

export async function tokenFor(server: ServerName, user: { username: string; password: string }): Promise<string> {
  const r = await call<{ accessToken: string }>(server, "/auth/login", {
    method: "POST",
    body: JSON.stringify({ usernameOrEmail: user.username, password: user.password }),
  });
  return r.accessToken;
}

/**
 * What the server holds for an account, read as a second device would. Deleted rows are left
 * out. Synced data is null when the plan doesn't include sync (Free on the cloud).
 */
export async function serverData(server: ServerName, user: { username: string; password: string }) {
  const token = await tokenFor(server, user);
  type Row = { dataJson?: string | null; deletedAtMs?: number | null };
  const synced = <T>(path: string) =>
    call<T>(server, path, { token }).catch((e: Error) => {
      if (e.message.includes(": 403 ")) return null;
      throw e;
    });
  const [splits, sessions, profile, me] = await Promise.all([
    synced<{ splits: Row[] }>("/sync/splits?since=0"),
    synced<{ sessions: Row[] }>("/sync/sessions?since=0"),
    synced<{ profile: Record<string, unknown> | null }>("/sync/profile"),
    call<{ onboardingCompleted?: boolean; tier?: string; displayName?: string }>(server, "/users/me", { token }),
  ]);
  const names = (rows: Row[]) =>
    rows.filter((r) => !r.deletedAtMs).map((r) => (JSON.parse(r.dataJson ?? "{}") as { name?: string }).name ?? "").sort();
  return {
    splitNames: splits ? names(splits.splits) : null,
    workoutNames: sessions ? names(sessions.sessions) : null,
    profile: profile?.profile ?? null,
    me,
  };
}

/** True when the server still has an account with this username and password. */
export async function accountExists(server: ServerName, user: { username: string; password: string }): Promise<boolean> {
  const res = await fetch(`${base(server)}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernameOrEmail: user.username, password: user.password }),
  });
  return res.ok;
}

/** A Studio coach invites a client and the client accepts, straight on the server. */
export async function coach(server: ServerName, coachUser: { username: string; password: string }, clientUser: { username: string; password: string }): Promise<void> {
  const coachToken = await tokenFor(server, coachUser);
  const { relationshipId } = await call<{ relationshipId: string }>(server, `/coach/clients/${clientUser.username}/invite`, {
    method: "POST",
    token: coachToken,
  });
  await call(server, `/coach/invites/${relationshipId}/accept`, {
    method: "POST",
    token: await tokenFor(server, clientUser),
    body: JSON.stringify({ sharing: null }),
  });
}
