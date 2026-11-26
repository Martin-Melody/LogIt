<script lang="ts">
  import { goto } from "$app/navigation";
  import { parseMentions } from "$lib/social/mentions";

  const { text, class: className = "" }: { text: string; class?: string } = $props();

  const segments = $derived(parseMentions(text));

  function open(e: MouseEvent, path: string) {
    e.stopPropagation();
    void goto(path);
  }
</script>

<p class={className}>
  {#each segments as seg, i (i)}
    {#if seg.type === "mention"}<button
        type="button"
        class="text-primary font-medium hover:underline"
        onclick={(e) => open(e, `/social/${seg.username}`)}
      >@{seg.username}</button>{:else if seg.type === "tag"}<button
        type="button"
        class="text-sky-700 dark:text-sky-300 hover:underline"
        onclick={(e) => open(e, `/social/tag/${encodeURIComponent(seg.tag)}`)}
      >#{seg.tag}</button>{:else}{seg.value}{/if}
  {/each}
</p>
