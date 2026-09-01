<script lang="ts">
  import { onMount } from "svelte";
  import {
    ArrowLeft,
    RotateCcw,
    Sparkles,
    Cloud,
    Server,
    WifiOff,
    Loader2,
    Trash2,
    ChevronRight,
    Lock,
    RefreshCw,
    Users,
  } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { back } from "$lib/navigation";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { profile } from "$lib/stores/profile.store";
  import { onboarding } from "$lib/stores/onboarding.store";
  import {
    resetTours,
    startHomeTour,
    startSessionTour,
    startSplitsTour,
    startExercisesTour,
    startProfileTour,
  } from "$lib/tour/index";
  import { clearAllData } from "$lib/usecases/clearAllData";
  import { isNativePlatform } from "$lib/platform/isNative";
  import { getActiveOwnerId } from "$lib/data/activeOwner";
  import type { LocalAccount } from "$lib/data/localAccountRepo";
  import { setMode, userPrefersMode } from "mode-watcher";
  import { authStore } from "$lib/api/authStore.svelte";
  import { apiClient, ApiError } from "@logit/core/api/client";
  import { syncAll, pushAllLocalData, lastSyncedAt } from "$lib/sync/syncService";
  import { connectionStatus } from "@logit/core/api/connectionStatus.svelte";
  import ConnectionDot from "$lib/components/ConnectionDot.svelte";
  import {
    getServerMode,
    type ServerMode,
  } from "@logit/core/api/serverConfig";
  import ImportExportPanel from "$lib/features/importExport/ImportExportPanel.svelte";
  import {
    getProgressionConfig,
    setProgressionAlgorithm,
  } from "@logit/core/usecases/progression/getProgressionConfig";
  import type { ProgressionConfigView } from "@logit/core/usecases/progression/getProgressionConfig";
  import { Settings2 } from "lucide-svelte";
  import {
    getAnalyticsConfig,
    setAnalyticsPlugin,
    DEFAULT_ANALYTICS_ID,
  } from "@logit/core/usecases/progression/getAnalyticsConfig";
  import type { AnalyticsConfigView } from "@logit/core/usecases/progression/getAnalyticsConfig";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import { pluginSettings } from "$lib/plugins";

  const isDev = import.meta.env.DEV;

  // --- Sync ---
  let syncing = $state(false);

  async function manualSync() {
    if (syncing) return;
    syncing = true;
    try {
      // Also push everything local, not just pull — covers accounts that signed in
      // before local history was ever fully backfilled to the server.
      await pushAllLocalData();
      await syncAll();
    } finally {
      syncing = false;
    }
  }

  function formatLastSynced(ms: number): string {
    if (!ms) return "Never synced";
    const diff = Date.now() - ms;
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(ms).toLocaleDateString();
  }

  // --- Account ---
  let serverMode = $state<ServerMode>(getServerMode());
  let pendingDeleteAccount = $state(false);
  let deletingAccount = $state(false);
  let deleteAccountPassword = $state("");
  let deleteAccountError = $state<string | null>(null);

  // --- Local account password ---
  let localAccountHasPassword = $state(false);
  let showPasswordForm = $state(false);
  let passwordForm = $state({ current: "", next: "", confirm: "" });
  let passwordError = $state<string | null>(null);
  let savingPassword = $state(false);

  $effect(() => {
    const ownerId = getActiveOwnerId();
    if (!ownerId || !isNativePlatform()) return;
    void (async () => {
      try {
        const { getLocalAccount } = await import("$lib/data/localAccountRepo");
        const acct = await getLocalAccount(ownerId);
        localAccountHasPassword = !!acct?.passwordHash;
      } catch {}
    })();
  });

  async function saveLocalAccountPassword(remove = false) {
    passwordError = null;
    if (!remove && passwordForm.next !== passwordForm.confirm) {
      passwordError = "Passwords don't match.";
      return;
    }
    if (localAccountHasPassword && !passwordForm.current.trim()) {
      passwordError = "Enter your current password to continue.";
      return;
    }
    savingPassword = true;
    try {
      const { getLocalAccount, verifyLocalPassword, updateLocalAccount } =
        await import("$lib/data/localAccountRepo");
      const ownerId = getActiveOwnerId();
      if (!ownerId) throw new Error("No active account.");
      const acct = await getLocalAccount(ownerId);
      if (!acct) throw new Error("Account not found.");
      if (localAccountHasPassword) {
        const ok = await verifyLocalPassword(acct, passwordForm.current);
        if (!ok) {
          passwordError = "Current password is incorrect.";
          return;
        }
      }
      const newPassword = remove
        ? undefined
        : passwordForm.next.trim() || undefined;
      await updateLocalAccount(ownerId, { password: newPassword });
      localAccountHasPassword = !remove && !!passwordForm.next.trim();
      showPasswordForm = false;
      passwordForm = { current: "", next: "", confirm: "" };
    } catch (e) {
      passwordError =
        e instanceof Error ? e.message : "Failed to update password.";
    } finally {
      savingPassword = false;
    }
  }

  // --- Online account password ---
  let showOnlinePasswordForm = $state(false);
  let onlinePasswordForm = $state({ current: "", next: "", confirm: "" });
  let onlinePasswordError = $state<string | null>(null);
  let savingOnlinePassword = $state(false);

  async function saveOnlinePassword() {
    onlinePasswordError = null;
    if (onlinePasswordForm.next !== onlinePasswordForm.confirm) {
      onlinePasswordError = "Passwords don't match.";
      return;
    }
    if (!onlinePasswordForm.current.trim()) {
      onlinePasswordError = "Enter your current password to continue.";
      return;
    }
    savingOnlinePassword = true;
    try {
      await apiClient.changePassword(onlinePasswordForm.current, onlinePasswordForm.next);
      showOnlinePasswordForm = false;
      onlinePasswordForm = { current: "", next: "", confirm: "" };
    } catch (e) {
      onlinePasswordError = e instanceof ApiError ? e.message : "Failed to update password.";
    } finally {
      savingOnlinePassword = false;
    }
  }

  // --- Progression ---
  const progUi = $state({
    loading: true,
    saving: false,
    error: null as string | null,
  });
  let view = $state<ProgressionConfigView>({ config: null, algorithms: [] });

  async function loadProgression() {
    progUi.loading = true;
    progUi.error = null;
    try {
      view = await getProgressionConfig(getProgressionDeps());
    } catch (e) {
      progUi.error = e instanceof Error ? e.message : "Failed to load settings";
    } finally {
      progUi.loading = false;
    }
  }

  async function selectAlgorithm(id: string) {
    if (progUi.saving) return;
    progUi.saving = true;
    progUi.error = null;
    try {
      await setProgressionAlgorithm(id, getProgressionDeps());
      view = { ...view, config: id ? { algorithmId: id } : null };
    } catch (e) {
      progUi.error = e instanceof Error ? e.message : "Failed to save setting";
    } finally {
      progUi.saving = false;
    }
  }

  // --- Analytics ---
  const analyticsUi = $state({
    loading: true,
    saving: false,
    error: null as string | null,
  });
  let analyticsView = $state<AnalyticsConfigView>({
    config: null,
    plugins: [],
  });

  async function loadAnalytics() {
    analyticsUi.loading = true;
    analyticsUi.error = null;
    try {
      analyticsView = await getAnalyticsConfig(getProgressionDeps());
    } catch (e) {
      analyticsUi.error =
        e instanceof Error ? e.message : "Failed to load settings";
    } finally {
      analyticsUi.loading = false;
    }
  }

  async function selectAnalyticsPlugin(id: string) {
    if (analyticsUi.saving) return;
    analyticsUi.saving = true;
    analyticsUi.error = null;
    try {
      await setAnalyticsPlugin(id, getProgressionDeps());
      analyticsView = {
        ...analyticsView,
        config: id ? { analyticsId: id } : null,
      };
    } catch (e) {
      analyticsUi.error =
        e instanceof Error ? e.message : "Failed to save setting";
    } finally {
      analyticsUi.saving = false;
    }
  }

  // --- Session preferences ---
  const SET_TYPE_LABELS: Record<string, string> = {
    normal: "Normal",
    warmup: "Warm-up",
    dropset: "Drop set",
    amrap: "AMRAP",
    failure: "To failure",
  };

  function toggleRestDefault(type: string) {
    const current = $profile.restDefaults[type];
    profile.save({
      restDefaults: {
        ...$profile.restDefaults,
        [type]: current !== undefined ? undefined : 90_000,
      },
    });
  }

  function setRestSeconds(type: string, seconds: string) {
    const ms = Math.round(Number(seconds) * 1000);
    if (!Number.isFinite(ms) || ms <= 0) return;
    profile.save({ restDefaults: { ...$profile.restDefaults, [type]: ms } });
  }

  async function clearAllDataAndAccount() {
    try {
      await authStore.deleteAccount(deleteAccountPassword);
    } catch {}
    await clearAllData();
  }

  async function confirmDeleteAccount() {
    if (authStore.isAuthenticated && !deleteAccountPassword) {
      deleteAccountError = "Enter your password to delete your account.";
      return;
    }
    deletingAccount = true;
    deleteAccountError = null;
    try {
      await authStore.deleteAccount(deleteAccountPassword);
    } catch (e) {
      deleteAccountError =
        e instanceof ApiError ? e.message : "Couldn't delete your account — try again.";
      deletingAccount = false;
    }
  }

  async function resetOnboarding() {
    resetTours();
    onboarding.reset();
    await goto("/onboarding");
  }

  // --- Dev: local accounts ---
  let localAccounts = $state<LocalAccount[]>([]);
  let deletingAccountId = $state<string | null>(null);

  $effect(() => {
    if (isDev && isNativePlatform()) {
      void (async () => {
        try {
          const { listLocalAccounts } = await import(
            "$lib/data/localAccountRepo"
          );
          localAccounts = await listLocalAccounts();
        } catch {}
      })();
    }
  });

  async function deleteLocalAccount(id: string) {
    if (deletingAccountId) return;
    deletingAccountId = id;
    try {
      const [{ clearOwnerData, getDb }] = await Promise.all([
        import("$lib/data/db/sqlite"),
      ]);
      await clearOwnerData(id);
      const db = getDb();
      await db.run(`DELETE FROM local_accounts WHERE id = ?`, [id]);
      localAccounts = localAccounts.filter((a) => a.id !== id);
      if (getActiveOwnerId() === id) {
        await authStore.logout();
      }
    } catch (e) {
      console.error("Failed to delete local account", e);
    } finally {
      deletingAccountId = null;
    }
  }

  onMount(() => {
    void loadProgression();
    void loadAnalytics();
    if (authStore.isAuthenticated) connectionStatus.startPolling();
  });
