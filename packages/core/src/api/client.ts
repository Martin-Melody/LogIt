import { normalizeServerUrl } from "./testConnection";
import { tokenStorage, type StoredTokens } from "./tokenStorage";
import { getSessionScope, sessionKey } from "./sessionScope";
import { log } from "../platform/log";
import { isNativePlatform } from "../platform/isNative";

const DEVICE_ID_KEY = "logit:device-id";

/**
 * A random id for this install of the phone app, the same for every account on it. Sent as
 * X-Logit-Device so a Free account's backup belongs to one phone (the server's FreeBackup).
 * The web app sends none, so the web dashboard stays a Pro feature.
 */
function deviceId(): string | null {
  if (!isNativePlatform()) return null;
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

const USER_KEY = "logit:auth:user";
const SELF_HOSTED_KEY = "logit:auth:selfHosted";
const REFUSED_SYNC_KEY = "logit:sync:refused";
// serverConfig.ts's MODE_KEY (it imports this file, so the name is repeated here).
const SERVER_MODE_KEY = "logit:server:mode";
// Each of these is stored per account on the phone: see sessionScope.ts.

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  tier: string;
  onboardingCompleted: boolean;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  isSelfHosted: boolean;
  /** A Free account's backup is held by another phone and was left there (decision D5). */
  backupElsewhere?: boolean;
}

export interface PairingStart {
  id: string;
  /** The QR's text: "logit-pair:<code>". */
  qr: string;
  secret: string;
  expiresAt: string;
}

export type PairingState = "waiting" | "approved" | "denied" | "expired" | "used";

export interface SignedInSession {
  id: string;
  label: string;
  startedAt: string;
  lastActiveAt: string;
  current: boolean;
}

/** The QR text a web sign-in page shows; the phone's scanner recognises it by this prefix. */
export const PAIRING_QR_PREFIX = "logit-pair:";

export const WRONG_CREDENTIALS_MESSAGE = "That username or password isn't right.";

/** What to show for an error response that carries no message of its own. */
export function fallbackErrorMessage(status: number): string {
  if (status === 401) return "You're not signed in, or your session has ended. Sign in again.";
  if (status === 403) return "You don't have access to that.";
  if (status === 404) return "That couldn't be found on the server.";
  if (status === 429) return "Too many attempts. Wait a few minutes and try again.";
  if (status >= 500) return `Something went wrong on the server (${status}). Try again in a moment.`;
  return `The server couldn't handle that request (${status}).`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** The server's machine-readable reason, when it sends one (e.g. "invite_invalid"). */
    public code?: string,
  ) {
    super(message);
  }
}

/** Who may sign up on a server (GET /auth/registration). */
export interface RegistrationInfo {
  /** "invite": signing up needs an invite code from the server's admin. */
  mode: "open" | "invite";
  selfHosted: boolean;
  /** Nobody is the admin yet: signing up with the server's ADMIN_KEY sets it up (no invite needed). */
  setup?: boolean;
}

const BASE_URL_KEY = "logit:api:baseUrl";
// The hosted server. VITE_API_URL at build time overrides it (e.g. a local API in development),
// and a self-hosted dashboard is told its own API at run time (logit-web's hooks.server.ts);
// users can also pick a server at sign-in, which is stored under BASE_URL_KEY.
const DEFAULT_BASE_URL: string = import.meta.env.VITE_API_URL || "https://api.getlogit.app";

/** The API a self-hosted dashboard's server said to use, or null. ":8080" = this page's host on 8080. */
export function runtimeApiUrl(injected = (globalThis as { __LOGIT_API_URL__?: unknown }).__LOGIT_API_URL__,
  where: { protocol: string; hostname: string } | undefined = globalThis.location): string | null {
  if (typeof injected !== "string" || !injected) return null;
  if (injected.startsWith(":")) return where ? `${where.protocol}//${where.hostname}${injected}` : null;
  return injected.replace(/\/+$/, "");
}

function getBaseUrl(): string {
  return localStorage.getItem(sessionKey(BASE_URL_KEY)) ?? runtimeApiUrl() ?? DEFAULT_BASE_URL;
}

/** The server this app talks to: the hosted one, or the self-hosted one picked at sign-in. */
export function apiBaseUrl(): string {
  return getBaseUrl();
}

/** Sent as X-Request-Id; the server logs it with the request and echoes it back, so an entry
 * in the app's diagnostics log can be matched to the server's log line. */
