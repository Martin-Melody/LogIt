<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { ArrowLeft, Cloud, Server, Eye, EyeOff, Loader2, CheckCircle, XCircle } from "lucide-svelte";
  import { get } from "svelte/store";
  import { authStore } from "$lib/api/authStore.svelte";
  import { profile } from "$lib/stores/profile.store";
  import { getServerMode, setServerMode, getSelfHostUrl } from "@logit/core/api/serverConfig";
  import { testServerConnection, type ConnectionResult } from "@logit/core/api/testConnection";
  import { apiClient, ApiError } from "@logit/core/api/client";
  import { isNativePlatform } from "$lib/platform/isNative";
  import { onboarding } from "$lib/stores/onboarding.store";
  import { getActiveOwnerId } from "$lib/data/activeOwner";

  type Mode = "login" | "register";

  const redirectTo = $derived(page.url.searchParams.get("redirect") ?? "/");

  let mode = $state<Mode>(page.url.searchParams.get("mode") === "register" ? "register" : "login");
  let showPassword = $state(false);
  let showConfirmPassword = $state(false);

  const form = $state({ username: "", email: "", password: "", confirmPassword: "" });
  let authError = $state<string | null>(null);
  let authLoading = $state(false);

  // Whether this device already holds unsynced local data to bring along
  let hasLocalData = $state(false);

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

  // ── Server (default: managed cloud) ──────────────────────────────────────
  let serverMode = $state(getServerMode() === "selfhosted" ? "selfhosted" : "cloud");
  let showServerSetup = $state(false);
  let selfHostUrl = $state(getSelfHostUrl() || "https://");
  let urlTestResult = $state<ConnectionResult>("idle");

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

  function useCloud() {
    setServerMode("cloud");
    serverMode = "cloud";
    showServerSetup = false;
  }

  const passwordMismatch = $derived(
    mode === "register" && form.confirmPassword.length > 0 && form.password !== form.confirmPassword
  );

  const submitDisabled = $derived(
    authLoading ||
    !form.username.trim() ||
    !form.password ||
    (mode === "register" && (!form.email.trim() || passwordMismatch || !form.confirmPassword))
  );

  onMount(async () => {
    if (authStore.isAuthenticated) {
      await goto(redirectTo, { replaceState: true });
      return;
    }
    if (isNativePlatform()) {
      try {
        const ownerId = getActiveOwnerId();
        if (ownerId) {
          const { getLocalAccount } = await import("$lib/data/localAccountRepo");
          const acct = await getLocalAccount(ownerId);
          hasLocalData = !!acct && !acct.serverUserId;
        }
      } catch {}
    }
  });

  function resolveRedirect(): string {
    const { completed } = get(onboarding);
    return completed ? redirectTo : "/onboarding";
  }

  function switchMode(m: Mode) {
    mode = m;
    authError = null;
    showForgotPassword = false;
    form.password = "";
    form.confirmPassword = "";
    showPassword = false;
    showConfirmPassword = false;
  }

  async function submit() {
    if (mode === "register" && form.password !== form.confirmPassword) {
      authError = "Passwords don't match.";
      return;
    }
    authError = null;
    authLoading = true;

    // Everything on this screen targets a server. If the user didn't pick a
    // self-hosted URL, they're connecting to the managed cloud.
    if (serverMode !== "selfhosted") setServerMode("cloud");

    try {
      if (mode === "login") {
        await authStore.login(form.username.trim(), form.password);
      } else {
        const displayName = get(profile).name.trim() || form.username.trim();
        await authStore.register(form.username.trim(), form.email.trim(), form.password, displayName);
      }
      await goto(resolveRedirect());
    } catch (e) {
      authError = e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
    } finally {
      authLoading = false;
    }
  }
</script>

