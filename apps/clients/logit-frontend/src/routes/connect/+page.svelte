<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { ArrowLeft, Cloud, Server, Eye, EyeOff, Loader2, CheckCircle, XCircle } from "lucide-svelte";
  import { authStore } from "$lib/api/authStore.svelte";
  import { getServerMode, setServerMode, getSelfHostUrl } from "$lib/api/serverConfig";
  import { testServerConnection, type ConnectionResult } from "$lib/api/testConnection";
  import { ApiError } from "$lib/api/client";
  import { isNativePlatform } from "$lib/platform/isNative";
  import { getActiveOwnerId } from "$lib/data/activeOwner";
  import type { LocalAccount } from "$lib/data/localAccountRepo";

  const redirectTo = $derived(page.url.searchParams.get("redirect") ?? "/settings");

  type Mode = "register" | "login";
  let mode = $state<Mode>("register");

  let localAccount = $state<LocalAccount | null>(null);
  let loading = $state(true);
  let usernameEditable = $state(false);
  let showPassword = $state(false);
  let showConfirmPassword = $state(false);

  const form = $state({ username: "", email: "", password: "", confirmPassword: "" });
  let authError = $state<string | null>(null);
  let authLoading = $state(false);

  // Server config (reactive)
  let serverMode = $state(getServerMode());
  let showServerSetup = $state(false);
  let serverSetupStep = $state<"pick" | "url">("pick");
  let selfHostUrl = $state(getSelfHostUrl() || "https://");
  let urlTestResult = $state<ConnectionResult>("idle");

  function openServerSetup() {
    showServerSetup = true;
    const saved = getSelfHostUrl();
    if (saved) {
      selfHostUrl = saved;
      serverSetupStep = "url";
    } else {
      selfHostUrl = "https://";
      serverSetupStep = "pick";
    }
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
    mode === "register" && form.confirmPassword.length > 0 && form.password !== form.confirmPassword
  );

  const submitDisabled = $derived(
    authLoading ||
    !form.username.trim() ||
    !form.password ||
    (mode === "register" && (!form.email.trim() || !form.confirmPassword || passwordMismatch))
  );

  onMount(async () => {
    if (authStore.isAuthenticated) {
      await goto(redirectTo, { replaceState: true });
      return;
    }
    if (isNativePlatform()) {
      try {
        const { getLocalAccount } = await import("$lib/data/localAccountRepo");
        const ownerId = getActiveOwnerId();
        if (ownerId) {
          localAccount = await getLocalAccount(ownerId);
          if (localAccount) form.username = localAccount.username;
        }
      } catch {}
    }
    loading = false;
  });

  function initials(name: string) {
    if (!name) return "?";
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }

  function switchMode(m: Mode) {
    mode = m;
    authError = null;
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
    try {
      if (mode === "register") {
        await authStore.register(
          form.username.trim(),
          form.email.trim(),
          form.password,
          localAccount?.displayName || form.username.trim(),
        );
      } else {
        await authStore.login(form.username.trim(), form.password);
      }
      await goto(redirectTo);
    } catch (e) {
      authError = e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
    } finally {
      authLoading = false;
    }
  }
</script>

<div class="flex flex-col min-h-screen bg-background text-foreground px-6 pt-10 pb-8 max-w-sm mx-auto w-full">
  <button type="button"
    class="flex items-center gap-1 text-sm text-muted-foreground mb-6 self-start"
    onclick={() => history.back()}>
    <ArrowLeft class="h-4 w-4" /> Back
  </button>

  <!-- Server indicator / inline setup -->
  {#if serverMode === "cloud"}
    <div class="flex items-center gap-2 mb-5">
      <Cloud class="h-3.5 w-3.5 text-primary shrink-0" />
      <span class="text-xs text-muted-foreground">Logit cloud</span>
    </div>
  {:else if serverMode === "selfhosted"}
    <div class="flex items-center gap-2 mb-5">
      <Server class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span class="text-xs text-muted-foreground">Self-hosted</span>
    </div>
  {:else if !showServerSetup}
    <button type="button"
      class="flex items-center gap-2 mb-5 self-start"
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
              <p class="text-sm font-medium">Logit cloud</p>
              <p class="text-xs text-muted-foreground">Managed hosting by Logit</p>
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

  <h1 class="text-xl font-bold mb-1">Connect online account</h1>
  <p class="text-xs text-muted-foreground mb-5">
    Link your local profile to the cloud to enable sync and social features. Your existing data stays on this device.
  </p>

  <!-- Local account card -->
  {#if !loading && localAccount}
    <div class="rounded border border-border px-4 py-3 mb-5 flex items-center gap-3">
      <div class="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0 overflow-hidden">
        {#if localAccount.avatarDataUrl}
          <img src={localAccount.avatarDataUrl} alt={localAccount.displayName} class="h-full w-full object-cover" />
        {:else}
          {initials(localAccount.displayName || localAccount.username)}
        {/if}
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Connecting as</p>
        <p class="text-sm font-medium truncate">{localAccount.displayName || localAccount.username}</p>
      </div>
    </div>
  {/if}

  <!-- Mode toggle -->
  <div class="flex rounded border overflow-hidden text-sm mb-5">
    <button type="button"
      class="flex-1 py-2 text-center transition-colors {mode === 'register' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}"
      onclick={() => switchMode("register")}>
      Create account
    </button>
    <button type="button"
      class="flex-1 py-2 text-center transition-colors {mode === 'login' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}"
      onclick={() => switchMode("login")}>
      Log in
    </button>
  </div>

  {#if serverMode === "offline"}
    <p class="text-sm text-muted-foreground text-center py-6">
      Configure a server above to continue.
    </p>
  {:else}
    <form class="flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); void submit(); }}>
      <!-- Username -->
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="username">
          {mode === "login" ? "Username or email" : "Username"}
        </label>
        {#if mode === "register" && localAccount && !usernameEditable}
          <input id="username" type="text"
            class="w-full rounded border bg-muted px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
            value={form.username} readonly />
          <p class="text-[11px] text-muted-foreground">
            From your local account ·
            <button type="button" class="underline" onclick={() => (usernameEditable = true)}>Edit</button>
          </p>
        {:else}
          <input id="username" type="text"
            autocomplete="username"
            placeholder={mode === "login" ? "username or email" : "choose a username"}
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={form.username} />
          {#if mode === "register"}
            <p class="text-xs text-muted-foreground">Letters, numbers, and underscores only.</p>
          {/if}
        {/if}
      </div>

      {#if mode === "register"}
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
              class="w-full rounded border bg-background px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-ring {passwordMismatch ? 'border-destructive' : ''}"
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
          {mode === "register" ? "Creating account…" : "Logging in…"}
        {:else}
          {mode === "register" ? "Create & connect" : "Log in & connect"}
        {/if}
      </button>
    </form>
  {/if}
</div>
