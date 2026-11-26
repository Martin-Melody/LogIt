<!-- Customise profile is part of Edit profile now (design canvas PR2). -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  onMount(() => void goto("/profile/edit", { replaceState: true }));
</script>
