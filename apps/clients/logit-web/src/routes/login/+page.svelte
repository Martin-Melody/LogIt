<!-- W1 · Sign in or sign up. One path instead of two tabs: email (or username) first, then the
     password; "Create an account" opens the sign-up form. The page never says whether an email
     has an account (same as the server), so the password step follows whatever was typed.
     Signed in on the phone? Scan the QR instead (PairingQr). -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount, tick } from "svelte";
  import { apiClient, ApiError, type RegistrationInfo } from "@logit/core/api/client";
  import { getServerMode, setServerMode, getSelfHostUrl } from "@logit/core/api/serverConfig";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Alert from "$lib/components/ui/alert";
  import Logo from "@logit/ui/Logo.svelte";
  import PairingQr from "$lib/features/auth/PairingQr.svelte";

  // Marketing site owns plan selection + Stripe checkout; link there for plan comparison.
  const PRICING_URL: string = `${import.meta.env.VITE_MARKETING_URL || "https://getlogit.app"}/pricing`;

  type Mode = "login" | "register";
  let mode = $state<Mode>(page.url.searchParams.get("mode") === "register" ? "register" : "login");
  /** Sign-in is two steps: who, then the password. */
  let step = $state<"who" | "password">("who");

  let usernameOrEmail = $state("");
  let username = $state("");
  let displayName = $state("");
  let email = $state("");
  let password = $state("");
  let confirmPassword = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Invite-only servers: signing up needs an invite code from the server's admin.
  let registration = $state<RegistrationInfo | null>(null);
  let inviteCode = $state("");
  let inviteError = $state<string | null>(null);
  // A new invite-only server with nobody in charge yet: the first account signs up with the
  // server's ADMIN_KEY instead of an invite and becomes its admin.
  const settingUp = $derived(mode === "register" && registration?.mode === "invite" && !!registration?.setup);
  const inviteRequired = $derived(mode === "register" && registration?.mode === "invite" && !settingUp);
  let adminKey = $state("");

  async function loadRegistration() {
    registration = null;
    registration = await apiClient.getRegistrationInfo();
  }
  onMount(() => void loadRegistration());

  let showServerSetup = $state(false);
  let serverMode = $state(getServerMode());
  let selfHostUrl = $state(getSelfHostUrl() || "");

  const passwordMismatch = $derived(
    mode === "register" && confirmPassword.length > 0 && password !== confirmPassword,
  );

  const canSubmit = $derived(
    !loading &&
    (mode === "login"
      ? step === "who" ? !!usernameOrEmail.trim() : !!password
      : !!password && !!username.trim() && !!email.trim() && !!displayName.trim() && !!confirmPassword && !passwordMismatch &&
        (!inviteRequired || !!inviteCode.trim()) && (!settingUp || !!adminKey.trim())),
  );

  async function switchMode(m: Mode) {
    mode = m;
    step = "who";
    error = null;
    password = "";
    confirmPassword = "";
    // Carry what was typed across: an email typed to sign in is the sign-up email.
    if (m === "register" && usernameOrEmail.includes("@") && !email) email = usernameOrEmail.trim();
    await tick();
    document.getElementById(m === "register" ? "displayName" : "identifier")?.focus();
  }

  /** Where to go: `?next=` when it's a path on this site (an invite link sends people here
   * first); otherwise Overview after signing in, and "What brings you here?" after signing up. */
  function nextPath(fallback: string): string {
    const next = page.url.searchParams.get("next") ?? "";
    return next.startsWith("/") && !next.startsWith("//") ? next : fallback;
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (!canSubmit) return;
    if (mode === "login" && step === "who") {
      step = "password";
      error = null;
      await tick();
      document.getElementById("password")?.focus();
      return;
    }
    loading = true;
    error = null;
    try {
      if (mode === "login") {
        await apiClient.login(usernameOrEmail.trim(), password);
        await goto(nextPath("/"));
      } else {
        await apiClient.register(
          username.trim(), email.trim(), password, displayName.trim(),
          inviteRequired ? inviteCode : undefined,
          settingUp ? adminKey : undefined,
        );
        await goto(nextPath("/welcome"));
      }
    } catch (err) {
      if (err instanceof ApiError && (err.code === "invite_required" || err.code === "invite_invalid")) {
        registration = { mode: "invite", selfHosted: registration?.selfHosted ?? true };
        inviteError = err.code === "invite_invalid"
          ? "That code isn't valid, has expired or has been used up. Check it with whoever sent it."
          : "This server is invite-only. Enter the invite code you were sent.";
      } else if (mode === "register" && err instanceof ApiError && err.status === 409) {
        error = "That username or email already has an account. Sign in instead.";
      } else {
        error =
          err instanceof ApiError
            ? err.message
            : mode === "login"
              ? "Couldn't sign in. Check your details and try again."
              : "Couldn't create your account. Try again.";
      }
    } finally {
      loading = false;
    }
  }

  function saveServerUrl() {
    const url = selfHostUrl.trim().replace(/\/$/, "");
    if (!url) return;
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
</script>


<div class="flex min-h-screen flex-wrap bg-background">
  <section class="flex min-w-0 flex-[1_1_420px] flex-col justify-center gap-5 bg-[#0f172a] px-[max(24px,6%)] py-14 text-slate-50 max-md:hidden">
    <div class="flex items-center gap-2.5">
      <Logo size={32} />
      <span class="text-lg font-bold">LogIt</span>
    </div>
    <h1 class="max-w-[18ch] text-4xl font-bold leading-tight">Your training, on a bigger screen.</h1>
    <div class="flex max-w-[46ch] flex-col gap-2.5 text-[15px] text-slate-300">
      <p>Plan weeks and see every lift's trend at a glance.</p>
      <p>Coach clients: programs, check-ins and messages in one place.</p>
    </div>
  </section>

  <section class="flex min-w-0 flex-[1_1_420px] items-center justify-center px-6 py-12">
    <div class="flex w-full max-w-[380px] flex-col gap-4">
      <div class="flex items-center gap-2 md:hidden">
        <Logo size={26} />
        <span class="text-base font-bold">LogIt</span>
      </div>
      <h2 class="text-2xl font-bold">{mode === "login" ? "Sign in" : "Create an account"}</h2>

      {#if mode === "login"}
        <PairingQr onSignedIn={() => void goto(nextPath("/"))} />
        <div class="flex items-center gap-2.5 text-[13px] text-muted-foreground">
          <span class="h-px flex-1 bg-border"></span>or<span class="h-px flex-1 bg-border"></span>
        </div>
      {/if}

      <form class="flex flex-col gap-3" onsubmit={submit}>
        {#if mode === "login"}
          {#if step === "who"}
            <div class="flex flex-col gap-1.5">
              <Label for="identifier">Username or email</Label>
              <Input id="identifier" type="text" bind:value={usernameOrEmail} autocomplete="username" placeholder="you@example.com" />
            </div>
          {:else}
            <div class="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
              <span class="min-w-0 truncate">{usernameOrEmail.trim()}</span>
              <button type="button" class="shrink-0 text-xs font-medium underline underline-offset-4" onclick={() => { step = "who"; password = ""; error = null; }}>Change</button>
            </div>
            <!-- Kept for password managers: they pair the password with this username. -->
            <input type="text" class="sr-only" tabindex="-1" aria-hidden="true" autocomplete="username" value={usernameOrEmail} readonly />
            <div class="flex flex-col gap-1.5">
              <Label for="password">Password</Label>
              <Input id="password" type="password" bind:value={password} autocomplete="current-password" />
            </div>
          {/if}
        {:else}
          {#if settingUp}
            <div class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
              <p class="text-sm font-semibold">Set up this server</p>
              <p class="text-xs text-muted-foreground">Nobody runs it yet. Sign up with its admin key and this account becomes the admin, who invites everyone else.</p>
              <Label for="admin-key">Admin key</Label>
              <Input id="admin-key" type="password" bind:value={adminKey} autocomplete="off" spellcheck="false" aria-describedby="admin-key-help" />
              <p id="admin-key-help" class="text-xs text-muted-foreground">It's <code class="rounded bg-muted px-1">ADMIN_KEY</code> in the .env file next to docker-compose.yml.</p>
            </div>
          {/if}
          {#if inviteRequired}
            <div class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
              <p class="text-sm font-semibold">This server is invite-only</p>
              <Label for="invite-code">Invite code</Label>
              <Input
                id="invite-code"
                type="text"
                bind:value={inviteCode}
                oninput={() => (inviteError = null)}
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                maxlength={12}
                placeholder="XXXX-XXXX"
                class="font-mono uppercase tracking-[0.12em] placeholder:normal-case placeholder:tracking-normal"
                aria-invalid={!!inviteError}
                aria-describedby="invite-code-help"
              />
              <p id="invite-code-help" class="text-xs {inviteError ? 'text-destructive' : 'text-muted-foreground'}">
                {inviteError ?? "Ask whoever runs this server for one."}
              </p>
            </div>
          {/if}
          <div class="flex flex-col gap-1.5">
            <Label for="displayName">Name</Label>
            <Input id="displayName" type="text" bind:value={displayName} autocomplete="name" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="email">Email</Label>
            <Input id="email" type="email" bind:value={email} autocomplete="email" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="username">Username</Label>
            <Input id="username" type="text" bind:value={username} autocomplete="username" aria-describedby="username-help" />
            <p id="username-help" class="text-xs text-muted-foreground">How friends find you on Social. Letters, numbers, dots and underscores.</p>
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="password">Password</Label>
            <Input id="password" type="password" bind:value={password} autocomplete="new-password" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="confirm-password">Confirm password</Label>
            <Input id="confirm-password" type="password" bind:value={confirmPassword} autocomplete="new-password" aria-invalid={passwordMismatch} />
            {#if passwordMismatch}
              <p class="text-xs text-destructive">Passwords don't match.</p>
            {/if}
          </div>
        {/if}

        {#if error}
          <Alert.Root variant="destructive">
            <Alert.Description>{error}</Alert.Description>
          </Alert.Root>
        {/if}

        <Button type="submit" disabled={!canSubmit} class="h-11 w-full">
          {#if loading}<Spinner class="size-4" />{/if}
          {mode === "register" ? "Create account" : step === "who" ? "Continue" : "Sign in"}
        </Button>
      </form>

      <p class="text-sm text-muted-foreground">
        {#if mode === "login"}
          New here? <button type="button" class="font-semibold text-foreground underline-offset-4 hover:underline" onclick={() => void switchMode("register")}>Create an account</button>
        {:else}
          Have an account? <button type="button" class="font-semibold text-foreground underline-offset-4 hover:underline" onclick={() => void switchMode("login")}>Sign in</button>
        {/if}
      </p>

      <div class="flex items-center justify-between text-xs">
        {#if mode === "login"}
          <a href="/forgot-password" class="text-muted-foreground hover:text-foreground">Forgot password?</a>
        {:else}
          <span></span>
        {/if}
        <a href={PRICING_URL} class="text-muted-foreground hover:text-foreground">Compare plans</a>
      </div>

      <div>
        <button type="button" class="text-xs text-muted-foreground hover:text-foreground" onclick={() => (showServerSetup = !showServerSetup)}>
          {serverMode === "selfhosted" ? `Your own server: ${selfHostUrl}` : "Advanced: use your own server"}
        </button>
      </div>

      {#if showServerSetup}
        <div class="flex flex-col gap-2 rounded border border-border p-3">
          <Label for="server-url">Server address</Label>
          <div class="flex gap-2">
            <Input id="server-url" type="text" placeholder="https://your-server.example.com" class="min-w-0 flex-1" bind:value={selfHostUrl} />
            <Button type="button" size="sm" disabled={!selfHostUrl.trim()} onclick={saveServerUrl}>Save</Button>
          </div>
          <button type="button" class="self-start text-xs text-muted-foreground hover:text-foreground" onclick={useCloud}>
            Use getlogit.app instead
          </button>
        </div>
      {/if}
    </div>
  </section>
</div>
