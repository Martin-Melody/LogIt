<script lang="ts">
  import { platesPerSide } from "@logit/core/domain/plates";
  import { toDisplayWeight } from "@logit/core/domain/units";
  import type { WeightUnit } from "@logit/core/domain/units";
  import { equipment } from "$lib/stores/equipment.store";

  const { weightKg, weightUnit = "kg" }: { weightKg: number; weightUnit?: WeightUnit } = $props();

  const bar = $derived($equipment.barbell);
  const breakdown = $derived(platesPerSide(weightKg, bar));

  function fmt(kg: number): string {
    const v = toDisplayWeight(kg, weightUnit);
    return Number(v.toFixed(2)).toString();
  }
</script>

{#if weightKg > bar.barKg}
  <div class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
    <span class="text-muted-foreground/70">Per side</span>
    {#if breakdown.perSide.length === 0}
      <span>just the bar</span>
    {:else}
      {#each breakdown.perSide as p, i (i)}
        <span class="rounded bg-muted px-1.5 py-0.5 font-medium tabular-nums text-foreground">{fmt(p)}</span>
      {/each}
    {/if}
    {#if breakdown.shortfallKg > 0.01}
      <span class="text-amber-600 dark:text-amber-400">
        (−{fmt(breakdown.shortfallKg)} — nearest is {fmt(breakdown.achievableKg)})
      </span>
    {/if}
  </div>
{/if}
