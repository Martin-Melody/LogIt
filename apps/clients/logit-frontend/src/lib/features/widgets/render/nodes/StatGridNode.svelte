<script lang="ts">
  import type { WidgetStatGridNode } from "@logit/core/plugins/widgetView";
  const { node }: { node: WidgetStatGridNode } = $props();
  const cols = $derived(Math.min(node.stats.length, 3));
</script>

<div class="grid gap-2" style="grid-template-columns: repeat({cols}, minmax(0, 1fr))">
  {#each node.stats as stat (stat.label)}
    <div class="text-center">
      <p class="text-base font-semibold tabular-nums">{stat.value}</p>
      <p class="text-[11px] text-muted-foreground">{stat.label}</p>
      {#if stat.sublabel}
        <p class="text-[10px] text-muted-foreground/70">{stat.sublabel}</p>
      {/if}
    </div>
  {/each}
</div>
