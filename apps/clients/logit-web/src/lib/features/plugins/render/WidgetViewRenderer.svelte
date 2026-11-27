<script lang="ts">
  import type { WidgetNode, WidgetView } from "@logit/core/plugins/widgetView";
  import Plus from "@lucide/svelte/icons/plus";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Moon from "@lucide/svelte/icons/moon";
  import { widgetActions } from "./widgetAction";
  const runWidgetAction = widgetActions();
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
  import GaugeNode from "./nodes/GaugeNode.svelte";

  /**
   * Draws a widget's view (core plugins/widgetView) on the dashboard: the same parts the
   * phone's home screen draws, from the same node components. Unknown parts are skipped
   * (the builder's checks flag them).
   */
  // header=false: the host already shows the widget's name (the Overview's section title).
  const { view, framed = true, header = true }: { view: WidgetView; framed?: boolean; header?: boolean } = $props();

  const INTERACTIVE_KINDS = new Set(["checklist", "button-row", "list", "calendar-heatmap"]);
</script>

<div class={framed ? "w-full rounded-[10px] border border-border bg-card px-[18px] py-4" : "w-full"}>
  {#if !header}
    {#if view.subtitle}<p class="text-xs text-muted-foreground">{view.subtitle}</p>{/if}
  {:else}
  <div class="flex items-start justify-between gap-2">
    <div class="flex min-w-0 items-start gap-2.5">
      {#if view.titleIcon === "rest"}
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
          <Moon class="h-4 w-4" />
        </span>
      {/if}
      <div class="min-w-0">
        <h3 class="text-sm font-semibold">{view.title}</h3>
        {#if view.subtitle}<p class="text-xs text-muted-foreground">{view.subtitle}</p>{/if}
      </div>
    </div>
    {#if view.headerActions?.length}
      <div class="flex shrink-0 items-center gap-0.5">
        {#each view.headerActions as ha (ha.label)}
          <button type="button" aria-label={ha.label} onclick={() => runWidgetAction(ha.action)}
            class="flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
            {#if ha.icon === "add"}<Plus class="h-4 w-4" />
            {:else if ha.icon === "prev"}<ChevronLeft class="h-4 w-4" />
            {:else if ha.icon === "next"}<ChevronRight class="h-4 w-4" />
            {:else}Edit{/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
  {/if}
  {#if view.pager && view.pager.count > 1}
    <div class="flex items-center gap-1 pt-1.5" aria-hidden="true">
      {#each Array(view.pager.count) as _, i (i)}
        <div class="h-1.5 rounded-full {i === view.pager.index ? 'w-4 bg-primary' : 'w-1.5 bg-border'}"></div>
      {/each}
    </div>
  {/if}

  <div class={header || view.subtitle ? "pt-3" : ""}>
    {#if view.empty}
      <button type="button" class="flex min-h-9 w-full items-center text-left text-sm text-primary disabled:text-muted-foreground"
        disabled={!view.empty.action} onclick={() => view.empty?.action && runWidgetAction(view.empty.action)}>
        {view.empty.text}
      </button>
    {:else}
      {#snippet nodeView(node: WidgetNode)}
        {#if node.kind === "text"}<TextNode {node} />
        {:else if node.kind === "stat-grid"}<StatGridNode {node} />
        {:else if node.kind === "muscle-map"}<MuscleMapNode {node} />
        {:else if node.kind === "list"}<ListNode {node} />
        {:else if node.kind === "progress-rings"}<ProgressRingsNode {node} />
        {:else if node.kind === "bar"}<BarNode {node} />
        {:else if node.kind === "line"}<LineNode {node} />
        {:else if node.kind === "calendar-heatmap"}<CalendarHeatmapNode {node} />
        {:else if node.kind === "button-row"}<ButtonRowNode {node} />
        {:else if node.kind === "checklist"}<ChecklistNode {node} />
        {:else if node.kind === "gauge"}<GaugeNode {node} />
        {/if}
      {/snippet}
      {#if view.action}
        <div class="relative flex w-full flex-col gap-3">
          <button type="button" class="absolute inset-0 z-0 cursor-pointer" aria-label={view.title} onclick={() => view.action && runWidgetAction(view.action)}></button>
          {#each view.body as node, i (i)}
            <div class={INTERACTIVE_KINDS.has(node.kind) ? "relative z-10" : ""}>{@render nodeView(node)}</div>
          {/each}
        </div>
      {:else}
        <div class="flex w-full flex-col gap-3">
          {#each view.body as node, i (i)}{@render nodeView(node)}{/each}
        </div>
      {/if}
    {/if}
  </div>
</div>
