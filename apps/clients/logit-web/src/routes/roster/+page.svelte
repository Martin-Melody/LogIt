<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  // Roster merged into Clients (phase 3). Kept so old links and bookmarks still land somewhere.
  onMount(() => void goto("/clients", { replaceState: true }));
</script>
