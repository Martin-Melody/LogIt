<script lang="ts">
  import { goto } from "$app/navigation";
  import { apiClient } from "@logit/core/api/client";

  // Update if the marketing domain changes — must stay in sync with the deployment docs.
  const PRICING_URL = "https://logit.ie/pricing";

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
    <a
      href={PRICING_URL}
      class="inline-flex items-center justify-center rounded bg-primary text-primary-foreground text-sm font-medium px-3 py-2"
    >
      See Pro and Studio
    </a>
    <button type="button" class="text-xs text-muted-foreground hover:text-foreground" onclick={logout}>
      Log out
    </button>
  </div>
</div>
