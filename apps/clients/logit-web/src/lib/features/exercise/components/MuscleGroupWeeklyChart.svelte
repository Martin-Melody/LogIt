<script lang="ts">
  // Full weekly volume trend for a muscle group — the desktop-only depth
  // beyond the aggregate avgWeeklySets/avgWeeklyFrequency shown in the card
  // header. Hand-rolled SVG bars, matching Sparkline's style rather than
  // pulling in layerchart for what's just a small in-card chart.
  import type { MuscleGroupInsightWeek } from "@logit/core/domain/muscleGroupInsight";
  import { weekBucketStartMs } from "@logit/core/domain/time";

  const { weeks, width = 320, height = 64 }: { weeks: MuscleGroupInsightWeek[]; width?: number; height?: number } =
    $props();

  const PAD = 2;

  const bars = $derived.by(() => {
    if (weeks.length === 0) return [];
    const max = Math.max(...weeks.map((w) => w.weightedSets), 1);
    const barWidth = (width - PAD * 2) / weeks.length;
    return weeks.map((w, i) => {
      const barHeight = Math.max(1, (w.weightedSets / max) * (height - PAD * 2));
      return {
        x: PAD + i * barWidth,
        y: height - PAD - barHeight,
        width: Math.max(1, barWidth - 1),
        height: barHeight,
        weekStartMs: weekBucketStartMs(w.weekBucket),
        sets: Math.round(w.weightedSets * 10) / 10,
      };
    });
  });

  let hovered = $state<number | null>(null);

  function formatWeek(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }
</script>

{#if bars.length > 0}
  <div class="relative">
    <svg {width} {height} viewBox="0 0 {width} {height}" class="w-full" style="height: {height}px">
      {#each bars as bar, i (i)}
        <!-- Hover-only tooltip; the same per-week figures are decorative
             supplements to the numeric stats already in the card above,
             not the only way to reach this data. -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <rect
          x={bar.x}
          y={bar.y}
          width={bar.width}
          height={bar.height}
          rx="1"
          class={hovered === i ? "fill-primary" : "fill-primary/50"}
          onmouseenter={() => (hovered = i)}
          onmouseleave={() => (hovered = null)}
        />
      {/each}
    </svg>
    {#if hovered !== null}
      {@const b = bars[hovered]!}
      <div class="pointer-events-none absolute -top-1 left-0 -translate-y-full rounded border border-border bg-popover px-2 py-1 text-xs shadow-sm" style="left: {(b.x / width) * 100}%">
        <p class="font-medium tabular-nums">{b.sets} sets</p>
        <p class="text-muted-foreground">wk of {formatWeek(b.weekStartMs)}</p>
      </div>
    {/if}
  </div>
{/if}
