import { apiClient, type AuthUser } from "@logit/core/api/client";
import { getServerMode } from "@logit/core/api/serverConfig";
import { isNativePlatform } from "$lib/platform/isNative";
import { getActiveOwnerId, setActiveOwnerId, loadActiveOwnerId } from "$lib/data/activeOwner";
import { resetRepos, initRepos } from "$lib/data/repoProvider";
import { rehydrateStores } from "$lib/platform/appInit";
import { needsAccountAuth } from "$lib/stores/appReady.store";
import { navConfig } from "$lib/stores/navConfig.store";
import { syncAll, pushAllLocalData, pushCurrentProfile } from "$lib/sync/syncService";

/** Re-initialize repos then flush all data stores for the new active owner. */
async function switchActiveOwner(isOnlineAccount: boolean): Promise<void> {
  resetRepos();
  await initRepos();
  await rehydrateStores();
  needsAccountAuth.set(false);
  if (!isOnlineAccount) navConfig.reconcileForOffline();
}

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

  async function login(usernameOrEmail: string, password: string) {
    const serverUser = await apiClient.login(usernameOrEmail, password);
    user = serverUser;
    if (isNativePlatform()) await linkOrCreateLocalAccount(serverUser);
    // Push this device's existing local history first — otherwise only records
    // created after this sign-in ever reach the server, and everything logged
    // offline up to now stays without a cloud copy. Profile pushes only *after* syncAll()
    // pulls — see pushCurrentProfile()'s comment for why it can't safely run alongside
    // pushAllLocalData() like everything else here.
    void pushAllLocalData().then(() => syncAll()).then(() => pushCurrentProfile());
  }

  async function register(username: string, email: string, password: string, displayName: string) {
    const serverUser = await apiClient.register(username, email, password, displayName);
    user = serverUser;
    if (isNativePlatform()) await linkOrCreateLocalAccount(serverUser);
    void pushAllLocalData().then(() => syncAll()).then(() => pushCurrentProfile());
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

    let account = await getLocalAccountByServerUserId(serverUser.id);

    if (account) {
      // Known server user — switch to their local account. Re-sync onboarding status from
      // the server every time, not just on first link: it's the source of truth (e.g. they
      // could have completed onboarding on a different device since this one last saw them).
      setActiveOwnerId(account.id);
      await updateLocalAccount(account.id, {
        displayName: serverUser.displayName ?? account.displayName,
        serverUserId: serverUser.id,
        onboardingCompleted: serverUser.onboardingCompleted,
      });
    } else {
      // Try to link the currently active unlinked local account (e.g. created during onboarding)
      const currentId = getActiveOwnerId();
      if (currentId) {
        const current = await getLocalAccount(currentId);
        if (current && !current.serverUserId) {
          await updateLocalAccount(currentId, {
            serverUserId: serverUser.id,
            // Prefer the name the user already set locally; fall back to server if blank
            displayName: current.displayName.trim() || serverUser.displayName || current.displayName,
            // The local-only account defaults to onboardingCompleted: false — without this,
            // logging into an already-onboarded server account from a fresh/local-only
            // profile sent the user through onboarding again every time.
            onboardingCompleted: serverUser.onboardingCompleted,
          });
          account = { ...current, serverUserId: serverUser.id, onboardingCompleted: serverUser.onboardingCompleted };
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

    await switchActiveOwner(true);
  }

  // ── Offline login / create ───────────────────────────────────────────────

  /**
   * Activate an existing local account by ID.
   * Password is optional — only verified when the account has one set.
   */
  async function loginOfflineAccount(accountId: string, password = ""): Promise<void> {
    if (!isNativePlatform()) return; // offline accounts only exist on native

    const { getLocalAccount, verifyLocalPassword } = await import("$lib/data/localAccountRepo");
    const account = await getLocalAccount(accountId);
    if (!account) throw new Error("Account not found.");

    const ok = await verifyLocalPassword(account, password);
    if (!ok) throw new Error("Incorrect password.");

    // Always clear online auth when entering local account mode. The local accounts tab
    // means offline use — even if the account was previously linked, online auth must be
    // re-established explicitly via the /auth screen.
    user = null;
    await apiClient.clearLocal();

    setActiveOwnerId(account.id);
    await switchActiveOwner(false);
  }

  /**
   * Create a new local-only account (or finalise the auto-created first-launch account).
   * Password is optional — only required if the user wants to protect the account.
   */
  async function createOfflineAccount(displayName: string, password: string): Promise<void> {
    if (!isNativePlatform()) {
      // Web: just update the profile store — no local account infra on web
      const { profile } = await import("$lib/stores/profile.store");
      if (displayName.trim()) profile.save({ name: displayName.trim() });
      return;
    }

    // Creating a new local account means going offline — clear any stale online auth.
    user = null;
    await apiClient.clearLocal();

    const { createLocalAccount, listLocalAccounts, claimOrphanedData, orphanClaimTarget } =
      await import("$lib/data/localAccountRepo");

    const effectivePassword = password.trim() || undefined;

    const activeOwnerIdBeforeCreate = getActiveOwnerId();
    const all = await listLocalAccounts();
    const slug = displayName.trim().toLowerCase().replace(/\s+/g, "_") || "local";
    const uniqueSlug = all.some((a) => a.username === slug) ? `${slug}_${Date.now()}` : slug;

    const account = await createLocalAccount({
      username: uniqueSlug,
      displayName: displayName.trim() || uniqueSlug,
      password: effectivePassword,
    });
    setActiveOwnerId(account.id);
    // See orphanClaimTarget(): true first-launch adopts orphaned (owner_id IS NULL) rows
    // itself; every later "Add another profile" hands them to whoever was active instead —
    // never to the new profile, which must start with a clean slate. Without this, a second
    // profile silently inherited the first profile's un-migrated splits/workouts.
    const claimTarget = orphanClaimTarget(all.length, activeOwnerIdBeforeCreate, account.id);
    if (claimTarget) await claimOrphanedData(claimTarget);
    await switchActiveOwner(false);
  }

  // ── Logout / delete ──────────────────────────────────────────────────────

  async function logout() {
    if (user) {
      try { await apiClient.logout(); } catch {}
    }
    user = null;

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

  async function deleteAccount(password = "") {
    // 1. Delete from server if online. This now requires the account password — let a
    // failure (wrong password, offline) propagate so we DON'T wipe local data while the
    // server account is still alive. The caller surfaces the error.
    if (user) {
      await apiClient.deleteAccount(password);
    }
    user = null;

    if (isNativePlatform()) {
      const { clearOwnerData, getDb } = await import("$lib/data/db/sqlite");
      const ownerId = getActiveOwnerId();
      if (ownerId) {
        // Wipe all data belonging to this owner, then remove the account row itself
        await clearOwnerData(ownerId);
        const db = getDb();
        await db.run(`DELETE FROM local_accounts WHERE id = ?`, [ownerId]);
      }
      setActiveOwnerId(null);
      window.location.href = "/auth";
    } else {
      const { clearAllData } = await import("$lib/usecases/clearAllData");
      await clearAllData();
    }
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
    logout,
    deleteAccount,
  };
}

export const authStore = createAuthStore();
