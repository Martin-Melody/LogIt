<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { ArrowLeft, Plus, Trash2, Pencil, ScanText } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import {
    createCustomFood,
    createRecipe,
    gramServing,
    mealTemplateTotals,
    tombstoneMealTemplate,
    updateCustomFood,
    tombstoneCustomFood,
    type CustomFood,
    type MealTemplate,
    type Recipe,
  } from "@logit/core/domain/nutrition";
  import { getNutritionRepo } from "$lib/data/repoProvider";
  import { pushCustomFood, pushRecipe, pushMealTemplate } from "$lib/sync/syncService";
  import { fmtKcal } from "$lib/features/nutrition/nutrition";
  import LabelScanner from "$lib/features/nutrition/LabelScanner.svelte";
  import { labelOcrAvailable, type LabelScanResult } from "$lib/features/nutrition/labelOcr";

  const ui = $state({ loading: true, showNewFood: false });
  let foods = $state<CustomFood[]>([]);
  let recipes = $state<Recipe[]>([]);
  let mealTemplates = $state<MealTemplate[]>([]);
  let showLabelScanner = $state(false);
  const ocrReady = labelOcrAvailable();

  // ── New / edit custom food ──
  const draft = $state({ name: "", brand: "", kcal: "", protein: "", carbs: "", fat: "", serving: "" });
  let editingId = $state<string | null>(null);

  function round1(n: number): number {
    return Math.round(n * 10) / 10;
  }

  function resetDraft() {
    Object.assign(draft, { name: "", brand: "", kcal: "", protein: "", carbs: "", fat: "", serving: "" });
    editingId = null;
  }

  function startEdit(row: CustomFood) {
    const f = row.food;
    const named = f.servings.find((s) => s.id !== "g" && s.grams > 0);
    Object.assign(draft, {
      name: f.name,
      brand: f.brand ?? "",
      kcal: String(f.per100g.kcal),
      protein: String(f.per100g.proteinG),
      carbs: String(f.per100g.carbsG),
      fat: String(f.per100g.fatG),
      serving: named ? String(Math.round(named.grams)) : "",
    });
    editingId = f.id;
    ui.showNewFood = true;
  }

  function onLabelScanned(r: LabelScanResult) {
    showLabelScanner = false;
    ui.showNewFood = true;
    const m = r.per100g ?? r.perServing;
    if (r.per100g) {
      draft.serving = r.servingSizeG ? String(Math.round(r.servingSizeG)) : draft.serving;
    } else if (r.servingSizeG) {
      const f = 100 / r.servingSizeG;
      draft.kcal = m?.kcal ? String(Math.round(m.kcal * f)) : "";
      draft.protein = m ? String(round1(m.proteinG * f)) : "";
      draft.carbs = m ? String(round1(m.carbsG * f)) : "";
      draft.fat = m ? String(round1(m.fatG * f)) : "";
      draft.serving = String(Math.round(r.servingSizeG));
      return;
    }
    draft.kcal = m?.kcal ? String(Math.round(m.kcal)) : "";
    draft.protein = m ? String(round1(m.proteinG)) : "";
    draft.carbs = m ? String(round1(m.carbsG)) : "";
    draft.fat = m ? String(round1(m.fatG)) : "";
  }

  async function load() {
    const repo = getNutritionRepo();
    const [f, r, t] = await Promise.all([
      repo.listCustomFoods(),
      repo.listRecipes(),
      repo.listMealTemplates(),
    ]);
    foods = f.filter((x) => !x.deletedAtMs);
    recipes = r.filter((x) => !x.deletedAtMs);
    mealTemplates = t.filter((x) => !x.deletedAtMs);
    ui.loading = false;
    const editId = $page.url.searchParams.get("edit");
    if (editId) {
      const row = foods.find((x) => x.food.id === editId);
      if (row) startEdit(row);
    }
  }

  async function saveFood() {
    const kcal = Number(draft.kcal);
    if (!draft.name.trim() || !Number.isFinite(kcal) || kcal <= 0) return;
    const per100g = {
      kcal,
      proteinG: Number(draft.protein) || 0,
      carbsG: Number(draft.carbs) || 0,
      fatG: Number(draft.fat) || 0,
    };
    const servings = [gramServing()];
    const s = Number(draft.serving);
    if (Number.isFinite(s) && s > 0) servings.push({ id: "serving", label: `serving (${s} g)`, grams: s });

    const repo = getNutritionRepo();
    if (editingId) {
      const row = foods.find((f) => f.food.id === editingId);
      if (row) {
        const next = updateCustomFood(row, {
          name: draft.name,
          brand: draft.brand.trim() || null,
          per100g,
          servings,
        });
        await repo.saveCustomFood(next);
        pushCustomFood(next);
      }
    } else {
      const food = createCustomFood({
        name: draft.name,
        brand: draft.brand.trim() || undefined,
        per100g,
        servings,
      });
      await repo.saveCustomFood(food);
      pushCustomFood(food);
    }
    resetDraft();
    ui.showNewFood = false;
    await load();
  }

  async function deleteFood(id: string) {
    await getNutritionRepo().deleteCustomFood(id);
    const row = foods.find((f) => f.food.id === id);
    if (row) pushCustomFood(tombstoneCustomFood(row));
    if (editingId === id) resetDraft();
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

  async function renameTemplate(t: MealTemplate, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === t.name) return;
    const next = { ...t, name: trimmed, updatedAtMs: Date.now() };
    await getNutritionRepo().saveMealTemplate(next);
    pushMealTemplate(next);
    await load();
  }

  async function deleteTemplate(id: string) {
    await getNutritionRepo().deleteMealTemplate(id);
    const row = mealTemplates.find((t) => t.id === id);
    if (row) pushMealTemplate(tombstoneMealTemplate(row));
    await load();
  }

  onMount(() => void load());
