<script lang="ts">
  import type { WeightTrend } from "@logit/core/nutrition/trend";
  import { kgToDisplay, type WeightUnit } from "$lib/nutrition";

  let {
    trend,
    unit,
    targetKg = null,
  }: { trend: WeightTrend; unit: WeightUnit; targetKg?: number | null } = $props();

  const W = 480;
  const H = 140;
  const PAD = 6;

  const model = $derived.by(() => {
    const pts = trend.points;
    if (pts.length < 2) return null;

    const values: number[] = [];
    for (const p of pts) {
      values.push(kgToDisplay(p.smoothedKg, unit));
      if (p.actualKg != null) values.push(kgToDisplay(p.actualKg, unit));
    }
    if (targetKg != null) values.push(kgToDisplay(targetKg, unit));

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;

    const x = (i: number) => PAD + (i / (pts.length - 1)) * (W - 2 * PAD);
    const y = (v: number) => PAD + (1 - (v - min) / span) * (H - 2 * PAD);

    const line = pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(kgToDisplay(p.smoothedKg, unit)).toFixed(1)}`)
      .join(" ");

    const dots = pts
      .map((p, i) => (p.actualKg != null ? { cx: x(i), cy: y(kgToDisplay(p.actualKg, unit)) } : null))
      .filter((d): d is { cx: number; cy: number } => d !== null);

    const targetY = targetKg != null ? y(kgToDisplay(targetKg, unit)) : null;

    return { line, dots, targetY };
  });
</script>

{#if model}
  <svg viewBox="0 0 {W} {H}" class="w-full max-h-40" role="img" aria-label="Bodyweight trend">
    {#if model.targetY != null}
      <line
        x1={PAD}
        x2={W - PAD}
        y1={model.targetY}
        y2={model.targetY}
        class="stroke-muted-foreground/40"
        stroke-dasharray="3 3"
        stroke-width="1"
      />
    {/if}
    {#each model.dots as d}
      <circle cx={d.cx} cy={d.cy} r="2" class="fill-muted-foreground/50" />
    {/each}
    <path d={model.line} fill="none" class="stroke-primary" stroke-width="2" stroke-linejoin="round" />
  </svg>
{:else}
  <p class="text-xs text-muted-foreground py-4 text-center">Log a few days to see your trend.</p>
{/if}
