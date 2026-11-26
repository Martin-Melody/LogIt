<script lang="ts">
  import SocialFrame from "$lib/social/SocialFrame.svelte";

  const { data, children } = $props();
</script>

<SocialFrame rail={data.rail} api={data.api}>{@render children()}</SocialFrame>
