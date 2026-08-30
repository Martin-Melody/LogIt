<script lang="ts">
  import { page } from "$app/state";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import type { FoodRef } from "@logit/core/domain/nutrition";
  import { scaleMacros, roundMacros } from "@logit/core/domain/nutrition";
  import {
    addMeal,
    addPlannedFood,
    createCoachNutritionPlan,
    groceryList,
    mealTotals,
    planTotals,
    removeMeal,
    removePlannedFood,
    updateMeal,
    type CoachNutritionPlan,
    type PlannedFood,
  } from "@logit/core/domain/CoachNutritionPlan";
  import { getWebCoachNutritionPlanRepo, getWebFoodDbRepo } from "$lib/deps";

  const clientId = $derived(page.params.id!);
  const username = $derived(page.url.searchParams.get("u") ?? "");

  let loading = $state(true);
  let saving = $state(false);
  let saved = $state(false);
  let error = $state<string | null>(null);
  let plan = $state<CoachNutritionPlan | null>(null);

  // food search — `target` is the meal id (or `${mealId}:${foodId}` for a swap)
  let searchTarget = $state<string | null>(null);
  let query = $state("");
  let results = $state<FoodRef[]>([]);
  let searching = $state(false);
  let grams = $state("100");

  async function load() {
    try {
      const existing = await getWebCoachNutritionPlanRepo().getForRecipient(clientId);
      plan = existing?.plan ?? createCoachNutritionPlan(`${username}'s plan`);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load";
    } finally {
      loading = false;
    }
  }

  function edit(fn: (p: CoachNutritionPlan) => CoachNutritionPlan) {
    if (plan) plan = fn(plan);
    saved = false;
  }

  async function save() {
    if (!plan || saving || !username) return;
    saving = true;
    error = null;
    try {
      await getWebCoachNutritionPlanRepo().savePlan(plan, username);
      saved = true;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save";
    } finally {
      saving = false;
    }
  }

  let timer: ReturnType<typeof setTimeout>;
  function onQuery() {
    clearTimeout(timer);
    timer = setTimeout(runSearch, 300);
  }
  async function runSearch() {
    if (!query.trim()) return (results = []);
    searching = true;
    try {
      results = await getWebFoodDbRepo().searchFoods(query, { limit: 20 });
    } finally {
      searching = false;
    }
  }

  function plannedFromRef(f: FoodRef, g: number): Omit<PlannedFood, "id"> {
    return {
      name: f.name,
      brand: f.brand,
      grams: g,
      computed: roundMacros(scaleMacros(f.per100g, g)),
    };
  }

  function pick(f: FoodRef) {
    const g = Number(grams) || 100;
    if (!searchTarget) return;
    const [mealId, foodId] = searchTarget.split(":");
    edit((p) =>
      updateMeal(p, mealId, (meal) => {
        if (foodId) {
          return {
            ...meal,
            foods: meal.foods.map((x) =>
              x.id === foodId
                ? { ...x, swaps: [...(x.swaps ?? []), { ...plannedFromRef(f, g), id: `sw_${Date.now()}` }] }
                : x,
            ),
          };
        }
        return addPlannedFood(meal, plannedFromRef(f, g));
      }),
    );
    searchTarget = null;
    query = "";
    results = [];
  }

  $effect(() => {
    void clientId;
    void load();
  });
</script>

