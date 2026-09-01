<script lang="ts">
  import type { MacroTotals } from "@logit/core/domain/nutrition";
  import { kcalFromMacros } from "@logit/core/domain/nutrition";
  import { fmtKcal } from "./nutrition";

  let { macros }: { macros: MacroTotals } = $props();

  // Ring segments are sized by each macro's calorie contribution (4/4/9), like Cronometer's
  // energy summary. The centre shows the item's actual kcal (which may differ slightly from
  // the 4/4/9 sum when the source gave a rounded energy value).
  const parts = $derived.by(() => {
    const p = Math.max(0, macros.proteinG) * 4;
    const c = Math.max(0, macros.carbsG) * 4;
    const f = Math.max(0, macros.fatG) * 9;
    const sum = p + c + f;
    return [
      { key: "p", label: "Protein", grams: macros.proteinG, kcal: p, color: "rgb(16 185 129)" },
      { key: "c", label: "Carbs", grams: macros.carbsG, kcal: c, color: "rgb(245 158 11)" },
      { key: "f", label: "Fat", grams: macros.fatG, kcal: f, color: "rgb(244 63 94)" },
    ].map((r) => ({ ...r, pct: sum > 0 ? (r.kcal / sum) * 100 : 0 }));
  });

  const R = 42;
  const C = 2 * Math.PI * R;

  const segments = $derived.by(() => {
    let offset = 0;
    return parts.map((r) => {
      const len = (r.pct / 100) * C;
      const seg = { color: r.color, dash: `${len} ${C - len}`, dashoffset: -offset };
      offset += len;
      return seg;
    });
  });
</script>

<div class="flex items-center gap-4">
  <svg viewBox="0 0 100 100" class="h-28 w-28 shrink-0">
    <g transform="rotate(-90 50 50)">
      <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" stroke-width="10" class="text-muted" />
      {#each segments as s (s.color)}
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={s.color}
          stroke-width="10"
          stroke-linecap="butt"
          stroke-dasharray={s.dash}
          stroke-dashoffset={s.dashoffset}
        />
      {/each}
    </g>
    <text x="50" y="46" text-anchor="middle" dominant-baseline="central" class="fill-foreground" font-size="17" font-weight="700">
      {fmtKcal(macros.kcal || kcalFromMacros(macros.proteinG, macros.carbsG, macros.fatG))}
    </text>
    <text x="50" y="60" text-anchor="middle" dominant-baseline="central" class="fill-muted-foreground" font-size="9">
      kcal
    </text>
  </svg>

  <div class="flex flex-col gap-1.5 text-sm">
    {#each parts as r (r.key)}
      <div class="flex items-center gap-2">
        <span class="h-2.5 w-2.5 rounded-full shrink-0" style="background: {r.color}"></span>
        <span class="text-muted-foreground">{r.label}</span>
        <span class="tabular-nums">({Math.round(r.pct)}%)</span>
        <span class="tabular-nums font-medium">{Math.round(r.grams * 10) / 10} g</span>
      </div>
    {/each}
  </div>
</div>
