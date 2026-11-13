<!-- Google's official "Get it on Google Play" badge (their brand rules require the real one). -->
<script lang="ts">
  import { PLAY_URL } from "$lib/site";
  let { height = 52, class: className = "" }: { height?: number; class?: string } = $props();
</script>

<a href={PLAY_URL} class="inline-block rounded-[10px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring {className}">
  <img src="/badges/google-play.png" alt="Get it on Google Play" style="height: {height}px; width: auto" />
</a>
