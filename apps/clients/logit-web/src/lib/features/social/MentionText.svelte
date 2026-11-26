<script lang="ts">
  import { parseMentions } from "@logit/core/domain/mentions";
  import ProfileHoverCard from "./ProfileHoverCard.svelte";

  let { text, class: className = "" }: { text: string; class?: string } = $props();
  const segments = $derived(parseMentions(text));
</script>

<p class="whitespace-pre-wrap break-words {className}">{#each segments as seg, i (i)}{#if seg.type === "mention"}<ProfileHoverCard username={seg.username} class="font-medium text-sky-700 hover:underline dark:text-sky-300">@{seg.username}</ProfileHoverCard>{:else if seg.type === "tag"}<a href="/social/tag/{encodeURIComponent(seg.tag)}" class="text-sky-700 hover:underline dark:text-sky-300">#{seg.tag}</a>{:else}{seg.value}{/if}{/each}</p>
