<script lang="ts">
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Plus } from "lucide-svelte";
  import type { WidgetView } from "@logit/core/plugins/widgetView";
  import { runWidgetAction } from "./widgetAction";
  import TextNode from "./nodes/TextNode.svelte";
  import StatGridNode from "./nodes/StatGridNode.svelte";
  import MuscleMapNode from "./nodes/MuscleMapNode.svelte";
  import ListNode from "./nodes/ListNode.svelte";
  import ProgressRingsNode from "./nodes/ProgressRingsNode.svelte";
  import BarNode from "./nodes/BarNode.svelte";
  import LineNode from "./nodes/LineNode.svelte";
  import ButtonRowNode from "./nodes/ButtonRowNode.svelte";

  const { view }: { view: WidgetView } = $props();

  const bodyClickable = $derived(!!view.action);
</script>

<Card.Root class="w-full">
  <Card.Header>
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <Card.Title>{view.title}</Card.Title>
        {#if view.subtitle}
          <Card.Description>{view.subtitle}</Card.Description>
        {/if}
      </div>
      {#if view.headerAction}
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 shrink-0"
          aria-label={view.headerAction.label}
          onclick={() => runWidgetAction(view.headerAction!.action)}
        >
          <Plus class="h-4 w-4" />
        </Button>
      {/if}
    </div>
  </Card.Header>

  <Card.Content>
    {#if view.empty}
      <button
        type="button"
        class="w-full text-left text-sm text-primary disabled:text-muted-foreground"
        disabled={!view.empty.action}
        onclick={() => view.empty!.action && runWidgetAction(view.empty!.action)}
      >
        {view.empty.text}
      </button>
    {:else}
      {#snippet bodyNodes()}
        {#each view.body as node, i (i)}
          {#if node.kind === "text"}
            <TextNode {node} />
          {:else if node.kind === "stat-grid"}
            <StatGridNode {node} />
          {:else if node.kind === "muscle-map"}
            <MuscleMapNode {node} />
          {:else if node.kind === "list"}
            <ListNode {node} />
          {:else if node.kind === "progress-rings"}
            <ProgressRingsNode {node} />
          {:else if node.kind === "bar"}
            <BarNode {node} />
          {:else if node.kind === "line"}
            <LineNode {node} />
          {:else if node.kind === "button-row"}
            <ButtonRowNode {node} />
          {/if}
        {/each}
      {/snippet}

      {#if bodyClickable}
        <button
          type="button"
          class="flex w-full cursor-pointer flex-col gap-3 text-left"
          onclick={() => runWidgetAction(view.action!)}
        >
          {@render bodyNodes()}
        </button>
      {:else}
        <div class="flex w-full flex-col gap-3">
          {@render bodyNodes()}
        </div>
      {/if}
    {/if}
  </Card.Content>
</Card.Root>
