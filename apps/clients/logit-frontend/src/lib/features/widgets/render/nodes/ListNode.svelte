<script lang="ts">
  import { ChevronRight } from "lucide-svelte";
  import type { WidgetListNode } from "@logit/core/plugins/widgetView";
  import { runWidgetAction } from "../widgetAction";
  const { node }: { node: WidgetListNode } = $props();
</script>

{#if node.items.length === 0}
  <p class="text-sm text-muted-foreground">{node.emptyText ?? "Nothing here yet."}</p>
{:else}
  <ul class="flex flex-col divide-y divide-border">
    {#each node.items as item, i (i)}
      {@const act = item.action}
      <li>
        {#snippet row()}
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{item.label}</p>
            {#if item.sublabel}
              <p class="truncate text-xs text-muted-foreground">{item.sublabel}</p>
            {/if}
          </div>
          {#if item.trailing}
            <span class="shrink-0 text-xs text-muted-foreground tabular-nums">{item.trailing}</span>
          {/if}
          {#if act}
            <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
          {/if}
        {/snippet}
        {#if act}
          <button type="button" class="flex w-full items-center gap-2 py-2 text-left" onclick={() => runWidgetAction(act)}>
            {@render row()}
          </button>
        {:else}
          <div class="flex w-full items-center gap-2 py-2">{@render row()}</div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}
