<script lang="ts">
  import { goto } from "$app/navigation";
  import { apiClient, ApiError } from "@logit/core/api/client";
  import { getServerMode, setServerMode, getSelfHostUrl } from "@logit/core/api/serverConfig";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Tabs from "$lib/components/ui/tabs";
  import * as Alert from "$lib/components/ui/alert";

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

    <Tabs.Root value={mode} onValueChange={(v) => switchMode(v as Mode)}>
      <Tabs.List class="w-full">
        <Tabs.Trigger value="login" class="flex-1">Log in</Tabs.Trigger>
        <Tabs.Trigger value="register" class="flex-1">Sign up</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>

    <form class="flex flex-col gap-3" onsubmit={submit}>
      {#if mode === "login"}
        <div class="flex flex-col gap-1.5">
          <Label for="identifier">Username or email</Label>
          <Input id="identifier" type="text" bind:value={usernameOrEmail} autocomplete="username" />
        </div>
      {:else}
        <div class="flex flex-col gap-1.5">
          <Label for="displayName">Name</Label>
          <Input id="displayName" type="text" bind:value={displayName} autocomplete="name" />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="username">Username</Label>
          <Input id="username" type="text" bind:value={username} autocomplete="username" />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="email">Email</Label>
          <Input id="email" type="email" bind:value={email} autocomplete="email" />
        </div>
      {/if}

      <div class="flex flex-col gap-1.5">
        <Label for="password">Password</Label>
        <Input
          id="password"
          type="password"
          bind:value={password}
          autocomplete={mode === "login" ? "current-password" : "new-password"}
        />
      </div>

      {#if mode === "register"}
        <div class="flex flex-col gap-1.5">
          <Label for="confirm-password">Confirm password</Label>
          <Input
            id="confirm-password"
            type="password"
            bind:value={confirmPassword}
            autocomplete="new-password"
            aria-invalid={passwordMismatch}
          />
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
          <Input
            type="text"
            placeholder="https://your-server.example.com"
            class="flex-1 min-w-0"
            bind:value={selfHostUrl}
          />
          <Button type="button" size="sm" disabled={!selfHostUrl.trim()} onclick={saveServerUrl}>
            Save
          </Button>
        </div>
        <button type="button" class="text-xs text-muted-foreground hover:text-foreground self-start" onclick={useCloud}>
          Use the managed cloud instead
        </button>
      </div>
    {/if}
  </div>
</div>
