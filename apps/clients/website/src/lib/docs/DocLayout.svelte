<!-- mdsvex layout for every .svx page: the shared long-form text style plus previous / next links. -->
<script lang="ts">
  import { page } from "$app/state";
  import { flatDocs } from "./nav";

  let { children, title }: { children: import("svelte").Snippet; title?: string } = $props();

  const idx = $derived(flatDocs.findIndex((d) => d.href === page.url.pathname));
  const prev = $derived(idx > 0 ? flatDocs[idx - 1] : null);
  const next = $derived(idx >= 0 && idx < flatDocs.length - 1 ? flatDocs[idx + 1] : null);
</script>

<svelte:head>
  {#if title}<title>{title} · LogIt docs</title>{/if}
</svelte:head>

<article class="prose-site">
  {#if title}<h1>{title}</h1>{/if}
  {@render children?.()}
</article>

{#if prev || next}
  <nav aria-label="Previous and next" class="mt-14 flex items-stretch gap-3 border-t border-border pt-6 text-sm">
    {#if prev}
      <a href={prev.href} class="flex-1 rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent">
        <span class="block text-xs text-muted-foreground">Previous</span>
        <span class="font-semibold text-foreground">{prev.title}</span>
      </a>
    {/if}
    {#if next}
      <a href={next.href} class="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-right hover:bg-accent">
        <span class="block text-xs text-muted-foreground">Next</span>
        <span class="font-semibold text-foreground">{next.title}</span>
      </a>
    {/if}
  </nav>
{/if}
