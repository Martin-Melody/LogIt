<script lang="ts">
  import { goto } from "$app/navigation";
  import { apiClient, ApiError } from "@logit/core/api/client";
  import { Button } from "$lib/components/ui/button";

  const user = $derived(apiClient.getUser());

  // Falls back to the live Cloudflare Pages URL so this works out of the box; set
  // VITE_MARKETING_URL at build time once logit.ie is live.
  const PRICING_URL: string = `${import.meta.env.VITE_MARKETING_URL || "https://logit-marketing.pages.dev"}/pricing`;

  let checkoutLoading = $state<"pro" | "studio" | null>(null);
  let checkoutError = $state<string | null>(null);

  async function upgrade(plan: "pro" | "studio") {
    checkoutLoading = plan;
    checkoutError = null;
    try {
      const url = await apiClient.createCheckoutSession(
        `${location.origin}/`,
        `${location.origin}/upgrade`,
        plan,
      );
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

<div class="min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-sm flex flex-col gap-4 text-center">
    <h1 class="text-lg font-semibold">This account doesn't include the web dashboard</h1>
    <p class="text-sm text-muted-foreground">
      Free accounts work in the LogIt mobile app for the social feed. Cross-device sync, this
      dashboard, and analytics need a Pro or Studio account — or you can self-host LogIt for
      full access, free.
    </p>

    <div class="flex gap-2">
      <Button class="flex-1" disabled={checkoutLoading !== null} onclick={() => void upgrade("pro")}>
        {checkoutLoading === "pro" ? "Starting…" : "Upgrade to Pro"}
      </Button>
      <Button class="flex-1" variant="outline" disabled={checkoutLoading !== null} onclick={() => void upgrade("studio")}>
        {checkoutLoading === "studio" ? "Starting…" : "Upgrade to Studio"}
      </Button>
    </div>
    {#if checkoutError}<p class="text-xs text-destructive">{checkoutError}</p>{/if}

    <a href={PRICING_URL} class="text-xs text-muted-foreground hover:text-foreground underline">
      Compare plans and pricing
    </a>
    <p class="text-xs text-muted-foreground">
      Signed in as <span class="font-medium text-foreground">@{user?.username}</span>
    </p>
    <button type="button" class="text-xs text-muted-foreground hover:text-foreground underline" onclick={logout}>
      Log out
    </button>
  </div>
</div>
