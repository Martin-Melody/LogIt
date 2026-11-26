<script lang="ts">
  import type { Snippet } from "svelte";
  import type { RtBlock } from "@logit/core/domain/richText";
  import RichBlocks from "./RichBlocks.svelte";
  import RichInline from "./RichInline.svelte";

  let { blocks, mentionHref, tagHref, mention }: {
    blocks: RtBlock[];
    mentionHref: (username: string) => string;
    tagHref: (tag: string) => string;
    mention?: Snippet<[string]>;
  } = $props();
</script>

{#each blocks as b, i (i)}
  {#if b.type === "p"}
    <p><RichInline nodes={b.inline} {mentionHref} {tagHref} {mention} /></p>
  {:else if b.type === "h"}
    {#if b.level === 1}<h3 class="text-[1.15em] font-bold"><RichInline nodes={b.inline} {mentionHref} {tagHref} {mention} /></h3>
    {:else if b.level === 2}<h4 class="text-[1.08em] font-semibold"><RichInline nodes={b.inline} {mentionHref} {tagHref} {mention} /></h4>
    {:else}<h5 class="font-semibold"><RichInline nodes={b.inline} {mentionHref} {tagHref} {mention} /></h5>{/if}
  {:else if b.type === "list"}
    {#if b.ordered}
      <ol class="flex list-decimal flex-col gap-1 pl-5" start={b.start}>
        {#each b.items as item, j (j)}<li><RichBlocks blocks={item} {mentionHref} {tagHref} {mention} /></li>{/each}
      </ol>
    {:else}
      <ul class="flex list-disc flex-col gap-1 pl-5">
        {#each b.items as item, j (j)}<li><RichBlocks blocks={item} {mentionHref} {tagHref} {mention} /></li>{/each}
      </ul>
    {/if}
  {:else if b.type === "quote"}
    <blockquote class="flex flex-col gap-2 border-l-2 border-border pl-3 text-muted-foreground">
      <RichBlocks blocks={b.blocks} {mentionHref} {tagHref} {mention} />
    </blockquote>
  {:else if b.type === "code"}
    <pre class="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-[0.9em]"><code>{b.text}</code></pre>
  {:else if b.type === "hr"}
    <hr class="border-border" />
  {/if}
{/each}
