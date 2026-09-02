<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { WidgetButtonRowNode } from "@logit/core/plugins/widgetView";
  import { runWidgetAction } from "../widgetAction";
  const { node }: { node: WidgetButtonRowNode } = $props();
</script>

<div class="flex flex-col gap-2">
  {#each node.buttons as btn (btn.label)}
    <Button
      class="w-full"
      variant={btn.primary ? "default" : "outline"}
      onclick={() => runWidgetAction(btn.action)}
    >
      {btn.label}
    </Button>
  {/each}
</div>
