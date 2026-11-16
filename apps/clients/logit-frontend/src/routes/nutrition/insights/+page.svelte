<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  // Nutrition's insights are now the "Is my eating on track?" question in Insights.
  onMount(() => void goto("/insights/eating", { replaceState: true }));
</script>
