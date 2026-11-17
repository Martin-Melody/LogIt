// A simulated Android phone running the real app code. What a phone keeps across an app
// restart lives here (SQLite database, localStorage/Preferences, the secure token store);
// `launch()` throws away every loaded module and starts the app again on top of it.
//
// The user actions (`register`, `signIn`, `switchProfile`, …) make the same calls, in the same
// order, as the screen that offers them — each one names its screen. Keep them in step when
// those screens change.
import { vi } from "vitest";
import { get } from "svelte/store";
import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
import type { WorkoutSession } from "@logit/core/domain/workout";
import { createNodeSqliteDb } from "../../unit/support/nodeSqliteDb";
import { setCurrentDevice } from "./deviceState";
import { CLOUD, SELF_HOST, type ServerName } from "./servers";

class MemoryStorage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  key(i: number) { return [...this.store.keys()][i] ?? null; }
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
  keys() { return [...this.store.keys()]; }
}

const realFetch = globalThis.fetch;

/** Everything the app exposes that the journeys read or drive, loaded fresh on each launch. */
async function loadApp() {
  // One at a time, startup module first, the way the app loads: importing them all at once
  // let one module see another half-loaded (they import each other).
  const appInit = await import("$lib/platform/appInit");
  const auth = await import("$lib/api/authStore.svelte");
  const accounts = await import("$lib/data/localAccountRepo");
  const activeOwner = await import("$lib/data/activeOwner");
  const repos = await import("$lib/data/repoProvider");
  const appReadyStore = await import("$lib/stores/appReady.store");
  const onboardingStore = await import("$lib/stores/onboarding.store");
  const profileStore = await import("$lib/stores/profile.store");
  const navConfigStore = await import("$lib/stores/navConfig.store");
  const splitsStore = await import("$lib/stores/splits.store");
  const serverConfig = await import("@logit/core/api/serverConfig");
  const client = await import("@logit/core/api/client");
  const sync = await import("$lib/sync/syncService");
  const { launchRedirect } = await import("$lib/platform/launchRedirect");
  return {
    appInit, auth, accounts, activeOwner, repos, appReadyStore, onboardingStore, profileStore,
    navConfigStore, splitsStore, serverConfig, client, sync, launchRedirect,
  };
}
type App = Awaited<ReturnType<typeof loadApp>>;

let deviceCount = 0;

export class Device {
  readonly name: string;
  readonly db: SQLiteDBConnection;
  readonly storage = new MemoryStorage();
  readonly secure = new Map<string, string>();
  /** Every screen the app went to, in order. */
  readonly routes: string[] = [];
  /** Every request the app sent to a server, as "METHOD /path" (query string dropped). */
  readonly requests: string[] = [];
  /** No signal: every request fails the way fetch() does offline. */
  networkDown = false;
  private inFlight = 0;
  private lastActivity = Date.now();
  private _app: App | null = null;

  constructor(name = `phone-${++deviceCount}`) {
    this.name = name;
    this.db = createNodeSqliteDb();
  }

  get app(): App {
    if (!this._app) throw new Error(`${this.name} isn't running. Call launch() first.`);
    return this._app;
  }

  /** The screen the user is looking at now. */
  get route(): string {
    return this.routes.at(-1) ?? "/";
  }

  navigatedTo(href: string): void {
    this.routes.push(href);
  }

  /**
   * Starts the app (again) on this phone: a cold start, like swiping it away and reopening it.
   * Lands where the root layout would send the user from `path` (default "/").
   */
  async launch(path = "/"): Promise<this> {
    await this.stop();
    this.install();
    vi.resetModules();
    this._app = await loadApp();
    this.routes.push(path);
    await this._app.appInit.appInit();
    await this.settle();
    this.followLaunchRedirect();
    return this;
  }

  /** Stops background work from the current run (timers, listeners). */
  async stop(): Promise<void> {
    if (!this._app) return;
    this._app.appInit.stopBackgroundSync();
    await this.settle();
    this._app = null;
  }

