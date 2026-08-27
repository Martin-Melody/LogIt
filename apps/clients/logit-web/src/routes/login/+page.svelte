<script lang="ts">
  import { goto } from "$app/navigation";
  import { apiClient, ApiError } from "@logit/core/api/client";
  import { getServerMode, setServerMode, getSelfHostUrl } from "@logit/core/api/serverConfig";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";

  // Marketing site owns plan selection + Stripe checkout; link there for plan comparison.
  // Falls back to the live Cloudflare Pages URL so this works out of the box; set
  // VITE_MARKETING_URL at build time once logit.ie is live.
  const PRICING_URL: string = `${import.meta.env.VITE_MARKETING_URL || "https://logit-marketing.pages.dev"}/pricing`;

  type Mode = "login" | "register";
  let mode = $state<Mode>("login");

  let usernameOrEmail = $state("");
  let username = $state("");
  let displayName = $state("");
  let email = $state("");
  let password = $state("");
  let confirmPassword = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);

  let showServerSetup = $state(false);
  let serverMode = $state(getServerMode());
  let selfHostUrl = $state(getSelfHostUrl() || "");

  const passwordMismatch = $derived(
    mode === "register" && confirmPassword.length > 0 && password !== confirmPassword,
  );

  const canSubmit = $derived(
    !loading &&
    !!password &&
    (mode === "login"
      ? !!usernameOrEmail.trim()
      : !!username.trim() && !!email.trim() && !!displayName.trim() && !!confirmPassword && !passwordMismatch),
  );

  function switchMode(m: Mode) {
    mode = m;
    error = null;
    password = "";
    confirmPassword = "";
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (!canSubmit) return;
    loading = true;
    error = null;
    try {
      if (mode === "login") {
        await apiClient.login(usernameOrEmail.trim(), password);
      } else {
        await apiClient.register(username.trim(), email.trim(), password, displayName.trim());
      }
      await goto("/");
    } catch (err) {
      if (mode === "register" && err instanceof ApiError && err.status === 409) {
        error = "That username or email already has an account — try logging in.";
      } else {
        error =
          err instanceof ApiError
            ? err.message
            : mode === "login"
              ? "Login failed — check your details and try again."
              : "Couldn't create your account — try again.";
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
  }

  function useCloud() {
    setServerMode("cloud");
    serverMode = "cloud";
    showServerSetup = false;
  }
</script>

<div class="min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-sm flex flex-col gap-4">
    <div class="text-center">
      <h1 class="text-lg font-semibold">LogIt</h1>
      <p class="text-sm text-muted-foreground mt-1">
        {mode === "login"
          ? "Sign in to view your training analytics."
          : "Create an account for the web dashboard and analytics."}
      </p>
    </div>

    <div class="flex rounded border overflow-hidden text-sm">
      <button
        type="button"
        class="flex-1 py-2 text-center transition-colors {mode === 'login' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}"
        onclick={() => switchMode("login")}
      >
        Log in
      </button>
      <button
        type="button"
        class="flex-1 py-2 text-center transition-colors {mode === 'register' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}"
        onclick={() => switchMode("register")}
      >
        Sign up
      </button>
    </div>

    <form class="flex flex-col gap-3" onsubmit={submit}>
      {#if mode === "login"}
        <div class="flex flex-col gap-1.5">
          <label for="identifier" class="text-sm font-medium">Username or email</label>
          <input
            id="identifier"
            type="text"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={usernameOrEmail}
            autocomplete="username"
          />
        </div>
      {:else}
        <div class="flex flex-col gap-1.5">
          <label for="displayName" class="text-sm font-medium">Name</label>
          <input
            id="displayName"
            type="text"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={displayName}
            autocomplete="name"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="username" class="text-sm font-medium">Username</label>
          <input
            id="username"
            type="text"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={username}
            autocomplete="username"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="email" class="text-sm font-medium">Email</label>
          <input
            id="email"
            type="email"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={email}
            autocomplete="email"
          />
        </div>
      {/if}

      <div class="flex flex-col gap-1.5">
        <label for="password" class="text-sm font-medium">Password</label>
        <input
          id="password"
          type="password"
          class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          bind:value={password}
          autocomplete={mode === "login" ? "current-password" : "new-password"}
        />
      </div>

      {#if mode === "register"}
        <div class="flex flex-col gap-1.5">
          <label for="confirm-password" class="text-sm font-medium">Confirm password</label>
          <input
            id="confirm-password"
            type="password"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring {passwordMismatch ? 'border-destructive' : ''}"
            bind:value={confirmPassword}
            autocomplete="new-password"
          />
          {#if passwordMismatch}
            <p class="text-xs text-destructive">Passwords don't match.</p>
          {/if}
        </div>
      {/if}

      {#if error}
        <p class="text-sm text-destructive">{error}</p>
      {/if}

      <Button type="submit" disabled={!canSubmit} class="w-full">
        {#if loading}<Spinner class="size-4" />{/if}
        {mode === "login" ? "Sign in" : "Create account"}
      </Button>
    </form>

    <div class="flex items-center justify-between text-xs">
      {#if mode === "login"}
        <a href="/forgot-password" class="text-muted-foreground hover:text-foreground">Forgot password?</a>
      {:else}
        <span></span>
      {/if}
      <a href={PRICING_URL} class="text-muted-foreground hover:text-foreground">Compare plans</a>
    </div>

    <div class="text-center">
      <button
        type="button"
        class="text-xs text-muted-foreground hover:text-foreground"
        onclick={() => (showServerSetup = !showServerSetup)}
      >
        {serverMode === "selfhosted" ? `Self-hosted: ${selfHostUrl}` : "Self-hosted? Set your server URL"}
      </button>
    </div>

    {#if showServerSetup}
      <div class="flex flex-col gap-2 rounded border border-border p-3">
        <div class="flex gap-2">
          <input
            type="text"
            placeholder="https://your-server.example.com"
            class="flex-1 min-w-0 rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={selfHostUrl}
          />
          <button
            type="button"
            class="shrink-0 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
            disabled={!selfHostUrl.trim()}
            onclick={saveServerUrl}
          >
            Save
          </button>
        </div>
        <button type="button" class="text-xs text-muted-foreground hover:text-foreground self-start" onclick={useCloud}>
          Use the managed cloud instead
        </button>
      </div>
    {/if}
  </div>
</div>
