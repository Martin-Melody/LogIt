<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { ArrowLeft, Search, Barcode, Plus } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import {
    addDiaryItem,
    createDiaryDay,
    gramServing,
    loggedItemFromFood,
    recipeAsFood,
    scaleMacros,
    roundMacros,
    localDateIso,
    type FoodRef,
    type MealSlot,
    type ServingOption,
  } from "@logit/core/domain/nutrition";
  import { getNutritionRepo, getFoodDbRepo } from "$lib/data/repoProvider";
  import { pushNutritionDay } from "$lib/sync/syncService";
  import { fmtKcal } from "$lib/features/nutrition/nutrition";

  const meal = ($page.url.searchParams.get("meal") ?? "breakfast") as MealSlot;
  const dateIso = $page.url.searchParams.get("date") ?? localDateIso();

  const ui = $state({ query: "", searching: false, tab: "all" as "all" | "custom" | "recipes" });
  let results = $state<FoodRef[]>([]);
  let selected = $state<FoodRef | null>(null);
  const pick = $state({ servingId: "g", quantity: 1 });

  // quick add
  const quick = $state({ name: "", kcal: "", protein: "", carbs: "", fat: "" });
  let showQuick = $state(false);

  let searchTimer: ReturnType<typeof setTimeout>;
  function onInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void runSearch(), 250);
  }

  async function runSearch() {
    const q = ui.query.trim();
    if (!q) {
      results = [];
      return;
    }
    ui.searching = true;
    try {
      const repo = getNutritionRepo();
      const [foods, customFoods, recipes] = await Promise.all([
        ui.tab === "recipes" ? Promise.resolve([]) : getFoodDbRepo().searchFoods(q, { limit: 30 }),
        repo.listCustomFoods(),
        repo.listRecipes(),
      ]);
      const ql = q.toLowerCase();
      const custom = customFoods
        .filter((c) => c.food.name.toLowerCase().includes(ql))
        .map((c) => c.food);
      const recipeFoods = recipes
        .filter((r) => r.name.toLowerCase().includes(ql))
        .map((r) => recipeAsFood(r));

      if (ui.tab === "custom") results = custom;
      else if (ui.tab === "recipes") results = recipeFoods;
      else results = [...recipeFoods, ...custom, ...foods];
    } finally {
      ui.searching = false;
    }
  }

  async function lookupBarcode() {
    const code = ui.query.trim().replace(/\D/g, "");
    if (code.length < 6) return;
    ui.searching = true;
    try {
      const food = await getFoodDbRepo().getFoodByBarcode(code);
      results = food ? [food] : [];
      if (food) select(food);
    } finally {
      ui.searching = false;
    }
  }

  function select(food: FoodRef) {
    selected = food;
    pick.servingId = food.servings[0]?.id ?? "g";
    pick.quantity = 1;
  }

  const chosenServing = $derived.by<ServingOption>(() => {
    const s = selected?.servings.find((x) => x.id === pick.servingId);
    return s ?? gramServing();
  });
  const grams = $derived(chosenServing.grams * (Number(pick.quantity) || 0));
  const preview = $derived(selected ? roundMacros(scaleMacros(selected.per100g, grams)) : null);

  async function addSelected() {
    if (!selected || grams <= 0) return;
    const repo = getNutritionRepo();
    const existing = (await repo.getDay(dateIso)) ?? createDiaryDay(dateIso);
    const label =
      (Number(pick.quantity) !== 1 ? `${pick.quantity} × ` : "") +
      `${chosenServing.label}` +
      (chosenServing.id !== "g" ? ` (${Math.round(grams)} g)` : "");
    const next = addDiaryItem(existing, loggedItemFromFood(selected, meal, grams, label));
    await repo.saveDay(next);
    pushNutritionDay(next);
    back(`/nutrition`);
  }

  async function addQuick() {
    const kcal = Number(quick.kcal);
    if (!quick.name.trim() || !Number.isFinite(kcal) || kcal <= 0) return;
    const repo = getNutritionRepo();
    const existing = (await repo.getDay(dateIso)) ?? createDiaryDay(dateIso);
    const next = addDiaryItem(existing, {
      meal,
      name: quick.name.trim(),
      grams: 0,
      computed: {
        kcal,
        proteinG: Number(quick.protein) || 0,
        carbsG: Number(quick.carbs) || 0,
        fatG: Number(quick.fat) || 0,
      },
    });
    await repo.saveDay(next);
    pushNutritionDay(next);
    back(`/nutrition`);
  }
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <button type="button" class="h-8 w-8 flex items-center justify-center" onclick={() => back("/nutrition")}>
      <ArrowLeft class="h-4 w-4" />
    </button>
    <h1 class="text-sm font-semibold">Add to <span class="capitalize">{meal}</span></h1>
  </div>

  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <Search class="h-4 w-4 text-muted-foreground shrink-0" />
    <input
      class="flex-1 bg-transparent text-sm outline-none py-1"
      placeholder="Search foods or paste a barcode"
      bind:value={ui.query}
      oninput={onInput}
    />
    <button type="button" class="h-7 w-7 flex items-center justify-center text-muted-foreground" onclick={() => void lookupBarcode()} aria-label="Look up barcode">
      <Barcode class="h-4 w-4" />
    </button>
  </div>

  <div class="flex gap-1 px-3 py-1.5 border-b border-border text-xs">
    {#each ["all", "custom", "recipes"] as t (t)}
      <button
        type="button"
        class="px-2 py-1 rounded capitalize {ui.tab === t ? 'bg-muted font-medium' : 'text-muted-foreground'}"
        onclick={() => { ui.tab = t as typeof ui.tab; void runSearch(); }}
      >{t}</button>
    {/each}
    <button type="button" class="ml-auto px-2 py-1 text-primary flex items-center gap-1" onclick={() => (showQuick = !showQuick)}>
      <Plus class="h-3.5 w-3.5" /> Quick add
    </button>
  </div>

  {#if showQuick}
    <div class="px-3 py-3 border-b border-border flex flex-col gap-2">
      <input class="w-full bg-muted rounded px-2 py-1.5 text-sm outline-none" placeholder="Name" bind:value={quick.name} />
      <div class="grid grid-cols-4 gap-2">
        <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="numeric" placeholder="kcal" bind:value={quick.kcal} />
        <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="numeric" placeholder="P" bind:value={quick.protein} />
        <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="numeric" placeholder="C" bind:value={quick.carbs} />
        <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="numeric" placeholder="F" bind:value={quick.fat} />
      </div>
      <Button size="sm" onclick={() => void addQuick()}>Add</Button>
    </div>
  {/if}

  {#if selected}
    <div class="px-3 py-3 border-b border-border bg-muted/30 flex flex-col gap-2">
      <div class="text-sm font-medium">{selected.name}{#if selected.brand}<span class="text-muted-foreground font-normal"> · {selected.brand}</span>{/if}</div>
      <div class="flex gap-2">
        <select class="flex-1 bg-muted rounded px-2 py-1.5 text-sm outline-none" bind:value={pick.servingId}>
          {#each selected.servings as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
        </select>
        <input class="w-20 bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="decimal" bind:value={pick.quantity} />
      </div>
      {#if preview}
        <div class="text-xs text-muted-foreground tabular-nums">
          {fmtKcal(preview.kcal)} kcal · P {Math.round(preview.proteinG)} · C {Math.round(preview.carbsG)} · F {Math.round(preview.fatG)}
        </div>
      {/if}
      <div class="flex gap-2">
        <Button size="sm" onclick={() => void addSelected()}>Add</Button>
        <Button size="sm" variant="ghost" onclick={() => (selected = null)}>Cancel</Button>
      </div>
    </div>
  {/if}

  {#if ui.searching}
    <p class="px-3 py-4 text-sm text-muted-foreground">Searching…</p>
  {:else if ui.query && results.length === 0}
    <p class="px-3 py-4 text-sm text-muted-foreground">No matches. Try Quick add or create a custom food.</p>
  {:else}
    <ul class="divide-y divide-border">
      {#each results as f (f.id)}
        <li>
          <button type="button" class="w-full text-left px-3 py-2 flex items-center gap-2" onclick={() => select(f)}>
            <span class="flex-1 min-w-0">
              <span class="block text-sm truncate">{f.name}</span>
              {#if f.brand}<span class="block text-[11px] text-muted-foreground truncate">{f.brand}</span>{/if}
            </span>
            <span class="text-xs text-muted-foreground tabular-nums shrink-0">{fmtKcal(f.per100g.kcal)}/100g</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
