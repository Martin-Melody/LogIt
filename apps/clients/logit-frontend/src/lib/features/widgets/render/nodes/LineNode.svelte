<script lang="ts">
  import type { WidgetLineNode } from "@logit/core/plugins/widgetView";
  const { node }: { node: WidgetLineNode } = $props();

  const W = 260;
  const H = 64;
  const path = $derived.by(() => {
    const pts = node.points;
    if (pts.length < 2) return "";
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys, node.reference ?? Infinity);
    const maxY = Math.max(...ys, node.reference ?? -Infinity);
    const sx = (x: number) => ((x - minX) / (maxX - minX || 1)) * W;
    const sy = (y: number) => H - ((y - minY) / (maxY - minY || 1)) * H;
    return {
      d: pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" "),
      ref: node.reference != null ? sy(node.reference) : null,
    };
  });
</script>

<svg viewBox="0 0 {W} {H}" class="w-full" preserveAspectRatio="none" height="64">
  {#if typeof path === "object" && path.ref != null}
    <line x1="0" x2={W} y1={path.ref} y2={path.ref} stroke="var(--muted-foreground)" stroke-width="1" stroke-dasharray="3 3" />
  {/if}
  {#if typeof path === "object"}
    <path d={path.d} fill="none" stroke="var(--primary)" stroke-width="2" stroke-linejoin="round" />
  {/if}
</svg>
