<!-- Post text on the public pages: #tags link to their page, @names to the profile. -->
<script lang="ts">
  import { parseMentions } from "@logit/core/domain/mentions";

  const { text, class: className = "" }: { text: string; class?: string } = $props();
  const segments = $derived(parseMentions(text));
</script>

<p class="whitespace-pre-wrap break-words {className}">{#each segments as seg, i (i)}{#if seg.type === "mention"}<a href="/@{seg.username.toLowerCase()}" class="font-medium text-sky-300 hover:underline">@{seg.username}</a>{:else if seg.type === "tag"}<a href="/t/{encodeURIComponent(seg.tag)}" class="text-sky-300 hover:underline">#{seg.tag}</a>{:else}{seg.value}{/if}{/each}</p>