</script>

{#if showLabelScanner}
  <LabelScanner onResult={onLabelScanned} onClose={() => (showLabelScanner = false)} />
{/if}

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <button type="button" class="h-8 w-8 flex items-center justify-center" onclick={() => back("/nutrition")}>
      <ArrowLeft class="h-4 w-4" />
    </button>
    <h1 class="text-sm font-semibold">Manage foods &amp; recipes</h1>
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
      {:else}
        <p class="px-3 pb-3 text-xs text-muted-foreground">
          A recipe is ingredients → servings, logged as one item.
        </p>
      {/if}
    </div>

    <!-- Meals (saved sets of foods) -->
    <div class="border-b border-border">
      <div class="flex items-center justify-between px-3 py-2">
        <span class="text-xs font-semibold">Meals</span>
      </div>
      {#if mealTemplates.length > 0}
        <ul class="divide-y divide-border">
          {#each mealTemplates as t (t.id)}
            {@const totals = mealTemplateTotals(t)}
            <li class="flex items-center gap-2 px-3 py-2 text-sm">
              <input
                class="flex-1 min-w-0 bg-transparent outline-none focus:bg-muted rounded px-1 py-0.5"
                value={t.name}
                onblur={(e) => void renameTemplate(t, e.currentTarget.value)}
              />
              <span class="text-[11px] text-muted-foreground tabular-nums shrink-0">
                {fmtKcal(totals.kcal)} kcal · {t.items.length} item{t.items.length === 1 ? "" : "s"}
              </span>
              <button type="button" class="h-6 w-6 flex items-center justify-center text-muted-foreground" onclick={() => void deleteTemplate(t.id)} aria-label="Delete">
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="px-3 pb-3 text-xs text-muted-foreground">
          Bookmark a meal on the diary screen to save it here.
        </p>
      {/if}
    </div>

    <!-- Custom foods -->
    <div>
      <div class="flex items-center justify-between px-3 py-2">
        <span class="text-xs font-semibold">Custom foods</span>
        <button
          type="button"
          class="text-xs text-primary flex items-center gap-1"
          onclick={() => {
            if (ui.showNewFood) {
              ui.showNewFood = false;
              resetDraft();
            } else {
              resetDraft();
              ui.showNewFood = true;
            }
          }}
        >
          <Plus class="h-3.5 w-3.5" /> New
        </button>
      </div>

      {#if ui.showNewFood}
        <div class="px-3 py-3 border-y border-border flex flex-col gap-2 bg-muted/30">
          <span class="text-[11px] font-medium text-muted-foreground">
            {editingId ? "Edit custom food" : "New custom food"}
          </span>
          {#if ocrReady}
            <button
              type="button"
              class="self-start rounded border border-border text-sm px-3 py-1.5 flex items-center gap-1.5"
              onclick={() => (showLabelScanner = true)}
            >
              <ScanText class="h-4 w-4" /> Scan nutrition label
            </button>
          {/if}
          <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" placeholder="Name" bind:value={draft.name} />
          <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" placeholder="Brand (optional)" bind:value={draft.brand} />
          <div class="grid grid-cols-4 gap-2">
            <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="decimal" placeholder="kcal" bind:value={draft.kcal} />
            <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="decimal" placeholder="P" bind:value={draft.protein} />
            <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="decimal" placeholder="C" bind:value={draft.carbs} />
            <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="decimal" placeholder="F" bind:value={draft.fat} />
          </div>
          <p class="text-[11px] text-muted-foreground">Values per 100 g.</p>
          <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="numeric" placeholder="Serving size in grams (optional)" bind:value={draft.serving} />
          {#if editingId}
            <p class="text-[11px] text-muted-foreground">
              Entries you already logged from this food keep their saved values.
            </p>
          {/if}
          <div class="flex gap-2">
            <Button size="sm" onclick={() => void saveFood()}>{editingId ? "Save changes" : "Save food"}</Button>
            <Button size="sm" variant="ghost" onclick={() => { ui.showNewFood = false; resetDraft(); }}>Cancel</Button>
          </div>
        </div>
      {/if}

      {#if foods.length > 0}
        <ul class="divide-y divide-border">
          {#each foods as f (f.food.id)}
            <li class="flex items-center gap-2 px-3 py-2 text-sm">
              <a href="/nutrition/food/{f.food.id}" class="flex-1 min-w-0 truncate">{f.food.name}</a>
              <span class="text-xs text-muted-foreground tabular-nums">{fmtKcal(f.food.per100g.kcal)}/100g</span>
              <button type="button" class="h-6 w-6 flex items-center justify-center text-muted-foreground" onclick={() => startEdit(f)} aria-label="Edit">
                <Pencil class="h-3.5 w-3.5" />
              </button>
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
