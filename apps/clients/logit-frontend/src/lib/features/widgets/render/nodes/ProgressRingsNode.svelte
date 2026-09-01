<script lang="ts">
  import type { WidgetProgressRingsNode } from "@logit/core/plugins/widgetView";
  const { node }: { node: WidgetProgressRingsNode } = $props();
  const R = 18;
  const C = 2 * Math.PI * R;
  function dash(v: number, max: number) {
    const pct = max > 0 ? Math.min(1, Math.max(0, v / max)) : 0;
    return `${pct * C} ${C}`;
  }
</script>

<div class="flex justify-around gap-2">
  {#each node.rings as ring (ring.label)}
    <div class="flex flex-col items-center gap-1">
      <svg width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={R} fill="none" stroke="var(--border)" stroke-width="4" />
        <circle
          cx="24" cy="24" r={R} fill="none" stroke="var(--primary)" stroke-width="4"
          stroke-linecap="round" stroke-dasharray={dash(ring.value, ring.max)}
          transform="rotate(-90 24 24)"
        />
        <text x="24" y="27" text-anchor="middle" class="fill-foreground text-[9px] font-semibold">
          {Math.round(ring.max > 0 ? (ring.value / ring.max) * 100 : 0)}%
        </text>
      </svg>
      <span class="text-[10px] text-muted-foreground">{ring.label}</span>
      <span class="text-[10px] tabular-nums">{Math.round(ring.value)}{ring.unit ? ` ${ring.unit}` : ""}</span>
    </div>
  {/each}
</div>
