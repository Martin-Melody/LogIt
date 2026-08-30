<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ArrowLeft, Plus, Trash2, Pencil } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import {
    createCustomFood,
    createRecipe,
    gramServing,
    type CustomFood,
    type Recipe,
  } from "@logit/core/domain/nutrition";
  import { getNutritionRepo } from "$lib/data/repoProvider";
  import { pushCustomFood, pushRecipe } from "$lib/sync/syncService";
  import { fmtKcal } from "$lib/features/nutrition/nutrition";

  const ui = $state({ loading: true, showNewFood: false });
  let foods = $state<CustomFood[]>([]);
  let recipes = $state<Recipe[]>([]);

  const draft = $state({ name: "", kcal: "", protein: "", carbs: "", fat: "", serving: "" });

  async function load() {
    const repo = getNutritionRepo();
    [foods, recipes] = await Promise.all([repo.listCustomFoods(), repo.listRecipes()]);
    ui.loading = false;
  }

  async function saveFood() {
    const kcal = Number(draft.kcal);
    if (!draft.name.trim() || !Number.isFinite(kcal) || kcal <= 0) return;
    const servings = [gramServing()];
    const s = Number(draft.serving);
    if (Number.isFinite(s) && s > 0) servings.push({ id: "serving", label: `serving (${s} g)`, grams: s });
    const food = createCustomFood({
      name: draft.name,
      per100g: {
        kcal,
        proteinG: Number(draft.protein) || 0,
        carbsG: Number(draft.carbs) || 0,
        fatG: Number(draft.fat) || 0,
      },
      servings,
    });
    await getNutritionRepo().saveCustomFood(food);
    pushCustomFood(food);
    Object.assign(draft, { name: "", kcal: "", protein: "", carbs: "", fat: "", serving: "" });
    ui.showNewFood = false;
    await load();
  }

  async function deleteFood(id: string) {
    await getNutritionRepo().deleteCustomFood(id);
    const row = foods.find((f) => f.food.id === id);
    if (row) pushCustomFood({ ...row, deletedAtMs: Date.now(), updatedAtMs: Date.now() });
    await load();
  }

  async function newRecipe() {
    const r = createRecipe("New recipe");
    await getNutritionRepo().saveRecipe(r);
    pushRecipe(r);
    void goto(`/nutrition/foods/recipe/${r.id}`);
  }

  async function deleteRecipe(id: string) {
    await getNutritionRepo().deleteRecipe(id);
    const row = recipes.find((r) => r.id === id);
    if (row) pushRecipe({ ...row, deletedAtMs: Date.now(), updatedAtMs: Date.now() });
    await load();
  }

  onMount(() => void load());
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <button type="button" class="h-8 w-8 flex items-center justify-center" onclick={() => back("/nutrition")}>
      <ArrowLeft class="h-4 w-4" />
    </button>
    <h1 class="text-sm font-semibold">Foods &amp; recipes</h1>
  </div>

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else}
    <!-- Recipes -->
    <div class="border-b border-border">
      <div class="flex items-center justify-between px-3 py-2">
        <span class="text-xs font-semibold">Recipes</span>
        <button type="button" class="text-xs text-primary flex items-center gap-1" onclick={() => void newRecipe()}>
          <Plus class="h-3.5 w-3.5" /> New
        </button>
      </div>
      {#if recipes.length > 0}
        <ul class="divide-y divide-border">
          {#each recipes as r (r.id)}
            <li class="flex items-center gap-2 px-3 py-2 text-sm">
              <a href="/nutrition/foods/recipe/{r.id}" class="flex-1 min-w-0">
                <span class="block truncate">{r.name}</span>
                <span class="block text-[11px] text-muted-foreground tabular-nums">
                  {fmtKcal(r.perServing.kcal)} kcal / serving · {r.servings} servings
                </span>
              </a>
              <a href="/nutrition/foods/recipe/{r.id}" class="h-6 w-6 flex items-center justify-center text-muted-foreground"><Pencil class="h-3.5 w-3.5" /></a>
              <button type="button" class="h-6 w-6 flex items-center justify-center text-muted-foreground" onclick={() => void deleteRecipe(r.id)} aria-label="Delete">
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Custom foods -->
    <div>
      <div class="flex items-center justify-between px-3 py-2">
        <span class="text-xs font-semibold">Custom foods</span>
        <button type="button" class="text-xs text-primary flex items-center gap-1" onclick={() => (ui.showNewFood = !ui.showNewFood)}>
          <Plus class="h-3.5 w-3.5" /> New
        </button>
      </div>

      {#if ui.showNewFood}
        <div class="px-3 py-3 border-y border-border flex flex-col gap-2 bg-muted/30">
          <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" placeholder="Name" bind:value={draft.name} />
          <div class="grid grid-cols-4 gap-2">
            <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="numeric" placeholder="kcal" bind:value={draft.kcal} />
            <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="numeric" placeholder="P" bind:value={draft.protein} />
            <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="numeric" placeholder="C" bind:value={draft.carbs} />
            <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="numeric" placeholder="F" bind:value={draft.fat} />
          </div>
          <p class="text-[11px] text-muted-foreground">Values per 100 g.</p>
          <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="numeric" placeholder="Serving size in grams (optional)" bind:value={draft.serving} />
          <Button size="sm" onclick={() => void saveFood()}>Save food</Button>
        </div>
      {/if}

      {#if foods.length > 0}
        <ul class="divide-y divide-border">
          {#each foods as f (f.food.id)}
            <li class="flex items-center gap-2 px-3 py-2 text-sm">
              <span class="flex-1 min-w-0 truncate">{f.food.name}</span>
              <span class="text-xs text-muted-foreground tabular-nums">{fmtKcal(f.food.per100g.kcal)}/100g</span>
              <button type="button" class="h-6 w-6 flex items-center justify-center text-muted-foreground" onclick={() => void deleteFood(f.food.id)} aria-label="Delete">
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </li>
          {/each}
        </ul>
      {:else if !ui.showNewFood}
        <p class="px-3 py-3 text-xs text-muted-foreground">No custom foods yet.</p>
      {/if}
    </div>
  {/if}
</div>
