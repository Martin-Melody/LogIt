<script lang="ts">
  import { onMount } from "svelte";
  import { currentSession } from "$lib/stores/currentSession.store";
  import SessionBuilder from "./SessionBuilder.svelte";
  import IdleStart from "./Components/IdleStart.svelte";

  // Opening this page doesn't start a workout: with none running it shows the idle
  // Start screen, so tapping or swiping onto the Start tab can't start one by accident.
  const sessionState = { subscribe: currentSession.subscribeState };
  let loaded = $state(false);

  onMount(() => {
    void currentSession.loadDraft().finally(() => (loaded = true));
  });
</script>

<!-- While finishing/discarding, the session is cleared before the page leaves; keep the
     builder up (transitioning) so it doesn't flash to the idle screen on the way out.
     A stale `transitioning` from an earlier finish is reset by loadDraft, hence `loaded`. -->
{#if $sessionState.session || (loaded && $sessionState.transitioning)}
  <SessionBuilder />
{:else if loaded}
  <IdleStart />
{/if}
