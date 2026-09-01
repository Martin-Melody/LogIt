<script lang="ts">
  import type { WidgetBarNode } from "@logit/core/plugins/widgetView";
  const { node }: { node: WidgetBarNode } = $props();
  const max = $derived(Math.max(1, ...node.bars.map((b) => b.max ?? b.value)));
</script>

<div class="flex flex-col gap-1.5">
  {#each node.bars as bar (bar.label)}
    <div class="flex items-center gap-2">
      <span class="w-16 shrink-0 truncate text-xs text-muted-foreground">{bar.label}</span>
      <div class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div class="h-full rounded-full bg-primary" style="width: {Math.min(100, (bar.value / (bar.max ?? max)) * 100)}%"></div>
      </div>
      <span class="w-10 shrink-0 text-right text-xs tabular-nums">{Math.round(bar.value)}</span>
    </div>
  {/each}
</div>
