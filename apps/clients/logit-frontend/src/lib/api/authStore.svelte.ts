import { apiClient, type AccountClosingChoice, type AuthUser } from "@logit/core/api/client";
import { getServerMode } from "@logit/core/api/serverConfig";
import { isNativePlatform } from "$lib/platform/isNative";
import { getActiveOwnerId, setActiveOwnerId, loadActiveOwnerId, onActiveOwnerChange } from "$lib/data/activeOwner";
import { getSessionScope, setSessionScope } from "@logit/core/api/sessionScope";
import { getSelfHostUrl, setServerMode } from "@logit/core/api/serverConfig";
import { resetRepos, initRepos } from "$lib/data/repoProvider";
import { rehydrateStores, startBackgroundSync, stopBackgroundSync } from "$lib/platform/appInit";
import { needsAccountAuth } from "$lib/stores/appReady.store";
import { syncAll, markFullUploadDue, planIncludesSync } from "$lib/sync/syncService";
import { log } from "@logit/core/platform/log";
import { onboarding } from "$lib/stores/onboarding.store";

/** Re-initialize repos then flush all data stores for the new active owner. */
async function switchActiveOwner(): Promise<void> {
  resetRepos();
  await initRepos();
  await rehydrateStores();
  needsAccountAuth.set(false);
}

// On the phone every account keeps its own sign-in (tokens, server, cached user): the API client
// uses the active account's. The web has one account per browser and no scope.
onActiveOwnerChange(() => setSessionScope(isNativePlatform() ? getActiveOwnerId() : null));

