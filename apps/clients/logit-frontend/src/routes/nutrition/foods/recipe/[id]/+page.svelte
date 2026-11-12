<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Search, Trash2 } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import { createId } from "@logit/core/domain/ids";
  import {
    recomputeRecipe,
    scaleMacros,
    roundMacros,
    type FoodRef,
    type Recipe,
  } from "@logit/core/domain/nutrition";
  import { getNutritionRepo, getFoodDbRepo } from "$lib/data/repoProvider";
  import { pushRecipe } from "$lib/sync/syncService";
  import { fmtKcal } from "$lib/features/nutrition/nutrition";

  const recipeId = page.params.id ?? "";
  const ui = $state({ loading: true, query: "", searching: false, grams: "100" });
  let recipe = $state<Recipe | null>(null);
  let results = $state<FoodRef[]>([]);
  let picked = $state<FoodRef | null>(null);

  let timer: ReturnType<typeof setTimeout>;
  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(() => void search(), 250);
  }
  async function search() {
    const q = ui.query.trim();
    if (!q) return (results = []);
    ui.searching = true;
    try {
      const repo = getNutritionRepo();
      const [foods, customs] = await Promise.all([
        getFoodDbRepo().searchFoods(q, { limit: 25 }),
        repo.listCustomFoods(),
      ]);
      const ql = q.toLowerCase();
      results = [
        ...customs.filter((c) => c.food.name.toLowerCase().includes(ql)).map((c) => c.food),
        ...foods,
      ];
    } finally {
      ui.searching = false;
    }
  }

  function addIngredient() {
    if (!recipe || !picked) return;
    const grams = Number(ui.grams) || 0;
    if (grams <= 0) return;
    recipe.ingredients = [
      ...recipe.ingredients,
      {
        id: createId("ing"),
        sourceId: picked.id,
        name: picked.name,
        brand: picked.brand,
        grams,
        computed: roundMacros(scaleMacros(picked.per100g, grams)),
      },
    ];
    recipe = recomputeRecipe(recipe);
    picked = null;
    ui.query = "";
    results = [];
  }

  function removeIngredient(id: string) {
    if (!recipe) return;
    recipe.ingredients = recipe.ingredients.filter((i) => i.id !== id);
    recipe = recomputeRecipe(recipe);
  }

  function setServings(v: string) {
    if (!recipe) return;
    recipe.servings = Math.max(1, Number(v) || 1);
    recipe = recomputeRecipe(recipe);
  }

  async function save() {
    if (!recipe) return;
    recipe.name = recipe.name.trim() || "Recipe";
    const next = recomputeRecipe(recipe);
    await getNutritionRepo().saveRecipe(next);
    pushRecipe(next);
    back("/nutrition/foods");
  }

  onMount(async () => {
    recipe = await getNutritionRepo().getRecipe(recipeId);
    ui.loading = false;
  });
</script>

<div class="flex flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/nutrition/foods")} />
    <h1 class="page-title">Recipe</h1>
    <button type="button" class="ml-auto h-11 px-3 -mr-1 text-sm font-medium text-primary" onclick={() => void save()}>Save</button>
  </PageHeader>

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if !recipe}
    <p class="px-3 py-4 text-sm text-destructive">Recipe not found.</p>
  {:else}
    <div class="px-3 py-3 border-b border-border flex flex-col gap-2">
      <input class="bg-muted rounded-md px-2 h-10 text-sm outline-none font-medium focus:ring-1 focus:ring-ring" bind:value={recipe.name} />
      <label class="flex items-center gap-2 text-xs text-muted-foreground">
        Makes
        <input
          class="w-16 bg-muted rounded-md px-2 h-10 text-sm outline-none focus:ring-1 focus:ring-ring"
          inputmode="numeric"
          value={recipe.servings}
          oninput={(e) => setServings(e.currentTarget.value)}
        />
        servings
      </label>
      <div class="text-sm tabular-nums">
        <span class="font-semibold">{fmtKcal(recipe.perServing.kcal)} kcal</span>
        <span class="text-muted-foreground">
          / serving · P {Math.round(recipe.perServing.proteinG)} · C {Math.round(recipe.perServing.carbsG)} · F {Math.round(recipe.perServing.fatG)}
        </span>
      </div>
    </div>

    <!-- Ingredients -->
    <ul class="divide-y divide-border">
      {#each recipe.ingredients as ing (ing.id)}
        <li class="flex min-h-11 items-center gap-2 pl-3 pr-1 text-sm">
          <span class="flex-1 min-w-0 truncate">{ing.name} <span class="text-muted-foreground">· {Math.round(ing.grams)} g</span></span>
          <span class="text-xs text-muted-foreground tabular-nums">{fmtKcal(ing.computed.kcal)}</span>
          <button type="button" class="h-11 w-11 flex items-center justify-center text-muted-foreground hover:text-destructive" onclick={() => removeIngredient(ing.id)} aria-label="Remove {ing.name}">
            <Trash2 class="h-4 w-4" />
          </button>
        </li>
      {/each}
    </ul>

    <!-- Add ingredient -->
    <div class="px-3 py-3 border-t border-border flex flex-col gap-2">
      {#if picked}
        <div class="flex items-center gap-2">
          <span class="flex-1 text-sm truncate">{picked.name}</span>
          <input class="w-20 bg-muted rounded-md px-2 h-10 text-sm outline-none focus:ring-1 focus:ring-ring" inputmode="numeric" bind:value={ui.grams} />
          <span class="text-xs text-muted-foreground">g</span>
          <Button onclick={addIngredient}>Add</Button>
          <Button size="icon" variant="ghost" onclick={() => (picked = null)} aria-label="Cancel">×</Button>
        </div>
      {:else}
        <div class="flex items-center gap-2">
          <Search class="h-4 w-4 text-muted-foreground" />
          <input class="flex-1 bg-transparent text-sm outline-none h-11" placeholder="Add an ingredient" bind:value={ui.query} oninput={onInput} />
        </div>
        {#if results.length > 0}
          <ul class="divide-y divide-border border-t border-border">
            {#each results as f (f.id)}
              <li>
                <button type="button" class="w-full text-left px-1 py-2 text-sm" onclick={() => (picked = f)}>
                  {f.name}
                  {#if f.brand}<span class="text-muted-foreground text-xs"> · {f.brand}</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </div>
  {/if}
</div>
