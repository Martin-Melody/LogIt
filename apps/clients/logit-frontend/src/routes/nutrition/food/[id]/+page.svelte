<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { ArrowLeft, Star, Pencil } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import * as Select from "$lib/components/ui/select";
  import {
    addDiaryItem,
    createDiaryDay,
    createFavoriteFood,
    loggedItemFromFood,
    localDateIso,
    roundMacros,
    scaleMacros,
    MEAL_SLOTS,
    type FoodRef,
    type MacroTotals,
    type MealSlot,
  } from "@logit/core/domain/nutrition";
  import { getNutritionRepo } from "$lib/data/repoProvider";
  import { pushNutritionDay, pushFavorite } from "$lib/sync/syncService";
  import { resolveFoodRef } from "$lib/features/nutrition/resolveFood";
  import { portionOptions, portionToGrams, portionLabel } from "$lib/features/nutrition/portion";
  import MacroRing from "$lib/features/nutrition/MacroRing.svelte";

  const foodId = $derived($page.params.id ?? "");
  const dateIso = $derived($page.url.searchParams.get("date") ?? localDateIso());

  const mealLabels: Record<MealSlot, string> = {
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snack: "Snacks",
  };

  const ui = $state({ loading: true, error: null as string | null, added: false });
  let food = $state<FoodRef | null>(null);
  let isFav = $state(false);

  let amount = $state<number | string>(100);
  let portionId = $state("g");

  const options = $derived(portionOptions(food?.servings));
  const activePortion = $derived(options.find((o) => o.id === portionId) ?? options[0]);
  const grams = $derived(portionToGrams(Number(amount) || 0, activePortion));
  const preview = $derived.by<MacroTotals>(() =>
    food ? roundMacros(scaleMacros(food.per100g, grams)) : { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  onMount(() => void load());

  async function load() {
    ui.loading = true;
    try {
      food = await resolveFoodRef(foodId);
      if (!food) {
        ui.error = "Food not found.";
        return;
      }
      const named = food.servings.find((s) => s.id !== "g" && s.grams > 0);
      if (named) {
        portionId = named.id;
        amount = 1;
      }
      isFav = (await getNutritionRepo().listFavorites()).some((f) => f.food.id === food!.id);
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load";
    } finally {
      ui.loading = false;
    }
  }

  async function addTo(meal: MealSlot) {
    if (!food || grams <= 0) return;
    const repo = getNutritionRepo();
    const existing = (await repo.getDay(dateIso)) ?? createDiaryDay(dateIso);
    const next = addDiaryItem(
      existing,
      loggedItemFromFood(food, meal, grams, portionLabel(Number(amount) || 0, activePortion, grams)),
    );
    await repo.saveDay(next);
    pushNutritionDay(next);
    ui.added = true;
    setTimeout(() => back("/nutrition"), 350);
  }

  async function toggleFav() {
    if (!food) return;
    const repo = getNutritionRepo();
    if (isFav) await repo.deleteFavorite(food.id);
    else await repo.saveFavorite(createFavoriteFood(food));
    isFav = !isFav;
    const row = (await repo.listFavoritesForPush()).find((f) => f.food.id === food!.id);
    if (row) pushFavorite(row);
  }
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <button type="button" class="h-8 w-8 flex items-center justify-center" onclick={() => back("/nutrition/foods")}>
      <ArrowLeft class="h-4 w-4" />
    </button>
    {#if food}
      <button type="button" onclick={() => void toggleFav()} aria-label="Toggle favourite" class="h-8 w-8 flex items-center justify-center">
        <Star class="h-4 w-4 {isFav ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}" />
      </button>
    {/if}
    <h1 class="text-sm font-semibold truncate">
      {food?.name ?? "Food"}{#if food?.brand}<span class="text-muted-foreground font-normal"> · {food.brand}</span>{/if}
    </h1>
    {#if foodId.startsWith("rcp_")}
      <a href="/nutrition/foods/recipe/{foodId}" class="ml-auto h-8 w-8 flex items-center justify-center text-muted-foreground">
        <Pencil class="h-4 w-4" />
      </a>
    {:else if food?.source === "custom"}
      <a href="/nutrition/foods?edit={foodId}" class="ml-auto h-8 w-8 flex items-center justify-center text-muted-foreground">
        <Pencil class="h-4 w-4" />
      </a>
    {/if}
  </div>

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if ui.error}
    <p class="px-3 py-4 text-sm text-destructive">{ui.error}</p>
  {:else if food}
    <div class="divide-y divide-border border-b border-border">
      <div class="flex items-center justify-between px-3 py-3">
        <span class="text-sm">Amount</span>
        <input
          class="w-28 bg-muted rounded px-2 py-1.5 text-sm text-right outline-none tabular-nums"
          inputmode="decimal"
          aria-label="Amount"
          bind:value={amount}
        />
      </div>
      <div class="flex items-center justify-between px-3 py-3">
        <span class="text-sm">Serving size</span>
        <Select.Root type="single" bind:value={portionId}>
          <Select.Trigger class="w-40">{activePortion?.label ?? "Unit"}</Select.Trigger>
          <Select.Content>
            {#each options as o (o.id)}
              <Select.Item value={o.id} label={o.label} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    </div>

    <div class="px-3 py-4 border-b border-border flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold">Nutrition · {Math.round(grams)} g</span>
        <span class="text-[11px] text-muted-foreground tabular-nums">
          {Math.round(food.per100g.kcal)} kcal / 100 g
        </span>
      </div>
      <MacroRing macros={preview} />
    </div>

    <div class="px-3 py-3 flex flex-col gap-2">
      <span class="text-xs text-muted-foreground">
        {ui.added ? "Added." : "Add to"}
        {#if dateIso !== localDateIso()} · {dateIso}{/if}
      </span>
      {#if !ui.added}
        <div class="grid grid-cols-2 gap-2">
          {#each MEAL_SLOTS as m (m)}
            <button
              type="button"
              class="rounded border border-border text-sm py-2 disabled:opacity-50"
              disabled={grams <= 0}
              onclick={() => void addTo(m)}
            >
              {mealLabels[m]}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
