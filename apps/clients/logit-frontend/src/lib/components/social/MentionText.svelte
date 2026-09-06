<script lang="ts">
  import { goto } from "$app/navigation";
  import { parseMentions } from "$lib/social/mentions";

  const { text, class: className = "" }: { text: string; class?: string } = $props();

  const segments = $derived(parseMentions(text));

  function openProfile(e: MouseEvent, username: string) {
    e.stopPropagation();
    void goto(`/social/${username}`);
  }
</script>

<p class={className}>
  {#each segments as seg, i (i)}
    {#if seg.type === "mention"}<button
        type="button"
        class="text-primary font-medium hover:underline"
        onclick={(e) => openProfile(e, seg.username)}
      >@{seg.username}</button>{:else}{seg.value}{/if}
  {/each}
</p>
