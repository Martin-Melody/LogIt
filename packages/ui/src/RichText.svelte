<!-- Formatted text (Markdown) drawn with plain elements, never as injected HTML: the words come
     from @logit/core's richTextBlocks, which keeps only safe links. Each app says how a
     @mention and a #tag link (or passes a `mention` snippet, e.g. the web's hover card). -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { richTextBlocks } from "@logit/core/domain/richText";
  import RichBlocks from "./RichBlocks.svelte";

  let {
    text,
    class: className = "",
    mentionHref = (u: string) => `/@${u.toLowerCase()}`,
    tagHref = (t: string) => `/t/${encodeURIComponent(t)}`,
    mention,
  }: {
    text: string;
    class?: string;
    mentionHref?: (username: string) => string;
    tagHref?: (tag: string) => string;
    mention?: Snippet<[string]>;
  } = $props();

  const blocks = $derived(richTextBlocks(text));
</script>

<div class="flex flex-col gap-2 break-words {className}">
  <RichBlocks {blocks} {mentionHref} {tagHref} {mention} />
</div>
