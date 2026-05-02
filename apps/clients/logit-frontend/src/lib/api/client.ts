import { tokenStorage, type StoredTokens } from "./tokenStorage";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  tier: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
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
const DEFAULT_BASE_URL = "https://api.logit.app";

function getBaseUrl(): string {
  return localStorage.getItem(BASE_URL_KEY) ?? DEFAULT_BASE_URL;
}

class ApiClient {
  private tokens: StoredTokens | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  async init(): Promise<void> {
    this.tokens = await tokenStorage.get();
  }

  isAuthenticated(): boolean {
    return this.tokens !== null;
  }

  getUser(): AuthUser | null {
    if (!this.tokens) return null;
    try {
      const payload = JSON.parse(atob(this.tokens.accessToken.split(".")[1]));
      return {
        id: payload.sub,
        username: payload.unique_name,
        displayName: payload.display_name ?? payload.unique_name,
        avatarUrl: payload.avatar_url ?? null,
        tier: payload.tier ?? "Free",
      };
    } catch {
      return null;
    }
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
          await this.logout();
          return false;
        }
        const data: AuthResponse = await res.json();
        this.tokens = { accessToken: data.accessToken, refreshToken: data.refreshToken };
        await tokenStorage.set(this.tokens);
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
    return data.user;
  }

  async login(usernameOrEmail: string, password: string): Promise<AuthUser> {
    const data: AuthResponse = await this.fetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ usernameOrEmail, password }),
    });
    this.tokens = { accessToken: data.accessToken, refreshToken: data.refreshToken };
    await tokenStorage.set(this.tokens);
    return data.user;
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
}

export const apiClient = new ApiClient();
