<script lang="ts">
  import { apiClient, ApiError } from "@logit/core/api/client";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";

  let email = $state("");
  let loading = $state(false);
  let result = $state<{ message: string; isError: boolean } | null>(null);

  async function submit(e: Event) {
    e.preventDefault();
    if (!email.trim()) return;
    loading = true;
    result = null;
    try {
      const { error } = await apiClient.forgotPassword(email.trim());
      result = error
        ? { message: error, isError: true }
        : { message: "If that email has an account, a reset link is on its way.", isError: false };
    } catch (e) {
      result = { message: e instanceof ApiError ? e.message : "Something went wrong. Please try again.", isError: true };
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-sm flex flex-col gap-4">
    <div class="text-center">
      <h1 class="text-lg font-semibold">Reset your password</h1>
      <p class="text-sm text-muted-foreground mt-1">We'll email you a link to set a new password.</p>
    </div>

    <form class="flex flex-col gap-3" onsubmit={submit}>
      <div class="flex flex-col gap-1.5">
        <label for="email" class="text-sm font-medium">Email</label>
        <input
          id="email"
          type="email"
          autocomplete="email"
          class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          bind:value={email}
        />
      </div>

      {#if result}
        <p class="text-sm {result.isError ? 'text-destructive' : 'text-muted-foreground'}">{result.message}</p>
      {/if}

      <Button type="submit" disabled={loading || !email.trim()} class="w-full">
        {#if loading}<Spinner class="size-4" />{/if}
        Send reset link
      </Button>
    </form>

    <div class="text-center">
      <a href="/login" class="text-xs text-muted-foreground hover:text-foreground">Back to log in</a>
    </div>
  </div>
</div>
