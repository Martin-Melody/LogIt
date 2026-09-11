<script lang="ts">
  import type { WidgetGaugeNode } from "@logit/core/plugins/widgetView";
  import { motionOK } from "$lib/transitions";

  const { node }: { node: WidgetGaugeNode } = $props();

  function n(v: unknown): number {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }

  const value = $derived(Math.max(0, n(node.value)));
  const target = $derived(Math.max(0, n(node.target)));
  const ratio = $derived(target > 0 ? value / target : 0);
  const clamped = $derived(Math.min(1, ratio));
  const over = $derived(ratio > 1.0001);
  const style = $derived(node.style === "linear" ? "linear" : "radial");

  const toneVar: Record<string, string> = {
    primary: "var(--primary)",
    protein: "oklch(0.7 0.15 155)",
    carbs: "oklch(0.75 0.15 75)",
    fat: "oklch(0.68 0.17 15)",
  };
  const stroke = $derived(over ? toneVar.protein : toneVar[node.tone ?? "primary"] ?? "var(--primary)");

  // Radial: a 270° arc (leaves a gap at the bottom, like a speedometer).
  const R = 26;
  const SWEEP = 0.75; // fraction of the circle the arc spans
  const C = 2 * Math.PI * R;
  const arcLen = C * SWEEP;
  const transition = $derived(motionOK() ? "stroke-dashoffset 240ms ease, width 240ms ease" : "none");

  const pctLabel = $derived(target > 0 ? `${Math.round(ratio * 100)}%` : "—");
</script>

<div class="flex items-center gap-3">
  {#if style === "radial"}
    <svg width="72" height="72" viewBox="0 0 72 72" class="shrink-0" aria-hidden="true">
      <g transform="rotate(135 36 36)">
        <circle
          cx="36" cy="36" r={R} fill="none" stroke="var(--border)" stroke-width="6"
          stroke-linecap="round" stroke-dasharray={`${arcLen} ${C}`}
        />
        <circle
          cx="36" cy="36" r={R} fill="none" stroke={stroke} stroke-width="6"
          stroke-linecap="round"
          stroke-dasharray={`${arcLen} ${C}`}
          stroke-dashoffset={arcLen * (1 - clamped)}
          style={`transition: ${transition}`}
        />
      </g>
      <text x="36" y="39" text-anchor="middle" class="fill-foreground text-[11px] font-semibold">
        {pctLabel}
      </text>
    </svg>
  {/if}

  <div class="min-w-0 flex-1">
    <div class="flex items-baseline justify-between gap-2 text-xs">
      <span class="text-muted-foreground truncate">{node.label}</span>
      <span class="tabular-nums font-medium shrink-0">
        {node.sublabel ?? `${Math.round(value)}${node.unit ? ` ${node.unit}` : ""} / ${Math.round(target)}${node.unit ? ` ${node.unit}` : ""}`}
      </span>
    </div>
    {#if style === "linear"}
      <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full"
          style={`width: ${clamped * 100}%; background: ${stroke}; transition: ${transition}`}
        ></div>
      </div>
    {/if}
    {#if over}
      <p class="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">Target beaten</p>
    {/if}
  </div>
</div>
