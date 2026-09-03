<script lang="ts">
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Plus, Pencil, ChevronLeft, ChevronRight } from "lucide-svelte";
  import type { WidgetNode, WidgetView } from "@logit/core/plugins/widgetView";
  import { createSwipeHandlers } from "$lib/swipe";
  import { runWidgetAction } from "./widgetAction";
  import TextNode from "./nodes/TextNode.svelte";
  import StatGridNode from "./nodes/StatGridNode.svelte";
  import MuscleMapNode from "./nodes/MuscleMapNode.svelte";
  import ListNode from "./nodes/ListNode.svelte";
  import ProgressRingsNode from "./nodes/ProgressRingsNode.svelte";
  import BarNode from "./nodes/BarNode.svelte";
  import LineNode from "./nodes/LineNode.svelte";
  import CalendarHeatmapNode from "./nodes/CalendarHeatmapNode.svelte";
  import ButtonRowNode from "./nodes/ButtonRowNode.svelte";
  import ChecklistNode from "./nodes/ChecklistNode.svelte";

  const { view }: { view: WidgetView } = $props();

  const bodyClickable = $derived(!!view.action);

  /**
   * Nodes that carry their own tap targets. When the whole card body is
   * clickable (`view.action`), these must sit *above* the navigation overlay so
   * tapping a row runs the row's action instead of opening the card.
   */
  const INTERACTIVE_KINDS = new Set([
    "checklist",
    "button-row",
    "list",
    "calendar-heatmap",
  ]);

  const swipe = $derived(
    view.swipe
      ? createSwipeHandlers(
          () => view.swipe && runWidgetAction(view.swipe.left),
          () => view.swipe && runWidgetAction(view.swipe.right),
        )
      : null,
  );
</script>

<Card.Root class="w-full" {...(swipe ?? {})}>
  <Card.Header>
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <Card.Title>{view.title}</Card.Title>
        {#if view.subtitle}
          <Card.Description>{view.subtitle}</Card.Description>
        {/if}
      </div>
      {#if view.headerActions?.length}
        <div class="flex shrink-0 items-center gap-0.5">
          {#each view.headerActions as ha (ha.label)}
            <Button
              variant="ghost"
              size={ha.icon === "edit" ? "sm" : "icon"}
              class={ha.icon === "edit" ? "h-7 px-2 text-xs" : "h-7 w-7"}
              aria-label={ha.label}
              onclick={() => runWidgetAction(ha.action)}
            >
              {#if ha.icon === "add"}<Plus class="h-4 w-4" />
              {:else if ha.icon === "prev"}<ChevronLeft class="h-4 w-4" />
              {:else if ha.icon === "next"}<ChevronRight class="h-4 w-4" />
              {:else if ha.icon === "edit"}Edit
              {/if}
            </Button>
          {/each}
        </div>
      {/if}
    </div>
    {#if view.pager && view.pager.count > 1}
      <div class="flex items-center gap-1 pt-1">
        {#each Array(view.pager.count) as _, i (i)}
          <div
            class="h-1.5 rounded-full transition-all {i === view.pager.index ? 'w-4 bg-primary' : 'w-1.5 bg-border'}"
          ></div>
        {/each}
      </div>
    {/if}
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
      {#snippet nodeView(node: WidgetNode)}
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
        {:else if node.kind === "calendar-heatmap"}
          <CalendarHeatmapNode {node} />
        {:else if node.kind === "button-row"}
          <ButtonRowNode {node} />
        {:else if node.kind === "checklist"}
          <ChecklistNode {node} />
        {/if}
      {/snippet}

      {#if bodyClickable}
        <!-- Full-body tap opens the card; interactive rows sit above the overlay. -->
        <div class="relative flex w-full flex-col gap-3">
          <button
            type="button"
            class="absolute inset-0 z-0 cursor-pointer"
            aria-label={view.title}
            onclick={() => runWidgetAction(view.action!)}
          ></button>
          {#each view.body as node, i (i)}
            <div class={INTERACTIVE_KINDS.has(node.kind) ? "relative z-10" : ""}>
              {@render nodeView(node)}
            </div>
          {/each}
        </div>
      {:else}
        <div class="flex w-full flex-col gap-3">
          {#each view.body as node, i (i)}
            {@render nodeView(node)}
          {/each}
        </div>
      {/if}
    {/if}
  </Card.Content>
</Card.Root>
