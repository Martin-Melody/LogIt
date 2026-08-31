<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { apiClient, ApiError } from "@logit/core/api/client";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Alert from "$lib/components/ui/alert";

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
          <Label for="new-password">New password</Label>
          <Input id="new-password" type="password" autocomplete="new-password" bind:value={newPassword} />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="confirm-password">Confirm new password</Label>
          <Input id="confirm-password" type="password" autocomplete="new-password" bind:value={confirmPassword} />
        </div>

        {#if error}
          <Alert.Root variant="destructive">
            <Alert.Description>{error}</Alert.Description>
          </Alert.Root>
        {/if}

        <Button type="submit" disabled={loading || !newPassword || !confirmPassword} class="w-full">
          {#if loading}<Spinner class="size-4" />{/if}
          Set new password
        </Button>
      </form>
    {/if}
  </div>
</div>
