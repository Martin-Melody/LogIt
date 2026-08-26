<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { ArrowLeft, Cloud, Server, Plus, Eye, EyeOff, Loader2, CheckCircle, XCircle, Pencil } from "lucide-svelte";
  import { get } from "svelte/store";
  import { authStore } from "$lib/api/authStore.svelte";
  import { getServerMode, setServerMode, getSelfHostUrl } from "@logit/core/api/serverConfig";
  import { testServerConnection, type ConnectionResult } from "@logit/core/api/testConnection";
  import { apiClient, ApiError } from "@logit/core/api/client";
  import { isNativePlatform } from "$lib/platform/isNative";
  import { onboarding } from "$lib/stores/onboarding.store";
  import type { LocalAccount } from "$lib/data/localAccountRepo";

  type OnlineMode = "login" | "register";
  type OfflineView = "list" | "create";

  const redirectTo = $derived(page.url.searchParams.get("redirect") ?? "/");
  const initialMode = $derived(page.url.searchParams.get("mode") ?? "login");

  let tab = $state<"online" | "offline">(initialMode === "offline" ? "offline" : "online");
  let onlineMode = $state<OnlineMode>(initialMode === "register" ? "register" : "login");
  let offlineView = $state<OfflineView>("list");
  let localAccounts = $state<LocalAccount[]>([]);
  let loadingAccounts = $state(false);
  let selectedAccountId = $state<string | null>(null);
  let showOfflinePassword = $state(false);
  let showOnlinePassword = $state(false);
  let showConfirmPassword = $state(false);

  const unlinkedLocalAccounts = $derived(localAccounts.filter((a) => !a.serverUserId));

  const form = $state({ username: "", email: "", password: "", displayName: "", confirmPassword: "" });
  let authError = $state<string | null>(null);
  let authLoading = $state(false);

  // Forgot password
  let showForgotPassword = $state(false);
  let forgotEmail = $state("");
  let forgotLoading = $state(false);
  let forgotResult = $state<{ message: string; isError: boolean } | null>(null);

  async function submitForgotPassword() {
    forgotLoading = true;
    forgotResult = null;
    try {
      const { error } = await apiClient.forgotPassword(forgotEmail.trim());
      forgotResult = error
        ? { message: error, isError: true }
        : { message: "If that email has an account, a reset link is on its way.", isError: false };
    } catch (e) {
      forgotResult = { message: e instanceof ApiError ? e.message : "Something went wrong. Please try again.", isError: true };
    } finally {
      forgotLoading = false;
    }
  }

  // Server config (reactive so inline changes reflect immediately)
  let serverMode = $state(getServerMode());
  let showServerSetup = $state(false);
  let serverSetupStep = $state<"pick" | "url">("pick");
  let selfHostUrl = $state(getSelfHostUrl() || "https://");
  let urlTestResult = $state<ConnectionResult>("idle");
  let savingServer = $state(false);

  function openServerSetup() {
    showServerSetup = true;
    selfHostUrl = getSelfHostUrl() || "https://";
    serverSetupStep = "pick";
    urlTestResult = "idle";
  }

  function pickCloud() {
    setServerMode("cloud");
    serverMode = "cloud";
    showServerSetup = false;
  }

  function pickSelfHosted() {
    serverSetupStep = "url";
  }

  async function testServerUrl() {
    const url = selfHostUrl.trim().replace(/\/$/, "");
    if (!url || url === "https:/") return;
    urlTestResult = "testing";
    urlTestResult = await testServerConnection(url);
  }

  function saveServerUrl() {
    const url = selfHostUrl.trim().replace(/\/$/, "");
    if (!url || url === "https:/") return;
    setServerMode("selfhosted", url);
    serverMode = "selfhosted";
    showServerSetup = false;
  }

  const passwordMismatch = $derived(
    form.confirmPassword.length > 0 && form.password !== form.confirmPassword
  );

  const onlineSubmitDisabled = $derived(
    authLoading ||
    !form.username.trim() ||
    !form.password ||
    (onlineMode === "register" && (!form.email.trim() || passwordMismatch || !form.confirmPassword))
  );

  onMount(async () => {
    if (isNativePlatform()) {
      loadingAccounts = true;
      try {
        const { listLocalAccounts } = await import("$lib/data/localAccountRepo");
        localAccounts = await listLocalAccounts();
        if (localAccounts.filter((a) => !a.serverUserId).length === 0) offlineView = "create";
      } catch {
        offlineView = "create";
      } finally {
        loadingAccounts = false;
      }
    } else {
      offlineView = "create";
    }
  });

  function selectAccount(id: string) {
    selectedAccountId = selectedAccountId === id ? null : id;
    form.password = "";
    authError = null;
  }

  function resolveRedirect(): string {
    const { completed } = get(onboarding);
    return completed ? redirectTo : "/onboarding";
  }

  async function loginOffline() {
    if (!selectedAccountId) return;
    authError = null;
    authLoading = true;
    try {
      await authStore.loginOfflineAccount(selectedAccountId, form.password);
      await goto(resolveRedirect());
    } catch (e) {
      authError = e instanceof Error ? e.message : "Could not log in.";
    } finally {
      authLoading = false;
    }
  }

  async function createOffline() {
    authError = null;
    if (form.password && form.password !== form.confirmPassword) {
      authError = "Passwords don't match.";
      return;
    }
    authLoading = true;
    try {
      await authStore.createOfflineAccount(form.displayName, form.password);
      await goto(resolveRedirect());
    } catch (e) {
      authError = e instanceof Error ? e.message : "Could not create account.";
    } finally {
      authLoading = false;
    }
  }

  async function submitOnline() {
    if (onlineMode === "register" && form.password !== form.confirmPassword) {
      authError = "Passwords don't match.";
      return;
    }
    authError = null;
    authLoading = true;
    try {
      if (onlineMode === "login") {
        await authStore.login(form.username.trim(), form.password);
      } else {
        await authStore.register(
          form.username.trim(),
          form.email.trim(),
          form.password,
          form.displayName.trim() || form.username.trim(),
        );
      }
      await goto(resolveRedirect());
    } catch (e) {
      authError = e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
    } finally {
      authLoading = false;
    }
  }

  function initials(name: string) {
    if (!name) return "?";
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }

  function switchOnlineMode(mode: OnlineMode) {
    onlineMode = mode;
    authError = null;
    showForgotPassword = false;
    form.password = "";
    form.confirmPassword = "";
    showOnlinePassword = false;
    showConfirmPassword = false;
  }