<div class="flex flex-col min-h-screen bg-background text-foreground px-6 pt-10 pb-8 max-w-sm mx-auto w-full">
  <button type="button" class="flex items-center gap-1 text-sm text-muted-foreground mb-6 self-start" onclick={() => history.back()}>
    <ArrowLeft class="h-4 w-4" /> Back
  </button>

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

    <h1 class="text-xl font-bold mb-1">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
    <p class="text-xs text-muted-foreground mb-5">
      {mode === "login"
        ? "Log in to sync across devices and use the social feed."
        : "Sync your training across devices and follow other lifters."}
    </p>

    <!-- Log in / Sign up toggle -->
    <div class="flex rounded border overflow-hidden text-sm mb-5">
      <button type="button"
        class="flex-1 py-2 text-center transition-colors {mode === 'login' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}"
        onclick={() => switchMode("login")}>
        Log in
      </button>
      <button type="button"
        class="flex-1 py-2 text-center transition-colors {mode === 'register' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}"
        onclick={() => switchMode("register")}>
        Sign up
      </button>
    </div>

    {#if mode === "register" && hasLocalData}
      <p class="text-xs text-muted-foreground mb-4 rounded border border-border px-3 py-2">
        Your workouts on this device stay put — they'll sync to your new account.
      </p>
    {/if}

    <form class="flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); void submit(); }}>
      <!-- Username -->
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="username">
          {mode === "login" ? "Username or email" : "Username"}
        </label>
        <input id="username" type="text"
          autocomplete="username"
          placeholder={mode === "login" ? "username or email" : "choose a username"}
          class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          bind:value={form.username} />
        {#if mode === "register"}
          <p class="text-xs text-muted-foreground">Letters, numbers, and underscores only.</p>
        {/if}
      </div>

      {#if mode === "register"}
        <!-- Email -->
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="email">Email</label>
          <input id="email" type="email" autocomplete="email" placeholder="you@example.com"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={form.email} />
        </div>
      {/if}

      <!-- Password -->
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="password">Password</label>
        <div class="relative">
          <input id="password"
            type={showPassword ? "text" : "password"}
            autocomplete={mode === "login" ? "current-password" : "new-password"}
            placeholder="••••••••"
            class="w-full rounded border bg-background px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={form.password} />
          <button type="button"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            onclick={() => (showPassword = !showPassword)}>
            {#if showPassword}<EyeOff class="h-3.5 w-3.5" />{:else}<Eye class="h-3.5 w-3.5" />{/if}
          </button>
        </div>
        {#if mode === "register"}
          <p class="text-xs text-muted-foreground">At least 8 characters.</p>
        {:else}
          <button type="button" class="self-end text-xs text-muted-foreground hover:text-foreground"
            onclick={() => { showForgotPassword = true; forgotEmail = ""; forgotResult = null; }}>
            Forgot password?
          </button>
        {/if}
      </div>

      {#if mode === "register"}
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
        disabled={submitDisabled}>
        {#if authLoading}
          <Loader2 class="h-4 w-4 animate-spin" />
          {mode === "login" ? "Logging in…" : "Creating account…"}
        {:else}
          {mode === "login" ? "Log in" : "Create account"}
        {/if}
      </button>
    </form>

    <!-- Server selector -->
    <div class="mt-6 pt-4 border-t border-border">
      {#if !showServerSetup}
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          {#if serverMode === "selfhosted"}
            <Server class="h-3.5 w-3.5 shrink-0" />
            <span class="truncate">{getSelfHostUrl() || "Self-hosted"}</span>
          {:else}
            <Cloud class="h-3.5 w-3.5 text-primary shrink-0" />
            <span>logit.ie</span>
          {/if}
          <button type="button" class="ml-auto underline hover:text-foreground shrink-0"
            onclick={() => { showServerSetup = true; urlTestResult = "idle"; }}>
            Connect to a different server
          </button>
        </div>
      {:else}
        <div class="rounded border border-border p-4 flex flex-col gap-3">
          <p class="text-xs font-medium">Connect to a self-hosted server</p>
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
            {#if serverMode === "selfhosted"}
              <button type="button" class="text-xs text-muted-foreground" onclick={useCloud}>Use logit.ie instead</button>
            {:else}
              <button type="button" class="text-xs text-muted-foreground" onclick={() => (showServerSetup = false)}>Cancel</button>
            {/if}
          </div>
          {#if urlTestResult === "ok"}
            <p class="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400"><CheckCircle class="h-3.5 w-3.5" /> Reachable</p>
          {:else if urlTestResult === "error"}
            <p class="flex items-center gap-1.5 text-xs text-destructive"><XCircle class="h-3.5 w-3.5" /> Can't reach server</p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