function newRequestId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The path without its query string, which can carry search text. */
function routeOf(path: string): string {
  return path.split("?")[0] ?? path;
}

const SLOW_REQUEST_MS = 5000;
const REFUSED_SYNC_MS = 60 * 60 * 1000;
const BACKUP_ELSEWHERE_MESSAGE = "Your free backup is on another phone. Move it here from the app, or get Pro to back up both.";

class ApiClient {
  private tokens: StoredTokens | null = null;
  private cachedUser: AuthUser | null = null;
  private cachedIsSelfHosted = false;
  private refreshPromise: Promise<boolean> | null = null;
  /** A Free account whose backup is held by another phone (the server said so); signing in here moves it back. */
  private backupElsewhere = false;
  /** /sync routes the server refused (403) for this account's plan, and when. Asked again after
   * REFUSED_SYNC_MS, a sign-in or a plan change: a phone without the free backup (or Free on the
   * web) sent every sync request on every sync, all refused (bug hunt 12.2, 4.9). Kept per
   * account on the phone so reopening the app doesn't send them all again. */
  private refusedSync = new Map<string, { at: number; code?: string }>();

  private loadRefusedSync(): void {
    try {
      this.refusedSync = new Map(Object.entries(JSON.parse(localStorage.getItem(sessionKey(REFUSED_SYNC_KEY)) ?? "{}")));
    } catch {
      this.refusedSync = new Map();
    }
  }

  private setRefusedSync(key: string | null, code?: string): void {
    if (key) this.refusedSync.set(key, { at: Date.now(), ...(code ? { code } : {}) });
    else this.refusedSync.clear();
    try {
      if (this.refusedSync.size) localStorage.setItem(sessionKey(REFUSED_SYNC_KEY), JSON.stringify(Object.fromEntries(this.refusedSync)));
      else localStorage.removeItem(sessionKey(REFUSED_SYNC_KEY));
    } catch {}
  }

  async init(): Promise<void> {
    this.tokens = await tokenStorage.get();
    if (this.tokens) {
      try {
        const raw = localStorage.getItem(sessionKey(USER_KEY));
        this.cachedUser = raw ? (JSON.parse(raw) as AuthUser) : null;
      } catch {
        this.cachedUser = null;
      }
      this.cachedIsSelfHosted = localStorage.getItem(sessionKey(SELF_HOSTED_KEY)) === "true";
    }
    this.loadRefusedSync();
  }

  /**
   * Forget the session in memory and load the current scope's (another account's, after a
   * switch). Nothing is revoked or deleted: the account left behind stays signed in.
   */
  async reloadSession(): Promise<void> {
    this.tokens = null;
    this.cachedUser = null;
    this.cachedIsSelfHosted = false;
    this.backupElsewhere = false;
    await this.init();
  }

  /**
   * A sign-in made in `fromScope` belongs to the account now in scope (the phone signs in first
   * and only then knows which account on it the session is for): store it there, server address
   * and mode included, and remove it from where it was made.
   */
  async moveSessionFrom(fromScope: string | null): Promise<void> {
    if (fromScope === getSessionScope()) return;
    for (const key of [BASE_URL_KEY, SERVER_MODE_KEY]) {
      const value = localStorage.getItem(sessionKey(key, fromScope));
      if (value !== null) localStorage.setItem(sessionKey(key), value);
      else localStorage.removeItem(sessionKey(key));
      localStorage.removeItem(sessionKey(key, fromScope));
    }
    if (this.tokens) await tokenStorage.set(this.tokens);
    if (this.cachedUser) this.saveUser(this.cachedUser, this.cachedIsSelfHosted);
    await tokenStorage.clear(fromScope);
    localStorage.removeItem(sessionKey(USER_KEY, fromScope));
    localStorage.removeItem(sessionKey(SELF_HOSTED_KEY, fromScope));
  }

  /**
   * Who an account on the phone is signed in as, read from its stored sign-in without loading
   * it (the account switcher lists every account this way). `server` is a host name to show:
   * getlogit.app for the hosted server.
   */
  async sessionSummary(scope: string): Promise<{ signedIn: boolean; user: AuthUser | null; selfHosted: boolean; server: string }> {
    const tokens = await tokenStorage.get(scope);
    let user: AuthUser | null = null;
    try {
      const raw = localStorage.getItem(sessionKey(USER_KEY, scope));
      user = raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      user = null;
    }
    const baseUrl = localStorage.getItem(sessionKey(BASE_URL_KEY, scope));
    let server = "getlogit.app";
    if (baseUrl) {
      try { server = new URL(baseUrl).host; } catch { server = baseUrl; }
    }
    return {
      signedIn: tokens !== null,
      user,
      selfHosted: localStorage.getItem(sessionKey(SELF_HOSTED_KEY, scope)) === "true",
      server,
    };
  }

