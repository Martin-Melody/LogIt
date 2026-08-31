<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { ArrowLeft, Search, Barcode, Plus, Star, History } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import * as Tabs from "$lib/components/ui/tabs";
  import BarcodeScanner from "$lib/features/nutrition/BarcodeScanner.svelte";
  import {
    addDiaryItem,
    createDiaryDay,
    createFavoriteFood,
    gramServing,
    loggedItemFromFood,
    loggedItemFromRecent,
    recentFoodsFromDays,
    recipeAsFood,
    scaleMacros,
    roundMacros,
    localDateIso,
    type FavoriteFood,
    type FoodRef,
    type MealSlot,
    type RecentFood,
    type ServingOption,
  } from "@logit/core/domain/nutrition";
  import { getNutritionRepo, getFoodDbRepo } from "$lib/data/repoProvider";
  import { pushNutritionDay, pushFavorite } from "$lib/sync/syncService";
  import { fmtKcal } from "$lib/features/nutrition/nutrition";

  const meal = ($page.url.searchParams.get("meal") ?? "breakfast") as MealSlot;
  const dateIso = $page.url.searchParams.get("date") ?? localDateIso();

  const ui = $state({ query: "", searching: false, filter: "all" as "all" | "custom" | "recipes" });
  let tab = $state<"recent" | "favorites">("recent");
  let results = $state<FoodRef[]>([]);
  let recents = $state<RecentFood[]>([]);
  let favorites = $state<FavoriteFood[]>([]);
  let selected = $state<FoodRef | null>(null);
  const pick = $state({ servingId: "g", quantity: 1 });

  const searching = $derived(ui.query.trim().length > 0);
  const favIds = $derived(new Set(favorites.map((f) => f.food.id)));

  // quick add
  const quick = $state({ name: "", kcal: "", protein: "", carbs: "", fat: "" });
  let showQuick = $state(false);
  let showScanner = $state(false);

  onMount(() => {
    void loadRecents();
    void loadFavorites();
  });

  async function loadRecents() {
    const repo = getNutritionRepo();
    const end = localDateIso();
    const start = localDateIso(new Date(Date.now() - 45 * 86_400_000));
    const days = await repo.listDaysInRange(start, end);
    recents = recentFoodsFromDays(days, 50);
  }

  async function loadFavorites() {
    favorites = await getNutritionRepo().listFavorites();
  }

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
    if (/^\d{8,14}$/.test(q)) {
      await lookupBarcode(q);
      return;
    }
    ui.searching = true;
    try {
      const repo = getNutritionRepo();
      const [foods, customFoods, recipes] = await Promise.all([
        ui.filter === "recipes" ? Promise.resolve([]) : getFoodDbRepo().searchFoods(q, { limit: 30 }),
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

      if (ui.filter === "custom") results = custom;
      else if (ui.filter === "recipes") results = recipeFoods;
      else results = [...recipeFoods, ...custom, ...foods];
    } finally {
      ui.searching = false;
    }
  }

  async function lookupBarcode(raw?: string) {
    const code = (raw ?? ui.query).trim().replace(/\D/g, "");
    if (code.length < 6) return;
    ui.query = code;
    ui.searching = true;
    try {
      const food = await getFoodDbRepo().getFoodByBarcode(code);
      results = food ? [food] : [];
      if (food) select(food);
    } finally {
      ui.searching = false;
    }
  }

  function onScanned(code: string) {
    showScanner = false;
    void lookupBarcode(code);
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

  /** One-tap re-log of a recent food, same portion as last time. */
  async function logRecent(r: RecentFood) {
    const repo = getNutritionRepo();
    const existing = (await repo.getDay(dateIso)) ?? createDiaryDay(dateIso);
    const next = addDiaryItem(existing, loggedItemFromRecent(r, meal));
    await repo.saveDay(next);
    pushNutritionDay(next);
    back(`/nutrition`);
  }

  async function toggleFavorite(food: FoodRef) {
    const repo = getNutritionRepo();
    if (favIds.has(food.id)) await repo.deleteFavorite(food.id);
    else await repo.saveFavorite(createFavoriteFood(food));
    await loadFavorites();
    // Push the resulting row — the new favourite, or the tombstone on removal.
    const row = (await repo.listFavoritesForPush()).find((f) => f.food.id === food.id);
    if (row) pushFavorite(row);
  }

  /** Star for a recent — only when it resolves to a real food (not a quick-add). */
  async function toggleFavoriteRecent(r: RecentFood) {
    if (!r.sourceId) return;
    const food =
      r.sourceKind === "recipe"
        ? recipeAsFood((await getNutritionRepo().getRecipe(r.sourceId))!)
        : await getFoodDbRepo().getFood(r.sourceId);
    if (food) await toggleFavorite(food);
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

  function relDay(iso: string): string {
    const today = localDateIso();
    if (iso === today) return "today";
    const y = localDateIso(new Date(Date.now() - 86_400_000));
    if (iso === y) return "yesterday";
    const days = Math.round((Date.parse(today) - Date.parse(iso)) / 86_400_000);
    return days < 7 ? `${days}d ago` : iso.slice(5);
  }
</script>

{#if showScanner}
  <BarcodeScanner onResult={onScanned} onClose={() => (showScanner = false)} />
{/if}

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
    <button type="button" class="h-7 w-7 flex items-center justify-center text-muted-foreground" onclick={() => (showScanner = true)} aria-label="Scan barcode">
      <Barcode class="h-4 w-4" />
    </button>
  </div>

  <div class="flex items-center gap-1 px-3 py-1.5 border-b border-border text-xs">
    {#if searching}
      {#each ["all", "custom", "recipes"] as t (t)}
        <button
          type="button"
          class="px-2 py-1 rounded capitalize {ui.filter === t ? 'bg-muted font-medium' : 'text-muted-foreground'}"
          onclick={() => { ui.filter = t as typeof ui.filter; void runSearch(); }}
        >{t}</button>
      {/each}
    {/if}
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
      <div class="flex items-start gap-2">
        <div class="text-sm font-medium flex-1">
          {selected.name}{#if selected.brand}<span class="text-muted-foreground font-normal"> · {selected.brand}</span>{/if}
        </div>
        <button type="button" aria-label="Toggle favourite" onclick={() => void toggleFavorite(selected!)}>
          <Star class="h-4 w-4 {favIds.has(selected.id) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}" />
        </button>
      </div>
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

  {#if searching}
    {#if ui.searching}
      <p class="px-3 py-4 text-sm text-muted-foreground">Searching…</p>
    {:else if results.length === 0}
      <p class="px-3 py-4 text-sm text-muted-foreground">No matches. Try Quick add or create a custom food.</p>
    {:else}
      <ul class="divide-y divide-border">
        {#each results as f (f.id)}
          <li class="flex items-center">
            <button type="button" class="flex-1 min-w-0 text-left px-3 py-2 flex items-center gap-2" onclick={() => select(f)}>
              <span class="flex-1 min-w-0">
                <span class="block text-sm truncate">{f.name}</span>
                {#if f.brand}<span class="block text-[11px] text-muted-foreground truncate">{f.brand}</span>{/if}
              </span>
              <span class="text-xs text-muted-foreground tabular-nums shrink-0">{fmtKcal(f.per100g.kcal)}/100g</span>
            </button>
            <button type="button" class="px-3 py-2 shrink-0" aria-label="Toggle favourite" onclick={() => void toggleFavorite(f)}>
              <Star class="h-4 w-4 {favIds.has(f.id) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/50'}" />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <Tabs.Root bind:value={tab} class="gap-0">
      <Tabs.List class="mx-3 my-2 w-auto">
        <Tabs.Trigger value="recent"><History class="h-3.5 w-3.5" /> Recent</Tabs.Trigger>
        <Tabs.Trigger value="favorites"><Star class="h-3.5 w-3.5" /> Favourites</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="recent">
        {#if recents.length === 0}
          <p class="px-3 py-6 text-sm text-muted-foreground text-center">Nothing logged yet.</p>
        {:else}
          <ul class="divide-y divide-border">
            {#each recents as r (r.key)}
              <li class="flex items-center">
                <button type="button" class="flex-1 min-w-0 text-left px-3 py-2" onclick={() => void logRecent(r)}>
                  <span class="block text-sm truncate">{r.name}</span>
                  <span class="block text-[11px] text-muted-foreground">
                    {fmtKcal(r.computed.kcal)} kcal
                    {#if r.servingLabel}· {r.servingLabel}{/if}
                    · {relDay(r.lastLoggedIso)}{#if r.count > 1} · ×{r.count}{/if}
                  </span>
                </button>
                {#if r.sourceId}
                  <button type="button" class="px-3 py-2 shrink-0" aria-label="Toggle favourite" onclick={() => void toggleFavoriteRecent(r)}>
                    <Star class="h-4 w-4 {favIds.has(r.sourceId) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/50'}" />
                  </button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </Tabs.Content>

      <Tabs.Content value="favorites">
        {#if favorites.length === 0}
          <p class="px-3 py-6 text-sm text-muted-foreground text-center">
            Star a food while logging to pin it here.
          </p>
        {:else}
          <ul class="divide-y divide-border">
            {#each favorites as fav (fav.food.id)}
              <li class="flex items-center">
                <button type="button" class="flex-1 min-w-0 text-left px-3 py-2 flex items-center gap-2" onclick={() => select(fav.food)}>
                  <span class="flex-1 min-w-0">
                    <span class="block text-sm truncate">{fav.food.name}</span>
                    {#if fav.food.brand}<span class="block text-[11px] text-muted-foreground truncate">{fav.food.brand}</span>{/if}
                  </span>
                  <span class="text-xs text-muted-foreground tabular-nums shrink-0">{fmtKcal(fav.food.per100g.kcal)}/100g</span>
                </button>
                <button type="button" class="px-3 py-2 shrink-0" aria-label="Remove favourite" onclick={() => void toggleFavorite(fav.food)}>
                  <Star class="h-4 w-4 fill-amber-400 text-amber-400" />
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </Tabs.Content>
    </Tabs.Root>
  {/if}
</div>
