<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { apiClient, ApiError } from "@logit/core/api/client";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";

  const token = $derived(page.url.searchParams.get("token") ?? "");

  let newPassword = $state("");
  let confirmPassword = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);
  let done = $state(false);

  async function submit(e: Event) {
    e.preventDefault();
    error = null;
    if (newPassword !== confirmPassword) {
      error = "Passwords don't match.";
      return;
    }
    if (!token) {
      error = "This reset link is missing its token.";
      return;
    }
    loading = true;
    try {
      await apiClient.resetPassword(token, newPassword);
      done = true;
    } catch (e) {
      error = e instanceof ApiError ? e.message : "This reset link is invalid or has expired.";
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-sm flex flex-col gap-4">
    {#if done}
      <div class="text-center flex flex-col gap-3">
        <h1 class="text-lg font-semibold">Password updated</h1>
        <p class="text-sm text-muted-foreground">You've been signed out everywhere for security — log in with your new password.</p>
        <Button onclick={() => goto("/login")} class="w-full">Go to log in</Button>
      </div>
    {:else}
      <div class="text-center">
        <h1 class="text-lg font-semibold">Set a new password</h1>
      </div>

      <form class="flex flex-col gap-3" onsubmit={submit}>
        <div class="flex flex-col gap-1.5">
          <label for="new-password" class="text-sm font-medium">New password</label>
          <input
            id="new-password"
            type="password"
            autocomplete="new-password"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={newPassword}
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="confirm-password" class="text-sm font-medium">Confirm new password</label>
          <input
            id="confirm-password"
            type="password"
            autocomplete="new-password"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={confirmPassword}
          />
        </div>

        {#if error}
          <p class="text-sm text-destructive">{error}</p>
        {/if}

        <Button type="submit" disabled={loading || !newPassword || !confirmPassword} class="w-full">
          {#if loading}<Spinner class="size-4" />{/if}
          Set new password
        </Button>
      </form>
    {/if}
  </div>
</div>