  /** The server refused this phone's sync because another phone holds this Free account's backup. */
  isBackupElsewhere(): boolean {
    return this.backupElsewhere;
  }

  /** "Back up this phone instead": a Free account's backup moves to this phone (decision D5). */
  async moveBackupHere(): Promise<void> {
    await this.fetch("/sync/backup/here", { method: "POST" });
    this.backupElsewhere = false;
    this.setRefusedSync(null);
  }

  isAuthenticated(): boolean {
    return this.tokens !== null;
  }

  getUser(): AuthUser | null {
    return this.cachedUser;
  }

  /** Whether the currently connected server is a self-hosted (unmetered) deployment, as
   * declared by the server itself on the last login/register — not a client-local guess. */
  isSelfHosted(): boolean {
    return this.cachedIsSelfHosted;
  }

  private saveUser(user: AuthUser, isSelfHosted: boolean): void {
    if (this.cachedUser?.tier !== user.tier) this.setRefusedSync(null);
    this.cachedUser = user;
    this.cachedIsSelfHosted = isSelfHosted;
    localStorage.setItem(sessionKey(USER_KEY), JSON.stringify(user));
    localStorage.setItem(sessionKey(SELF_HOSTED_KEY), String(isSelfHosted));
  }

  private clearUser(): void {
    this.cachedUser = null;
    this.cachedIsSelfHosted = false;
    localStorage.removeItem(sessionKey(USER_KEY));
    localStorage.removeItem(sessionKey(SELF_HOSTED_KEY));
  }

