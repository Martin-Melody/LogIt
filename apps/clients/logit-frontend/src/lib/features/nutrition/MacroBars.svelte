<script lang="ts">
  import type { MacroTotals } from "@logit/core/domain/nutrition";
  import { fmtKcal, fmtGrams } from "./nutrition";

  let { consumed, target }: { consumed: MacroTotals; target: MacroTotals | null } = $props();

  const rows = $derived([
    { key: "kcal", label: "Calories", got: consumed.kcal, goal: target?.kcal ?? 0, fmt: fmtKcal, unit: "kcal", color: "bg-primary" },
    { key: "p", label: "Protein", got: consumed.proteinG, goal: target?.proteinG ?? 0, fmt: fmtGrams, unit: "", color: "bg-emerald-500" },
    { key: "c", label: "Carbs", got: consumed.carbsG, goal: target?.carbsG ?? 0, fmt: fmtGrams, unit: "", color: "bg-amber-500" },
    { key: "f", label: "Fat", got: consumed.fatG, goal: target?.fatG ?? 0, fmt: fmtGrams, unit: "", color: "bg-rose-500" },
  ]);

  function pct(got: number, goal: number): number {
    if (goal <= 0) return 0;
    return Math.max(0, Math.min(100, (got / goal) * 100));
  }
</script>

<div class="flex flex-col gap-2.5">
  {#each rows as r (r.key)}
    <div class="flex flex-col gap-1">
      <div class="flex items-baseline justify-between text-xs">
        <span class="text-muted-foreground">{r.label}</span>
        <span class="tabular-nums">
          <span class="font-medium">{r.fmt(r.got)}</span>
          {#if r.goal > 0}
            <span class="text-muted-foreground"> / {r.fmt(r.goal)}</span>
          {/if}
        </span>
      </div>
      <div class="h-1.5 rounded-full bg-muted overflow-hidden">
        <div class="h-full {r.color} rounded-full transition-[width]" style="width: {pct(r.got, r.goal)}%"></div>
      </div>
    </div>
  {/each}
</div>
