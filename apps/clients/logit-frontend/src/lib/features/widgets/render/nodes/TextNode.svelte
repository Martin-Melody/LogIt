<script lang="ts">
  import { Check } from "lucide-svelte";
  import type { WidgetTextNode } from "@logit/core/plugins/widgetView";
  const { node }: { node: WidgetTextNode } = $props();
  const cls = $derived(
    node.tone === "muted"
      ? "text-muted-foreground"
      : node.tone === "primary"
        ? "text-primary"
        : node.tone === "success"
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-foreground",
  );
</script>

{#if node.tone === "success"}
  <p class="flex items-center gap-1.5 text-sm {cls}"><Check class="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />{node.text}</p>
{:else}
  <p class="text-sm {cls}">{node.text}</p>
{/if}
