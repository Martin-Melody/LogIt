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
  /** Requests matching this ("METHOD server /path") get a 503, like a server falling over halfway. */
  failRequests: RegExp | null = null;
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
      const request = `${(init?.method ?? "GET").toUpperCase()} ${server} ${new URL(url).pathname}`;
      device.requests.push(request);
      if (device.failRequests?.test(request)) return new Response("server fell over", { status: 503 });
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

  /**
   * The onboarding questions (design canvas O1, E0, O2, O3) answered, and "I'll start later":
   * the plan they build is saved and onboarding ends.
   */
  async onboardWithPlan(answers: import("@logit/core/domain/starterPlan").StarterAnswers) {
    const { buildStarterPlan } = await import("@logit/core/domain/starterPlan");
    const { saveStarterPlan } = await import("$lib/features/onboarding/saveStarterPlan");
    const plan = buildStarterPlan(answers);
    const split = await saveStarterPlan(plan);
    this.app.onboardingStore.onboarding.complete();
    this.routes.push("/");
    await this.settle();
    return { plan, split };
  }

  /** Onboarding screen before 2026-11-17 (name step, optional split, finish); still how most journeys set up. */
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
  async signIn(
    user: { username: string; password: string },
    server: ServerName = "cloud",
    offlineTraining?: "add" | "keep-separate",
  ): Promise<void> {
    this.pickServer(server);
    // The sign-in screen asks "Is the training on this phone yours?" first when there is
    // training without an account (offlineTrainingToAsk); `offlineTraining` is the answer.
    await this.app.auth.authStore.login(user.username, user.password, offlineTraining ? { offlineTraining } : undefined);
    this.routes.push(this.afterAuthRoute());
    await this.settle();
  }

  /**
   * Settings › Sign out of @name (design canvas 7): the account's training leaves the phone and
   * the next account opens (or the welcome screen). `keepHere`: "Keep using it here without the
   * account" instead. Reloads the app.
   */
  async signOut(opts: { keepHere?: boolean } = {}): Promise<void> {
    await this.app.auth.authStore.signOutOfAccount(opts);
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
  async switchProfile(profileId: string): Promise<void> {
    const { auth, accounts } = this.app;
    await auth.authStore.loginOfflineAccount(profileId);
    const account = await accounts.getLocalAccount(profileId);
    this.routes.push(account ? accounts.postSwitchDestination(account, auth.authStore.isAuthenticated) : "/");
    await this.settle();
  }

  /**
   * Account menu › Add account, then sign in: the account in use stays signed in and the new
   * one gets its own space (authStore.beginAddingAccount, then the sign-in screen).
   */
  async addAccount(user: { username: string; password: string; email?: string }, server: ServerName = "cloud", mode: "signIn" | "register" = "signIn"): Promise<void> {
    await this.app.auth.authStore.beginAddingAccount();
    if (mode === "register") await this.register({ username: user.username, email: user.email ?? `${user.username}@journey.test`, password: user.password }, server);
    else await this.signIn(user, server);
  }

  /** Profiles screen › Add profile (src/routes/accounts addProfile()). */
  /**
   * Settings › Move to another server (design canvas 9): `to` is where to ("nowhere" is an
   * address with no Logit server behind it). Returns what the screen shows afterwards.
   */
  async moveServer(
    to: ServerName | "nowhere",
    user: { username: string; password: string; email?: string },
    account: "new" | "existing" = "new",
  ) {
    const { moveToServer } = await import("$lib/accounts/moveServer");
    const url = to === "cloud" ? null : to === "self-host" ? SELF_HOST : "http://127.0.0.1:5299";
    const result = await moveToServer({ url, account, username: user.username, password: user.password, email: user.email });
    await this.settle();
    return result;
  }

  async addProfile(): Promise<void> {
    const result = await this.app.auth.authStore.createOfflineAccount("", "");
    this.routes.push(result === "created" ? "/onboarding" : "/");
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

  /** This install's id, sent as X-Logit-Device (a Free account's backup belongs to one phone). */
  get deviceId(): string | null {
    return this.storage.getItem("logit:device-id");
  }

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
