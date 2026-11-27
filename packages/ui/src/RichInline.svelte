<script lang="ts">
  import type { Snippet } from "svelte";
  import type { RtInline } from "@logit/core/domain/richText";
  import { parseMentions } from "@logit/core/domain/mentions";
  import RichInline from "./RichInline.svelte";

  let { nodes, mentionHref, tagHref, mention }: {
    nodes: RtInline[];
    mentionHref: (username: string) => string;
    tagHref: (tag: string) => string;
    mention?: Snippet<[string]>;
  } = $props();
</script>

{#each nodes as n, i (i)}{#if n.type === "text"}{#each parseMentions(n.text) as seg, j (j)}{#if seg.type === "mention"}{#if mention}{@render mention(seg.username)}{:else}<a href={mentionHref(seg.username)} class="font-medium text-sky-700 hover:underline dark:text-sky-300">@{seg.username}</a>{/if}{:else if seg.type === "tag"}<a href={tagHref(seg.tag)} class="text-sky-700 hover:underline dark:text-sky-300">#{seg.tag}</a>{:else}{seg.value}{/if}{/each}{:else if n.type === "strong"}<strong class="font-semibold"><RichInline nodes={n.children} {mentionHref} {tagHref} {mention} /></strong>{:else if n.type === "em"}<em><RichInline nodes={n.children} {mentionHref} {tagHref} {mention} /></em>{:else if n.type === "del"}<del><RichInline nodes={n.children} {mentionHref} {tagHref} {mention} /></del>{:else if n.type === "code"}<code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{n.text}</code>{:else if n.type === "link"}<a href={n.href} target="_blank" rel="noopener noreferrer nofollow" class="text-sky-700 underline underline-offset-2 dark:text-sky-300"><RichInline nodes={n.children} {mentionHref} {tagHref} {mention} /></a>{:else if n.type === "br"}<br />{/if}{/each}
