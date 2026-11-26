<script lang="ts">
  import { Separator } from "$lib/components/ui/separator/index.js";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { ClipboardPaste, CookingPot, Plus, Trash2 } from "lucide-svelte";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { back } from "$lib/navigation";
  import { toast } from "$lib/components/ui/sonner";
  import { createId } from "@logit/core/domain/ids";
  import {
    createRecipe,
    localDateIso,
    loggedItemPer100g,
    nutrientsFor,
    recipePer100gCooked,
    recipeTotals,
    recomputeRecipe,
    roundMacros,
    scaleMacros,
    type FoodRef,
    type Recipe,
    type RecipeIngredient,
  } from "@logit/core/domain/nutrition";
  import { getNutritionRepo } from "$lib/data/repoProvider";
  import { pushRecipe } from "$lib/sync/syncService";
  import { resolveFoodRef } from "$lib/features/nutrition/resolveFood";
  import type { MatchedLine } from "$lib/features/nutrition/foodFinder";
  import AmountSheet, { type AmountResult } from "$lib/features/nutrition/ui/AmountSheet.svelte";
  import IngredientPicker from "$lib/features/nutrition/ui/IngredientPicker.svelte";
  import PasteIngredients from "$lib/features/nutrition/ui/PasteIngredients.svelte";
  import type { Picked } from "$lib/features/nutrition/ui/FoodSearchPanel.svelte";
  import { fmtNum, macroLine } from "$lib/features/nutrition/ui/meals";
  import { segment, segmentTrack } from "$lib/features/nutrition/ui/style";

  // Build a recipe: ingredients add up, and it's portioned either into servings or by the
  // weight of the cooked pot (weigh it, then log grams on the plate). Saves as you go; a
  // new recipe is only stored once it has a name or an ingredient.
  const isNew = page.params.id === "new";
  let recipe = $state<Recipe | null>(null);
  let stored = $state(!isNew);
  let status = $state<"saved" | "saving" | "idle">("idle");
  let loading = $state(true);

  let potText = $state("");
  let servingsText = $state("");

  onMount(async () => {
    if (isNew) {
      recipe = { ...createRecipe(""), name: "" };
    } else {
      recipe = await getNutritionRepo().getRecipe(page.params.id ?? "");
    }
    if (recipe) {
      potText = recipe.cookedWeightG ? String(Math.round(recipe.cookedWeightG)) : "";
      servingsText = String(recipe.servings);
      status = isNew ? "idle" : "saved";
    }
    loading = false;
  });

  // ── Saving ──
  let timer: ReturnType<typeof setTimeout>;
  function changed(next: Recipe, now = false) {
    recipe = recomputeRecipe(next);
    clearTimeout(timer);
    if (now) void persist();
    else timer = setTimeout(() => void persist(), 500);
  }

  async function persist() {
    if (!recipe) return;
    if (!stored && !recipe.name.trim() && recipe.ingredients.length === 0) return;
    status = "saving";
    const toSave = { ...recipe, name: recipe.name.trim() || "Untitled recipe" };
    await getNutritionRepo().saveRecipe(toSave);
    pushRecipe(toSave);
    status = "saved";
    if (!stored) {
      stored = true;
      void goto(`/nutrition/foods/recipe/${recipe.id}`, { replaceState: true, keepFocus: true, noScroll: true });
    }
  }

  async function leave() {
    clearTimeout(timer);
    await persist();
    back("/nutrition/foods?tab=recipes");
  }

  // ── Portioning ──
  const byWeight = $derived(recipe?.portionMode === "weight");
  const totals = $derived(recipe ? recipeTotals(recipe) : null);
  const per100 = $derived(recipe ? recipePer100gCooked(recipe) : null);

  function setMode(mode: "servings" | "weight") {
    if (!recipe || recipe.portionMode === mode) return;
    changed({ ...recipe, portionMode: mode }, true);
  }

  function onPot() {
    if (!recipe) return;
    const g = Number(potText.replace(",", "."));
    const weight = Number.isFinite(g) && g > 0 ? g : undefined;
    if (weight === recipe.cookedWeightG) return;
    // A new weight is a new pot: "what's left" counts from today.
    changed({ ...recipe, cookedWeightG: weight, cookedOn: weight ? localDateIso() : undefined });
  }

  function onServings() {
    if (!recipe) return;
    const n = Math.max(1, Math.round(Number(servingsText) || 1));
    if (n !== recipe.servings) changed({ ...recipe, servings: n });
  }

  // ── Ingredients ──
  let picking = $state(false);
  let pasting = $state(false);
  let sheet = $state<null | { food: FoodRef; editing: RecipeIngredient | null }>(null);

  function ingredientFrom(food: FoodRef, r: { grams: number; label: string; amount: number; portionId: string }, id = createId("ing")): RecipeIngredient {
    return {
      id,
      sourceId: food.id.startsWith("snapshot:") ? undefined : food.id,
      name: food.name,
      brand: food.brand,
      grams: r.grams,
      servingLabel: r.label,
      amount: r.amount,
      portionId: r.portionId,
      computed: roundMacros(scaleMacros(food.per100g, r.grams)),
      ...nutrientsFor(food, r.grams),
    };
  }

  function onPicked(p: Picked) {
    picking = false;
    sheet = { food: p.food, editing: null };
  }

  async function openIngredient(ing: RecipeIngredient) {
    const food =
      (ing.sourceId ? await resolveFoodRef(ing.sourceId) : null) ??
      (() => {
        const per = loggedItemPer100g(ing);
        return per ? ({ id: `snapshot:${ing.id}`, source: "custom", name: ing.name, brand: ing.brand, per100g: per, servings: [] } as FoodRef) : null;
      })();
    if (!food) return;
    sheet = { food, editing: ing };
  }

  function confirmIngredient(r: AmountResult) {
    if (!recipe || !sheet) return;
    const { food, editing } = sheet;
    sheet = null;
    const ing = ingredientFrom(food, r, editing?.id);
    const ingredients = editing
      ? recipe.ingredients.map((x) => (x.id === editing.id ? { ...ing, sourceId: editing.sourceId ?? ing.sourceId } : x))
      : [...recipe.ingredients, ing];
    changed({ ...recipe, ingredients }, true);
  }

  function removeIngredient(ing: RecipeIngredient) {
    if (!recipe) return;
    sheet = null;
    const before = recipe;
    changed({ ...recipe, ingredients: recipe.ingredients.filter((x) => x.id !== ing.id) }, true);
    toast(`Removed ${ing.name}`, { action: { label: "Undo", onClick: () => changed(before, true) } });
  }

  function addPasted(lines: MatchedLine[]) {
    pasting = false;
    if (!recipe) return;
    const added = lines
      .filter((l) => l.food && l.grams)
      .map((l) => ingredientFrom(l.food!, { grams: l.grams!, label: l.label, amount: l.amount, portionId: l.portionId }));
    changed({ ...recipe, ingredients: [...recipe.ingredients, ...added] }, true);
  }

  async function deleteRecipe() {
    if (!recipe) return;
    clearTimeout(timer);
    if (stored) {
      await getNutritionRepo().deleteRecipe(recipe.id);
      pushRecipe({ ...recipe, deletedAtMs: Date.now(), updatedAtMs: Date.now() });
    }
    toast(`Deleted ${recipe.name || "recipe"}`);
    stored = false;
    recipe = null;
    back("/nutrition/foods?tab=recipes");
  }

  function amountPill(ing: RecipeIngredient): string {
    const l = ing.servingLabel ?? `${Math.round(ing.grams)} g`;
    return l.replace(/\s*\((\d+(\.\d+)?)\s*g\)$/, "");
  }

  const box = 420;
