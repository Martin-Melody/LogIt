<script lang="ts">
  import { scaleLinear, scaleUtc } from "d3-scale";
  import type { GoalView } from "./goalProgress";

  /**
   * One goal over time: the logged history (dots joined by a line), today, a dashed line on
   * to the likely date, the likely range as a band (the faster and slower pace you've shown),
   * the target as a dashed level and the deadline if there is one. Plain SVG, so the band and
   * the dashed parts are easy to control and it reads at phone width.
   */
  let {
    view,
    toDisplay = (v: number) => v,
    unitLabel = "",
    nowMs = Date.now(),
  }: {
    view: GoalView;
    /** Stored value (kg, reps…) → the number shown. */
    toDisplay?: (v: number) => number;
    unitLabel?: string;
    nowMs?: number;
  } = $props();

  const W = 340;
  const H = 190;
  const M = { top: 14, right: 12, bottom: 22, left: 38 };
  const DAY = 24 * 60 * 60 * 1000;

  function fmtNum(v: number): string {
    const r = Math.abs(v) >= 1000 ? Math.round(v) : Math.round(v * 10) / 10;
    return Math.abs(r) >= 10000 ? `${Math.round(r / 1000)}k` : String(r);
  }

  const model = $derived.by(() => {
    const pts = view.points;
    if (pts.length === 0) return null;
    const p = view.projection;

    // Keep the history to the last year so a long log doesn't squash the projection.
    const historyFrom = Math.max(pts[0]!.tMs, nowMs - 365 * DAY);
    const shown = pts.filter((q) => q.tMs >= historyFrom);
    const xs = [historyFrom, nowMs, ...shown.map((q) => q.tMs)];
    if (p.eta) xs.push(p.eta.lateMs ?? p.band.at(-1)?.tMs ?? p.eta.likelyMs, p.eta.likelyMs);
    else if (p.line.length) xs.push(p.line.at(-1)!.tMs);
    if (view.deadlineMs) xs.push(view.deadlineMs);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs, x0 + 14 * DAY);

    const ys = [view.target, ...shown.map((q) => q.value)];
    for (const b of p.band) ys.push(b.low, b.high);
    for (const l of p.line) ys.push(l.value);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const pad = (yMax - yMin || Math.abs(yMax) * 0.1 || 1) * 0.08;

    const x = scaleUtc().domain([new Date(x0), new Date(x1)]).range([M.left, W - M.right]);
    // Nothing here goes below zero, so the axis shouldn't either.
    const lo = yMin >= 0 ? Math.max(0, yMin - pad) : yMin - pad;
    const y = scaleLinear().domain([toDisplay(lo), toDisplay(yMax + pad)]).nice(4).range([H - M.bottom, M.top]);
    const X = (t: number) => x(new Date(t));
    const Y = (v: number) => y(toDisplay(v));

    const historyPath = shown.map((q, i) => `${i ? "L" : "M"}${X(q.tMs).toFixed(1)},${Y(q.value).toFixed(1)}`).join("");
    const bandPath = p.band.length
      ? [
          ...p.band.map((b, i) => `${i ? "L" : "M"}${X(b.tMs).toFixed(1)},${Y(b.high).toFixed(1)}`),
          ...[...p.band].reverse().map((b) => `L${X(b.tMs).toFixed(1)},${Y(b.low).toFixed(1)}`),
          "Z",
        ].join("")
      : null;
    // Cut the projection where it leaves the chart, so a stalled line can't run off the top.
    const projection = p.line.length === 2
      ? { x1: X(p.line[0]!.tMs), y1: Y(p.line[0]!.value), x2: X(p.line[1]!.tMs), y2: Y(p.line[1]!.value) }
      : null;
    // A bridge from the last session to today's trend value, so the dashed line starts where you are.
    const last = shown.at(-1);
    const bridge = last && p.line.length && p.line[0]!.tMs > last.tMs
      ? { x1: X(last.tMs), y1: Y(last.value), x2: X(p.line[0]!.tMs), y2: Y(p.line[0]!.value) }
      : null;

    const xTicks = (x.ticks(4) as Date[]).map((d) => ({
      x: x(d),
      label: d.toLocaleDateString(undefined, x1 - x0 > 300 * DAY ? { month: "short", year: "2-digit" } : { month: "short" }),
    }));
    const yTicks = y.ticks(4).map((v: number) => ({ y: y(v), label: fmtNum(v) }));

    return {
      historyPath,
      // Past ~40 sessions the dots just blur into a thick line.
      dots: shown.length <= 40 ? shown.map((q) => ({ cx: X(q.tMs), cy: Y(q.value) })) : [],
      bandPath,
      projection,
      bridge,
      targetY: Y(view.target),
      todayX: X(nowMs),
      deadlineX: view.deadlineMs ? X(view.deadlineMs) : null,
      etaX: p.eta ? X(p.eta.likelyMs) : null,
      achievedX: view.achievedAtMs != null && view.goal ? X(view.achievedAtMs) : null,
      xTicks,
      yTicks,
    };
  });