</script>

<div class="flex flex-col min-h-screen bg-background text-foreground px-6 pt-10 pb-8 max-w-sm mx-auto w-full">
  <button type="button" class="flex items-center gap-1 text-sm text-muted-foreground mb-6 self-start" onclick={() => history.back()}>
    <ArrowLeft class="h-4 w-4" /> Back
  </button>

  <!-- Tab toggle -->
  <div class="flex rounded border overflow-hidden text-sm mb-6">
    <button type="button"
      class="flex-1 py-2 text-center transition-colors {tab === 'online' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}"
      onclick={() => { tab = "online"; authError = null; }}>
      Online account
    </button>
    <button type="button"
      class="flex-1 py-2 text-center transition-colors {tab === 'offline' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}"
      onclick={() => { tab = "offline"; authError = null; }}>
      Local account
    </button>
  </div>

  <!-- ── ONLINE TAB ── -->
  {#if tab === "online"}

    <!-- Server indicator / inline setup -->
    {#if serverMode === "cloud"}
      <div class="flex items-center gap-2 mb-5">
        <Cloud class="h-3.5 w-3.5 text-primary shrink-0" />
        <span class="text-xs text-muted-foreground">logit.ie</span>
        {#if !showServerSetup}
          <button type="button" class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-1" onclick={openServerSetup}>
            <Pencil class="h-3 w-3" /> Change
          </button>
        {/if}
      </div>
    {:else if serverMode === "selfhosted"}
      <div class="flex items-center gap-2 mb-5">
        <Server class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span class="text-xs text-muted-foreground truncate max-w-[160px]">{getSelfHostUrl() || "Self-hosted"}</span>
        {#if !showServerSetup}
          <button type="button" class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0 ml-1" onclick={openServerSetup}>
            <Pencil class="h-3 w-3" /> Change
          </button>
        {/if}
      </div>
    {:else if !showServerSetup}
      <button type="button"
        class="flex items-center gap-2 mb-5 self-start text-left"
        onclick={openServerSetup}>
        <span class="text-xs text-amber-600 dark:text-amber-400">No server configured</span>
        <span class="text-xs text-primary underline">Set up</span>
      </button>
    {/if}

    {#if showServerSetup}
      <div class="rounded border border-border p-4 mb-5 flex flex-col gap-3">
        {#if serverSetupStep === "pick"}
          <p class="text-xs font-medium">Where do you want to connect?</p>
          <div class="flex flex-col gap-2">
            <button type="button"
              class="flex items-center gap-3 rounded border border-border px-3 py-3 text-left hover:border-primary/50 hover:bg-primary/5 transition-colors"
              onclick={pickCloud}>
              <Cloud class="h-4 w-4 text-primary shrink-0" />
              <div>
                <p class="text-sm font-medium">logit.ie</p>
                <p class="text-xs text-muted-foreground">Managed hosting — no server setup needed</p>
              </div>
            </button>
            <button type="button"
              class="flex items-center gap-3 rounded border border-border px-3 py-3 text-left hover:border-muted-foreground/50 hover:bg-muted/40 transition-colors"
              onclick={pickSelfHosted}>
              <Server class="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p class="text-sm font-medium">Self-hosted</p>
                <p class="text-xs text-muted-foreground">Your own Logit instance</p>
              </div>
            </button>
          </div>
          <button type="button" class="text-xs text-muted-foreground self-start" onclick={() => (showServerSetup = false)}>Cancel</button>
        {:else}
          <p class="text-xs font-medium">Your server URL</p>
          <input type="url" inputmode="url" placeholder="https://logit.yourdomain.com"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            oninput={() => (urlTestResult = "idle")}
            bind:value={selfHostUrl} />
          {#if selfHostUrl.startsWith("http://") && !selfHostUrl.startsWith("https://")}
            <p class="text-xs text-amber-600 dark:text-amber-400">HTTP is unencrypted — use HTTPS if possible.</p>
          {/if}
          <div class="flex items-center gap-2 flex-wrap">
            <button type="button"
              class="px-3 py-1.5 rounded border border-border text-xs disabled:opacity-50 hover:border-muted-foreground/50 transition-colors"
              disabled={!selfHostUrl.trim() || selfHostUrl.trim().replace(/\/$/, "") === "https:/" || urlTestResult === "testing"}
              onclick={() => void testServerUrl()}>
              {urlTestResult === "testing" ? "Testing…" : "Test connection"}
            </button>
            <button type="button"
              class="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs disabled:opacity-50"
              disabled={!selfHostUrl.trim() || selfHostUrl.trim().replace(/\/$/, "") === "https:/"}
              onclick={saveServerUrl}>
              Save
            </button>
            <button type="button" class="text-xs text-muted-foreground" onclick={() => (serverSetupStep = "pick")}>Back</button>
          </div>
          {#if urlTestResult === "ok"}
            <p class="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400"><CheckCircle class="h-3.5 w-3.5" /> Reachable</p>
          {:else if urlTestResult === "error"}
            <p class="flex items-center gap-1.5 text-xs text-destructive"><XCircle class="h-3.5 w-3.5" /> Can't reach server</p>
          {/if}
        {/if}
      </div>
    {/if}

    {#if showForgotPassword}
      <h1 class="text-xl font-bold mb-1">Reset your password</h1>
      <p class="text-xs text-muted-foreground mb-5">We'll email you a link to set a new password.</p>

      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="forgot-email">Email</label>
          <input id="forgot-email" type="email" autocomplete="email" placeholder="you@example.com"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={forgotEmail} />
        </div>

        {#if forgotResult}
          <div class="rounded border px-3 py-2 {forgotResult.isError ? 'border-destructive/30 bg-destructive/5' : 'border-border'}">
            <p class="text-sm {forgotResult.isError ? 'text-destructive' : 'text-foreground'}">{forgotResult.message}</p>
          </div>
        {/if}

        <button type="button"
          class="w-full py-3 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          disabled={forgotLoading || !forgotEmail.trim()}
          onclick={() => void submitForgotPassword()}>
          {#if forgotLoading}<Loader2 class="h-4 w-4 animate-spin" />{/if}
          {forgotLoading ? "Sending…" : "Send reset link"}
        </button>
        <button type="button" class="w-full py-2 text-sm text-muted-foreground"
          onclick={() => (showForgotPassword = false)}>
          Back to log in
        </button>
      </div>
    {:else}

    <h1 class="text-xl font-bold mb-5">{onlineMode === "login" ? "Welcome back" : "Create account"}</h1>

    <!-- Login / Register sub-toggle -->
    <div class="flex rounded border overflow-hidden text-sm mb-5">
      <button type="button"
        class="flex-1 py-2 text-center transition-colors {onlineMode === 'login' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}"
        onclick={() => switchOnlineMode("login")}>
        Log in
      </button>
      <button type="button"
        class="flex-1 py-2 text-center transition-colors {onlineMode === 'register' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}"
        onclick={() => switchOnlineMode("register")}>
        Sign up
      </button>
    </div>

    <form class="flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); void submitOnline(); }}>
      <!-- Username -->
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="username">
          {onlineMode === "login" ? "Username or email" : "Username"}
        </label>
        <input id="username" type="text"
          autocomplete="username"
          placeholder={onlineMode === "login" ? "username or email" : "choose a username"}
          class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          bind:value={form.username} />
        {#if onlineMode === "register"}
          <p class="text-xs text-muted-foreground">Letters, numbers, and underscores only.</p>
        {/if}
      </div>

      {#if onlineMode === "register"}
        <!-- Email -->
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="email">Email</label>
          <input id="email" type="email" autocomplete="email" placeholder="you@example.com"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={form.email} />
        </div>

        <!-- Display name -->
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="display-name">
            Display name <span class="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input id="display-name" type="text" autocomplete="name" placeholder="Your name"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={form.displayName} />
        </div>
      {/if}

      <!-- Password -->
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="password">Password</label>
        <div class="relative">
          <input id="password"
            type={showOnlinePassword ? "text" : "password"}
            autocomplete={onlineMode === "login" ? "current-password" : "new-password"}
            placeholder="••••••••"
            class="w-full rounded border bg-background px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={form.password} />
          <button type="button"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            onclick={() => (showOnlinePassword = !showOnlinePassword)}>
            {#if showOnlinePassword}<EyeOff class="h-3.5 w-3.5" />{:else}<Eye class="h-3.5 w-3.5" />{/if}
          </button>
        </div>
        {#if onlineMode === "register"}
          <p class="text-xs text-muted-foreground">At least 8 characters.</p>
        {:else}
          <button type="button" class="self-end text-xs text-muted-foreground hover:text-foreground"
            onclick={() => { showForgotPassword = true; forgotEmail = ""; forgotResult = null; }}>
            Forgot password?
          </button>
        {/if}
      </div>

      {#if onlineMode === "register"}
        <!-- Confirm password -->
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="confirm-password">Confirm password</label>
          <div class="relative">
            <input id="confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              autocomplete="new-password"
              placeholder="••••••••"
              class="w-full rounded border bg-background px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-ring {passwordMismatch ? 'border-destructive focus:ring-destructive' : ''}"
              bind:value={form.confirmPassword} />
            <button type="button"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              onclick={() => (showConfirmPassword = !showConfirmPassword)}>
              {#if showConfirmPassword}<EyeOff class="h-3.5 w-3.5" />{:else}<Eye class="h-3.5 w-3.5" />{/if}
            </button>
          </div>
          {#if passwordMismatch}
            <p class="text-xs text-destructive">Passwords don't match.</p>
          {/if}
        </div>
      {/if}

      {#if authError}
        <div class="rounded border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p class="text-sm text-destructive">{authError}</p>
        </div>
      {/if}

      <button type="submit"
        class="w-full py-3 mt-2 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        disabled={onlineSubmitDisabled}>
        {#if authLoading}
          <Loader2 class="h-4 w-4 animate-spin" />
          {onlineMode === "login" ? "Logging in…" : "Creating account…"}
        {:else}
          {onlineMode === "login" ? "Log in" : "Create account"}
        {/if}
      </button>
    </form>
    {/if}

  <!-- ── OFFLINE TAB ── -->
  {:else}
    <h1 class="text-xl font-bold mb-1">Local account</h1>
    <p class="text-xs text-muted-foreground mb-5">Data stays on this device. No internet required.</p>

    {#if loadingAccounts}
      <div class="flex justify-center py-10">
        <div class="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>

    {:else if offlineView === "list" && unlinkedLocalAccounts.length > 0}
      <p class="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">Your accounts</p>
      <ul class="flex flex-col gap-2 flex-1">
        {#each unlinkedLocalAccounts as account (account.id)}
          <li>
            <button type="button"
              class="w-full text-left px-4 py-3 rounded border transition-colors {selectedAccountId === account.id ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50'}"
              onclick={() => selectAccount(account.id)}>
              <div class="flex items-center gap-3">
                <div class="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                  {#if account.avatarDataUrl}
                    <img src={account.avatarDataUrl} alt={account.displayName} class="h-full w-full object-cover rounded-full" />
                  {:else}
                    {initials(account.displayName)}
                  {/if}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{account.displayName || account.username}</p>
                  <p class="text-[10px] text-muted-foreground">{account.passwordHash ? "Password protected" : "No password"}</p>
                </div>
              </div>

              {#if selectedAccountId === account.id}
                <div class="mt-3 flex flex-col gap-2">
                  {#if account.passwordHash}
                    <div class="relative">
                      <input
                        type={showOfflinePassword ? "text" : "password"}
                        placeholder="Password"
                        autocomplete="current-password"
                        class="w-full rounded border border-border bg-background px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-1 focus:ring-ring"
                        bind:value={form.password}
                        onkeydown={(e) => { if (e.key === "Enter") void loginOffline(); }} />
                      <button type="button"
                        class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                        onclick={(e) => { e.stopPropagation(); showOfflinePassword = !showOfflinePassword; }}>
                        {#if showOfflinePassword}<EyeOff class="h-3.5 w-3.5" />{:else}<Eye class="h-3.5 w-3.5" />{/if}
                      </button>
                    </div>
                  {/if}
                  {#if authError && selectedAccountId === account.id}
                    <p class="text-xs text-destructive">{authError}</p>
                  {/if}
                  <button type="button"
                    class="w-full py-2 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                    disabled={authLoading || (!!account.passwordHash && !form.password)}
                    onclick={() => void loginOffline()}>
                    {#if authLoading}<Loader2 class="h-3.5 w-3.5 animate-spin" />{/if}
                    {authLoading ? "Logging in…" : "Log in"}
                  </button>
                </div>
              {/if}
            </button>
          </li>
        {/each}
      </ul>

      <button type="button"
        class="mt-4 flex items-center justify-center gap-1.5 w-full py-2.5 rounded border border-dashed border-border text-sm text-muted-foreground hover:border-muted-foreground/50 transition-colors"
        onclick={() => { offlineView = "create"; authError = null; form.displayName = ""; form.password = ""; form.confirmPassword = ""; }}>
        <Plus class="h-4 w-4" /> Create another account
      </button>

    {:else}
      {#if unlinkedLocalAccounts.length > 0}
        <button type="button" class="flex items-center gap-1 text-sm text-muted-foreground mb-5 self-start"
          onclick={() => { offlineView = "list"; authError = null; }}>
          <ArrowLeft class="h-4 w-4" /> Back to accounts
        </button>
      {/if}

      <form class="flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); void createOffline(); }}>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="offline-name">Your name</label>
          <input id="offline-name" type="text" autocomplete="name" placeholder="e.g. Alex"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={form.displayName} />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="offline-password">
            Password <span class="text-muted-foreground font-normal">(optional)</span>
          </label>
          <p class="text-xs text-muted-foreground">Protects this account if others share this device.</p>
          <div class="relative">
            <input id="offline-password"
              type={showOfflinePassword ? "text" : "password"}
              autocomplete="new-password"
              placeholder="Leave blank for no password"
              class="w-full rounded border bg-background px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              bind:value={form.password} />
            <button type="button"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              onclick={() => (showOfflinePassword = !showOfflinePassword)}>
              {#if showOfflinePassword}<EyeOff class="h-3.5 w-3.5" />{:else}<Eye class="h-3.5 w-3.5" />{/if}
            </button>
          </div>
        </div>

        {#if form.password}
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium" for="offline-confirm">Confirm password</label>
            <input id="offline-confirm"
              type="password"
              autocomplete="new-password"
              placeholder="••••••••"
              class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring {form.confirmPassword && form.password !== form.confirmPassword ? 'border-destructive' : ''}"
              bind:value={form.confirmPassword} />
            {#if form.confirmPassword && form.password !== form.confirmPassword}
              <p class="text-xs text-destructive">Passwords don't match.</p>
            {/if}
          </div>
        {/if}

        {#if authError}
          <div class="rounded border border-destructive/30 bg-destructive/5 px-3 py-2">
            <p class="text-sm text-destructive">{authError}</p>
          </div>
        {/if}

        <button type="submit"
          class="w-full py-3 mt-4 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          disabled={authLoading || (!!form.password && form.password !== form.confirmPassword)}>
          {#if authLoading}<Loader2 class="h-4 w-4 animate-spin" />{/if}
          {authLoading ? "Setting up…" : (unlinkedLocalAccounts.length === 0 ? "Continue" : "Create account")}
        </button>
      </form>
    {/if}
  {/if}
</div>
