<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowLeft, Plus, Repeat, ShoppingCart, Check } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import {
    createDiaryDay,
    localDateIso,
    addDiaryItem,
  } from "@logit/core/domain/nutrition";
  import {
    groceryList,
    mealTotals,
    plannedFoodToLoggedItem,
    slotForMeal,
    type CoachNutritionPlan,
    type PlannedFood,
    type PlannedMeal,
  } from "@logit/core/domain/CoachNutritionPlan";
  import { getNutritionRepo, getCoachNutritionPlanRepo } from "$lib/data/repoProvider";
  import { pushNutritionDay } from "$lib/sync/syncService";
  import { fmtKcal } from "$lib/features/nutrition/nutrition";

  const ui = $state({ loading: true, logged: new Set<string>(), swapFor: null as string | null });
  let plan = $state<CoachNutritionPlan | null>(null);

  async function load() {
    plan = await getCoachNutritionPlanRepo().getAssignedPlan();
    ui.loading = false;
  }

  async function logFood(meal: PlannedMeal, food: PlannedFood) {
    const repo = getNutritionRepo();
    const today = localDateIso();
    const day = (await repo.getDay(today)) ?? createDiaryDay(today);
    const next = addDiaryItem(day, plannedFoodToLoggedItem(food, slotForMeal(meal)));
    await repo.saveDay(next);
    pushNutritionDay(next);
    ui.logged = new Set([...ui.logged, food.id]);
    ui.swapFor = null;
  }

  async function logMeal(meal: PlannedMeal) {
    for (const f of meal.foods) {
      if (!ui.logged.has(f.id)) await logFood(meal, f);
    }
  }

  onMount(() => void load());
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <button type="button" class="h-8 w-8 flex items-center justify-center" onclick={() => back("/nutrition")}>
      <ArrowLeft class="h-4 w-4" />
    </button>
    <h1 class="text-sm font-semibold">Meal plan</h1>
  </div>

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if !plan?.meals?.length}
    <p class="px-3 py-6 text-sm text-muted-foreground">Your coach hasn't set a meal plan.</p>
  {:else}
    {#if plan.note}
      <p class="px-3 py-2 text-xs text-muted-foreground border-b border-border whitespace-pre-line">{plan.note}</p>
    {/if}

    {#each plan.meals as meal (meal.id)}
      {@const mt = mealTotals(meal)}
      <div class="border-b border-border">
        <div class="flex items-center justify-between px-3 py-2">
          <div class="flex items-baseline gap-2">
            <span class="text-xs font-semibold">{meal.name}</span>
            <span class="text-[11px] text-muted-foreground tabular-nums">{fmtKcal(mt.kcal)} kcal</span>
          </div>
          <button type="button" class="text-xs text-primary flex items-center gap-1" onclick={() => void logMeal(meal)}>
            <Plus class="h-3.5 w-3.5" /> Log meal
          </button>
        </div>
        <ul class="px-3 pb-2 flex flex-col gap-1.5">
          {#each meal.foods as food (food.id)}
            <li class="text-xs">
              <div class="flex items-center gap-2">
                <span class="flex-1 min-w-0">
                  <span class="truncate">{food.name}</span>
                  <span class="text-muted-foreground">
                    · {Math.round(food.grams)} g · {fmtKcal(food.computed.kcal)} kcal
                  </span>
                </span>
                {#if food.swaps?.length}
                  <button type="button" class="h-6 px-1.5 flex items-center gap-0.5 text-muted-foreground" onclick={() => (ui.swapFor = ui.swapFor === food.id ? null : food.id)} aria-label="Swap">
                    <Repeat class="h-3.5 w-3.5" />
                  </button>
                {/if}
                <button
                  type="button"
                  class="h-6 w-6 flex items-center justify-center {ui.logged.has(food.id) ? 'text-emerald-500' : 'text-primary'}"
                  onclick={() => void logFood(meal, food)}
                  aria-label="Log"
                >
                  {#if ui.logged.has(food.id)}<Check class="h-4 w-4" />{:else}<Plus class="h-4 w-4" />{/if}
                </button>
              </div>
              {#if ui.swapFor === food.id && food.swaps}
                <ul class="mt-1 ml-2 pl-2 border-l border-border flex flex-col gap-1">
                  {#each food.swaps as swap (swap.id)}
                    <li class="flex items-center gap-2">
                      <span class="flex-1 truncate text-muted-foreground">
                        {swap.name} · {Math.round(swap.grams)} g · {fmtKcal(swap.computed.kcal)} kcal
                      </span>
                      <button type="button" class="h-6 px-2 text-primary" onclick={() => void logFood(meal, swap)}>Log this</button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/each}

    <!-- Grocery list -->
    <div class="px-3 py-3">
      <div class="flex items-center gap-1.5 mb-2">
        <ShoppingCart class="h-3.5 w-3.5 text-muted-foreground" />
        <span class="text-xs font-semibold">Grocery list</span>
      </div>
      <ul class="flex flex-col gap-1 text-xs">
        {#each groceryList(plan) as item (item.name + (item.brand ?? ""))}
          <li class="flex justify-between">
            <span>{item.name}{#if item.brand}<span class="text-muted-foreground"> · {item.brand}</span>{/if}</span>
            <span class="text-muted-foreground tabular-nums">{item.grams} g</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