</script>

{#if model}
  <svg viewBox="0 0 {W} {H}" class="w-full select-none" role="img" aria-label="Goal progress and projection">
    <defs>
      <clipPath id="goal-plot-{view.key}">
        <rect x={M.left} y={M.top - 2} width={W - M.left - M.right} height={H - M.top - M.bottom + 4} />
      </clipPath>
    </defs>

    <!-- grid + y labels -->
    {#each model.yTicks as t (t.y)}
      <line x1={M.left} x2={W - M.right} y1={t.y} y2={t.y} class="stroke-border" stroke-width="0.5" />
      <text x={M.left - 5} y={t.y} dy="0.32em" text-anchor="end" class="fill-muted-foreground text-[9px] tabular-nums">{t.label}</text>
    {/each}
    {#each model.xTicks as t (t.x)}
      <text x={t.x} y={H - 6} text-anchor="middle" class="fill-muted-foreground text-[9px]">{t.label}</text>
    {/each}

    <g clip-path="url(#goal-plot-{view.key})">
      <!-- likely range -->
      {#if model.bandPath}
        <path d={model.bandPath} class="fill-primary/15" />
      {/if}

      <!-- target level -->
      <line x1={M.left} x2={W - M.right} y1={model.targetY} y2={model.targetY} class="stroke-amber-500" stroke-width="1" stroke-dasharray="4 3" />

      <!-- today -->
      <line x1={model.todayX} x2={model.todayX} y1={M.top} y2={H - M.bottom} class="stroke-muted-foreground/40" stroke-width="0.75" stroke-dasharray="2 2" />

      {#if model.deadlineX != null}
        <line x1={model.deadlineX} x2={model.deadlineX} y1={M.top} y2={H - M.bottom} class="stroke-destructive/60" stroke-width="1" stroke-dasharray="3 2" />
      {/if}

      <!-- history -->
      <path d={model.historyPath} fill="none" class="stroke-primary" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" />
      {#each model.dots as d, i (i)}
        <circle cx={d.cx} cy={d.cy} r="2.2" class="fill-primary" />
      {/each}

      <!-- projection -->
      {#if model.bridge}
        <line {...model.bridge} class="stroke-primary/60" stroke-width="1.5" stroke-dasharray="1 3" stroke-linecap="round" />
      {/if}
      {#if model.projection}
        <line {...model.projection} class="stroke-primary" stroke-width="1.5" stroke-dasharray="5 4" stroke-linecap="round" />
      {/if}
      {#if model.etaX != null}
        <circle cx={model.etaX} cy={model.targetY} r="4" class="fill-background stroke-amber-500" stroke-width="2" />
      {/if}
      {#if model.achievedX != null}
        <circle cx={model.achievedX} cy={model.targetY} r="4.5" class="fill-amber-500" />
      {/if}
    </g>

    <!-- target label, inside the plot on the right -->
    <text x={W - M.right - 2} y={model.targetY} dy="-0.45em" text-anchor="end" class="fill-amber-600 dark:fill-amber-400 text-[9px] font-medium">
      Goal {fmtNum(toDisplay(view.target))}{unitLabel ? ` ${unitLabel}` : ""}
    </text>
    <text x={model.todayX} y={M.top - 4} text-anchor="middle" class="fill-muted-foreground text-[8px]">Today</text>
  </svg>
{:else}
  <p class="text-xs text-muted-foreground py-6 text-center">Nothing logged for this goal yet.</p>
{/if}
