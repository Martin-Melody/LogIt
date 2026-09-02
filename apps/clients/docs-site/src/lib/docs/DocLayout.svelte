<script lang="ts">
  import { page } from "$app/stores";
  import { flatDocs } from "./nav";

  let { children, title } = $props<{ children: any; title?: string }>();

  const idx = $derived(flatDocs.findIndex((d) => d.href === $page.url.pathname));
  const prev = $derived(idx > 0 ? flatDocs[idx - 1] : null);
  const next = $derived(idx >= 0 && idx < flatDocs.length - 1 ? flatDocs[idx + 1] : null);
</script>

<article class="doc-prose">
  {#if title}<h1>{title}</h1>{/if}
  {@render children?.()}
</article>

{#if prev || next}
  <nav class="mt-12 flex items-stretch gap-3 border-t border-border pt-6 text-sm">
    {#if prev}
      <a href={prev.href} class="flex-1 rounded border border-border px-4 py-3 hover:bg-muted/40">
        <span class="block text-xs text-muted-foreground">Previous</span>
        <span class="font-medium">{prev.title}</span>
      </a>
    {/if}
    {#if next}
      <a href={next.href} class="flex-1 rounded border border-border px-4 py-3 text-right hover:bg-muted/40">
        <span class="block text-xs text-muted-foreground">Next</span>
        <span class="font-medium">{next.title}</span>
      </a>
    {/if}
  </nav>
{/if}

<style>
  .doc-prose :global(h1) {
    font-size: 1.875rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-bottom: 0.5rem;
  }
  .doc-prose :global(h2) {
    font-size: 1.25rem;
    font-weight: 600;
    margin-top: 2.5rem;
    margin-bottom: 0.75rem;
    scroll-margin-top: 5rem;
  }
  .doc-prose :global(h3) {
    font-size: 1rem;
    font-weight: 600;
    margin-top: 1.75rem;
    margin-bottom: 0.5rem;
  }
  .doc-prose :global(p),
  .doc-prose :global(ul),
  .doc-prose :global(ol) {
    margin: 0.85rem 0;
    line-height: 1.7;
  }
  .doc-prose :global(ul) {
    list-style: disc;
    padding-left: 1.4rem;
  }
  .doc-prose :global(ol) {
    list-style: decimal;
    padding-left: 1.4rem;
  }
  .doc-prose :global(li) {
    margin: 0.3rem 0;
  }
  .doc-prose :global(a) {
    color: var(--primary);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .doc-prose :global(code:not(pre code)) {
    background: var(--muted);
    border-radius: 4px;
    padding: 0.1rem 0.35rem;
    font-size: 0.85em;
  }
  .doc-prose :global(pre) {
    background: var(--muted);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    overflow-x: auto;
    font-size: 0.85rem;
    line-height: 1.6;
    margin: 1rem 0;
  }
  .doc-prose :global(pre code) {
    background: none;
  }
  .doc-prose :global(blockquote) {
    border-left: 3px solid var(--border);
    padding-left: 1rem;
    color: var(--muted-foreground);
  }
  .doc-prose :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
    font-size: 0.9rem;
  }
  .doc-prose :global(th),
  .doc-prose :global(td) {
    border: 1px solid var(--border);
    padding: 0.5rem 0.75rem;
    text-align: left;
  }
  .doc-prose :global(th) {
    background: var(--muted);
    font-weight: 600;
  }
  /* shiki dual-theme */
  .doc-prose :global(.shiki),
  .doc-prose :global(.shiki span) {
    color: var(--shiki-light);
    background-color: transparent;
  }
  :global(.dark) .doc-prose :global(.shiki),
  :global(.dark) .doc-prose :global(.shiki span) {
    color: var(--shiki-dark);
  }
</style>