  private async refreshTokens(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      if (!this.tokens) return false;
      try {
        const res = await fetch(`${getBaseUrl()}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: this.tokens.refreshToken }),
        });
        if (!res.ok) {
          log.info("auth", `Session refresh rejected (${res.status}), signed out on this device`);
          // Don't call logout() here — it would try to revoke via fetch(), which
          // calls refreshTokens() again while this.refreshPromise is still set,
          // causing an async deadlock. Just clear tokens locally.
          this.tokens = null;
          this.clearUser();
          await tokenStorage.clear();
          return false;
        }
        const data: AuthResponse = await res.json();
        this.tokens = { accessToken: data.accessToken, refreshToken: data.refreshToken };
        await tokenStorage.set(this.tokens);
        // Re-sync the cached user from the refreshed session. A refresh can happen at any
        // time (any 401), and the refresh token in storage may belong to a different
        // account than the last-saved user blob (e.g. after a cross-tab login) — keeping
        // the blob in step with the token that's actually in use prevents the UI showing
        // one identity while requests run as another.
        this.saveUser(data.user, data.isSelfHosted);
        return true;
      } catch (e) {
        log.warn("auth", "Session refresh failed (network?)", e);
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async fetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const method = (init.method ?? "GET").toUpperCase();
    const route = routeOf(path);
    const requestId = newRequestId();
    const started = Date.now();
    const syncKey = path.startsWith("/sync/") ? `${method} ${route}` : null;
    const refused = syncKey ? this.refusedSync.get(syncKey) : undefined;
    if (refused && Date.now() - refused.at < REFUSED_SYNC_MS) {
      const elsewhere = refused.code === "backup_other_device";
      if (elsewhere) this.backupElsewhere = true;
      throw new ApiError(403, elsewhere ? BACKUP_ELSEWHERE_MESSAGE : fallbackErrorMessage(403), refused.code);
    }

    // A caller that brings its own token (withToken) keeps it, and a 401 isn't retried with ours.
    const ownToken = !!(init.headers as Record<string, string> | undefined)?.["Authorization"];
    const doRequest = async (token: string | null) => {
      const headers: Record<string, string> = {
        // A form (a photo upload) sets its own multipart type and boundary.
        ...(typeof FormData !== "undefined" && init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        "X-Request-Id": requestId,
        ...(deviceId() ? { "X-Logit-Device": deviceId()! } : {}),
        ...(init.headers as Record<string, string>),
      };
      if (token && !ownToken) headers["Authorization"] = `Bearer ${token}`;
      // A full URL (the hosted admin console's same-origin /admin-api) is used as it is.
      return fetch(/^https?:\/\//.test(path) ? path : `${getBaseUrl()}${path}`, { ...init, headers });
    };

    let res: Response;
    try {
      res = await doRequest(this.tokens?.accessToken ?? null);

      if (res.status === 401 && this.tokens && !ownToken) {
        const refreshed = await this.refreshTokens();
        if (refreshed) {
          res = await doRequest(this.tokens!.accessToken);
        }
      }
    } catch (e) {
      // fetch() only throws when no response came back: offline, DNS, TLS, CORS, aborted.
      log.warn("api", `${method} ${route} got no response`, {
        requestId,
        ms: Date.now() - started,
        online: typeof navigator === "undefined" ? undefined : navigator.onLine,
        error: e,
      });
      throw e;
    }

    const ms = Date.now() - started;

    if (!res.ok) {
      let message = "";
      let code: string | undefined;
      try {
        const body = await res.json();
        if (typeof body?.error === "string") message = body.error;
        if (typeof body?.code === "string") code = body.code;
      } catch {}
      // Not the status text: over HTTP/2 there is none, so an error without a body reached the
      // screen as an empty message (the sign-in screen showed nothing), and over HTTP/1.1 it
      // was a bare "Unauthorized".
      if (!message.trim()) message = fallbackErrorMessage(res.status);
      const details = { requestId, ms, error: message };
      if (res.status >= 500) log.error("api", `${method} ${route} ${res.status}`, details);
      else log.warn("api", `${method} ${route} ${res.status}`, details);
      if (code === "backup_other_device") this.backupElsewhere = true;
      if (syncKey && res.status === 403) this.setRefusedSync(syncKey, code);
      throw new ApiError(res.status, message, code);
    }

    if (ms >= SLOW_REQUEST_MS) log.info("api", `${method} ${route} slow`, { requestId, ms, status: res.status });
    else log.debug("api", `${method} ${route} ${res.status}`, { requestId, ms });

    if (res.status === 204) return undefined as T;
    // A file (e.g. the admin's database backup) comes back as a Blob; everything else is JSON.
    if (!(res.headers.get("Content-Type") ?? "application/json").includes("json")) return (await res.blob()) as T;
    return res.json();
  }

  // Auth

  async register(
    username: string,
    email: string,
    password: string,
    displayName: string,
    inviteCode?: string,
    adminKey?: string,
  ): Promise<AuthUser> {
    const data: AuthResponse = await this.fetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password, displayName, inviteCode: inviteCode?.trim() || undefined, adminKey: adminKey?.trim() || undefined }),
    });
    this.tokens = { accessToken: data.accessToken, refreshToken: data.refreshToken };
    await tokenStorage.set(this.tokens);
    this.saveUser(data.user, data.isSelfHosted);
    this.backupElsewhere = false; // signing in on this phone moves a Free backup here
    this.setRefusedSync(null);
    return data.user;
  }

  /**
   * Whether the current server needs an invite code to sign up. Servers from before invites
   * existed answer 404, which means open. Null when the server can't be reached.
   */
  async getRegistrationInfo(): Promise<RegistrationInfo | null> {
    try {
      const info = await this.fetch<RegistrationInfo>("/auth/registration");
      return { mode: info.mode === "invite" ? "invite" : "open", selfHosted: !!info.selfHosted, setup: !!info.setup };
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return { mode: "open", selfHosted: false };
      return null;
    }
  }

  async login(usernameOrEmail: string, password: string): Promise<AuthUser> {
    let data: AuthResponse;
    try {
      data = await this.fetch("/auth/login", {
        method: "POST",
        // This app asks "Back up this phone instead?" itself (decision D5), so the server leaves
        // a Free backup where it is and says so (backupElsewhere).
        body: JSON.stringify({ usernameOrEmail, password, askBeforeMovingBackup: true }),
      });
    } catch (e) {
      // Servers from before 2026-11-14 answer a failed sign-in with a bare 401.
      if (e instanceof ApiError && e.status === 401 && !e.code) {
        throw new ApiError(401, WRONG_CREDENTIALS_MESSAGE, "invalid_credentials");
      }
      throw e;
    }
    this.tokens = { accessToken: data.accessToken, refreshToken: data.refreshToken };
    await tokenStorage.set(this.tokens);
    this.saveUser(data.user, data.isSelfHosted);
    // Signing in moves a Free backup here, unless another phone holds it (then the app asks).
    this.backupElsewhere = !!data.backupElsewhere;
    this.setRefusedSync(null);
    return data.user;
  }

  // Scan-to-sign-in (server Features/Auth/PairingEndpoints.cs).

  /** The web sign-in page asks for a code to show as a QR. Keep `secret` on this page only. */
  async startPairing(): Promise<PairingStart> {
    return this.fetch<PairingStart>("/auth/pair", { method: "POST" });
  }

  /**
   * The web page asks whether the phone answered. On "approved" this browser is signed in with
   * its own session (no password typed), exactly as after login().
   */
  async pollPairing(id: string, secret: string): Promise<PairingState> {
    const res = await this.fetch<{ state: PairingState; auth?: AuthResponse }>(`/auth/pair/${id}/poll`, {
      method: "POST",
      body: JSON.stringify({ secret }),
    });
    if (res.state === "approved" && res.auth) {
      this.tokens = { accessToken: res.auth.accessToken, refreshToken: res.auth.refreshToken };
      await tokenStorage.set(this.tokens);
      this.saveUser(res.auth.user, res.auth.isSelfHosted);
    }
    return res.state;
  }

  /** The phone, signed in, reads a scanned code: which browser is asking. 410 = run out. */
  async lookUpPairing(code: string): Promise<{ device: string; expiresAt: string; secondsLeft: number }> {
    return this.fetch("/auth/pair/look", { method: "POST", body: JSON.stringify({ code }) });
  }

  async answerPairing(code: string, approve: boolean): Promise<void> {
    await this.fetch("/auth/pair/answer", { method: "POST", body: JSON.stringify({ code, approve }) });
  }

  /** Account › Where you're signed in. */
  async listSessions(): Promise<SignedInSession[]> {
    return (await this.fetch<{ sessions: SignedInSession[] }>("/auth/sessions")).sessions;
  }

  async signOutSession(id: string): Promise<void> {
    await this.fetch(`/auth/sessions/${id}`, { method: "DELETE" });
  }

  async deleteAccount(password: string): Promise<void> {
    await this.fetch("/auth/account", {
      method: "DELETE",
      body: JSON.stringify({ password }),
    });
    this.tokens = null;
    this.clearUser();
    await tokenStorage.clear();
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.fetch("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  /** Always resolves — the server intentionally never reveals whether the email matched. */
  async forgotPassword(email: string): Promise<{ error?: string }> {
    return this.fetch("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.fetch("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    });
  }

  async logout(): Promise<void> {
    if (this.tokens) {
      try {
        await this.fetch("/auth/revoke", {
          method: "POST",
          body: JSON.stringify({ refreshToken: this.tokens.refreshToken }),
        });
      } catch {}
    }
    this.tokens = null;
    this.clearUser();
    await tokenStorage.clear();
  }

  /** Clear local auth state without calling the revoke endpoint (e.g. when switching accounts). */
  async clearLocal(): Promise<void> {
    this.tokens = null;
    this.clearUser();
    await tokenStorage.clear();
  }

  // Self-hosting

  setBaseUrl(url: string): void {
    localStorage.setItem(sessionKey(BASE_URL_KEY), normalizeServerUrl(url));
  }

  getBaseUrl(): string {
    return getBaseUrl();
  }

  resetBaseUrl(): void {
    localStorage.removeItem(sessionKey(BASE_URL_KEY));
  }

  /**
   * The web dashboard only talks to its own server. Forget a server picked at sign-in in the
   * past (the web no longer offers it); if it was another server, its session goes too.
   * Returns true when that signed someone out.
   */
  async forgetPickedServer(): Promise<boolean> {
    const picked = localStorage.getItem(sessionKey(BASE_URL_KEY));
    if (picked === null) return false;
    this.resetBaseUrl();
    localStorage.removeItem(sessionKey(SERVER_MODE_KEY));
    if (picked === (runtimeApiUrl() ?? DEFAULT_BASE_URL)) return false;
    await this.clearLocal();
    return true;
  }

  async updateDisplayName(displayName: string): Promise<void> {
    await this.fetch("/users/me", {
      method: "PATCH",
      body: JSON.stringify({ displayName }),
    });
    if (this.cachedUser) {
      this.saveUser({ ...this.cachedUser, displayName }, this.cachedIsSelfHosted);
    }
  }

  async updateOnboardingCompleted(value: boolean): Promise<void> {
    await this.fetch("/users/me", {
      method: "PATCH",
      body: JSON.stringify({ onboardingCompleted: value }),
    });
    if (this.cachedUser) {
      this.saveUser({ ...this.cachedUser, onboardingCompleted: value }, this.cachedIsSelfHosted);
    }
  }

  // Billing

  async createCheckoutSession(
    successUrl: string,
    cancelUrl: string,
    plan: "pro" | "studio" = "pro",
  ): Promise<string> {
    const data: { checkoutUrl: string } = await this.fetch("/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ successUrl, cancelUrl, plan }),
    });
    return data.checkoutUrl;
  }

  async getBillingStatus(): Promise<BillingStatus> {
    return this.fetch("/billing/status");
  }

  /** Reports a Google Play purchase (after buying, and for each purchase Play lists on start-up)
   * so the server can check it with Google and switch the plan on. Errors carry a `code`:
   * invalid_purchase, other_account, store_unavailable, store_not_configured. */
  async verifyGooglePurchase(purchaseToken: string): Promise<BillingStatus> {
    return this.fetch("/billing/google/verify", {
      method: "POST",
      body: JSON.stringify({ purchaseToken }),
    });
  }

  /** Reconciles the whole cached auth identity against server truth. `init()` only reads
   * the local user blob, which is written at login and can go stale or belong to a
   * different account (token refresh, another tab logging in on the same origin). Calling
   * this on boot makes the displayed identity — id, name, tier, onboarding state — match
   * the token that requests actually carry. A rejected/duplicate token clears local auth
   * so the app falls back to login instead of showing a ghost session; transient failures
   * (offline, 5xx) keep the last-known blob and retry next boot. */
  async reconcileSession(): Promise<void> {
    if (!this.tokens) return;
    try {
      const me = await this.fetch<{
        id: string;
        username: string;
        displayName: string;
        avatarUrl: string | null;
        tier?: string | null;
        onboardingCompleted?: boolean | null;
      }>("/users/me");
      this.saveUser(
        {
          id: me.id,
          username: me.username,
          displayName: me.displayName,
          avatarUrl: me.avatarUrl,
          tier: me.tier ?? this.cachedUser?.tier ?? "Free",
          onboardingCompleted:
            me.onboardingCompleted ?? this.cachedUser?.onboardingCompleted ?? false,
        },
        this.cachedIsSelfHosted,
      );
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
        await this.clearLocal();
      }
    }
  }

  async createBillingPortalSession(returnUrl: string): Promise<string> {
    const data: { portalUrl: string } = await this.fetch("/billing/portal", {
      method: "POST",
      body: JSON.stringify({ returnUrl }),
    });
    return data.portalUrl;
  }
}

export type BillingSubscriptionState =
  | "pending"
  | "active"
  /** Won't renew; paid up until expiresAt. */
  | "canceled"
  /** A payment failed and the store is retrying. Still has access. */
  | "gracePeriod"
  /** A payment failed for too long. No access until fixed in the store. */
  | "onHold"
  | "paused"
  | "expired"
  | "revoked";

export type BillingStatus = {
  /** The plan in force now. */
  tier: "Free" | "Pro" | "Studio";
  /** A paid subscription is giving access now. */
  subscriptionActive: boolean;
  /** A plan given by hand on the admin page, if any. */
  manualTier?: "Pro" | "Studio" | null;
  /** The subscription giving access, else the most recent one. */
  subscription?: {
    source: "google" | "apple" | "stripe";
    plan: "Pro" | "Studio";
    state: BillingSubscriptionState;
    expiresAt: string | null;
    autoRenewing: boolean;
    grantsAccess: boolean;
    productId: string;
    /** The store's subscription page. Null for Stripe: use createBillingPortalSession. */
    manageUrl: string | null;
  } | null;
  /** Whether the website sells plans (off at launch: plans are sold in the app). */
  webCheckout?: boolean;
};

export const apiClient = new ApiClient();

/** Anything with the API client's fetch: apiClient itself, or withToken(...). */
export interface ApiFetcher {
  fetch<T>(path: string, init?: RequestInit): Promise<T>;
}

/** Calls the API as someone else: a sandbox sample client, with the short-lived token its
 * coach got from POST /coach/sandbox/clients/{id}/token. Same base URL, logging and errors. */
export function withToken(token: string): ApiFetcher {
  return {
    fetch: <T>(path: string, init: RequestInit = {}) =>
      apiClient.fetch<T>(path, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
      }),
  };
}
