<script lang="ts">
  import { onMount } from "svelte";
  import { apiClient, type BillingStatus } from "@logit/core/api/client";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";

  // Falls back to the live App Runner URL (infra/aws terraform output web_service_url) so this
  // works out of the box; set VITE_WEB_URL at build time once app.logit.ie is live.
  const WEB_DASHBOARD_URL: string =
    import.meta.env.VITE_WEB_URL || "https://zi5nyrmpny.eu-west-1.awsapprunner.com";

  let loading = $state(true);
  let status = $state<BillingStatus | null>(null);

  onMount(async () => {
    await apiClient.init();
    try {
      status = await apiClient.getBillingStatus();
    } catch {
      status = null;
    } finally {
      loading = false;
    }
  });

  async function refresh() {
    loading = true;
    try {
      status = await apiClient.getBillingStatus();
    } catch {
      status = null;
    } finally {
      loading = false;
    }
  }
</script>

<div class="max-w-sm mx-auto px-4 py-16 text-center flex flex-col gap-4 items-center">
  {#if loading}
    <Spinner class="size-6 text-muted-foreground" />
  {:else if status?.tier === "Pro" || status?.tier === "Studio"}
    <h1 class="text-lg font-semibold">You're all set</h1>
    <p class="text-sm text-muted-foreground">
      Your account is now on LogIt {status.tier}. Open your web dashboard, or log into the LogIt
      mobile app with the account you just created.
      {#if status.tier === "Studio"}
        You can invite clients from the web dashboard once you're logged in.
      {/if}
    </p>
    <Button href={WEB_DASHBOARD_URL}>Open web dashboard</Button>
  {:else}
    <h1 class="text-lg font-semibold">Payment received</h1>
    <p class="text-sm text-muted-foreground">
      Your account isn't showing as upgraded quite yet — this usually takes just a few seconds
      to finish processing. Try refreshing.
    </p>
    <Button onclick={refresh}>Check again</Button>
  {/if}
</div>
