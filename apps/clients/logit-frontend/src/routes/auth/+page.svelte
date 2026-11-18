<script lang="ts">
  import { segment, segmentTrack } from "$lib/components/ui/choice";
  import { cn } from "$lib/utils.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { ArrowLeft, ChevronRight, Eye, EyeOff, Loader2, CheckCircle, XCircle, Ticket } from "lucide-svelte";
  import { get } from "svelte/store";
  import { authStore } from "$lib/api/authStore.svelte";
  import { profile } from "$lib/stores/profile.store";
  import { getServerMode, setServerMode, getSelfHostUrl } from "@logit/core/api/serverConfig";
  import { testServerConnection, type ConnectionResult } from "@logit/core/api/testConnection";
  import { apiClient, ApiError, type RegistrationInfo } from "@logit/core/api/client";
  import { isNativePlatform } from "$lib/platform/isNative";
  import { onboarding } from "$lib/stores/onboarding.store";
  import { getActiveOwnerId } from "$lib/data/activeOwner";

  type Mode = "login" | "register";

  const redirectTo = $derived(page.url.searchParams.get("redirect") ?? "/");

  // Set when the accounts switcher sends us here for a profile that's linked to a server
  // account but has no restorable session (see authStore.loginOfflineAccount) — prefill the
  // username and explain why sign-in is needed again instead of leaving it a mystery.
  const resumeUsername = page.url.searchParams.get("resume") ?? "";

  let mode = $state<Mode>(page.url.searchParams.get("mode") === "register" ? "register" : "login");
  let showPassword = $state(false);
  let showConfirmPassword = $state(false);

  const form = $state({ username: resumeUsername, email: "", password: "", confirmPassword: "" });
  let authError = $state<string | null>(null);
  let authLoading = $state(false);

  // Invite-only servers: the sign-up form needs an invite code from the server's admin.
  let registration = $state<RegistrationInfo | null>(null);
  let inviteCode = $state("");
  let inviteError = $state<string | null>(null);
  const inviteRequired = $derived(mode === "register" && registration?.mode === "invite");

  async function loadRegistration() {
    registration = null;
    registration = await apiClient.getRegistrationInfo();
  }

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

  // The address is checked as it's typed (design canvas 3), so there's no separate Test button.
  let checkTimer: ReturnType<typeof setTimeout> | null = null;
  function checkAsTyped() {
    urlTestResult = "idle";
    if (checkTimer) clearTimeout(checkTimer);
    checkTimer = setTimeout(() => void testServerUrl(), 600);
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
    inviteError = null;
    void loadRegistration();
  }

  function useCloud() {
    setServerMode("cloud");
    serverMode = "cloud";
    showServerSetup = false;
    inviteError = null;
    void loadRegistration();
  }

  const passwordMismatch = $derived(
    mode === "register" && form.confirmPassword.length > 0 && form.password !== form.confirmPassword
  );

  const submitDisabled = $derived(
    authLoading ||
    !form.username.trim() ||
    !form.password ||
    (mode === "register" && (!form.email.trim() || passwordMismatch || !form.confirmPassword)) ||
    (inviteRequired && !inviteCode.trim())
  );

  onMount(async () => {
    if (authStore.isAuthenticated) {
      await goto(redirectTo, { replaceState: true });
      return;
    }
    void loadRegistration();
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
    // Onboarding's own screens (the coach ones) ask to come back after signing in.
    return completed || redirectTo.startsWith("/onboarding/") ? redirectTo : "/onboarding";
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

  // "Is the training on this phone yours?" Asked before signing in from the space without an
  // account when it holds training (authStore.offlineTrainingToAsk). Neither answer is the
  // default: the safe one depends on who's holding the phone.
  type OfflineTraining = { workouts: number; splits: number; name: string };
  let whoseTraining = $state<OfflineTraining | null>(null);
  let answerWhose: ((choice: "add" | "keep-separate" | null) => void) | null = null;

  function askWhoseTraining(found: OfflineTraining): Promise<"add" | "keep-separate" | null> {
    whoseTraining = found;
    return new Promise((resolve) => {
      answerWhose = (choice) => {
        whoseTraining = null;
        answerWhose = null;
        resolve(choice);
      };
    });
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
        const found = await authStore.offlineTrainingToAsk();
        let offlineTraining: "add" | "keep-separate" | undefined;
        if (found) {
          const choice = await askWhoseTraining(found);
          if (!choice) return;
          offlineTraining = choice;
        }
        await authStore.login(form.username.trim(), form.password, { offlineTraining });
      } else {
        const displayName = get(profile).name.trim() || form.username.trim();
        await authStore.register(
          form.username.trim(), form.email.trim(), form.password, displayName,
          inviteRequired ? inviteCode : undefined,
        );
      }
      await goto(resolveRedirect());
    } catch (e) {
      if (e instanceof ApiError && (e.code === "invite_required" || e.code === "invite_invalid")) {
        // The server may have become invite-only since the screen loaded: show the field.
        registration = { mode: "invite", selfHosted: registration?.selfHosted ?? true };
        inviteError = e.code === "invite_invalid"
          ? "That code isn't valid, has expired or has been used up. Check it with whoever sent it."
          : "This server is invite-only. Enter the invite code you were sent.";
        return;
      }
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
          class="h-10 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          bind:value={forgotEmail} />
      </div>

      {#if forgotResult}
        <div class="rounded-md border px-3 py-2 {forgotResult.isError ? 'border-destructive/30 bg-destructive/5' : 'border-border'}">
          <p class="text-sm {forgotResult.isError ? 'text-destructive' : 'text-foreground'}">{forgotResult.message}</p>
        </div>
      {/if}

      <button type="button"
        class="w-full py-3 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        disabled={forgotLoading || !forgotEmail.trim()}
        onclick={() => void submitForgotPassword()}>
        {#if forgotLoading}<Loader2 class="h-4 w-4 animate-spin" />{/if}
        {forgotLoading ? "Sending…" : "Send reset link"}
      </button>
      <button type="button" class="w-full py-2 text-sm text-muted-foreground"
        onclick={() => (showForgotPassword = false)}>
        Back to sign in
      </button>
    </div>
  {:else}

    <h1 class="text-xl font-bold mb-1">{mode === "login" ? "Sign in" : "Create account"}</h1>
    <p class="text-sm text-muted-foreground mb-5">
      {mode === "login"
        ? "Your workouts, splits and settings come back with you."
        : "Back up your training, train with friends, get coached."}
    </p>

    <!-- Log in / Sign up toggle -->
    <div class={cn(segmentTrack, "mb-5")}>
      <button type="button"
        class={segment(mode === 'login')} aria-pressed={mode === 'login'}
        onclick={() => switchMode("login")}>
        Sign in
      </button>
      <button type="button"
        class={segment(mode === 'register')} aria-pressed={mode === 'register'}
        onclick={() => switchMode("register")}>
        Create account
      </button>
    </div>

    {#if mode === "register" && hasLocalData}
      <p class="text-xs text-muted-foreground mb-4 rounded-md border border-border px-3 py-2">
        Your workouts on this device stay put — they'll sync to your new account.
      </p>
    {/if}

    {#if mode === "login" && resumeUsername}
      <p class="text-xs text-muted-foreground mb-4 rounded-md border border-border px-3 py-2">
        Sign in as <span class="font-medium text-foreground">{resumeUsername}</span> to resume syncing this profile.
      </p>
    {/if}

    <form class="flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); void submit(); }}>
      {#if inviteRequired}
        <!-- Invite code (invite-only servers) -->
        <div class="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5">
          <p class="flex items-center gap-2 text-sm font-semibold">
            <Ticket class="h-4 w-4 text-highlight" aria-hidden="true" /> This server is invite-only
          </p>
          <label class="text-sm font-medium" for="invite-code">Invite code</label>
          <input id="invite-code" type="text"
            autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12"
            placeholder="XXXX-XXXX"
            aria-invalid={inviteError ? "true" : undefined}
            aria-describedby="invite-code-help"
            class="h-10 w-full rounded-md border bg-background px-3 font-mono text-[15px] uppercase tracking-[0.12em] placeholder:normal-case placeholder:tracking-normal focus:outline-none focus:ring-1 focus:ring-ring {inviteError ? 'border-destructive focus:ring-destructive' : ''}"
            oninput={() => (inviteError = null)}
            bind:value={inviteCode} />
          <p id="invite-code-help" class="text-xs {inviteError ? 'text-destructive' : 'text-muted-foreground'}">
            {inviteError ?? "Ask whoever runs this server for one."}
          </p>
        </div>
      {/if}

      <!-- Username -->
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="username">
          {mode === "login" ? "Username or email" : "Username"}
        </label>
        <input id="username" type="text"
          autocomplete="username"
          placeholder={mode === "login" ? "username or email" : "choose a username"}
          class="h-10 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
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
            class="h-10 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
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
            class="h-10 w-full rounded-md border bg-background px-3 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
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
              class="h-10 w-full rounded-md border bg-background px-3 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-ring {passwordMismatch ? 'border-destructive focus:ring-destructive' : ''}"
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
        <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p class="text-sm text-destructive">{authError}</p>
        </div>
      {/if}

      <button type="submit"
        class="w-full py-3 mt-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        disabled={submitDisabled}>
        {#if authLoading}
          <Loader2 class="h-4 w-4 animate-spin" />
          {mode === "login" ? "Signing in…" : "Creating account…"}
        {:else}
          {mode === "login" ? "Sign in" : "Create account"}
        {/if}
      </button>
    </form>

    <!-- Server (design canvas 2 and 3): getlogit.app unless changed under Advanced -->
    <div class="mt-6">
      {#if !showServerSetup}
        <button type="button" class="w-full min-h-11 flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5 text-left"
          onclick={() => { showServerSetup = true; urlTestResult = "idle"; }}>
          <span class="flex min-w-0 flex-col">
            <span class="text-xs text-muted-foreground">Server</span>
            <span class="flex items-center gap-2 truncate text-sm font-medium">
              {serverMode === "selfhosted" ? getSelfHostUrl().replace(/^https?:\/\//, "") || "Your own server" : "getlogit.app"}
              {#if serverMode === "selfhosted" && registration?.mode === "invite"}
                <span class="shrink-0 rounded-full bg-highlight/12 px-2 py-0.5 text-[11px] font-semibold text-highlight">Invite-only</span>
              {/if}
            </span>
          </span>
          <span class="flex shrink-0 items-center gap-1 text-[13px] text-muted-foreground">Advanced <ChevronRight class="h-3.5 w-3.5" /></span>
        </button>
      {:else}
        <div class="flex flex-col gap-3">
          <div>
            <p class="text-base font-bold">Which server?</p>
            <p class="text-sm text-muted-foreground">Most people use getlogit.app. If you run Logit on your own server, enter its address.</p>
          </div>
          <button type="button" class="flex items-center gap-3 rounded-lg border px-3.5 py-3 text-left {serverMode === 'cloud' ? 'border-2 border-primary' : 'border-border'}"
            aria-pressed={serverMode === "cloud"} onclick={useCloud}>
            <span class="h-5 w-5 shrink-0 rounded-full {serverMode === 'cloud' ? 'border-[6px] border-primary' : 'border-2 border-muted-foreground/50'}"></span>
            <span class="flex flex-col"><span class="text-[15px] font-medium">getlogit.app</span><span class="text-xs text-muted-foreground">Free, with Pro and Studio plans</span></span>
          </button>
          <div class="flex flex-col gap-3 rounded-lg border px-3.5 py-3 {serverMode === 'selfhosted' ? 'border-2 border-primary' : 'border-border'}">
            <span class="flex items-center gap-3">
              <span class="h-5 w-5 shrink-0 rounded-full {serverMode === 'selfhosted' ? 'border-[6px] border-primary' : 'border-2 border-muted-foreground/50'}"></span>
              <span class="flex flex-col"><span class="text-[15px] font-medium">My own server</span><span class="text-xs text-muted-foreground">Everything included, on your hardware</span></span>
            </span>
            <label class="text-sm font-medium" for="server-address">Server address</label>
            <input id="server-address" type="url" inputmode="url" placeholder="https://logit.yourdomain.com"
              class="h-10 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              oninput={checkAsTyped}
              bind:value={selfHostUrl} />
            {#if selfHostUrl.startsWith("http://") && !selfHostUrl.startsWith("https://")}
              <p class="text-xs text-warning">HTTP is unencrypted. Use HTTPS if you can.</p>
            {/if}
            {#if urlTestResult === "testing"}
              <p class="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 class="h-3.5 w-3.5 animate-spin" /> Checking…</p>
            {:else if urlTestResult === "ok"}
              <p class="flex items-center gap-1.5 text-xs text-success"><CheckCircle class="h-3.5 w-3.5" /> Found a Logit server</p>
            {:else if urlTestResult === "error"}
              <p class="flex items-center gap-1.5 text-xs text-destructive"><XCircle class="h-3.5 w-3.5" /> Can't reach a Logit server there</p>
            {/if}
            <button type="button"
              class="h-11 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              disabled={!selfHostUrl.trim() || selfHostUrl.trim().replace(/\/$/, "") === "https:/"}
              onclick={saveServerUrl}>
              Use this server
            </button>
          </div>
          <button type="button" class="h-11 text-sm text-muted-foreground" onclick={() => (showServerSetup = false)}>Back</button>
        </div>
      {/if}
    </div>
  {/if}
</div>

{#if whoseTraining}
  <div class="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" role="presentation">
    <div class="rounded-t-2xl bg-background px-6 pt-3 pb-[max(1.75rem,env(safe-area-inset-bottom))] flex flex-col gap-4" role="dialog" aria-modal="true" aria-labelledby="whose-title">
      <div class="h-1 w-10 rounded-full bg-muted-foreground/30 self-center"></div>
      <div>
        <h2 id="whose-title" class="text-lg font-bold">Is the training on this phone yours, @{form.username.trim()}?</h2>
        <p class="mt-1 text-sm text-muted-foreground">This phone has training that isn't in any account yet.</p>
      </div>
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="rounded-lg bg-muted p-2.5"><p class="text-lg font-bold">{whoseTraining.workouts}</p><p class="text-xs text-muted-foreground">workout{whoseTraining.workouts === 1 ? "" : "s"}</p></div>
        <div class="rounded-lg bg-muted p-2.5"><p class="text-lg font-bold">{whoseTraining.splits}</p><p class="text-xs text-muted-foreground">split{whoseTraining.splits === 1 ? "" : "s"}</p></div>
        <div class="rounded-lg bg-muted p-2.5"><p class="text-lg font-bold truncate">{whoseTraining.name || "No name"}</p><p class="text-xs text-muted-foreground">name on it</p></div>
      </div>
      <div class="flex flex-col gap-2.5">
        <button type="button" class="flex flex-col items-start gap-0.5 rounded-lg border border-border px-3.5 py-3 text-left" onclick={() => answerWhose?.("keep-separate")}>
          <span class="text-[15px] font-medium">No, it's someone else's</span>
          <span class="text-sm text-muted-foreground">It stays as it is. You start with your own</span>
        </button>
        <button type="button" class="flex flex-col items-start gap-0.5 rounded-lg border border-border px-3.5 py-3 text-left" onclick={() => answerWhose?.("add")}>
          <span class="text-[15px] font-medium">Yes, add it to @{form.username.trim()}</span>
          <span class="text-sm text-muted-foreground">It joins your account's history</span>
        </button>
        <button type="button" class="h-11 text-sm font-medium text-muted-foreground" onclick={() => answerWhose?.(null)}>Cancel</button>
      </div>
    </div>
  </div>
{/if}
