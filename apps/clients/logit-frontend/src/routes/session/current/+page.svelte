<script lang="ts">
  import { onMount } from "svelte";
  import { currentSession } from "$lib/stores/currentSession.store";
  import SessionBuilder from "./SessionBuilder.svelte";

  async function ensureSessionExists() {
    await currentSession.loadDraft();
    if (!$currentSession) {
      await currentSession.start();
    }
  }

  onMount(() => {
    void ensureSessionExists();
  });
</script>

<SessionBuilder />