</script>

<PageHeader>
  <BackButton onclick={() => void leave()} />
  <span class="flex-1 text-[13px] text-muted-foreground">
    {#if status === "saving"}Saving…{:else if status === "saved"}Recipe · saved{:else}New recipe{/if}
  </span>
  {#if recipe}
    <button type="button" class="-mr-1 flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive" aria-label="Delete recipe" onclick={() => void deleteRecipe()}>
      <Trash2 class="size-5" />
    </button>
  {/if}
</PageHeader>

{#if loading}
  <p class="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
{:else if !recipe}
  <p class="px-4 py-6 text-sm text-destructive">Recipe not found.</p>
{:else}
  {@const r = recipe}
  <div class="flex flex-col gap-3.5 px-4 pb-32">
    <input
      aria-label="Recipe name"
      placeholder="Recipe name"
      class="w-full bg-transparent py-1 text-[26px] font-bold tracking-tight outline-none placeholder:text-muted-foreground/60"
      value={r.name}
      oninput={(e) => changed({ ...r, name: e.currentTarget.value })}
    />

    <!-- How it's portioned -->
    <section class="rounded-2xl border border-border bg-card p-3.5 dark:border-transparent">
      <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">How you portion it</p>
      <div class={segmentTrack} role="radiogroup" aria-label="How you portion it">
        <button type="button" role="radio" aria-checked={!byWeight} class={segment(!byWeight)} onclick={() => setMode("servings")}>Into servings</button>
        <button type="button" role="radio" aria-checked={byWeight} class={segment(byWeight)} onclick={() => setMode("weight")}>By cooked weight</button>
      </div>

      <label class="mt-3.5 flex items-center gap-2.5">
        <span class="flex-1">
          <span class="block font-medium">{byWeight ? "Usually split into" : "Makes"}</span>
          <span class="block text-xs text-muted-foreground">{byWeight ? "Boxes or plates, for a quick pick when logging" : "Equal servings"}</span>
        </span>
        <input class="h-11 w-16 rounded-xl bg-muted text-center font-semibold tabular-nums outline-none focus:ring-2 focus:ring-ring" inputmode="numeric" bind:value={servingsText} onchange={onServings} onblur={onServings} aria-label="Servings" />
      </label>

      <label class="mt-3 flex items-center gap-2.5">
        <CookingPot class="size-[22px] shrink-0 text-muted-foreground" />
        <span class="flex-1">
          <span class="block font-medium">Food in the pot {#if !byWeight}<span class="font-normal text-muted-foreground">(optional)</span>{/if}</span>
          <span class="block text-xs text-muted-foreground">Weigh after cooking, minus the pot</span>
        </span>
        <input class="h-11 w-24 rounded-xl bg-muted px-3 text-right font-semibold tabular-nums outline-none focus:ring-2 focus:ring-ring {byWeight && !r.cookedWeightG ? 'ring-2 ring-warning' : ''}" inputmode="decimal" bind:value={potText} oninput={onPot} aria-label="Cooked weight in grams" />
        <span class="text-muted-foreground">g</span>
      </label>

      <Separator class="my-3.5" />
      {#if r.ingredients.length === 0}
        <p class="text-sm text-muted-foreground">Add ingredients and the numbers show up here.</p>
      {:else if byWeight}
        {#if per100}
          <p class="flex items-baseline gap-2"><span class="text-[28px] font-bold tabular-nums">{fmtNum(per100.kcal)}</span><span class="text-[13px] text-muted-foreground">kcal per 100 g cooked</span></p>
          <p class="mt-1 flex gap-3.5 text-[13px] tabular-nums">
            <span class="text-macro-protein">P {Math.round(per100.proteinG * 10) / 10}</span>
            <span class="text-macro-carbs">C {Math.round(per100.carbsG * 10) / 10}</span>
            <span class="text-macro-fat">F {Math.round(per100.fatG * 10) / 10}</span>
          </p>
          {#if totals}
            <p class="mt-2 text-xs text-muted-foreground tabular-nums">
              Whole pot {fmtNum(totals.kcal)} kcal · P {fmtNum(totals.proteinG)} g. A {box} g box is {fmtNum((per100.kcal * box) / 100)} kcal, P {Math.round((per100.proteinG * box) / 100)}.
            </p>
          {/if}
        {:else}
          <p class="text-sm">Weigh the pot after cooking to log this by the gram.</p>
          {#if totals}<p class="mt-1 text-xs text-muted-foreground tabular-nums">Whole recipe {fmtNum(totals.kcal)} kcal · {macroLine(totals)}</p>{/if}
        {/if}
      {:else}
        <p class="flex items-baseline gap-2"><span class="text-[28px] font-bold tabular-nums">{fmtNum(r.perServing.kcal)}</span><span class="text-[13px] text-muted-foreground">kcal per serving{r.cookedWeightG ? ` (${fmtNum(r.cookedWeightG / r.servings)} g)` : ""}</span></p>
        <p class="mt-1 flex gap-3.5 text-[13px] tabular-nums">
          <span class="text-macro-protein">P {Math.round(r.perServing.proteinG)}</span>
          <span class="text-macro-carbs">C {Math.round(r.perServing.carbsG)}</span>
          <span class="text-macro-fat">F {Math.round(r.perServing.fatG)}</span>
        </p>
        {#if totals}<p class="mt-2 text-xs text-muted-foreground tabular-nums">Whole recipe {fmtNum(totals.kcal)} kcal · P {fmtNum(totals.proteinG)} g</p>{/if}
      {/if}
    </section>

    <!-- Ingredients -->
    <div class="mt-1 flex items-center justify-between">
      <span class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ingredients · {r.ingredients.length}</span>
      <button type="button" class="flex h-9 items-center gap-1.5 rounded-lg bg-muted px-2.5 text-[13px] font-medium" onclick={() => (pasting = true)}>
        <ClipboardPaste class="size-[15px]" />Paste a list
      </button>
    </div>
    <section class="overflow-hidden rounded-2xl border border-border bg-card dark:border-transparent">
      <ul>
        {#each r.ingredients as ing (ing.id)}
          <li class="border-t border-border first:border-t-0">
            <button type="button" class="flex min-h-[52px] w-full items-center gap-2.5 pl-2.5 pr-3.5 text-left" onclick={() => void openIngredient(ing)}>
              <span class="flex h-8 min-w-[74px] max-w-[45%] shrink-0 items-center justify-center truncate rounded-lg bg-muted px-2 text-[13px] font-semibold tabular-nums">{amountPill(ing)}</span>
              <span class="min-w-0 flex-1 truncate">{ing.name}</span>
              <span class="tabular-nums text-muted-foreground">{fmtNum(ing.computed.kcal)}</span>
            </button>
          </li>
        {/each}
      </ul>
      <button type="button" class="flex min-h-[52px] w-full items-center gap-2.5 px-4 font-medium {r.ingredients.length ? 'border-t border-border' : ''}" onclick={() => (picking = true)}>
        <Plus class="size-[18px]" />Add ingredient
      </button>
    </section>

    <section class="rounded-2xl border border-border bg-card px-3.5 py-3 dark:border-transparent">
      <label class="flex flex-col gap-1.5">
        <span class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Notes</span>
        <textarea
          rows="3"
          placeholder="Method, links, what to change next time"
          class="w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground/70"
          value={r.notes ?? ""}
          oninput={(e) => changed({ ...r, notes: e.currentTarget.value || undefined })}
        ></textarea>
      </label>
    </section>

    {#if stored && r.ingredients.length}
      <a href="/nutrition/log?pick={r.id}" class="flex h-13 items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground" onclick={() => void persist()}>
        Log a portion
      </a>
    {/if}
  </div>
{/if}

{#if picking}
  <IngredientPicker onpick={onPicked} onclose={() => (picking = false)} />
{/if}
{#if pasting}
  <PasteIngredients onadd={addPasted} onclose={() => (pasting = false)} />
{/if}
{#if sheet}
  {@const s = sheet}
  <AmountSheet
    food={s.food}
    subtitle={s.food.brand}
    initial={s.editing ? { amount: s.editing.amount, portionId: s.editing.portionId, grams: s.editing.grams } : undefined}
    meal={null}
    confirmText={() => (s.editing ? "Save" : "Add to recipe")}
    ondelete={s.editing ? () => removeIngredient(s.editing!) : null}
    onconfirm={confirmIngredient}
    onclose={() => (sheet = null)}
  />
{/if}
