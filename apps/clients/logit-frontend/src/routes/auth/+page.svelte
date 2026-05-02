<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { ArrowLeft, Cloud, Server } from "lucide-svelte";
  import { authStore } from "$lib/api/authStore.svelte";
  import { getServerMode, setServerMode } from "$lib/api/serverConfig";
  import { ApiError } from "$lib/api/client";

  type AuthMode = "login" | "register";

  const redirectTo = $derived(page.url.searchParams.get("redirect") ?? "/");
  const initialMode = $derived((page.url.searchParams.get("mode") as AuthMode | null) ?? "login");

  let authMode = $state<AuthMode>(initialMode);
  let authError = $state<string | null>(null);
  let authLoading = $state(false);
  const form = $state({ username: "", email: "", password: "", displayName: "" });

  const serverMode = getServerMode();
  let showServerInfo = $state(false);

  async function submit() {
    authError = null;
    authLoading = true;
    try {
      if (authMode === "login") {
        await authStore.login(form.username.trim(), form.password);
      } else {
        await authStore.register(
          form.username.trim(),
          form.email.trim(),
          form.password,
          form.displayName.trim() || form.username.trim(),
        );
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
  <button type="button" class="flex items-center gap-1 text-sm text-muted-foreground mb-6 self-start" onclick={() => history.back()}>
    <ArrowLeft class="h-4 w-4" /> Back
  </button>

  <!-- Server indicator -->
  <button type="button" class="flex items-center gap-2 mb-6 self-start" onclick={() => goto("/settings?section=server")}>
    {#if serverMode === "cloud"}
      <Cloud class="h-3.5 w-3.5 text-primary" />
      <span class="text-xs text-muted-foreground">Logit cloud</span>
    {:else if serverMode === "selfhosted"}
      <Server class="h-3.5 w-3.5 text-muted-foreground" />
      <span class="text-xs text-muted-foreground">Self-hosted</span>
    {:else}
      <span class="text-xs text-muted-foreground">No server configured · <span class="text-primary underline">Settings</span></span>
    {/if}
  </button>

  <div class="mb-6">
    <h1 class="text-2xl font-bold">{authMode === "login" ? "Welcome back" : "Create account"}</h1>
  </div>

  <!-- Login / Register toggle -->
  <div class="flex rounded border overflow-hidden text-sm mb-6">
    <button type="button"
      class="flex-1 py-2 text-center transition-colors {authMode === 'login' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}"
      onclick={() => { authMode = "login"; authError = null; }}>
      Log in
    </button>
    <button type="button"
      class="flex-1 py-2 text-center transition-colors {authMode === 'register' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}"
      onclick={() => { authMode = "register"; authError = null; }}>
      Sign up
    </button>
  </div>

  <div class="flex flex-col gap-4 flex-1">
    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-medium" for="username">
        {authMode === "login" ? "Username or email" : "Username"}
      </label>
      <input id="username" type="text" autocomplete={authMode === "login" ? "username" : "username"}
        placeholder={authMode === "login" ? "username or email" : "username"}
        class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        bind:value={form.username} />
    </div>

    {#if authMode === "register"}
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="email">Email</label>
        <input id="email" type="email" autocomplete="email" placeholder="you@example.com"
          class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          bind:value={form.email} />
      </div>

      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="display-name">
          Display name <span class="text-muted-foreground font-normal">(optional)</span>
        </label>
        <input id="display-name" type="text" autocomplete="name" placeholder="Your name"
          class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          bind:value={form.displayName} />
      </div>
    {/if}

    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-medium" for="password">Password</label>
      <input id="password" type="password" autocomplete={authMode === "login" ? "current-password" : "new-password"}
        placeholder="••••••••"
        class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        bind:value={form.password} />
    </div>

    {#if authError}
      <p class="text-xs text-destructive">{authError}</p>
    {/if}
  </div>

  <button type="button"
    class="w-full py-3 mt-8 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
    disabled={authLoading || !form.username.trim() || !form.password}
    onclick={() => void submit()}>
    {authLoading
      ? (authMode === "login" ? "Logging in…" : "Creating account…")
      : (authMode === "login" ? "Log in" : "Create account")}
  </button>
</div>
