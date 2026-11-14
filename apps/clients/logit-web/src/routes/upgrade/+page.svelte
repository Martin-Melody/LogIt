<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { apiClient, ApiError } from "@logit/core/api/client";
  import { Button } from "$lib/components/ui/button";
  import * as Alert from "$lib/components/ui/alert";

  // Where a Free account on the hosted server lands. Plans are sold in the Android app
  // (Google Play); web checkout through Stripe only shows when the server turns it on
  // (Billing:WebCheckout).
  const user = $derived(apiClient.getUser());
  const MARKETING_URL: string = import.meta.env.VITE_MARKETING_URL || "https://getlogit.app";
  const PRICING_URL = `${MARKETING_URL}/pricing`;
  const PLAY_URL = "https://play.google.com/store/apps/details?id=ie.logit.app";

  let webCheckout = $state(false);
  let checkoutLoading = $state<"pro" | "studio" | null>(null);
  let checkoutError = $state<string | null>(null);

  onMount(async () => {
    try {
      webCheckout = (await apiClient.getBillingStatus()).webCheckout === true;
    } catch {
      // Stay on the app-only wording.
    }
  });

  async function upgrade(plan: "pro" | "studio") {
    checkoutLoading = plan;
    checkoutError = null;
    try {
      const url = await apiClient.createCheckoutSession(`${location.origin}/`, `${location.origin}/upgrade`, plan);
      location.href = url;
    } catch (e) {
      checkoutError = e instanceof ApiError ? e.message : "Couldn't start checkout.";
      checkoutLoading = null;
    }
  }

  function logout() {
    void apiClient.logout().then(() => goto("/login"));
  }
</script>

<div class="flex min-h-screen items-center justify-center p-4">
  <div class="flex w-full max-w-sm flex-col gap-4 text-center">
    <h1 class="text-lg font-semibold">The dashboard comes with Pro and Studio</h1>
    <p class="text-sm text-muted-foreground">
      Your account is on Free, which covers everything on your phone. Pro adds sync between devices and this
      dashboard; Studio adds coaching clients.
    </p>

    {#if webCheckout}
      <div class="flex gap-2">
        <Button class="flex-1" disabled={checkoutLoading !== null} onclick={() => void upgrade("pro")}>
          {checkoutLoading === "pro" ? "Starting…" : "Upgrade to Pro"}
        </Button>
        <Button class="flex-1" variant="outline" disabled={checkoutLoading !== null} onclick={() => void upgrade("studio")}>
          {checkoutLoading === "studio" ? "Starting…" : "Upgrade to Studio"}
        </Button>
      </div>
      {#if checkoutError}
        <Alert.Root variant="destructive" class="text-left">
          <Alert.Description>{checkoutError}</Alert.Description>
        </Alert.Root>
      {/if}
    {:else}
      <div class="rounded-[10px] border border-border bg-card p-4 text-left text-sm leading-relaxed">
        <p class="font-medium">Subscribe in the LogIt app</p>
        <p class="mt-1 text-muted-foreground">
          On your Android phone, open Settings › Account › See plans, signed in as
          <span class="font-medium text-foreground">@{user?.username}</span>. Google Play takes the payment, and this
          dashboard opens straight after.
        </p>
      </div>
      <Button href={PLAY_URL} target="_blank" rel="noopener">Get LogIt on Google Play</Button>
    {/if}

    <a href={PRICING_URL} class="text-xs text-muted-foreground underline hover:text-foreground">Compare plans</a>
    <p class="text-xs text-muted-foreground">
      Signed in as <span class="font-medium text-foreground">@{user?.username}</span> ·
      <a href="/account" class="underline hover:text-foreground">Account</a> ·
      <button type="button" class="underline hover:text-foreground" onclick={logout}>Log out</button>
    </p>
  </div>
</div>
