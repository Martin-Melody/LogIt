<script lang="ts">
  const {
    values,
    color = "hsl(var(--primary))",
    height = 48,
  } = $props<{
    values: number[];
    color?: string;
    height?: number;
  }>();

  const W = 200;
  const H = height;
  const PAD = 4;

  function buildPath(vals: number[]): string {
    if (vals.length < 2) return "";

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;

    const points = vals.map((v, i) => {
      const x = PAD + (i / (vals.length - 1)) * (W - PAD * 2);
      const y = PAD + (1 - (v - min) / range) * (H - PAD * 2);
      return `${x},${y}`;
    });

    return `M ${points.join(" L ")}`;
  }

  function lastPoint(vals: number[]): { x: number; y: number } | null {
    if (vals.length === 0) return null;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const i = vals.length - 1;
    return {
      x: PAD + (i / (vals.length - 1)) * (W - PAD * 2),
      y: PAD + (1 - (vals[i] - min) / range) * (H - PAD * 2),
    };
  }

  const path = $derived(buildPath(values));
  const last = $derived(lastPoint(values));
</script>

<svg
  viewBox="0 0 {W} {H}"
  width="100%"
  {height}
  preserveAspectRatio="none"
  aria-hidden="true"
>
  {#if path}
    <path
      d={path}
      fill="none"
      stroke={color}
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      opacity="0.7"
    />
  {/if}

  {#if last}
    <circle cx={last.x} cy={last.y} r="3" fill={color} />
  {/if}
</svg>
