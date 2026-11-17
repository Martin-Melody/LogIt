<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { ChevronRight, Plus, Search } from "lucide-svelte";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { back } from "$lib/navigation";
  import { toast } from "$lib/components/ui/sonner";
  import {
    isWeightRecipe,
    mealTemplateTotals,
    recipePer100gCooked,
    tombstoneCustomFood,
    tombstoneMealTemplate,
    type CustomFood,
    type MealTemplate,
    type Recipe,
  } from "@logit/core/domain/nutrition";
  import { rankByQuery } from "@logit/core/nutrition/foodSearch";
  import { getNutritionRepo } from "$lib/data/repoProvider";
  import { pushCustomFood, pushMealTemplate } from "$lib/sync/syncService";
  import { bottomNavHeight } from "$lib/stores/bottomNav.store";
  import { loadMyFoods } from "$lib/features/nutrition/foodFinder";
  import { rowPortion } from "$lib/features/nutrition/portion";
  import FoodEditor from "$lib/features/nutrition/ui/FoodEditor.svelte";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import { fmtNum } from "$lib/features/nutrition/ui/meals";
  import { segment, segmentTrack } from "$lib/features/nutrition/ui/style";

  // Everything you've made: foods, recipes and saved meals.
  type Tab = "foods" | "recipes" | "meals";
  const startTab = page.url.searchParams.get("tab");
  let tab = $state<Tab>(startTab === "foods" || startTab === "meals" ? startTab : "recipes");
  let query = $state("");
  let loading = $state(true);
  let foods = $state<CustomFood[]>([]);
  let recipes = $state<Recipe[]>([]);
  let meals = $state<MealTemplate[]>([]);

  let editor = $state<null | { existing: CustomFood | null }>(null);
  let mealSheet = $state<null | { t: MealTemplate; name: string }>(null);

  onMount(() => void load());

  async function load() {
    const my = await loadMyFoods();
    foods = my.custom.sort((a, b) => a.food.name.localeCompare(b.food.name));
    recipes = my.recipes.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    meals = my.meals;
    loading = false;
    const edit = page.url.searchParams.get("edit");
    if (edit) {
      const row = foods.find((f) => f.food.id === edit);
      if (row) {
        tab = "foods";
        editor = { existing: row };
      }
    }
  }

  function setTab(t: Tab) {
    tab = t;
    query = "";
    const url = new URL(page.url);
    url.searchParams.set("tab", t);
    url.searchParams.delete("edit");
    void goto(url, { replaceState: true, keepFocus: true, noScroll: true });
  }

  const shownFoods = $derived(query.trim() ? rankByQuery(foods, query, (f) => f.food) : foods);
  const shownRecipes = $derived(query.trim() ? rankByQuery(recipes, query, (r) => r) : recipes);
  const shownMeals = $derived(query.trim() ? rankByQuery(meals, query, (m) => m) : meals);

  function recipeLine(r: Recipe): { main: string; sub: string } {
    if (isWeightRecipe(r)) {
      const p = recipePer100gCooked(r)!;
      return { main: `${fmtNum(p.kcal)} kcal · P ${Math.round(p.proteinG * 10) / 10}`, sub: "per 100 g cooked" };
    }
    return {
      main: `${fmtNum(r.perServing.kcal)} kcal · P ${Math.round(r.perServing.proteinG)}`,
      sub: `per serving · makes ${r.servings}`,
    };
  }

  async function deleteFood(row: CustomFood) {
    editor = null;
    await getNutritionRepo().deleteCustomFood(row.food.id);
    pushCustomFood(tombstoneCustomFood(row));
    toast(`Deleted ${row.food.name}`);
    await load();
  }

  async function saveMeal() {
    if (!mealSheet) return;
    const name = mealSheet.name.trim();
    const t = mealSheet.t;
    mealSheet = null;
    if (!name || name === t.name) return;
    const next = { ...t, name, updatedAtMs: Date.now() };
    await getNutritionRepo().saveMealTemplate(next);
    pushMealTemplate(next);
    await load();
  }

  async function deleteMeal(t: MealTemplate) {
    mealSheet = null;
    await getNutritionRepo().deleteMealTemplate(t.id);
    pushMealTemplate(tombstoneMealTemplate(t));
    toast(`Deleted ${t.name}`);
    await load();
  }
