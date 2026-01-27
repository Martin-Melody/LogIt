<script lang="ts">
  import { currentSession } from "$lib/stores/currentSession.store";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import { recentSessions } from "$lib/stores/recentSessions.store";

  async function finish() {
    await currentSession.finish();
    await recentSessions.refresh(5);
    await goto("/");
  }
</script>

<div class="p-4">
  <h1 class="text-xl font-semibold">Current Session</h1>

  {#if !$currentSession}
    <p class="mt-4 text-sm text-muted-foreground">
      No active workout. Go back and start one.
    </p>
  {:else}
    <pre class="mt-4 rounded border p-3 text-xs overflow-auto">
{JSON.stringify($currentSession, null, 2)}
    </pre>

    <Button class="mt-4" onclick={finish}>Finish (temporary)</Button>
  {/if}
</div>
