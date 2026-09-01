<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { ArrowLeft, Star, Trash2 } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import * as Select from "$lib/components/ui/select";
  import {
    createFavoriteFood,
    removeDiaryItem,
    updateDiaryItem,
    roundMacros,
    scaleMacros,
    MEAL_SLOTS,
    type DiaryDay,
    type FoodRef,
    type LoggedItem,
    type MacroTotals,
    type MealSlot,
  } from "@logit/core/domain/nutrition";
  import { getNutritionRepo } from "$lib/data/repoProvider";
  import { pushNutritionDay, pushFavorite } from "$lib/sync/syncService";
  import { basisForItem, resolveFoodRef } from "$lib/features/nutrition/resolveFood";
  import { portionOptions, portionToGrams, portionLabel } from "$lib/features/nutrition/portion";
  import MacroRing from "$lib/features/nutrition/MacroRing.svelte";
  import { fmtKcal } from "$lib/features/nutrition/nutrition";

  const dateIso = $derived($page.params.date ?? "");
  const itemId = $derived($page.params.item ?? "");

  const mealLabels: Record<MealSlot, string> = {
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snack: "Snacks",
  };

  const ui = $state({ loading: true, error: null as string | null, saving: false });
  let day = $state<DiaryDay | null>(null);
  let item = $state<LoggedItem | null>(null);
  let basis = $state<MacroTotals | null>(null);
  let fromSource = $state(true);
  let sourceFood = $state<FoodRef | null>(null);

  let amount = $state<number | string>(0);
  let portionId = $state("g");
  let meal = $state<MealSlot>("breakfast");
  // Quick-add items have no per-100g basis — edit the absolute macros instead.
  const raw = $state({ kcal: "", protein: "", carbs: "", fat: "" });

  let isFav = $state(false);

  const options = $derived(portionOptions(sourceFood?.servings));
  const activePortion = $derived(options.find((o) => o.id === portionId) ?? options[0]);
  const grams = $derived(portionToGrams(Number(amount) || 0, activePortion));

  const preview = $derived.by<MacroTotals>(() => {
    if (basis) return roundMacros(scaleMacros(basis, grams));
    return {
      kcal: Number(raw.kcal) || 0,
      proteinG: Number(raw.protein) || 0,
      carbsG: Number(raw.carbs) || 0,
      fatG: Number(raw.fat) || 0,
    };
  });

  const sourceLabel = $derived(
    !item?.sourceId
      ? "Quick add"
      : item.sourceKind === "recipe"
        ? "Recipe"
        : sourceFood?.source === "custom"
          ? "Custom food"
          : sourceFood?.source === "usda"
            ? "Whole food"
            : sourceFood
              ? "Packaged food"
              : "Saved entry",
  );

  onMount(() => void load());

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      const d = await getNutritionRepo().getDay(dateIso);
      const it = d?.items.find((i) => i.id === itemId) ?? null;
      if (!d || !it) {
        ui.error = "Entry not found.";
        return;
      }
      day = d;
      item = it;
      meal = it.meal;
      if (it.sourceId) sourceFood = await resolveFoodRef(it.sourceId);
      const b = await basisForItem(it);
      if (b) {
        basis = b.per100g;
        fromSource = b.fromSource;
        portionId = "g";
        amount = Math.round(it.grams * 100) / 100;
      } else {
        raw.kcal = String(it.computed.kcal);
        raw.protein = String(it.computed.proteinG);
        raw.carbs = String(it.computed.carbsG);
        raw.fat = String(it.computed.fatG);
      }
      if (it.sourceId && sourceFood) {
        isFav = (await getNutritionRepo().listFavorites()).some((f) => f.food.id === it.sourceId);
      }
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load";
    } finally {
      ui.loading = false;
    }
  }

  async function save() {
    if (!day || !item || ui.saving) return;
    ui.saving = true;
    try {
      const patch: Partial<Omit<LoggedItem, "id">> = { meal };
      if (basis) {
        if (grams <= 0) return;
        patch.grams = grams;
        patch.servingLabel = portionLabel(Number(amount) || 0, activePortion, grams);
        patch.computed = roundMacros(scaleMacros(basis, grams));
      } else {
        patch.computed = {
          kcal: Number(raw.kcal) || 0,
          proteinG: Number(raw.protein) || 0,
          carbsG: Number(raw.carbs) || 0,
          fatG: Number(raw.fat) || 0,
        };
      }
      const next = updateDiaryItem(day, item.id, patch);
      await getNutritionRepo().saveDay(next);
      pushNutritionDay(next);
      back("/nutrition");
    } finally {
      ui.saving = false;
    }
  }

  async function del() {
    if (!day || !item) return;
    const next = removeDiaryItem(day, item.id);
    await getNutritionRepo().saveDay(next);
    pushNutritionDay(next);
    back("/nutrition");
  }

  async function toggleFav() {
    const id = item?.sourceId;
    if (!id || !sourceFood) return;
    const repo = getNutritionRepo();
    if (isFav) await repo.deleteFavorite(id);
    else await repo.saveFavorite(createFavoriteFood(sourceFood));
    isFav = !isFav;
    const row = (await repo.listFavoritesForPush()).find((f) => f.food.id === id);
    if (row) pushFavorite(row);
  }
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <button type="button" class="h-8 w-8 flex items-center justify-center" onclick={() => back("/nutrition")}>
      <ArrowLeft class="h-4 w-4" />
    </button>
    {#if item?.sourceId && sourceFood}
      <button type="button" onclick={() => void toggleFav()} aria-label="Toggle favourite" class="h-8 w-8 flex items-center justify-center">
        <Star class="h-4 w-4 {isFav ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}" />
      </button>
    {/if}
    <h1 class="text-sm font-semibold truncate">{item?.name ?? "Entry"}</h1>
  </div>

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if ui.error}
    <p class="px-3 py-4 text-sm text-destructive">{ui.error}</p>
  {:else if item}
    <!-- Amount / serving / meal -->
    <div class="divide-y divide-border border-b border-border">
      {#if basis}
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
      {:else}
        <div class="px-3 py-3 flex flex-col gap-2">
          <span class="text-sm">Macros for this entry</span>
          <div class="grid grid-cols-4 gap-2">
            <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none tabular-nums" inputmode="decimal" placeholder="kcal" bind:value={raw.kcal} />
            <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none tabular-nums" inputmode="decimal" placeholder="P" bind:value={raw.protein} />
            <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none tabular-nums" inputmode="decimal" placeholder="C" bind:value={raw.carbs} />
            <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none tabular-nums" inputmode="decimal" placeholder="F" bind:value={raw.fat} />
          </div>
        </div>
      {/if}
      <div class="flex items-center justify-between px-3 py-3">
        <span class="text-sm">Meal</span>
        <Select.Root type="single" bind:value={meal}>
          <Select.Trigger class="w-40">{mealLabels[meal]}</Select.Trigger>
          <Select.Content>
            {#each MEAL_SLOTS as m (m)}
              <Select.Item value={m} label={mealLabels[m]} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    </div>

    <!-- Energy summary -->
    <div class="px-3 py-4 border-b border-border flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold">Energy summary</span>
        <span class="text-[11px] text-muted-foreground">
          {sourceLabel}{#if basis} · {Math.round(grams)} g{/if}
        </span>
      </div>
      <MacroRing macros={preview} />
      {#if !fromSource && item.sourceId}
        <p class="text-[11px] text-muted-foreground">
          The source food is no longer in your library — editing the values saved with this entry.
        </p>
      {/if}
    </div>

    <div class="flex items-center gap-2 px-3 py-3">
      <Button size="sm" class="flex-1" disabled={ui.saving} onclick={() => void save()}>
        {ui.saving ? "Saving…" : "Save"}
      </Button>
      <button
        type="button"
        class="h-9 px-3 flex items-center gap-1.5 text-sm text-destructive rounded border border-border"
        onclick={() => void del()}
      >
        <Trash2 class="h-4 w-4" /> Delete
      </button>
    </div>

    <p class="px-3 text-[11px] text-muted-foreground tabular-nums">
      Was: {fmtKcal(item.computed.kcal)} kcal
      {#if item.servingLabel}· {item.servingLabel}{/if}
    </p>
  {/if}
</div>
