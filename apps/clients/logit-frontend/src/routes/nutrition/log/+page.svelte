<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { ChevronDown, X } from "lucide-svelte";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import * as Select from "$lib/components/ui/select";
  import { back } from "$lib/navigation";
  import { toast } from "$lib/components/ui/sonner";
  import {
    createFavoriteFood,
    isRecipeId,
    isWeightRecipe,
    localDateIso,
    loggedItemFromFood,
    loggedItemFromRecent,
    mealTemplateToItems,
    MEAL_SLOTS,
    type FoodRef,
    type LoggedItem,
    type MacroTotals,
    type MealSlot,
    type MealTemplate,
    type Recipe,
    type RecentFood,
  } from "@logit/core/domain/nutrition";
  import { getNutritionRepo } from "$lib/data/repoProvider";
  import { pushFavorite } from "$lib/sync/syncService";
  import FoodSearchPanel, { type Picked } from "$lib/features/nutrition/ui/FoodSearchPanel.svelte";
  import { SNAPSHOT_PREFIX } from "$lib/features/nutrition/foodFinder";
  import AmountSheet, { type AmountResult } from "$lib/features/nutrition/ui/AmountSheet.svelte";
  import QuickAddSheet from "$lib/features/nutrition/ui/QuickAddSheet.svelte";
  import { MEAL_LABELS, fmtNum, mealForNow } from "$lib/features/nutrition/ui/meals";
  import { addItems, dayContext, potLeft, removeItems } from "$lib/features/nutrition/diary";
  import { defaultPortion, portionLabel, portionOptions, portionToGrams } from "$lib/features/nutrition/portion";
  import { bottomNavHeight } from "$lib/stores/bottomNav.store";

  // Add food: search / scan / recents, an amount sheet for the details, and a running
  // tally so several things can go in one visit. "Done" returns to the diary.
  const mealParam = page.url.searchParams.get("meal") as MealSlot | null;
  let meal = $state<MealSlot>(mealParam && MEAL_SLOTS.includes(mealParam) ? mealParam : mealForNow());
  const dateIso = page.url.searchParams.get("date") ?? localDateIso();
  const isToday = dateIso === localDateIso();

  let ctx = $state<{ eaten: MacroTotals; target: MacroTotals | null } | null>(null);
  let favIds = $state(new Set<string>());

  // This visit's adds, for the tally and Undo.
  type Batch = { ids: string[]; keys: string[]; kcal: number; protein: number; meal: MealSlot };
  let batches = $state<Batch[]>([]);
  const added = $derived(new Set(batches.flatMap((b) => b.keys)));
  const addedCount = $derived(batches.reduce((n, b) => n + b.ids.length, 0));
  const addedKcal = $derived(batches.reduce((n, b) => n + b.kcal, 0));
  const addedProtein = $derived(batches.reduce((n, b) => n + b.protein, 0));

  let sheet = $state<null | { picked: Picked; recipe: Recipe | null; pot: Awaited<ReturnType<typeof potLeft>> }>(null);
  let quick = $state(false);

  onMount(() => {
    void refreshCtx();
    void loadFavs();
    // ?pick=<food or recipe id>: open its amount sheet straight away ("Log a portion").
    const pickId = page.url.searchParams.get("pick");
    if (pickId) void openById(pickId);
  });

  async function openById(id: string) {
    const { resolveFoodRef } = await import("$lib/features/nutrition/resolveFood");
    const { recipeHasRealGrams } = await import("@logit/core/domain/nutrition");
    const food = await resolveFoodRef(id);
    if (!food) return;
    const recipe = isRecipeId(id) ? await getNutritionRepo().getRecipe(id) : null;
    await onpick({
      food,
      kind: recipe ? "recipe" : food.source === "custom" ? "custom" : food.source === "off" ? "packaged" : "generic",
      realGrams: recipe ? recipeHasRealGrams(recipe) : true,
    });
  }

  async function refreshCtx() {
    const c = await dayContext(dateIso);
    ctx = { eaten: c.eaten, target: c.target };
  }

  async function loadFavs() {
    const favs = await getNutritionRepo().listFavorites();
    favIds = new Set(favs.filter((f) => !f.deletedAtMs).map((f) => f.food.id));
  }

  async function toggleFav(food: FoodRef) {
    const repo = getNutritionRepo();
    if (favIds.has(food.id)) await repo.deleteFavorite(food.id);
    else await repo.saveFavorite(createFavoriteFood(food));
    await loadFavs();
    const row = (await repo.listFavoritesForPush()).find((f) => f.food.id === food.id);
    if (row) pushFavorite(row);
  }

  async function log(items: Omit<LoggedItem, "id">[], keys: string[], toMeal: MealSlot) {
    const { ids } = await addItems(dateIso, items);
    const kcal = items.reduce((n, i) => n + i.computed.kcal, 0);
    const protein = items.reduce((n, i) => n + i.computed.proteinG, 0);
    batches = [...batches, { ids, keys, kcal, protein, meal: toMeal }];
    await refreshCtx();
  }

  async function undo() {
    const last = batches.at(-1);
    if (!last) return;
    await removeItems(dateIso, last.ids);
    batches = batches.slice(0, -1);
    await refreshCtx();
  }

  async function onpick(p: Picked) {
    let recipe: Recipe | null = null;
    let pot = null;
    if (p.kind === "recipe" || isRecipeId(p.food.id)) {
      recipe = await getNutritionRepo().getRecipe(p.food.id);
      if (recipe) pot = await potLeft(recipe);
      // A weighed pot is logged by the gram: start on a box's worth, not "whole pot".
      if (recipe && isWeightRecipe(recipe) && !p.initial) {
        const w = recipe.cookedWeightG ?? 0;
        const box = recipe.servings > 1 ? w / recipe.servings : Math.min(w, 400);
        p = { ...p, initial: { amount: Math.round(box), portionId: "g" } };
      }
    }
    sheet = { picked: p, recipe, pot };
  }

  async function confirmAmount(r: AmountResult) {
    if (!sheet) return;
    const food = sheet.picked.food;
    const toMeal = r.meal ?? meal;
    const item = { ...loggedItemFromFood(food, toMeal, r.grams, r.label, { amount: r.amount, portionId: r.portionId }), loggedAtMs: r.loggedAtMs };
    if (food.id.startsWith(SNAPSHOT_PREFIX)) {
      delete item.sourceId;
      delete item.sourceKind;
    }
    sheet = null;
    await log([item], [food.id], toMeal);
    if (toMeal !== meal) toast(`Added to ${MEAL_LABELS[toMeal]}`);
  }

  async function addRecent(r: RecentFood) {
    await log([loggedItemFromRecent(r, meal)], [r.key, r.sourceId ?? r.key], meal);
  }

  async function addFood(p: Picked) {
    const rawUnits = p.realGrams !== false;
    const start = defaultPortion(p.food, undefined, { rawUnits });
    const o = portionOptions(p.food.servings, { rawUnits }).find((x) => x.id === start.portionId);
    const grams = portionToGrams(start.amount, o);
    await log(
      [loggedItemFromFood(p.food, meal, grams, portionLabel(start.amount, o, grams), start)],
      [p.food.id],
      meal,
    );
  }

  async function addMeal(t: MealTemplate) {
    await log(mealTemplateToItems(t, meal), [t.id], meal);
  }

  async function addQuick(r: { name: string; computed: MacroTotals; meal: MealSlot; loggedAtMs?: number }) {
    quick = false;
    await log([{ meal: r.meal, name: r.name, grams: 0, computed: r.computed, loggedAtMs: r.loggedAtMs }], [], r.meal);
  }

  function done() {
    back("/nutrition");
  }

  const kcalLeft = $derived(ctx?.target ? ctx.target.kcal - ctx.eaten.kcal : null);
