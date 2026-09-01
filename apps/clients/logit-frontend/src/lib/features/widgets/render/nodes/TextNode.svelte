<script lang="ts">
  import type { WidgetTextNode } from "@logit/core/plugins/widgetView";
  const { node }: { node: WidgetTextNode } = $props();
  const cls = $derived(
    node.tone === "muted"
      ? "text-muted-foreground"
      : node.tone === "primary"
        ? "text-primary"
        : "text-foreground",
  );
</script>

<p class="text-sm {cls}">{node.text}</p>