<div class="flex flex-col gap-4 max-w-3xl">
  <div>
    <a href="/clients/{clientId}?u={username}" class="text-xs text-muted-foreground hover:text-foreground">&larr; @{username}</a>
    <h1 class="text-lg font-semibold mt-1">Meal plan</h1>
  </div>

  {#if error}<p class="text-sm text-destructive">{error}</p>{/if}

  {#if loading}
    <p class="text-sm text-muted-foreground">Loading…</p>
  {:else if plan}
    {@const totals = planTotals(plan)}
    <Card.Root>
      <Card.Header class="pb-2 flex-row items-start justify-between">
        <div>
          <Card.Title>Meals</Card.Title>
          <Card.Description>
            What this client should eat. They see each meal with a “Log” action (and swaps
            where you add alternatives), plus a grocery list.
            {#if plan.meals?.length}
              · Plan totals: {totals.kcal} kcal · P {totals.proteinG} · C {totals.carbsG} · F {totals.fatG}
            {/if}
          </Card.Description>
        </div>
        <Button size="sm" variant="outline" onclick={() => edit((p) => addMeal(p))}>Add meal</Button>
      </Card.Header>
      <Card.Content class="pt-0 flex flex-col gap-4">
        {#if !plan.meals?.length}
          <p class="text-sm text-muted-foreground py-2">No meals yet. Add one to start.</p>
        {/if}
        {#each plan.meals ?? [] as meal (meal.id)}
          {@const mt = mealTotals(meal)}
          <div class="border border-border rounded-md p-3 flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <input
                class="flex-1 h-8 rounded border border-border bg-background px-2 text-sm font-medium"
                value={meal.name}
                oninput={(e) => edit((p) => updateMeal(p, meal.id, (m) => ({ ...m, name: e.currentTarget.value })))}
              />
              <span class="text-xs text-muted-foreground tabular-nums">{mt.kcal} kcal</span>
              <button type="button" class="text-xs text-destructive" onclick={() => edit((p) => removeMeal(p, meal.id))}>Remove</button>
            </div>

            <ul class="flex flex-col gap-1 text-sm">
              {#each meal.foods as food (food.id)}
                <li>
                  <div class="flex items-center gap-2">
                    <span class="flex-1 truncate">{food.name} <span class="text-muted-foreground">· {food.grams} g · {food.computed.kcal} kcal</span></span>
                    <button type="button" class="text-xs text-muted-foreground" onclick={() => { searchTarget = `${meal.id}:${food.id}`; }}>+ alt</button>
                    <button type="button" class="text-xs text-destructive" onclick={() => edit((p) => updateMeal(p, meal.id, (m) => removePlannedFood(m, food.id)))}>×</button>
                  </div>
                  {#if food.swaps?.length}
                    <ul class="ml-3 mt-0.5 text-xs text-muted-foreground">
                      {#each food.swaps as s (s.id)}
                        <li>↳ {s.name} · {s.grams} g · {s.computed.kcal} kcal</li>
                      {/each}
                    </ul>
                  {/if}
                </li>
              {/each}
            </ul>

            <button type="button" class="text-xs text-primary self-start" onclick={() => { searchTarget = meal.id; }}>+ Add food</button>
          </div>
        {/each}
      </Card.Content>
    </Card.Root>

    {#if plan.meals?.length}
      <Card.Root>
        <Card.Header class="pb-2"><Card.Title>Grocery list</Card.Title></Card.Header>
        <Card.Content class="pt-0 text-sm">
          <ul class="flex flex-col gap-1">
            {#each groceryList(plan) as item (item.name + (item.brand ?? ""))}
              <li class="flex justify-between">
                <span>{item.name}{#if item.brand}<span class="text-muted-foreground"> · {item.brand}</span>{/if}</span>
                <span class="text-muted-foreground tabular-nums">{item.grams} g</span>
              </li>
            {/each}
          </ul>
        </Card.Content>
      </Card.Root>
    {/if}

    <div class="flex items-center gap-2">
      <Button size="sm" disabled={saving} onclick={save}>
        {#if saving}<Spinner class="size-4" />{/if}
        {saved ? "Saved" : "Save plan"}
      </Button>
    </div>
  {/if}
</div>

{#if searchTarget}
  <div class="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-20 px-4" role="dialog">
    <div class="bg-background border border-border rounded-lg w-full max-w-md p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium">{searchTarget.includes(":") ? "Add an alternative" : "Add a food"}</span>
        <button type="button" class="text-xs text-muted-foreground" onclick={() => { searchTarget = null; results = []; query = ""; }}>Close</button>
      </div>
      <div class="flex gap-2">
        <input class="flex-1 h-8 rounded border border-border bg-background px-2 text-sm" placeholder="Search Open Food Facts" bind:value={query} oninput={onQuery} />
        <input class="w-20 h-8 rounded border border-border bg-background px-2 text-sm" bind:value={grams} />
        <span class="text-xs text-muted-foreground self-center">g</span>
      </div>
      {#if searching}
        <p class="text-xs text-muted-foreground">Searching…</p>
      {:else}
        <ul class="flex flex-col max-h-72 overflow-y-auto divide-y divide-border">
          {#each results as f (f.id)}
            <li>
              <button type="button" class="w-full text-left py-2 text-sm" onclick={() => pick(f)}>
                {f.name}{#if f.brand}<span class="text-muted-foreground text-xs"> · {f.brand}</span>{/if}
                <span class="block text-xs text-muted-foreground">{f.per100g.kcal} kcal / 100 g</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}
