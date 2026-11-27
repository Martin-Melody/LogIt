<!-- Canvas Q7: "Change amounts" on a meal. Each food's grams (0 = skipped), this meal's total and
     the day after it, then Log. The coach sees "changed amounts", not off plan. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { atAmount } from "@logit/core/domain/mealPlanDay";
  import { addMacros, roundMacros, ZERO_MACROS, type MacroTotals } from "@logit/core/domain/nutrition";
  import type { PlannedFood, PlannedMeal } from "@logit/core/domain/CoachNutritionPlan";

  let { open, onOpenChange, meal, foods, eatenSoFar, targetKcal, onlog }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    meal: PlannedMeal | null;
    /** What they see for each planned food (a swap in place of food they don't eat). */
    foods: { planned: PlannedFood; seen: PlannedFood }[];
    eatenSoFar: MacroTotals;
    targetKcal: number | null;
    onlog: (rows: { planned: PlannedFood; eaten: PlannedFood }[]) => void;
  } = $props();
  let grams = $state<Record<string, string>>({});
  $effect(() => {
    if (open) grams = Object.fromEntries(foods.map((f) => [f.planned.id, String(f.seen.grams)]));
  });
  const rows = $derived(foods.map((f) => ({ planned: f.planned, eaten: atAmount(f.seen, Number((grams[f.planned.id] ?? "").replace(",", "."))) })));
  const meal_ = $derived(roundMacros(rows.reduce((a, r) => (r.eaten ? addMacros(a, r.eaten.computed) : a), { ...ZERO_MACROS })));
  const after = $derived(Math.round(eatenSoFar.kcal + meal_.kcal));
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content class="flex max-h-[88svh] flex-col gap-3 p-4 sm:max-w-[420px]">
    {#if meal}
      <Dialog.Header><Dialog.Title>Log {meal.name.toLowerCase()}</Dialog.Title></Dialog.Header>
      <ul class="flex flex-col gap-2">
        {#each foods as f (f.planned.id)}
          <li class="flex items-center justify-between gap-3 text-[15px]">
            <span class="flex flex-col"><span>{f.seen.name}</span><span class="text-xs text-muted-foreground">Planned {f.seen.grams} g</span></span>
            <span class="flex items-center gap-1.5"><input class="h-11 w-20 rounded-[10px] border border-input bg-background px-2.5 text-right tabular-nums" inputmode="decimal" aria-label="{f.seen.name} grams" bind:value={grams[f.planned.id]} /><span class="text-sm text-muted-foreground">g</span></span>
          </li>
        {/each}
      </ul>
      <p class="text-xs text-muted-foreground">0 = skipped.</p>
      <div class="flex flex-col gap-0.5 rounded-[12px] bg-muted px-3.5 py-2.5 text-sm">
        <span class="flex justify-between"><span>This meal</span><span class="tabular-nums">{Math.round(meal_.kcal)} kcal · {Math.round(meal_.proteinG)} P</span></span>
        <span class="flex justify-between"><span>Day after this</span><span class="tabular-nums">{after.toLocaleString()}{targetKcal ? ` of ${targetKcal.toLocaleString()}` : ""}</span></span>
      </div>
      <Button class="h-12" disabled={!rows.some((r) => r.eaten)} onclick={() => onlog(rows.filter((r): r is { planned: PlannedFood; eaten: PlannedFood } => !!r.eaten))}>Log</Button>
    {/if}
  </Dialog.Content>
</Dialog.Root>
