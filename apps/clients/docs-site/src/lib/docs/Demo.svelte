<script lang="ts">
  import WidgetNodePreview from "./WidgetNodePreview.svelte";

  /** node: a WidgetNode object. Shows it rendered (in a card) next to its JSON. */
  let { node, title }: { node: any; title?: string } = $props();
  const json = $derived(JSON.stringify(node, null, 2));
</script>

<div class="my-6 overflow-hidden rounded-lg border border-border">
  {#if title}
    <div class="border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
      {title}
    </div>
  {/if}
  <div class="grid md:grid-cols-2">
    <div class="flex items-center justify-center border-b border-border p-6 md:border-b-0 md:border-r">
      <div class="w-full max-w-[280px] rounded-lg border border-border bg-card p-3">
        <WidgetNodePreview {node} />
      </div>
    </div>
    <pre class="overflow-x-auto bg-muted/30 p-4 text-xs leading-relaxed"><code>{json}</code></pre>
  </div>
</div>
