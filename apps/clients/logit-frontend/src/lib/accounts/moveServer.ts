// Moving an account to another server (accounts plan step 8, design canvas 9 and 10). The
// training is on the phone, so moving is: sign in or sign up on the new server, upload
// everything there, and only then make the new server this account's. Until the upload has
// landed the phone stays on the old server, so a move that stops halfway (no signal, server
// down) leaves things as they were and can simply be tried again.
//
// The old account is kept: the done screen offers to delete it. Social posts and followers
// stay where they were (they belong to that server's community).
import { apiClient, apiBaseUrl, ApiError, type AuthUser } from "@logit/core/api/client";
import { getSessionScope, setSessionScope, sessionKey } from "@logit/core/api/sessionScope";
import { setServerMode } from "@logit/core/api/serverConfig";
import { tokenStorage } from "@logit/core/api/tokenStorage";
import { normalizeServerUrl, testServerConnection } from "@logit/core/api/testConnection";
import { getActiveOwnerId } from "$lib/data/activeOwner";
import { isNativePlatform } from "$lib/platform/isNative";
import { log } from "@logit/core/platform/log";

export const HOSTED_SERVER = "getlogit.app";

export type ServerCheck =
  | { reachable: false }
  | { reachable: true; inviteOnly: boolean; selfHosted: boolean };

/** Whether a Logit server answers at `url` (null = getlogit.app), and whether it needs an invite to sign up. */
export async function checkServer(url: string | null): Promise<ServerCheck> {
  const base = url ? normalizeServerUrl(url) : hostedBaseUrl();
  if ((await testServerConnection(base)) !== "ok") return { reachable: false };
  try {
    const res = await fetch(`${base}/auth/registration`);
    if (res.status === 404) return { reachable: true, inviteOnly: false, selfHosted: false };
    const info = (await res.json()) as { mode?: string; selfHosted?: boolean };
    return { reachable: true, inviteOnly: info.mode === "invite", selfHosted: !!info.selfHosted };
  } catch {
    return { reachable: true, inviteOnly: false, selfHosted: false };
  }
}

export type MoveRequest = {
  /** The new server's address; null = getlogit.app. */
  url: string | null;
  /** "new": make an account there. "existing": sign in to one. */
  account: "new" | "existing";
  username: string;
  password: string;
  email?: string;
  inviteCode?: string;
};

/** What was left behind, for the done screen (delete it, cancel a plan bought there). */
export type MovedFrom = {
  server: string;
  baseUrl: string;
  username: string;
  tier: AuthUser["tier"] | null;
  selfHosted: boolean;
};

export type MoveResult =
  | { ok: true; to: string; from: MovedFrom; counts: MoveCounts }
  | { ok: false; error: string };

export type MoveCounts = { workouts: number; splits: number };

/** Host name to show for a server address. */
export function serverName(url: string | null): string {
  if (!url) return HOSTED_SERVER;
  try {
    return new URL(normalizeServerUrl(url)).host;
  } catch {
    return url;
  }
}

/** The server the account in use is on, as a host name. */
export function currentServerName(): string {
  return apiClient.isSelfHosted() ? serverName(apiBaseUrl()) : HOSTED_SERVER;
}

function hostedBaseUrl(): string {
  return import.meta.env.VITE_API_URL || "https://api.getlogit.app";
}

/**
 * Moves the account in use to another server, training and settings included. The phone only
 * switches once the upload has landed; on any failure it stays on the old server.
 */