  /** Makes this phone the one the mocked plugins, storage and network talk to. */
  private install(): void {
    setCurrentDevice(this);
    const device = this;
    Object.defineProperty(globalThis, "localStorage", { value: this.storage, writable: true, configurable: true });
    const location = {
      get href() { return `http://localhost${device.route}`; },
      set href(v: string) {
        // A full page load: the real app restarts on that page. launchAfterReload() does it.
        device.pendingReload = new URL(v, "http://localhost").pathname;
      },
      get pathname() { return device.route; },
      reload() { device.pendingReload = device.route; },
      assign(v: string) { this.href = v; },
      replace(v: string) { this.href = v; },
    };
    const noop = () => {};
    Object.defineProperty(globalThis, "window", {
      value: Object.assign(globalThis, { location, addEventListener: noop, removeEventListener: noop }),
      writable: true, configurable: true,
    });
    Object.defineProperty(globalThis, "document", {
      value: { visibilityState: "visible", addEventListener: noop, removeEventListener: noop, documentElement: { style: {}, classList: { add: noop, remove: noop, toggle: noop } } },
      writable: true, configurable: true,
    });
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "LogitJourneyTest Android", onLine: true, language: "en-IE" },
      writable: true, configurable: true,
    });
    // Only the two local test APIs are reachable; anything else (food lookups, music, …)
    // fails as if the phone had no signal for it, so tests never touch the real internet.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith(CLOUD) && !url.startsWith(SELF_HOST)) {
        return new Response("blocked in journey tests", { status: 503 });
      }
      if (device.networkDown) throw new TypeError("Failed to fetch");
      const server = url.startsWith(CLOUD) ? "cloud" : "self-host";
      device.requests.push(`${(init?.method ?? "GET").toUpperCase()} ${server} ${new URL(url).pathname}`);
      device.inFlight++;
      device.lastActivity = Date.now();
      try {
        return await realFetch(input, init);
      } finally {
        device.inFlight--;
        device.lastActivity = Date.now();
      }
    }) as typeof fetch;
  }

  pendingReload: string | null = null;

  private followLaunchRedirect(): void {
    const { appReadyStore, onboardingStore } = this.app;
    const to = this.app.launchRedirect({
      ready: get(appReadyStore.appReady),
      onboardingCompleted: get(onboardingStore.onboarding).completed,
      needsAccountAuth: get(appReadyStore.needsAccountAuth),
      path: this.route,
    });
    if (to) this.routes.push(to);
  }

  /** Waits until the app has stopped talking to the server (fire-and-forget syncs included). */
  async settle(quietMs = 250, timeoutMs = 20_000): Promise<void> {
    const start = Date.now();
    for (;;) {
      await new Promise((r) => setTimeout(r, 25));
      if (this.inFlight === 0 && Date.now() - this.lastActivity >= quietMs) return;
      if (Date.now() - start > timeoutMs) throw new Error(`${this.name}: network never went quiet`);
    }
  }

  /** If the last action did a full page load (window.location.href = …), restart there. */
  private async followReload(): Promise<void> {
    const to = this.pendingReload;
    if (!to) return;
    this.pendingReload = null;
    await this.launch(to);
  }

  // ── What the user does ─────────────────────────────────────────────────────────────────

  /** Onboarding screen (src/routes/onboarding): name step, optional split, finish. */
  async finishOnboarding(opts: { name?: string; split?: string } = {}): Promise<void> {
    const { profileStore, onboardingStore } = this.app;
    if (opts.name) profileStore.profile.save({ name: opts.name });
    onboardingStore.onboarding.setStep(2);
    if (opts.split) {
      const split = await this.saveSplit(opts.split);
      await this.app.splitsStore.splits.setActive(split.id);
    }
    onboardingStore.onboarding.complete();
    this.routes.push("/");
    await this.settle();
  }

  /** Sign-up on the sign-in screen (src/routes/auth submit()). */
  async register(user: { username: string; email: string; password: string }, server: ServerName = "cloud"): Promise<void> {
    this.pickServer(server);
    const { auth, profileStore } = this.app;
    const displayName = get(profileStore.profile).name.trim() || user.username;
    await auth.authStore.register(user.username, user.email, user.password, displayName);
    this.routes.push(this.afterAuthRoute());
    await this.settle();
  }

  /** Log in on the sign-in screen (src/routes/auth submit()). */
  async signIn(user: { username: string; password: string }, server: ServerName = "cloud"): Promise<void> {
    this.pickServer(server);
    await this.app.auth.authStore.login(user.username, user.password);
    this.routes.push(this.afterAuthRoute());
    await this.settle();
  }

  /** Settings › Sign out. On a phone this reloads the app on /accounts or /auth. */
  async signOut(): Promise<void> {
    await this.app.auth.authStore.logout();
    await this.settle();
    await this.followReload();
  }

  /** Settings › Delete account. Reloads on /auth afterwards. */
  async deleteAccount(password = ""): Promise<void> {
    await this.app.auth.authStore.deleteAccount(password);
    await this.settle();
    await this.followReload();
  }

  /** Profiles screen (src/routes/accounts switchTo()). */
  async switchProfile(profileId: string, password = ""): Promise<void> {
    const { auth, accounts } = this.app;
    await auth.authStore.loginOfflineAccount(profileId, password);
    const account = await accounts.getLocalAccount(profileId);
    this.routes.push(account ? accounts.postSwitchDestination(account) : "/");
    await this.settle();
  }

  /** Profiles screen › Add profile (src/routes/accounts addProfile()). */
  async addProfile(): Promise<void> {
    await this.app.auth.authStore.createOfflineAccount("", "");
    this.routes.push("/onboarding");
    await this.settle();
  }

  /** Runs a sync now, as the background timer or Settings › Sync now does. */
  async sync(): Promise<void> {
    await this.app.sync.syncAll();
    await this.settle();
  }

  /** Pulls the plan and profile from the server again (after a purchase or a store notice). */
  async refreshPlan(): Promise<void> {
    await this.app.auth.authStore.refreshUser();
    await this.settle();
  }

  /** Settings › Navigation › Swipe between tabs. Stands in for every layout setting. */
  setSwipe(on: boolean): void {
    this.app.navConfigStore.navConfig.setSwipe(on);
  }

  get swipeOn(): boolean {
    return get(this.app.navConfigStore.navConfig).swipe !== false;
  }

  /** Social › Privacy (lives on the server, per account). */
  async setPrivate(isPrivate: boolean): Promise<void> {
    const { socialApi } = await import("@logit/core/api/socialApi");
    await socialApi.updateSettings({ isPrivate });
  }

  async isPrivate(): Promise<boolean> {
    const { socialApi } = await import("@logit/core/api/socialApi");
    return (await socialApi.getSettings()).isPrivate;
  }

  /** The login on this phone stopped working (expired or revoked on the server). */
  breakStoredLogin(): void {
    for (const key of this.secure.keys()) if (key.startsWith("logit:auth:")) this.secure.set(key, "expired-token");
  }

  /** Rows in the phone's database that belong to a profile, across every per-profile table. */
  async rowsOwnedBy(profileId: string): Promise<number> {
    const tables = await this.db.query(`SELECT name FROM sqlite_master WHERE type='table'`);
    let total = 0;
    for (const { name } of (tables.values ?? []) as { name: string }[]) {
      const cols = await this.db.query(`PRAGMA table_info(${name})`);
      if (!((cols.values ?? []) as { name: string }[]).some((c) => c.name === "owner_id")) continue;
      const r = await this.db.query(`SELECT COUNT(*) AS n FROM ${name} WHERE owner_id = ?`, [profileId]);
      total += Number(((r.values ?? [])[0] as { n: number }).n);
    }
    return total;
  }

  private pickServer(server: ServerName): void {
    const { serverConfig } = this.app;
    // "Use getlogit.app" vs "Connect to a different server" on the sign-in screen.
    if (server === "self-host") serverConfig.setServerMode("selfhosted", SELF_HOST);
    else serverConfig.setServerMode("cloud");
  }

  private afterAuthRoute(): string {
    return get(this.app.onboardingStore.onboarding).completed ? "/" : "/onboarding";
  }

  // ── Data the user makes ────────────────────────────────────────────────────────────────

  async saveSplit(name: string): Promise<WorkoutSplit> {
    const now = Date.now();
    const split: WorkoutSplit = {
      id: `split-${name.replace(/\W+/g, "-").toLowerCase()}-${now}-${Math.random().toString(36).slice(2, 7)}`,
      name, archived: false, createdAtMs: now, updatedAtMs: now, days: [],
    };
    // The split editor's save (uploads it too when the account syncs).
    const { saveSplit } = await import("$lib/usecases/Splits/saveSplit");
    await saveSplit(split);
    await this.app.splitsStore.splits.refresh({ limit: 20 });
    await this.settle();
    return split;
  }

  async splitNames(): Promise<string[]> {
    const list = await this.app.repos.getSplitRepo().getListSplits({ includeArchived: true });
    return list.map((s) => s.name).sort();
  }

  async logWorkout(name: string): Promise<WorkoutSession> {
    const now = Date.now();
    const session: WorkoutSession = {
      id: `session-${now}-${Math.random().toString(36).slice(2, 7)}`,
      startedAtMs: now - 45 * 60_000, endedAtMs: now, blocks: [], name,
    };
    // Finishing a workout (uploads it too when the account syncs).
    const { finishCurrentSession } = await import("$lib/usecases/finishCurrentSession");
    const finished = await finishCurrentSession(session);
    await this.settle();
    return finished;
  }

  async workoutNames(): Promise<string[]> {
    const list = await this.app.repos.getWorkoutRepo().listAllSessions();
    return list.map((s) => s.name ?? "").sort();
  }

  // ── What the app shows ─────────────────────────────────────────────────────────────────

  get signedIn(): boolean {
    return this.app.auth.authStore.isAuthenticated;
  }

  get user() {
    return this.app.auth.authStore.user;
  }

  get onboardingDone(): boolean {
    return get(this.app.onboardingStore.onboarding).completed;
  }

  get profileName(): string {
    return get(this.app.profileStore.profile).name;
  }

  async profiles() {
    return this.app.accounts.listLocalAccounts();
  }

  async activeProfile() {
    const id = this.app.activeOwner.getActiveOwnerId();
    return id ? this.app.accounts.getLocalAccount(id) : null;
  }
}
