<script lang="ts">
  import type { WidgetBarNode } from "@logit/core/plugins/widgetView";
  const { node }: { node: WidgetBarNode } = $props();
  const fallbackMax = $derived(Math.max(1, ...node.bars.map((b) => b.max ?? b.value)));
  const toneClass: Record<string, string> = {
    primary: "bg-primary",
    protein: "bg-emerald-500",
    carbs: "bg-amber-500",
    fat: "bg-rose-500",
  };
  function pct(v: number, max: number): number {
    return Math.max(0, Math.min(100, (v / (max || 1)) * 100));
  }
</script>

<div class="flex flex-col gap-2.5">
  {#each node.bars as bar (bar.label)}
    <div class="flex flex-col gap-1">
      <div class="flex items-baseline justify-between text-xs">
        <span class="text-muted-foreground">{bar.label}</span>
        <span class="tabular-nums font-medium">{bar.sublabel ?? Math.round(bar.value)}</span>
      </div>
      <div class="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full transition-[width] {toneClass[bar.tone ?? 'primary']}"
          style="width: {pct(bar.value, bar.max ?? fallbackMax)}%"
        ></div>
      </div>
    </div>
  {/each}
</div>

