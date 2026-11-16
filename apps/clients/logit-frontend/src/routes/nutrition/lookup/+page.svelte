<script lang="ts">
  import { onMount } from "svelte";
  import { X } from "lucide-svelte";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import { back } from "$lib/navigation";
  import { toast } from "$lib/components/ui/sonner";
  import {
    createFavoriteFood,
    localDateIso,
    loggedItemFromFood,
    type FoodRef,
    type MacroTotals,
  } from "@logit/core/domain/nutrition";
  import { getNutritionRepo } from "$lib/data/repoProvider";
  import { pushFavorite } from "$lib/sync/syncService";
  import { SNAPSHOT_PREFIX } from "$lib/features/nutrition/foodFinder";
  import FoodSearchPanel, { type Picked } from "$lib/features/nutrition/ui/FoodSearchPanel.svelte";
  import AmountSheet, { type AmountResult } from "$lib/features/nutrition/ui/AmountSheet.svelte";
  import { MEAL_LABELS, fmtNum, mealForNow } from "$lib/features/nutrition/ui/meals";
  import { addItems, dayContext } from "$lib/features/nutrition/diary";

  // Look a food up without logging it: search or scan, see its numbers for any amount,
  // star it for later. "Add to diary…" is there if it turns out you're eating it.
  let picked = $state<Picked | null>(null);
  let favIds = $state(new Set<string>());
  let ctx = $state<{ eaten: MacroTotals; target: MacroTotals | null } | null>(null);
  const today = localDateIso();

  onMount(() => {
    void loadFavs();
  });

  async function loadFavs() {
    const favs = await getNutritionRepo().listFavorites();
    favIds = new Set(favs.filter((f) => !f.deletedAtMs).map((f) => f.food.id));
  }

  async function toggleFav(food: FoodRef) {
    const repo = getNutritionRepo();
    const was = favIds.has(food.id);
    if (was) await repo.deleteFavorite(food.id);
    else await repo.saveFavorite(createFavoriteFood(food));
    await loadFavs();
    const row = (await repo.listFavoritesForPush()).find((f) => f.food.id === food.id);
    if (row) pushFavorite(row);
    toast(was ? `Removed ${food.name} from favourites` : `Added ${food.name} to favourites`);
  }

  async function open(p: Picked) {
    picked = p;
    const c = await dayContext(today);
    ctx = { eaten: c.eaten, target: c.target };
  }

  async function add(r: AmountResult) {
    if (!picked || !r.meal) return;
    const food = picked.food;
    const item = loggedItemFromFood(food, r.meal, r.grams, r.label, { amount: r.amount, portionId: r.portionId });
    if (food.id.startsWith(SNAPSHOT_PREFIX)) {
      delete item.sourceId;
      delete item.sourceKind;
    }
    picked = null;
    await addItems(today, [item]);
    toast(`Added to ${MEAL_LABELS[r.meal]}`);
  }
</script>

<PageHeader>
  <button type="button" class="flex size-11 items-center justify-center rounded-lg" aria-label="Close" onclick={() => back("/nutrition")}>
    <X class="size-[22px]" />
  </button>
  <h1 class="page-title flex-1">Look up food</h1>
</PageHeader>

<div class="flex flex-col pb-10">
  <FoodSearchPanel mode="lookup" onpick={(p) => void open(p)} autofocus />
</div>

{#if picked}
  {@const p = picked}
  <AmountSheet
    food={p.food}
    subtitle={p.kind === "recipe" ? "Your recipe" : p.kind === "custom" ? (p.food.brand ? `${p.food.brand} · your food` : "Your food") : p.food.brand}
    rawUnits={p.realGrams !== false}
    initial={p.initial}
    day={ctx}
    meal={null}
    askMeal={mealForNow()}
    favourite={p.food.id.startsWith(SNAPSHOT_PREFIX) ? null : { on: favIds.has(p.food.id), toggle: () => void toggleFav(p.food) }}
    onconfirm={(r) => void add(r)}
    onclose={() => (picked = null)}
  >
    {#snippet extra()}
      {#if p.realGrams !== false}
        <p class="text-xs text-muted-foreground tabular-nums">
          per 100 g: {fmtNum(p.food.per100g.kcal)} kcal · P {Math.round(p.food.per100g.proteinG * 10) / 10} ·
          C {Math.round(p.food.per100g.carbsG * 10) / 10} · F {Math.round(p.food.per100g.fatG * 10) / 10}
        </p>
      {/if}
    {/snippet}
  </AmountSheet>
{/if}
