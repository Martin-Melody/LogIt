<script lang="ts">
  import { page } from "$app/state";
  import { apiClient, ApiError } from "@logit/core/api/client";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";

  const rawPlan = page.url.searchParams.get("plan");
  const plan = rawPlan === "pro" || rawPlan === "studio" ? rawPlan : "free";
  const planLabel = plan === "studio" ? "Studio" : plan === "pro" ? "Pro" : "Free";

  // Falls back to the live App Runner URL so this works out of the box; set VITE_WEB_URL at
  // build time once app.logit.ie is live.
  const LOGIN_URL: string = `${import.meta.env.VITE_WEB_URL || "https://zi5nyrmpny.eu-west-1.awsapprunner.com"}/login`;

  let username = $state("");
  let email = $state("");
  let password = $state("");
  let confirmPassword = $state("");
  let displayName = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);
  let accountExists = $state(false);
  let registeredFree = $state(false);

  const passwordMismatch = $derived(
    confirmPassword.length > 0 && password !== confirmPassword,
  );

  const canSubmit = $derived(
    username.trim() && email.trim() && password && confirmPassword && !passwordMismatch && displayName.trim() && !loading,
  );

  async function submit(e: Event) {
    e.preventDefault();
    if (!canSubmit) return;
    loading = true;
    error = null;
    accountExists = false;
    try {
      await apiClient.register(username.trim(), email.trim(), password, displayName.trim());

      if (plan === "pro" || plan === "studio") {
        const origin = window.location.origin;
        const checkoutUrl = await apiClient.createCheckoutSession(
          `${origin}/success`,
          `${origin}/pricing`,
          plan,
        );
        window.location.href = checkoutUrl;
      } else {
        registeredFree = true;
        loading = false;
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        accountExists = true;
      } else {
        error =
          e instanceof ApiError
            ? e.message
            : "Something went wrong creating your account — try again.";
      }
      loading = false;
    }
  }
</script>

{#if registeredFree}
  <div class="max-w-sm mx-auto px-4 py-16 text-center flex flex-col gap-4 items-center">
    <h1 class="text-lg font-semibold">Your account is ready</h1>
    <p class="text-sm text-muted-foreground">
      Open the LogIt mobile app and log in with the account you just created to use the social
      feed — follow people, post, and comment. This account doesn't include cross-device sync,
      the web dashboard, or analytics. If you want those, either self-host (free, full app) or
      upgrade to Pro or Studio any time from your account page on the web.
    </p>
  </div>
{:else}
  <div class="max-w-sm mx-auto px-4 py-16">
    <div class="text-center mb-6">
      <h1 class="text-lg font-semibold">Create your LogIt {planLabel} account</h1>
      <p class="text-sm text-muted-foreground mt-1">
        {#if plan === "pro" || plan === "studio"}
          You're signing up for {planLabel}. You'll be taken to checkout after this step.
        {:else}
          This free account works in the LogIt mobile app for the social feed only — no sync,
          web dashboard, or analytics. Want more?
          <a href="/pricing" class="underline hover:text-foreground">See what Pro and Studio add</a>.
        {/if}
      </p>
    </div>

    <form class="flex flex-col gap-3" onsubmit={submit}>
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

      <div class="flex flex-col gap-1.5">
        <label for="password" class="text-sm font-medium">Password</label>
        <input
          id="password"
          type="password"
          class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          bind:value={password}
          autocomplete="new-password"
        />
      </div>

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

      {#if accountExists}
        <div class="rounded border border-border px-3 py-2 flex flex-col gap-1.5">
          <p class="text-sm">
            Looks like that username or email already has an account.
            {#if plan === "pro" || plan === "studio"}
              Log in and you'll be taken straight to upgrade to {planLabel}.
            {:else}
              Log in to manage it.
            {/if}
          </p>
          <a href={LOGIN_URL} class="text-sm font-medium underline hover:text-foreground self-start">Log in</a>
        </div>
      {:else if error}
        <p class="text-sm text-destructive">{error}</p>
      {/if}

      <Button type="submit" disabled={!canSubmit} class="w-full">
        {#if loading}<Spinner class="size-4" />{/if}
        {plan === "pro" || plan === "studio" ? "Continue to checkout" : "Create free account"}
      </Button>
    </form>

    <p class="text-center text-xs text-muted-foreground mt-4">
      Already have an account? <a href={LOGIN_URL} class="underline hover:text-foreground">Log in</a>
    </p>
  </div>
{/if}
