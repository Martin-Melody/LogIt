<script lang="ts">
  import { goto } from "$app/navigation";
  import { apiClient, ApiError } from "@logit/core/api/client";
  import { getServerMode, setServerMode, getSelfHostUrl } from "@logit/core/api/serverConfig";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";

  let usernameOrEmail = $state("");
  let password = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);

  let showServerSetup = $state(false);
  let serverMode = $state(getServerMode());
  let selfHostUrl = $state(getSelfHostUrl() || "");

  async function submit(e: Event) {
    e.preventDefault();
    if (!usernameOrEmail.trim() || !password) return;
    loading = true;
    error = null;
    try {
      await apiClient.login(usernameOrEmail.trim(), password);
      await goto("/");
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Login failed — check your details and try again.";
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
      <p class="text-sm text-muted-foreground mt-1">Sign in to view your training analytics.</p>
    </div>

    <form class="flex flex-col gap-3" onsubmit={submit}>
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

      <div class="flex flex-col gap-1.5">
        <label for="password" class="text-sm font-medium">Password</label>
        <input
          id="password"
          type="password"
          class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          bind:value={password}
          autocomplete="current-password"
        />
      </div>

      {#if error}
        <p class="text-sm text-destructive">{error}</p>
      {/if}

      <Button type="submit" disabled={loading || !usernameOrEmail.trim() || !password} class="w-full">
        {#if loading}<Spinner class="size-4" />{/if}
        Sign in
      </Button>
    </form>

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
