<script lang="ts">
  import { scaleLinear, scaleUtc } from "d3-scale";
  import type { ChartBucket, ChartLine } from "@logit/core/domain/insightChart";
  import { formatChartValue } from "@logit/core/domain/insightChart";
  import { toDisplayWeight, type WeightUnit } from "@logit/core/domain/units";

  /**
   * A saved Insights chart: the main lines on the left scale, the comparison (dashed) on its
   * own scale on the right. Plain SVG like GoalChart. `compact` drops the axes for a card.
   */
  let {
    lines,
    bucket = "week",
    unit = "kg",
    compact = false,
    height = 280,
  }: { lines: ChartLine[]; bucket?: ChartBucket; unit?: WeightUnit; compact?: boolean; height?: number } = $props();

  // Drawn at the box's real width so text stays at its set size however wide the card is.
  let boxWidth = $state(0);
  const W = $derived(boxWidth > 0 ? boxWidth : 640);
  const H = $derived(height);
  const M = $derived(compact ? { top: 6, right: 4, bottom: 6, left: 4 } : { top: 16, right: 44, bottom: 26, left: 44 });
  const LEFT_COLORS = ["var(--chart-1)", "var(--chart-4)", "var(--chart-2)", "var(--chart-5)"];
  const RIGHT_COLOR = "var(--chart-3)";

  function shown(v: number, l: ChartLine): number {
    return l.unit === "kg" ? toDisplayWeight(v, unit) : v;
  }

  function fmtTick(v: number): string {
    const r = Math.abs(v) >= 1000 ? Math.round(v) : Math.round(v * 10) / 10;
    return Math.abs(r) >= 10000 ? `${Math.round(r / 1000)}k` : String(r);
  }

  function when(tMs: number): string {
    const d = new Date(tMs);
    if (bucket === "month") return d.toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
    if (bucket === "week") return `Week of ${d.toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" })}`;
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  }

  const model = $derived.by(() => {
    const all = lines.flatMap((l) => l.points.map((p) => p.tMs));
    if (all.length === 0) return null;
    const x0 = Math.min(...all);
    const x1 = Math.max(...all, x0 + 86_400_000);
    const x = scaleUtc().domain([new Date(x0), new Date(x1)]).range([M.left, W - M.right]);
    const scaleFor = (side: "left" | "right") => {
      const vs = lines.filter((l) => l.axis === side).flatMap((l) => l.points.map((p) => shown(p.value, l)));
      if (vs.length === 0) return null;
      const lo = Math.min(...vs);
      const hi = Math.max(...vs);
      const pad = (hi - lo || Math.abs(hi) * 0.1 || 1) * 0.1;
      return scaleLinear().domain([lo >= 0 ? Math.max(0, lo - pad) : lo - pad, hi + pad]).nice(4).range([H - M.bottom, M.top]);
    };
    const yl = scaleFor("left");
    const yr = scaleFor("right");
    let li = 0;
    const drawn = lines.map((l) => {
      const y = (l.axis === "left" ? yl : yr)!;
      const color = l.axis === "left" ? LEFT_COLORS[li++ % LEFT_COLORS.length]! : RIGHT_COLOR;
      const pts = l.points.map((p) => ({ cx: x(new Date(p.tMs)), cy: y(shown(p.value, l)), tMs: p.tMs, value: p.value }));
      return {
        line: l,
        color,
        dashed: l.axis === "right",
        path: pts.map((p, i) => `${i ? "L" : "M"}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(""),
        pts,
      };
    });
    const times = [...new Set(all)].sort((a, b) => a - b);
    return {
      x,
      drawn,
      times,
      xTicks: (x.ticks(compact ? 0 : 5) as Date[]).map((d) => ({
        x: x(d),
        label: d.toLocaleDateString(undefined, x1 - x0 > 300 * 86_400_000 ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" }),
      })),
      leftTicks: yl ? yl.ticks(4).map((v: number) => ({ y: yl(v), label: fmtTick(v) })) : [],
      rightTicks: yr ? yr.ticks(4).map((v: number) => ({ y: yr(v), label: fmtTick(v) })) : [],
    };
  });

  let hoverT = $state<number | null>(null);
  let svgEl = $state<SVGSVGElement | null>(null);

  function onMove(e: PointerEvent) {
    if (!model || !svgEl) return;
    const r = svgEl.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = model.times[0]!;
    for (const t of model.times) if (Math.abs(model.x(new Date(t)) - px) < Math.abs(model.x(new Date(best)) - px)) best = t;
    hoverT = best;
  }

  const hover = $derived.by(() => {
    if (hoverT == null || !model) return null;
    const hx = model.x(new Date(hoverT));
    const rows = model.drawn
      .map((d) => ({ d, p: d.pts.find((p) => p.tMs === hoverT) }))
      .filter((r) => r.p)
      .map((r) => ({ color: r.d.color, label: r.d.line.label, value: formatChartValue(r.p!.value, r.d.line.unit, unit) }));
    return { x: hx, rows, title: when(hoverT), alignRight: hx > W * 0.6 };
  });

  const ariaLabel = $derived(
    lines.length === 0
      ? "Empty chart"
      : lines
          .map((l) => {
            const f = l.points[0];
            const z = l.points.at(-1);
            return f && z ? `${l.label} from ${formatChartValue(f.value, l.unit, unit)} to ${formatChartValue(z.value, l.unit, unit)}` : `${l.label}: no data`;
          })
          .join("; "),
  );
</script>

<div bind:clientWidth={boxWidth}>
{#if model}
  <div class="relative">
    <svg
      bind:this={svgEl}
      viewBox="0 0 {W} {H}"
      width={W}
      height={H}
      class="block w-full select-none touch-pan-y"
      role="img"
      aria-label={ariaLabel}
      onpointermove={compact ? undefined : onMove}
      onpointerleave={() => (hoverT = null)}
    >
      {#if !compact}
        {#each model.leftTicks as t (t.y)}
          <line x1={M.left} x2={W - M.right} y1={t.y} y2={t.y} class="stroke-border" stroke-width="0.5" />
          <text x={M.left - 6} y={t.y} dy="0.32em" text-anchor="end" class="fill-muted-foreground text-[11px] tabular-nums">{t.label}</text>
        {/each}
        {#each model.rightTicks as t (t.y)}
          <text x={W - M.right + 6} y={t.y} dy="0.32em" style="fill: {RIGHT_COLOR}" class="text-[11px] tabular-nums">{t.label}</text>
        {/each}
        {#each model.xTicks as t (t.x)}
          <text x={t.x} y={H - 6} text-anchor="middle" class="fill-muted-foreground text-[11px]">{t.label}</text>
        {/each}
      {/if}
      {#if hover}
        <line x1={hover.x} x2={hover.x} y1={M.top} y2={H - M.bottom} class="stroke-foreground/20" stroke-width="1" />
      {/if}
      {#each model.drawn as d (d.line.key)}
        <path d={d.path} fill="none" style="stroke: {d.color}" stroke-width={compact ? 2.5 : 2.25} stroke-linejoin="round" stroke-linecap="round" stroke-dasharray={d.dashed ? "6 5" : undefined} />
        {#if !compact && !d.dashed && d.pts.length <= 60}
          {#each d.pts as p (p.tMs)}
            <circle cx={p.cx} cy={p.cy} r={hoverT === p.tMs ? 4.5 : 2.6} style="fill: {d.color}" />
          {/each}
        {/if}
      {/each}
    </svg>
    {#if hover && hover.rows.length}
      <div
        class="pointer-events-none absolute top-2 z-10 flex min-w-36 flex-col gap-0.5 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md"
        style={hover.alignRight ? `right: ${100 - (hover.x / W) * 100 + 1}%` : `left: ${(hover.x / W) * 100 + 1}%`}
      >
        <span class="font-semibold">{hover.title}</span>
        {#each hover.rows as r (r.label)}
          <span class="flex items-center justify-between gap-3"><span class="flex items-center gap-1.5"><span class="size-2 rounded-full" style="background: {r.color}"></span>{r.label}</span><span class="tabular-nums">{r.value}</span></span>
        {/each}
      </div>
    {/if}
  </div>
  {#if !compact}
    <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {#each model.drawn as d (d.line.key)}
        <span class="flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden="true"><line x1="0" x2="18" y1="3" y2="3" style="stroke: {d.color}" stroke-width="2.5" stroke-dasharray={d.dashed ? "4 3" : undefined} /></svg>
          {d.line.label}{d.dashed ? " (right scale)" : ""}
        </span>
      {/each}
    </div>
  {/if}
{:else}
  <p class="py-8 text-center text-xs text-muted-foreground">Nothing to show in this range yet.</p>
{/if}
</div>