export async function moveToServer(req: MoveRequest): Promise<MoveResult> {
  const owner = getActiveOwnerId();
  const oldUser = apiClient.getUser();
  if (!isNativePlatform() || !owner || !oldUser) return { ok: false, error: "Sign in to move your account." };
  const oldScope = getSessionScope();
  const from: MovedFrom = {
    server: currentServerName(),
    baseUrl: apiBaseUrl(),
    username: oldUser.username,
    tier: oldUser.tier ?? null,
    selfHosted: apiClient.isSelfHosted(),
  };
  const target = req.url ? normalizeServerUrl(req.url) : null;
  if ((target ?? hostedBaseUrl()) === from.baseUrl.replace(/\/+$/, "")) {
    return { ok: false, error: `This account is already on ${from.server}.` };
  }

  const { stopBackgroundSync, startBackgroundSync } = await import("$lib/platform/appInit");
  const sync = await import("$lib/sync/syncService");
  const { syncStorageKey } = await import("$lib/sync/syncKeys");
  const repo = await import("$lib/data/localAccountRepo");

  stopBackgroundSync();
  // The sign-in to the new server is made in a scope of its own, so the account keeps its
  // working sign-in until the move has finished.
  const moveScope = `${owner}~move`;
  const syncKeys = snapshotSyncKeys(syncStorageKey("logit:sync:"));
  const restore = async () => {
    restoreSyncKeys(syncStorageKey("logit:sync:"), syncKeys);
    setSessionScope(oldScope);
    await clearScope(moveScope);
    await apiClient.reloadSession();
    sync.reloadLastSyncedAt();
    startBackgroundSync();
  };

  let newUser: AuthUser;
  try {
    setSessionScope(moveScope);
    await apiClient.reloadSession();
    setServerMode(target ? "selfhosted" : "cloud", target ?? undefined);
    newUser = req.account === "existing"
      ? await apiClient.login(req.username.trim(), req.password)
      : await apiClient.register(
          req.username.trim().toLowerCase(),
          (req.email ?? "").trim(),
          req.password,
          oldUser.displayName || req.username.trim(),
          req.inviteCode,
        );
  } catch (e) {
    await restore();
    return { ok: false, error: e instanceof ApiError || e instanceof Error ? e.message : "Couldn't reach that server." };
  }

  const elsewhere = await repo.getLocalAccountByServerUserId(newUser.id);
  if (elsewhere && elsewhere.id !== owner) {
    await restore();
    return { ok: false, error: `@${newUser.username} is already on this phone. Switch to it from Accounts instead.` };
  }

  // Upload everything to the new server. Its pull cursors start from zero (an existing account
  // there may already hold training, which comes down and merges).
  clearSyncKeys(syncStorageKey("logit:sync:"));
  sync.markFullUploadDue();
  let landed = false;
  try {
    await sync.syncAll();
    landed = sync.fullUploadFinished();
  } catch (e) {
    log.warn("accounts", "Move: upload failed", e);
  }
  if (!landed) {
    await restore();
    return { ok: false, error: "The copy didn't finish, so nothing has changed. Check your connection and try again." };
  }

  // The new server is this account's from now on.
  setSessionScope(oldScope);
  await apiClient.moveSessionFrom(moveScope);
  const account = await repo.getLocalAccount(owner);
  await repo.updateLocalAccount(owner, { serverUserId: newUser.id, username: newUser.username });
  if (account?.onboardingCompleted && !newUser.onboardingCompleted) {
    apiClient.updateOnboardingCompleted(true).catch((e) => log.warn("accounts", "Move: onboarding status not saved", e));
  }
  sync.reloadLastSyncedAt();
  (await import("$lib/api/authStore.svelte")).authStore.reloadUser();
  startBackgroundSync();
  log.info("accounts", "Moved account to another server", { to: serverName(target) });
  return { ok: true, to: serverName(target), from, counts: await countTraining() };
}

/**
 * Deletes the account left behind on the old server (the done screen's "Delete my … account").
 * Signs in there with its password first: the phone no longer keeps that sign-in.
 */
export async function deleteOldAccount(from: MovedFrom, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const login = await fetch(`${from.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernameOrEmail: from.username, password }),
    });
    if (!login.ok) return { ok: false, error: login.status === 401 ? "That password isn't right." : "Couldn't reach that server." };
    const { accessToken } = (await login.json()) as { accessToken: string };
    const del = await fetch(`${from.baseUrl}/auth/account`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ password }),
    });
    return del.ok ? { ok: true } : { ok: false, error: "Couldn't delete it. Try again." };
  } catch {
    return { ok: false, error: "Couldn't reach that server." };
  }
}

async function countTraining(): Promise<MoveCounts> {
  const { getWorkoutRepo, getSplitRepo } = await import("$lib/data/repoProvider");
  const [workouts, splits] = await Promise.all([
    getWorkoutRepo().listAllSessions().then((s) => s.length).catch(() => 0),
    getSplitRepo().getListSplits({ includeArchived: true }).then((s) => s.length).catch(() => 0),
  ]);
  return { workouts, splits };
}

async function clearScope(scope: string): Promise<void> {
  await tokenStorage.clear(scope);
  for (const key of ["logit:auth:user", "logit:auth:selfHosted", "logit:api:baseUrl", "logit:server:mode"]) {
    localStorage.removeItem(sessionKey(key, scope));
  }
}

function snapshotSyncKeys(prefix: string): Map<string, string> {
  const saved = new Map<string, string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) saved.set(key, localStorage.getItem(key) ?? "");
  }
  return saved;
}

function clearSyncKeys(prefix: string): void {
  for (const key of snapshotSyncKeys(prefix).keys()) localStorage.removeItem(key);
}

function restoreSyncKeys(prefix: string, saved: Map<string, string>): void {
  clearSyncKeys(prefix);
  for (const [key, value] of saved) localStorage.setItem(key, value);
}