</script>

<PageHeader>
  <BackButton onclick={() => back("/nutrition")} />
  <h1 class="page-title flex-1">My foods</h1>
</PageHeader>

<div class="flex flex-col gap-2.5 px-3 pb-32 pt-1">
  <div class={segmentTrack} role="tablist">
    <button type="button" role="tab" aria-selected={tab === "foods"} class={segment(tab === "foods")} onclick={() => setTab("foods")}>
      Foods <span class="ml-1 opacity-60">{foods.length}</span>
    </button>
    <button type="button" role="tab" aria-selected={tab === "recipes"} class={segment(tab === "recipes")} onclick={() => setTab("recipes")}>
      Recipes <span class="ml-1 opacity-60">{recipes.length}</span>
    </button>
    <button type="button" role="tab" aria-selected={tab === "meals"} class={segment(tab === "meals")} onclick={() => setTab("meals")}>
      Meals <span class="ml-1 opacity-60">{meals.length}</span>
    </button>
  </div>

  <label class="flex h-11 items-center gap-2.5 rounded-xl bg-muted px-3.5 focus-within:ring-2 focus-within:ring-ring">
    <Search class="size-4 text-muted-foreground" />
    <input class="min-w-0 flex-1 bg-transparent outline-none" placeholder="Search your {tab}" bind:value={query} aria-label="Search your {tab}" />
  </label>

  {#if loading}
    <p class="px-1 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if tab === "recipes"}
    {#if recipes.length === 0}
      <p class="px-2 py-6 text-center text-sm text-muted-foreground">
        A recipe adds up its ingredients, so you can log a portion of it like any food. Weigh the pot after cooking and you can log it by the gram.
      </p>
    {/if}
    {#each shownRecipes as r (r.id)}
      {@const line = recipeLine(r)}
      <a href="/nutrition/foods/recipe/{r.id}" class="flex items-center gap-3 rounded-2xl border border-border bg-card py-3 pl-3.5 pr-2 dark:border-transparent">
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5">
            <span class="truncate font-semibold">{r.name}</span>
            {#if isWeightRecipe(r)}<span class="shrink-0 rounded-md bg-muted px-1.5 text-[11px] text-muted-foreground">by weight</span>{/if}
          </span>
          <span class="mt-0.5 flex gap-2.5 text-xs tabular-nums">
            <span>{line.main}</span><span class="text-muted-foreground">{line.sub}</span>
          </span>
          {#if r.cookedOn && r.cookedWeightG}
            <span class="mt-0.5 block text-[11px] text-muted-foreground">Pot weighed {fmtNum(r.cookedWeightG)} g · {r.cookedOn}</span>
          {/if}
        </span>
        <ChevronRight class="size-[18px] shrink-0 text-muted-foreground" />
      </a>
    {/each}
  {:else if tab === "foods"}
    {#if foods.length === 0}
      <p class="px-2 py-6 text-center text-sm text-muted-foreground">Foods you add yourself, or save from a label scan, live here.</p>
    {/if}
    {#if shownFoods.length}
      <ul class="overflow-hidden rounded-2xl border border-border bg-card dark:border-transparent">
        {#each shownFoods as f (f.food.id)}
          {@const p = rowPortion(f.food)}
          <li class="border-t border-border first:border-t-0">
            <button type="button" class="flex min-h-[58px] w-full items-center gap-3 px-4 text-left" onclick={() => (editor = { existing: f })}>
              <span class="min-w-0 flex-1">
                <span class="block truncate">{f.food.name}</span>
                <span class="block truncate text-xs text-muted-foreground tabular-nums">
                  {f.food.brand ? `${f.food.brand} · ` : ""}{p.label} · {fmtNum((f.food.per100g.kcal * p.grams) / 100)} kcal · P {Math.round((f.food.per100g.proteinG * p.grams) / 100)}
                </span>
              </span>
              <ChevronRight class="size-[18px] shrink-0 text-muted-foreground" />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    {#if meals.length === 0}
      <p class="px-2 py-6 text-center text-sm text-muted-foreground">
        Open a meal's menu (the ··· on the diary) and choose "Save as a meal" to log the same foods again in one tap.
      </p>
    {/if}
    {#if shownMeals.length}
      <ul class="overflow-hidden rounded-2xl border border-border bg-card dark:border-transparent">
        {#each shownMeals as t (t.id)}
          {@const tot = mealTemplateTotals(t)}
          <li class="border-t border-border first:border-t-0">
            <button type="button" class="flex min-h-[58px] w-full items-center gap-3 px-4 text-left" onclick={() => (mealSheet = { t, name: t.name })}>
              <span class="min-w-0 flex-1">
                <span class="block truncate">{t.name}</span>
                <span class="block truncate text-xs text-muted-foreground tabular-nums">{t.items.length} items · {fmtNum(tot.kcal)} kcal · P {Math.round(tot.proteinG)}</span>
              </span>
              <ChevronRight class="size-[18px] shrink-0 text-muted-foreground" />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

{#if tab !== "meals"}
  {#if tab === "recipes"}
    <a
      href="/nutrition/foods/recipe/new"
      class="fixed right-4 z-30 flex h-13 items-center gap-2 rounded-full bg-primary pl-4 pr-5 font-semibold text-primary-foreground shadow-xl"
      style="bottom: {$bottomNavHeight + 16}px"
    >
      <Plus class="size-5" strokeWidth={2.4} />New recipe
    </a>
  {:else}
    <button
      type="button"
      class="fixed right-4 z-30 flex h-13 items-center gap-2 rounded-full bg-primary pl-4 pr-5 font-semibold text-primary-foreground shadow-xl"
      style="bottom: {$bottomNavHeight + 16}px"
      onclick={() => (editor = { existing: null })}
    >
      <Plus class="size-5" strokeWidth={2.4} />New food
    </button>
  {/if}
{/if}

{#if editor}
  {@const ex = editor.existing}
  <FoodEditor
    existing={ex}
    onsave={() => {
      editor = null;
      void load();
    }}
    onclose={() => (editor = null)}
    ondelete={ex ? () => void deleteFood(ex) : null}
  />
{/if}

{#if mealSheet}
  {@const ms = mealSheet}
  {@const tot = mealTemplateTotals(ms.t)}
  <BottomSheet label={ms.t.name} onclose={() => (mealSheet = null)}>
    <div class="flex flex-col gap-3 px-5 pt-1">
      <label class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-muted-foreground">Name</span>
        <input class="h-12 rounded-xl bg-muted px-3 font-semibold outline-none focus:ring-2 focus:ring-ring" bind:value={ms.name} />
      </label>
      <p class="text-xs text-muted-foreground tabular-nums">{fmtNum(tot.kcal)} kcal · P {Math.round(tot.proteinG)} · C {Math.round(tot.carbsG)} · F {Math.round(tot.fatG)}</p>
      <ul class="overflow-hidden rounded-xl bg-muted/50">
        {#each ms.t.items as it, i (i)}
          <li class="flex items-center gap-3 border-t border-border px-3.5 py-2.5 text-sm first:border-t-0">
            <span class="min-w-0 flex-1 truncate">{it.name} <span class="text-muted-foreground">· {it.servingLabel ?? `${Math.round(it.grams)} g`}</span></span>
            <span class="tabular-nums text-muted-foreground">{fmtNum(it.computed.kcal)}</span>
          </li>
        {/each}
      </ul>
      <button type="button" class="h-11 self-start text-sm font-medium text-destructive" onclick={() => void deleteMeal(ms.t)}>Delete this meal</button>
    </div>
    {#snippet footer()}
      <button type="button" class="h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground" onclick={() => void saveMeal()}>Save</button>
    {/snippet}
  </BottomSheet>
{/if}
