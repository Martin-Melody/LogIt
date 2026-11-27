<!-- Canvas SW2 (client): Swap on a planned food. The coach's swaps, at the amount that matches
     the planned food's protein; or log something else, always allowed, which the coach sees as
     off plan. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { swapAmount } from "@logit/core/domain/mealPlanDay";
  import type { PlannedFood, PlannedMeal } from "@logit/core/domain/CoachNutritionPlan";

  let { open, onOpenChange, meal, food, coachName, onpick, onelse }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    meal: PlannedMeal | null;
    food: PlannedFood | null;
    coachName: string;
    onpick: (swap: PlannedFood) => void;
    onelse: () => void;
  } = $props();
  const first = $derived(coachName.split(" ")[0] || coachName);
  const swaps = $derived(food ? (food.swaps ?? []).map((s) => swapAmount(food, s)) : []);
  const amount = (f: PlannedFood) => (f.recipe ? `${f.servingsUsed ?? 1} ${f.servingsUsed === 1 ? "serving" : "servings"}` : `${f.grams} g`);
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content class="flex max-h-[88svh] flex-col gap-3 p-4 sm:max-w-[420px]">
    {#if food && meal}
      <Dialog.Header>
        <Dialog.Title>Instead of {food.name.toLowerCase()}</Dialog.Title>
        <Dialog.Description>{meal.name} · planned {amount(food)}: {Math.round(food.computed.kcal)} kcal · {Math.round(food.computed.proteinG)} g protein</Dialog.Description>
      </Dialog.Header>
      {#if swaps.length}
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{first}'s swaps</p>
        <ul class="flex flex-col gap-1.5">
          {#each swaps as s (s.id)}
            <li><button type="button" class="flex min-h-12 w-full items-center justify-between gap-3 rounded-[12px] border border-border px-3.5 text-left text-[15px] active:bg-muted" onclick={() => onpick(s)}>
              <span>{s.name} · {amount(s)}</span><span class="text-sm tabular-nums text-muted-foreground">{Math.round(s.computed.kcal)} kcal · {Math.round(s.computed.proteinG)} P</span>
            </button></li>
          {/each}
        </ul>
        <p class="text-xs text-muted-foreground">Amounts match the planned protein.</p>
      {:else}
        <p class="text-[15px] text-muted-foreground">{first} hasn't added swaps for this one.</p>
      {/if}
      <Button variant="outline" class="h-12" onclick={onelse}>Log something else</Button>
      <p class="text-xs text-muted-foreground">Always allowed. It counts toward your day, and {first} sees it as off plan.</p>
    {/if}
  </Dialog.Content>
</Dialog.Root>