function createAuthStore() {
  let user = $state<AuthUser | null>(null);
  let ready = $state(false);

  async function init() {
    if (getServerMode() === "offline") {
      ready = true;
      return;
    }
    await apiClient.init();
    user = apiClient.getUser();
    ready = true;
  }

  // ── Online login / register ──────────────────────────────────────────────

  /**
   * Signing in from the space without an account while it holds training: the sign-in screen
   * asks whether it's the person's own ("add" links it to the account) or someone else's
   * ("keep-separate" leaves it and gives the account its own space). Null when there's nothing
   * to ask: no training there, an account in use, or the web.
   */
  async function offlineTrainingToAsk(): Promise<{ workouts: number; splits: number; name: string } | null> {
    if (!isNativePlatform()) return null;
    const ownerId = getActiveOwnerId();
    if (!ownerId) return null;
    const { getLocalAccount } = await import("$lib/data/localAccountRepo");
    const account = await getLocalAccount(ownerId);
    if (!account || account.serverUserId) return null;
    const { getWorkoutRepo, getSplitRepo } = await import("$lib/data/repoProvider");
    const workouts = (await getWorkoutRepo().listAllSessions()).length;
    const splits = (await getSplitRepo().getListSplits({ includeArchived: true })).length;
    if (workouts + splits === 0) return null;
    return { workouts, splits, name: account.displayName };
  }

  async function login(
    usernameOrEmail: string,
    password: string,
    opts: { offlineTraining?: "add" | "keep-separate" } = {},
  ) {
    // "Someone else's": sign in from no account, so the offline training isn't linked, taking
    // the server picked on the sign-in screen along. A failed sign-in goes back to it.
    let returnTo: string | null = null;
    if (opts.offlineTraining === "keep-separate" && isNativePlatform() && getActiveOwnerId()) {
      returnTo = getActiveOwnerId();
      const picked = { mode: getServerMode(), url: getSelfHostUrl() };
      setServerMode("offline");
      await beginAddingAccount();
      setServerMode(picked.mode, picked.url);
    }
    let serverUser: AuthUser;
    try {
      serverUser = await apiClient.login(usernameOrEmail, password);
    } catch (e) {
      if (returnTo) await loginOfflineAccount(returnTo);
      throw e;
    }
    user = serverUser;
    log.info("auth", "Signed in", { tier: serverUser.tier, selfHosted: apiClient.isSelfHosted() });
    if (isNativePlatform()) await linkOrCreateLocalAccount(serverUser);
    else onboarding.syncWithServer(serverUser.onboardingCompleted);
    // Send this device's existing local history too — otherwise only records created after
    // this sign-in ever reach the server, and everything logged offline up to now stays
    // without a cloud copy. syncAll() does it, the profile after its pulls (see
    // pushCurrentProfile()), and keeps trying on later syncs until the plan allows it and it
    // gets through (see markFullUploadDue).
    markFullUploadDue();
    void syncAll();
    startBackgroundSync();
    void import("$lib/billing/billing.svelte").then((m) => m.billing.start());
  }

  async function register(username: string, email: string, password: string, displayName: string, inviteCode?: string) {
    const serverUser = await apiClient.register(username, email, password, displayName, inviteCode);
    user = serverUser;
    log.info("auth", "Account created and signed in", { selfHosted: apiClient.isSelfHosted() });
    if (isNativePlatform()) await linkOrCreateLocalAccount(serverUser);
    else onboarding.syncWithServer(serverUser.onboardingCompleted);
    markFullUploadDue();
    void syncAll();
    startBackgroundSync();
    void import("$lib/billing/billing.svelte").then((m) => m.billing.start());
  }

  async function linkOrCreateLocalAccount(serverUser: AuthUser) {
    const {
      getLocalAccountByServerUserId,
      createLocalAccount,
      updateLocalAccount,
      claimOrphanedData,
      getLocalAccount,
      listLocalAccounts,
      orphanClaimTarget,
    } = await import("$lib/data/localAccountRepo");

    // Where the sign-in was made: the account in use (re-signing in, or linking an offline
    // profile) or no account at all (adding one). It's moved to the account it belongs to below.
    const signedInFrom = getSessionScope();
    let account = await getLocalAccountByServerUserId(serverUser.id);

    if (account) {
      // Known server user — switch to their local account. Re-sync onboarding status from
      // the server every time, not just on first link: it's the source of truth (e.g. they
      // could have completed onboarding on a different device since this one last saw them).
      // The name stays the one on this phone when it has one: the account's display name
      // can lag behind it (a name typed in onboarding after signing up used to stay on the
      // phone only), and signing back in used to replace it with the username. A rename on
      // another device still arrives through the synced profile.
      setActiveOwnerId(account.id);
      await updateLocalAccount(account.id, {
        username: serverUser.username,
        displayName: account.displayName.trim() || serverUser.displayName || account.displayName,
        serverUserId: serverUser.id,
        onboardingCompleted: account.onboardingCompleted || serverUser.onboardingCompleted,
      });
    } else {
      // Try to link the currently active unlinked local account (e.g. created during onboarding)
      const currentId = getActiveOwnerId();
      if (currentId) {
        const current = await getLocalAccount(currentId);
        if (current && !current.serverUserId) {
          // Onboarding is done if it was done on either side: on the server (an account that
          // finished it on another device — a fresh local profile defaults to false, and
          // logging in from one used to mean onboarding again every time) or on this phone
          // (someone who onboarded offline and then makes an account used to be sent through
          // it a second time, because a new account says false).
          const onboardingCompleted = current.onboardingCompleted || serverUser.onboardingCompleted;
          // The account's username replaces the space's placeholder ("local"), which the
          // account switcher showed as "@local".
          await updateLocalAccount(currentId, {
            username: serverUser.username,
            serverUserId: serverUser.id,
            // Prefer the name the user already set locally; fall back to server if blank
            displayName: current.displayName.trim() || serverUser.displayName || current.displayName,
            onboardingCompleted,
          });
          if (onboardingCompleted && !serverUser.onboardingCompleted) {
            apiClient.updateOnboardingCompleted(true)
              .catch((e) => log.warn("auth", "Could not save onboarding status to the server", e));
          }
          account = { ...current, username: serverUser.username, serverUserId: serverUser.id, onboardingCompleted };
        }
      }

      if (!account) {
        // First time this server user has logged in on this device — create a fresh local
        // account. See orphanClaimTarget() for why any owner_id-IS-NULL rows go to whichever
        // profile was active before this one (currentId), not to the new account.
        const accountsBeforeCreate = (await listLocalAccounts()).length;
        account = await createLocalAccount({
          username: serverUser.username,
          displayName: serverUser.displayName ?? "",
          serverUserId: serverUser.id,
          onboardingCompleted: serverUser.onboardingCompleted,
        });
        setActiveOwnerId(account.id);
        const claimTarget = orphanClaimTarget(accountsBeforeCreate, currentId, account.id);
        if (claimTarget) await claimOrphanedData(claimTarget);
      }
    }

    await apiClient.moveSessionFrom(signedInFrom);
    await switchActiveOwner();
  }

  /**
   * Account menu › Add account: leave the account in use signed in and sign in from no account,
   * so the new sign-in can't land on top of the current one. linkOrCreateLocalAccount() then
   * gives it its own space.
   */
  async function beginAddingAccount(): Promise<void> {
    stopBackgroundSync();
    user = null;
    setActiveOwnerId(null);
    await apiClient.reloadSession();
  }

  // ── Offline login / create ───────────────────────────────────────────────

  /**
   * Activate an existing local account by ID.
   * Password is optional — only verified when the account has one set.
   */
  async function loginOfflineAccount(accountId: string): Promise<void> {
    if (!isNativePlatform()) return; // offline accounts only exist on native

    // Local profile passwords are retired (accounts plan, step 5d): accounts each keep their own
    // sign-in, and the phone's own lock protects the phone. A stored hash is simply ignored.
    const { getLocalAccount } = await import("$lib/data/localAccountRepo");
    const account = await getLocalAccount(accountId);
    if (!account) throw new Error("Account not found.");

    // Switching restores that account's own sign-in when it has one (each account keeps its
    // session: sessionScope.ts); the account left behind stays signed in. A profile that was
    // never signed in, or whose sign-in has ended, opens offline.
    stopBackgroundSync();
    setActiveOwnerId(account.id);
    await apiClient.reloadSession();
    user = apiClient.getUser();
    await switchActiveOwner();
    if (user) {
      void syncAll();
      startBackgroundSync();
      // Check the restored sign-in is still good (and pick up a plan change) in the background.
      void refreshUser();
    }
  }

  /**
   * Create a new local-only account (or finalise the auto-created first-launch account).
   * Password is optional — only required if the user wants to protect the account.
   */
  /**
   * The space without an account: open it, or make it when the phone has none. A phone has at
   * most one (the owner's training before they sign up); anyone else on the phone signs into
   * their own account (beginAddingAccount). "opened" when one already existed.
   */
  async function createOfflineAccount(displayName: string, password: string): Promise<"created" | "opened"> {
    if (!isNativePlatform()) {
      // Web: just update the profile store — no local account infra on web
      const { profile } = await import("$lib/stores/profile.store");
      if (displayName.trim()) profile.save({ name: displayName.trim() });
      return "created";
    }

    const { listLocalAccounts: listAll } = await import("$lib/data/localAccountRepo");
    const existing = (await listAll()).find((a) => !a.serverUserId);
    if (existing) {
      if (existing.id !== getActiveOwnerId()) await loginOfflineAccount(existing.id);
      return "opened";
    }

    // The new profile starts with no sign-in; the account in use stays signed in.
    user = null;
    stopBackgroundSync();

    const { createLocalAccount, listLocalAccounts, claimOrphanedData, orphanClaimTarget } =
      await import("$lib/data/localAccountRepo");


    const activeOwnerIdBeforeCreate = getActiveOwnerId();
    const all = await listLocalAccounts();
    const slug = displayName.trim().toLowerCase().replace(/\s+/g, "_") || "local";
    const uniqueSlug = all.some((a) => a.username === slug) ? `${slug}_${Date.now()}` : slug;

    const account = await createLocalAccount({
      username: uniqueSlug,
      // Blank, not the auto-generated slug — same as ensureLocalAccount()'s true-first-launch
      // account. Falling back to the slug here used to pre-fill onboarding's name step with
      // something like "local_1789636452490"; a user who didn't clear it before typing their
      // real name ended up with the two concatenated.
      displayName: displayName.trim(),
    });
    setActiveOwnerId(account.id);
    // See orphanClaimTarget(): true first-launch adopts orphaned (owner_id IS NULL) rows
    // itself; every later "Add another profile" hands them to whoever was active instead —
    // never to the new profile, which must start with a clean slate. Without this, a second
    // profile silently inherited the first profile's un-migrated splits/workouts.
    const claimTarget = orphanClaimTarget(all.length, activeOwnerIdBeforeCreate, account.id);
    if (claimTarget) await claimOrphanedData(claimTarget);
    await apiClient.reloadSession();
    await switchActiveOwner();
    return "created";
  }

  // ── Logout / delete ──────────────────────────────────────────────────────

  async function logout() {
    if (user) {
      await (await import("$lib/platform/push")).forgetPushDevice();
      try { await apiClient.logout(); } catch (e) { log.warn("auth", "Server sign-out failed (signed out locally anyway)", e); }
    }
    log.info("auth", "Signed out");
    user = null;
    stopBackgroundSync();

    if (isNativePlatform()) {
      // Drop the active owner pointer — data stays in SQLite under owner_id
      setActiveOwnerId(null);
      // App-first: if local profiles still exist, send the user to pick one and
      // keep using the app offline rather than facing a sign-in wall.
      const { listLocalAccounts } = await import("$lib/data/localAccountRepo");
      const hasLocalAccounts = (await listLocalAccounts()).length > 0;
      window.location.href = hasLocalAccounts ? "/accounts" : "/auth";
    } else {
      const { clearAllData } = await import("$lib/usecases/clearAllData");
      await clearAllData();
    }
  }

  /** Takes an account and everything it made off the phone (its server copy is untouched). */
  async function removeFromPhone(ownerId: string): Promise<void> {
    const { clearOwnerData, getDb } = await import("$lib/data/db/sqlite");
    await clearOwnerData(ownerId);
    await getDb().run(`DELETE FROM local_accounts WHERE id = ?`, [ownerId]);
    const { forgetAccountStorage } = await import("$lib/data/accountStorage");
    forgetAccountStorage(ownerId);
  }

  /**
   * After an account leaves the phone: open the next one, or the welcome screen when none is
   * left. A full reload, so nothing of the account that left stays in memory.
   */
  async function openNextAccount(): Promise<void> {
    const { listLocalAccounts } = await import("$lib/data/localAccountRepo");
    const next = (await listLocalAccounts())[0];
    if (next) {
      try {
        await loginOfflineAccount(next.id);
        window.location.href = "/";
        return;
      } catch {
        // Couldn't open it: let the user pick.
        setActiveOwnerId(null);
        window.location.href = "/accounts";
        return;
      }
    }
    setActiveOwnerId(null);
    // Nobody left: start like a new phone (the welcome screen), not at a sign-in wall.
    localStorage.removeItem("logit:had_account");
    window.location.href = "/";
  }

  /**
   * Settings › Sign out of @name (design canvas 7). Signs this account out on the phone; the
   * other accounts aren't touched.
   * - default: its training leaves the phone. Only offer this plainly when everything is backed
   *   up (everythingBackedUp); otherwise the screen saves a copy first.
   * - keepHere: the training stays as the phone's space without an account (Pro → offline).
   *   Only when the phone has no such space already.
   */
  /** Whether "Keep using it here without the account" can be offered: the phone has no other space without an account. */
  async function canKeepHere(): Promise<boolean> {
    if (!isNativePlatform()) return false;
    const ownerId = getActiveOwnerId();
    const { listLocalAccounts } = await import("$lib/data/localAccountRepo");
    return !(await listLocalAccounts()).some((a) => !a.serverUserId && a.id !== ownerId);
  }

  async function signOutOfAccount(opts: { keepHere?: boolean } = {}): Promise<void> {
    if (!isNativePlatform()) return logout();
    if (opts.keepHere && !(await canKeepHere())) {
      throw new Error("This phone already has training without an account.");
    }
    const ownerId = getActiveOwnerId();
    if (user) {
      await (await import("$lib/platform/push")).forgetPushDevice();
      try { await apiClient.logout(); } catch (e) { log.warn("auth", "Server sign-out failed (signed out locally anyway)", e); }
    }
    log.info("auth", opts.keepHere ? "Signed out, kept on the phone" : "Signed out and removed from the phone");
    user = null;
    stopBackgroundSync();
    if (!ownerId) {
      window.location.href = "/auth";
      return;
    }
    if (opts.keepHere) {
      const { updateLocalAccount } = await import("$lib/data/localAccountRepo");
      await updateLocalAccount(ownerId, { serverUserId: null });
      // The training stays; a coach's check-ins don't (no coach without the account).
      try {
        const { getCheckinRepo } = await import("$lib/data/repoProvider");
        const repo = getCheckinRepo();
        for (const s of await repo.listAssignedSchedules()) await repo.removeScheduleFromRemote(s.id);
      } catch (e) {
        log.warn("auth", "Couldn't clear the coach's check-ins", e);
      }
      setServerMode("offline");
      apiClient.resetBaseUrl();
      window.location.href = "/";
      return;
    }
    await removeFromPhone(ownerId);
    await openNextAccount();
  }

  async function deleteAccount(password = "", closing?: AccountClosingChoice) {
    // 1. Delete from server if online. This now requires the account password — let a
    // failure (wrong password, offline, Stripe couldn't stop a client's plan) propagate so
    // we DON'T wipe local data while the server account is still alive. The caller surfaces
    // the error.
    if (user) {
      await apiClient.deleteAccount(password, closing);
    }
    user = null;
    stopBackgroundSync();

    if (isNativePlatform()) {
      // Everything of this account leaves the phone too; the next account opens, or the
      // welcome screen when nobody is left (as after signing out).
      const ownerId = getActiveOwnerId();
      if (ownerId) await removeFromPhone(ownerId);
      await openNextAccount();
    } else {
      const { clearAllData } = await import("$lib/usecases/clearAllData");
      await clearAllData();
    }
  }

  /** Re-reads who the server says we are (the plan, after a purchase or a store notice). */
  async function refreshUser() {
    if (!user) return;
    const couldSync = planIncludesSync();
    await apiClient.reconcileSession();
    user = apiClient.getUser();
    // Just bought (or got back) a plan with sync: send what's waiting now rather than at the
    // next 5-minute sync.
    if (user && !couldSync && planIncludesSync()) void syncAll();
  }

  return {
    get user() { return user; },
    get ready() { return ready; },
    get isAuthenticated() { return user !== null; },
    init,
    login,
    register,
    loginOfflineAccount,
    createOfflineAccount,
    beginAddingAccount,
    offlineTrainingToAsk,
    signOutOfAccount,
    canKeepHere,
    logout,
    deleteAccount,
    refreshUser,
    /** Picks up a sign-in the API client changed underneath (moving server). */
    reloadUser() { user = apiClient.getUser(); },
  };
}

export const authStore = createAuthStore();
