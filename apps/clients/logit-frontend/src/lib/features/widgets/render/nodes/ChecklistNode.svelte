<script lang="ts">
  import { Check } from "lucide-svelte";
  import type { WidgetChecklistNode } from "@logit/core/plugins/widgetView";
  import { runWidgetAction } from "../widgetAction";
  const { node }: { node: WidgetChecklistNode } = $props();
</script>

<ul class="flex flex-col divide-y divide-border">
  {#each node.items as item (item.id)}
    <li>
      <svelte:element
        this={item.action ? "button" : "div"}
        type={item.action ? "button" : undefined}
        role={item.action ? "button" : undefined}
        class="flex w-full items-center gap-3 py-2 text-left {item.muted ? 'opacity-45' : ''}"
        onclick={item.action ? () => runWidgetAction(item.action!) : undefined}
      >
        <span
          class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors {item.checked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/40'}"
        >
          {#if item.checked}<Check class="h-3.5 w-3.5" />{/if}
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium {item.checked ? 'text-muted-foreground line-through' : ''}">
            {item.label}
          </p>
          {#if item.sublabel}
            <p class="truncate text-xs text-muted-foreground">{item.sublabel}</p>
          {/if}
        </div>
      </svelte:element>
    </li>
  {/each}
</ul>
