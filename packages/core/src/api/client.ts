import { tokenStorage, type StoredTokens } from "./tokenStorage";

const USER_KEY = "logit:auth:user";
const SELF_HOSTED_KEY = "logit:auth:selfHosted";

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
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const BASE_URL_KEY = "logit:api:baseUrl";
// Falls back to the live App Runner URL (infra/aws terraform output api_service_url) so
// every app works out of the box; set VITE_API_URL at build time once api.logit.ie is live.
const DEFAULT_BASE_URL: string =
  import.meta.env.VITE_API_URL || "https://zczrd44n9t.eu-west-1.awsapprunner.com";

function getBaseUrl(): string {
  return localStorage.getItem(BASE_URL_KEY) ?? DEFAULT_BASE_URL;
}

class ApiClient {
  private tokens: StoredTokens | null = null;
  private cachedUser: AuthUser | null = null;
  private cachedIsSelfHosted = false;
  private refreshPromise: Promise<boolean> | null = null;

  async init(): Promise<void> {
    this.tokens = await tokenStorage.get();
    if (this.tokens) {
      try {
        const raw = localStorage.getItem(USER_KEY);
        this.cachedUser = raw ? (JSON.parse(raw) as AuthUser) : null;
      } catch {
        this.cachedUser = null;
      }
      this.cachedIsSelfHosted = localStorage.getItem(SELF_HOSTED_KEY) === "true";
    }
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
    this.cachedUser = user;
    this.cachedIsSelfHosted = isSelfHosted;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(SELF_HOSTED_KEY, String(isSelfHosted));
  }

  private clearUser(): void {
    this.cachedUser = null;
    this.cachedIsSelfHosted = false;
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(SELF_HOSTED_KEY);
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
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async fetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const doRequest = async (token: string | null) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string>),
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      return fetch(`${getBaseUrl()}${path}`, { ...init, headers });
    };

    let res = await doRequest(this.tokens?.accessToken ?? null);

    if (res.status === 401 && this.tokens) {
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        res = await doRequest(this.tokens!.accessToken);
      }
    }

    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = await res.json();
        message = body?.error ?? message;
      } catch {}
      throw new ApiError(res.status, message);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  }

  // Auth

  async register(
    username: string,
    email: string,
    password: string,
    displayName: string,
  ): Promise<AuthUser> {
    const data: AuthResponse = await this.fetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password, displayName }),
    });
    this.tokens = { accessToken: data.accessToken, refreshToken: data.refreshToken };
    await tokenStorage.set(this.tokens);
    this.saveUser(data.user, data.isSelfHosted);
    return data.user;
  }

  async login(usernameOrEmail: string, password: string): Promise<AuthUser> {
    const data: AuthResponse = await this.fetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ usernameOrEmail, password }),
    });
    this.tokens = { accessToken: data.accessToken, refreshToken: data.refreshToken };
    await tokenStorage.set(this.tokens);
    this.saveUser(data.user, data.isSelfHosted);
    return data.user;
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
    localStorage.setItem(BASE_URL_KEY, url.replace(/\/$/, ""));
  }

  getBaseUrl(): string {
    return getBaseUrl();
  }

  resetBaseUrl(): void {
    localStorage.removeItem(BASE_URL_KEY);
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

export type BillingStatus = {
  tier: "Free" | "Pro" | "Studio";
  subscriptionActive: boolean;
};

export const apiClient = new ApiClient();