</script>

<PageHeader>
  <button type="button" class="flex size-11 items-center justify-center rounded-lg" aria-label="Close" onclick={done}>
    <X class="size-[22px]" />
  </button>
  <span class="text-[15px] text-muted-foreground">Add to</span>
  <Select.Root type="single" bind:value={meal}>
    <Select.Trigger class="ml-1 h-9 w-auto gap-1 border-0 bg-muted px-2.5 text-[15px] font-semibold" aria-label="Meal">
      {MEAL_LABELS[meal]}
    </Select.Trigger>
    <Select.Content>
      {#each MEAL_SLOTS as m (m)}
        <Select.Item value={m} label={MEAL_LABELS[m]} />
      {/each}
    </Select.Content>
  </Select.Root>
  <span class="ml-auto mr-2 text-[13px] text-muted-foreground">{isToday ? "Today" : dateIso}</span>
</PageHeader>

<div class="flex flex-col pb-24">
  <FoodSearchPanel
    mode="log"
    {meal}
    {onpick}
    onaddrecent={(r) => void addRecent(r)}
    onaddfood={(p) => void addFood(p)}
    onmeal={(t) => void addMeal(t)}
    onquickadd={() => (quick = true)}
    {added}
  />
</div>

{#if addedCount > 0}
  <div
    class="fixed inset-x-3 z-30 mx-auto flex max-w-lg items-center gap-1.5 rounded-2xl bg-muted py-1.5 pl-4 pr-1.5 shadow-xl"
    style="bottom: {$bottomNavHeight + 12}px"
    role="status"
  >
    <div class="min-w-0 flex-1">
      <div class="font-semibold">{addedCount} added{batches.every((b) => b.meal === meal) ? ` to ${MEAL_LABELS[meal]}` : ""}</div>
      <div class="truncate text-xs text-muted-foreground tabular-nums">
        {fmtNum(addedKcal)} kcal · P {Math.round(addedProtein)}{#if kcalLeft !== null} · {kcalLeft >= 0 ? `${fmtNum(kcalLeft)} kcal left` : `${fmtNum(-kcalLeft)} over`}{/if}
      </div>
    </div>
    <button type="button" class="h-11 px-3 text-[13px] text-muted-foreground" onclick={() => void undo()}>Undo</button>
    <button type="button" class="h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground" onclick={done}>Done</button>
  </div>
{/if}

{#if sheet}
  {@const p = sheet.picked}
  {@const pot = sheet.pot}
  <AmountSheet
    food={p.food}
    subtitle={p.food.id.startsWith(SNAPSHOT_PREFIX) ? "As you logged it before" : p.kind === "recipe" ? "Your recipe" : p.kind === "custom" ? (p.food.brand ? `${p.food.brand} · your food` : "Your food") : p.food.brand}
    rawUnits={p.realGrams !== false}
    initial={p.initial}
    day={ctx}
    {meal}
    {dateIso}
    favourite={p.food.id.startsWith(SNAPSHOT_PREFIX) ? null : { on: favIds.has(p.food.id), toggle: () => void toggleFav(p.food) }}
    onconfirm={(r) => void confirmAmount(r)}
    onclose={() => (sheet = null)}
  >
    {#snippet extra({ grams })}
      {#if pot}
        <p class="text-xs">
          Pot from {pot.cookedOn.slice(5).split("-").reverse().join("/")}:
          <span class="font-semibold tabular-nums">{fmtNum(pot.leftG)} g left</span>
          {#if grams > 0 && pot.leftG > 0}
            <span class="text-muted-foreground"> · about {Math.max(0, Math.floor(pot.leftG / grams))} more like this</span>
          {/if}
        </p>
      {:else if p.realGrams !== false}
        <p class="text-xs text-muted-foreground">
          per 100 g: {fmtNum(p.food.per100g.kcal)} kcal · P {Math.round(p.food.per100g.proteinG * 10) / 10}
        </p>
      {/if}
    {/snippet}
  </AmountSheet>
{/if}

{#if quick}
  <QuickAddSheet {meal} {dateIso} onadd={(r) => void addQuick(r)} onclose={() => (quick = false)} />
{/if}