</script>

<div class="flex flex-col gap-3 p-3 pb-24">
  <!-- Header -->
  <div class="flex items-center gap-2">
    <Button
      variant="ghost"
      size="icon"
      class="h-8 w-8"
      onclick={() => back("/profile")}
    >
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <h1 class="text-base font-semibold">Settings</h1>
  </div>

  <!-- Account -->
  <Card.Root>
    <Card.Header>
      <Card.Title>Account</Card.Title>
      <Card.Description
        >Manage your identity and server connection.</Card.Description
      >
    </Card.Header>
    <Card.Content class="flex flex-col gap-0">
      {#if authStore.isAuthenticated && authStore.user}
        <!-- Identity row -->
        <div class="flex items-center gap-3 pb-3">
          {#if serverMode === "cloud"}
            <div class="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Cloud class="h-4 w-4 text-primary" />
            </div>
          {:else}
            <div class="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Server class="h-4 w-4 text-muted-foreground" />
            </div>
          {/if}
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium">@{authStore.user.username}</p>
            <p class="text-xs text-muted-foreground">{serverMode === "cloud" ? "logit.ie" : "Self-hosted"} · {authStore.user.tier} plan</p>
          </div>
        </div>

        <!-- Plan (informational only — no purchase link/button; upgrading is handled entirely
             on the website, never inside the app, per Apple's in-app purchase rules). -->
        <div class="border-t border-border py-3">
          <p class="text-xs text-muted-foreground">
            {#if authStore.user.tier === "Free"}
              Free plan — social feed on your phone. Cross-device sync and the web dashboard need Pro or Studio. Manage your plan in a browser at logit.ie.
            {:else}
              {authStore.user.tier} plan. Manage your plan in a browser at logit.ie.
            {/if}
          </p>
        </div>

        <button type="button"
          class="w-full flex items-center justify-between border-t border-border py-3 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          disabled={syncing || serverMode === "offline"}
          onclick={() => void manualSync()}>
          <span class="flex items-center gap-2">
            <RefreshCw class="h-3.5 w-3.5 {syncing ? 'animate-spin' : ''}" />
            {syncing ? "Syncing…" : "Sync now"}
          </span>
          <span class="flex items-center gap-1.5 text-xs">
            <ConnectionDot />
            {formatLastSynced($lastSyncedAt)}
          </span>
        </button>
        <button type="button"
          class="w-full flex items-center justify-between border-t border-border py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onclick={() => goto("/clients")}>
          <span class="flex items-center gap-2">
            <Users class="h-3.5 w-3.5" />
            Coaching
          </span>
          <ChevronRight class="h-4 w-4 shrink-0" />
        </button>
        <button type="button"
          class="w-full flex items-center justify-between border-t border-border py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onclick={() => { showOnlinePasswordForm = !showOnlinePasswordForm; onlinePasswordError = null; onlinePasswordForm = { current: "", next: "", confirm: "" }; }}>
          <span class="flex items-center gap-2">
            <Lock class="h-3.5 w-3.5" />
            Change password
          </span>
          <ChevronRight class="h-4 w-4 shrink-0 transition-transform {showOnlinePasswordForm ? 'rotate-90' : ''}" />
        </button>
        {#if showOnlinePasswordForm}
          <div class="flex flex-col gap-2 pb-2 pt-1">
            <input type="password" placeholder="Current password" autocomplete="current-password"
              class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              bind:value={onlinePasswordForm.current} />
            <input type="password" placeholder="New password" autocomplete="new-password"
              class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              bind:value={onlinePasswordForm.next} />
            <input type="password" placeholder="Confirm new password" autocomplete="new-password"
              class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              bind:value={onlinePasswordForm.confirm} />
            {#if onlinePasswordError}
              <p class="text-xs text-destructive">{onlinePasswordError}</p>
            {/if}
            <div class="flex gap-2 pt-1">
              <Button size="sm" disabled={savingOnlinePassword} onclick={() => void saveOnlinePassword()}>
                {savingOnlinePassword ? "Saving…" : "Save"}
              </Button>
              <Button variant="ghost" size="sm" onclick={() => { showOnlinePasswordForm = false; onlinePasswordError = null; }}>Cancel</Button>
            </div>
          </div>
        {/if}
        <button type="button"
          class="w-full flex items-center justify-between border-t border-border pt-3 pb-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onclick={() => void authStore.logout()}>
          Sign out
          <ChevronRight class="h-4 w-4 shrink-0" />
        </button>

      {:else if getActiveOwnerId()}
        <!-- Identity row -->
        <div class="flex items-center gap-3 pb-3">
          <div class="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
            <WifiOff class="h-4 w-4 text-muted-foreground" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium">{$profile.name || "Local account"}</p>
            <p class="text-xs text-muted-foreground">Offline · data stored on this device</p>
          </div>
        </div>
        <!-- Action rows -->
        <button type="button"
          class="w-full flex items-center justify-between border-t border-border py-3 text-sm hover:text-primary transition-colors"
          onclick={() => goto("/auth?mode=register")}>
          Create an account
          <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
        <button type="button"
          class="w-full flex items-center justify-between border-t border-border py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onclick={() => goto("/auth?mode=login")}>
          Log in
          <ChevronRight class="h-4 w-4 shrink-0" />
        </button>
        <button type="button"
          class="w-full flex items-center justify-between border-t border-border py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onclick={() => goto("/accounts")}>
          Switch profile
          <ChevronRight class="h-4 w-4 shrink-0" />
        </button>
        <button type="button"
          class="w-full flex items-center justify-between border-t border-border py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onclick={() => { showPasswordForm = !showPasswordForm; passwordError = null; passwordForm = { current: "", next: "", confirm: "" }; }}>
          <span class="flex items-center gap-2">
            <Lock class="h-3.5 w-3.5" />
            {localAccountHasPassword ? "Change password" : "Set a password"}
          </span>
          <ChevronRight class="h-4 w-4 shrink-0 transition-transform {showPasswordForm ? 'rotate-90' : ''}" />
        </button>
        {#if showPasswordForm}
          <div class="flex flex-col gap-2 pb-2 pt-1">
            {#if localAccountHasPassword}
              <input type="password" placeholder="Current password" autocomplete="current-password"
                class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                bind:value={passwordForm.current} />
            {/if}
            <input type="password" placeholder={localAccountHasPassword ? "New password" : "Password"} autocomplete="new-password"
              class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              bind:value={passwordForm.next} />
            <input type="password" placeholder="Confirm password" autocomplete="new-password"
              class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              bind:value={passwordForm.confirm} />
            {#if passwordError}
              <p class="text-xs text-destructive">{passwordError}</p>
            {/if}
            <div class="flex gap-2 pt-1">
              <Button size="sm" disabled={savingPassword} onclick={() => void saveLocalAccountPassword()}>
                {savingPassword ? "Saving…" : "Save"}
              </Button>
              {#if localAccountHasPassword}
                <Button variant="outline" size="sm" disabled={savingPassword} onclick={() => void saveLocalAccountPassword(true)}>
                  Remove
                </Button>
              {/if}
              <Button variant="ghost" size="sm" onclick={() => { showPasswordForm = false; passwordError = null; }}>Cancel</Button>
            </div>
          </div>
        {/if}
        <button type="button"
          class="w-full flex items-center justify-between border-t border-border py-3 pb-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onclick={() => void authStore.logout()}>
          Sign out
          <ChevronRight class="h-4 w-4 shrink-0" />
        </button>

      {:else}
        <!-- No account -->
        <div class="flex flex-col gap-3 pb-1">
          <p class="text-sm text-muted-foreground">Not signed in — all data is stored locally on this device.</p>
          <div class="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onclick={() => goto("/auth?mode=login")}>Log in</Button>
            <Button variant="outline" size="sm" onclick={() => goto("/auth?mode=register")}>Create account</Button>
            {#if isNativePlatform()}
              <Button variant="outline" size="sm" onclick={() => goto("/accounts")}>Switch profile</Button>
            {/if}
          </div>
        </div>
      {/if}
    </Card.Content>
  </Card.Root>

  <!-- Appearance -->
  <Card.Root>
    <Card.Header>
      <Card.Title>Appearance</Card.Title>
      <Card.Description>Choose how the app looks.</Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-3">
      <div class="flex rounded border overflow-hidden text-sm w-fit">
        {#each [["system", "System"], ["light", "Light"], ["dark", "Dark"]] as ["system" | "light" | "dark", string][] as [value, label] (value)}
          <button
            type="button"
            class="px-4 py-2 transition-colors {userPrefersMode.current ===
            value
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:text-foreground'}"
            onclick={() => setMode(value)}
          >
            {label}
          </button>
        {/each}
      </div>
      <button
        type="button"
        class="flex items-center justify-between border-t border-border pt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
        onclick={() => goto("/settings/navbar")}
      >
        Customise navigation
        <ChevronRight class="h-4 w-4 shrink-0" />
      </button>
    </Card.Content>
  </Card.Root>

  <!-- Progression -->
  <Card.Root>
    <Card.Header>
      <Card.Title>Progression</Card.Title>
      <Card.Description
        >How the app suggests weights and reps for your next session.</Card.Description
      >
    </Card.Header>
    <Card.Content class="flex flex-col gap-3">
      {#if progUi.error}
        <p class="text-sm text-destructive">{progUi.error}</p>
      {/if}
      {#if progUi.loading}
        <p class="text-sm text-muted-foreground">Loading…</p>
      {:else if view.algorithms.length === 0}
        <p class="text-sm text-muted-foreground">No algorithms available.</p>
      {:else}
        <ul class="flex flex-col gap-2">
          {#each view.algorithms as algo (algo.id)}
            {@const isActive = view.config?.algorithmId === algo.id}
            <li
              class="rounded border p-3 transition-colors {isActive
                ? 'border-primary bg-primary/5'
                : 'border-border'}"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="text-sm font-medium">{algo.name}</p>
                    {#if isActive}
                      <span
                        class="text-xs font-medium text-primary rounded border border-primary px-1.5 py-0.5"
                        >Active</span
                      >
                    {/if}
                  </div>
                  <p class="mt-1 text-xs text-muted-foreground">
                    {algo.description}
                  </p>
                  {#if algo.author}
                    <p class="mt-1 text-xs text-muted-foreground/60">
                      by {algo.author}
                    </p>
                  {/if}
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  {#if algo.hasPreferences}
                    <Button
                      size="sm"
                      variant="ghost"
                      class="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                      title="Configure"
                      onclick={() => goto(`/settings/progression/${algo.id}`)}
                    >
                      <Settings2 class="h-4 w-4" />
                    </Button>
                  {/if}
                  {#if !isActive}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={progUi.saving}
                      onclick={() => void selectAlgorithm(algo.id)}>Select</Button
                    >
                  {/if}
                </div>
              </div>
            </li>
          {/each}
        </ul>
        {#if view.config}
          <Button
            variant="ghost"
            class="text-muted-foreground text-sm self-start"
            disabled={progUi.saving}
            onclick={() => void selectAlgorithm("")}
          >
            Disable suggestions
          </Button>
        {/if}
      {/if}
    </Card.Content>
  </Card.Root>

  <!-- Analytics -->
  <Card.Root>
    <Card.Header>
      <Card.Title>Analytics</Card.Title>
      <Card.Description
        >How the app computes your progress metrics and chart data.</Card.Description
      >
    </Card.Header>
    <Card.Content class="flex flex-col gap-3">
      {#if analyticsUi.error}
        <p class="text-sm text-destructive">{analyticsUi.error}</p>
      {/if}
      {#if analyticsUi.loading}
        <p class="text-sm text-muted-foreground">Loading…</p>
      {:else if analyticsView.plugins.length === 0}
        <p class="text-sm text-muted-foreground">
          No analytics plugins available.
        </p>
      {:else}
        <ul class="flex flex-col gap-2">
          {#each analyticsView.plugins as plugin (plugin.id)}
            {@const activeId =
              analyticsView.config?.analyticsId ?? DEFAULT_ANALYTICS_ID}
            {@const isActive = activeId === plugin.id}
            <li
              class="rounded border p-3 transition-colors {isActive
                ? 'border-primary bg-primary/5'
                : 'border-border'}"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="text-sm font-medium">{plugin.name}</p>
                    {#if isActive}
                      <span
                        class="text-xs font-medium text-primary rounded border border-primary px-1.5 py-0.5"
                        >Active</span
                      >
                    {/if}
                  </div>
                  <p class="mt-1 text-xs text-muted-foreground">
                    {plugin.description}
                  </p>
                  {#if plugin.author}
                    <p class="mt-1 text-xs text-muted-foreground/60">
                      by {plugin.author}
                    </p>
                  {/if}
                </div>
                {#if !isActive}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={analyticsUi.saving}
                    onclick={() => void selectAnalyticsPlugin(plugin.id)}
                    >Select</Button
                  >
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </Card.Content>
  </Card.Root>

  <!-- Session -->
  <Card.Root>
    <Card.Header>
      <Card.Title>Session</Card.Title>
      <Card.Description>Behaviour during a workout.</Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-4">
      <label class="flex items-center justify-between gap-3 cursor-pointer">
        <div>
          <p class="text-sm font-medium">Collapse blocks by default</p>
          <p class="text-xs text-muted-foreground">
            Exercise blocks start collapsed in a session.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={$profile.blocksCollapsedByDefault}
          class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {$profile.blocksCollapsedByDefault
            ? 'bg-primary'
            : 'bg-input'}"
          onclick={() =>
            profile.save({
              blocksCollapsedByDefault: !$profile.blocksCollapsedByDefault,
            })}
        >
          <span
            class="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform {$profile.blocksCollapsedByDefault
              ? 'translate-x-4'
              : 'translate-x-0'}"
          ></span>
        </button>
      </label>

      <div class="flex flex-col gap-2">
        <p class="text-sm font-medium">Auto rest timer</p>
        <p class="text-xs text-muted-foreground mb-1">
          Enable and set the default rest duration for each set type.
        </p>
        {#each Object.keys(SET_TYPE_LABELS) as type (type)}
          {@const enabled = $profile.restDefaults[type] !== undefined}
          {@const seconds = enabled
            ? Math.round(($profile.restDefaults[type] ?? 90_000) / 1000)
            : 90}
          <div class="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors {enabled
                ? 'bg-primary'
                : 'bg-input'}"
              onclick={() => toggleRestDefault(type)}
            >
              <span
                class="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform {enabled
                  ? 'translate-x-4'
                  : 'translate-x-0'}"
              ></span>
            </button>
            <span class="text-sm w-24">{SET_TYPE_LABELS[type]}</span>
            {#if enabled}
              <div class="flex items-center gap-1.5 ml-auto">
                <input
                  type="number"
                  min="5"
                  max="600"
                  class="w-16 rounded border bg-background px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                  value={seconds}
                  onchange={(e) =>
                    setRestSeconds(type, (e.target as HTMLInputElement).value)}
                />
                <span class="text-xs text-muted-foreground">sec</span>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </Card.Content>
  </Card.Root>

  <!-- Backup & Restore -->
  <ImportExportPanel />

  <!-- App Tour -->
  <Card.Root>
    <Card.Header>
      <Card.Title>App Tour</Card.Title>
      <Card.Description
        >Replay a walkthrough for any part of the app.</Card.Description
      >
    </Card.Header>
    <Card.Content class="flex flex-col gap-2">
      <Button
        variant="outline"
        size="sm"
        class="justify-start"
        onclick={() => startHomeTour(true)}
      >
        <RotateCcw class="h-3.5 w-3.5 mr-2" /> Home overview
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="justify-start"
        onclick={() => startSessionTour(true)}
      >
        <RotateCcw class="h-3.5 w-3.5 mr-2" /> Workout session
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="justify-start"
        onclick={() => startSplitsTour(true)}
      >
        <RotateCcw class="h-3.5 w-3.5 mr-2" /> Training splits
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="justify-start"
        onclick={() => startExercisesTour(true)}
      >
        <RotateCcw class="h-3.5 w-3.5 mr-2" /> Exercise library
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="justify-start"
        onclick={() => startProfileTour(true)}
      >
        <RotateCcw class="h-3.5 w-3.5 mr-2" /> Profile page
      </Button>
    </Card.Content>
  </Card.Root>

  <!-- Plugins -->
  <Card.Root>
    <Card.Header>
      <Card.Title>Plugins</Card.Title>
      <Card.Description
        >Explore community-built widgets and algorithms.</Card.Description
      >
    </Card.Header>
    <Card.Content class="flex flex-col gap-2">
      <p class="text-xs text-muted-foreground">
        Community plugins are
        {#if $pluginSettings.communityPluginsEnabled}
          <span class="font-medium text-emerald-600">on</span>
        {:else}
          <span class="font-medium text-amber-600">off</span> — widgets and
          algorithms from the community won't run
        {/if}.
      </p>
      <Button
        variant="outline"
        size="sm"
        class="justify-start"
        onclick={() => void goto("/plugins")}
      >
        <Sparkles class="mr-2 h-3.5 w-3.5" /> Open plugin catalog
      </Button>
    </Card.Content>
  </Card.Root>

  <!-- Danger zone -->
  <Card.Root class="border-destructive/40">
    <Card.Header>
      <Card.Title class="text-destructive">Danger zone</Card.Title>
      <Card.Description>Irreversible and destructive actions.</Card.Description>
    </Card.Header>
    <Card.Content>
      {#if pendingDeleteAccount}
        <div class="flex flex-col gap-3">
          <p class="text-sm text-destructive">
            {authStore.isAuthenticated
              ? "This will permanently delete your account from the server and erase all local data. This cannot be undone."
              : getActiveOwnerId()
                ? "This will erase all local data and remove this account from the device. This cannot be undone."
                : "This will erase all local data on this device. This cannot be undone."}
          </p>
          {#if authStore.isAuthenticated}
            <input
              type="password"
              placeholder="Confirm your password"
              autocomplete="current-password"
              class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              bind:value={deleteAccountPassword}
            />
          {/if}
          {#if deleteAccountError}
            <p class="text-xs text-destructive">{deleteAccountError}</p>
          {/if}
          <div class="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              class="border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-50"
              disabled={deletingAccount}
              onclick={() => void confirmDeleteAccount()}
            >
              {#if deletingAccount}
                <Loader2 class="h-3.5 w-3.5 mr-1.5 animate-spin" />
              {/if}
              Yes, delete everything
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={deletingAccount}
              onclick={() => {
                pendingDeleteAccount = false;
                deleteAccountPassword = "";
                deleteAccountError = null;
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      {:else}
        <Button
          variant="outline"
          size="sm"
          class="border-destructive/50 text-destructive hover:bg-destructive/10"
          onclick={() => (pendingDeleteAccount = true)}
        >
          <Trash2 class="h-3.5 w-3.5 mr-1.5" />
          Delete account and all data
        </Button>
      {/if}
    </Card.Content>
  </Card.Root>

  {#if isDev}
    <Card.Root class="border-destructive/40">
      <Card.Header>
        <Card.Title class="text-destructive">Developer</Card.Title>
        <Card.Description>Reset app state for testing.</Card.Description>
      </Card.Header>
      <Card.Content class="flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          class="justify-start border-destructive/40 text-destructive hover:bg-destructive/10"
          onclick={() => void resetOnboarding()}
        >
          <RotateCcw class="h-3.5 w-3.5 mr-2" /> Reset onboarding
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="justify-start border-destructive/40 text-destructive hover:bg-destructive/10"
          onclick={() => resetTours()}
        >
          <RotateCcw class="h-3.5 w-3.5 mr-2" /> Reset tours
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="justify-start border-destructive/40 text-destructive hover:bg-destructive/10"
          onclick={() => void clearAllData()}
        >
          <RotateCcw class="h-3.5 w-3.5 mr-2" /> Clear all data & databases
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="justify-start border-destructive/40 text-destructive hover:bg-destructive/10"
          disabled={!authStore.isAuthenticated}
          onclick={() => void clearAllDataAndAccount()}
        >
          <RotateCcw class="h-3.5 w-3.5 mr-2" /> Clear all data & delete API account
        </Button>

        {#if isNativePlatform() && localAccounts.length > 0}
          <div class="pt-1 border-t border-destructive/20">
            <p class="text-xs text-muted-foreground mb-2">
              Local accounts on this device
            </p>
            <div class="flex flex-col gap-1.5">
              {#each localAccounts as account (account.id)}
                <div
                  class="flex items-center gap-2 rounded border border-destructive/30 px-3 py-2"
                >
                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-medium truncate">
                      {account.displayName || account.username}
                    </p>
                    <p class="text-[10px] text-muted-foreground">
                      {account.serverUserId
                        ? "linked to online account"
                        : account.passwordHash
                          ? "password protected"
                          : "no password"}
                      {getActiveOwnerId() === account.id ? " · active" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="shrink-0 text-destructive/60 hover:text-destructive transition-colors disabled:opacity-40"
                    disabled={deletingAccountId === account.id}
                    onclick={() => void deleteLocalAccount(account.id)}
                    aria-label="Delete account"
                  >
                    {#if deletingAccountId === account.id}
                      <Loader2 class="h-3.5 w-3.5 animate-spin" />
                    {:else}
                      <Trash2 class="h-3.5 w-3.5" />
                    {/if}
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>
  {/if}
</div>
