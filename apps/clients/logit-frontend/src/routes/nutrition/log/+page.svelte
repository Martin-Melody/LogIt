<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { ArrowLeft, Search, Barcode, Plus, Star, ScanText } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import * as Tabs from "$lib/components/ui/tabs";
  import * as Select from "$lib/components/ui/select";
  import BarcodeScanner from "$lib/features/nutrition/BarcodeScanner.svelte";
  import { barcodeScanIsNative, scanBarcodeNative } from "$lib/features/nutrition/barcodeScan";
  import { toast } from "$lib/components/ui/sonner";
  import LabelScanner from "$lib/features/nutrition/LabelScanner.svelte";
  import { labelOcrAvailable, type LabelScanResult } from "$lib/features/nutrition/labelOcr";
  import {
    addDiaryItem,
    createCustomFood,
    createDiaryDay,
    createFavoriteFood,
    loggedItemFromFood,
    loggedItemFromRecent,
    mealTemplateToItems,
    mealTemplateTotals,
    recentFoodsFromDays,
    recipeAsFood,
    scaleMacros,
    roundMacros,
    localDateIso,
    MEAL_SLOTS,
    MEASURE_UNITS,
    isMeasureUnit,
    unitToGrams,
    type CustomFood,
    type FavoriteFood,
    type FoodRef,
    type MealSlot,
    type MealTemplate,
    type RecentFood,
  } from "@logit/core/domain/nutrition";
  import { getNutritionRepo, getFoodDbRepo } from "$lib/data/repoProvider";
  import { pushNutritionDay, pushFavorite, pushCustomFood } from "$lib/sync/syncService";
  import { fmtKcal } from "$lib/features/nutrition/nutrition";

  // No `meal` param → "browse" mode: search/inspect foods without committing to a meal yet
  // (reached from the "Foods" link). The meal to add to is then chosen with a picker.
  const mealParam = $page.url.searchParams.get("meal");
  const browse = mealParam === null;
  let meal = $state<MealSlot>((mealParam as MealSlot) ?? "breakfast");
  const dateIso = $page.url.searchParams.get("date") ?? localDateIso();

  const mealLabels: Record<MealSlot, string> = {
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snack: "Snacks",
  };

  const ui = $state({ query: "", searching: false, filter: "all" as "all" | "custom" | "recipes" });
  let tab = $state<"recent" | "favorites" | "custom" | "meals">("recent");
  let results = $state<FoodRef[]>([]);
  let recents = $state<RecentFood[]>([]);
  let favorites = $state<FavoriteFood[]>([]);
  let customFoods = $state<CustomFood[]>([]);
  let mealTemplates = $state<MealTemplate[]>([]);
  let selected = $state<FoodRef | null>(null);
  // portionId is a raw unit ("g" | "ml" | "oz") or a named serving id from the food;
  // amount is how many of those (grams / ml / oz, or a count of the serving).
  const pick = $state({ portionId: "g", amount: 100 });

  type PortionOption = { id: string; label: string; grams: number | null };

  const portionOptions = $derived.by<PortionOption[]>(() => {
    const units: PortionOption[] = MEASURE_UNITS.map((u) => ({ id: u, label: u, grams: null }));
    const named = (selected?.servings ?? [])
      .filter((s) => s.id !== "g" && s.grams > 0)
      .map((s) => ({ id: s.id, label: s.label, grams: s.grams }));
    return [...units, ...named];
  });

  const activePortion = $derived(
    portionOptions.find((o) => o.id === pick.portionId) ?? portionOptions[0],
  );

  function fmtAmount(n: number): string {
    return Number(n.toFixed(2)).toString();
  }

  function portionLabel(): string {
    const amt = Number(pick.amount) || 0;
    const o = activePortion;
    if (!o) return `${Math.round(grams)} g`;
    if (o.grams === null) return `${fmtAmount(amt)} ${o.label}`;
    const each = amt === 1 ? "" : `${fmtAmount(amt)} × `;
    return `${each}${o.label} (${Math.round(grams)} g)`;
  }

  const searching = $derived(ui.query.trim().length > 0);
  const favIds = $derived(new Set(favorites.map((f) => f.food.id)));

  // quick add
  const quick = $state({ name: "", kcal: "", protein: "", carbs: "", fat: "" });
  let showQuick = $state(false);
  let showScanner = $state(false);

  // label scan (barcode not found → read the nutrition panel from a photo)
  let showLabelScanner = $state(false);
  const ocrReady = labelOcrAvailable();
  let notFoundBarcode = $state<string | null>(null);
  const labelDraft = $state({
    open: false,
    name: "",
    brand: "",
    basis: "100g" as "100g" | "serving",
    servingG: "",
    kcal: "",
    protein: "",
    carbs: "",
    fat: "",
    warnings: [] as string[],
    raw: "",
    showRaw: false,
  });

  onMount(() => {
    void loadRecents();
    void loadFavorites();
    void loadCustomFoods();
    void loadTemplates();
  });

  async function loadTemplates() {
    mealTemplates = await getNutritionRepo().listMealTemplates();
  }

  async function loadCustomFoods() {
    customFoods = (await getNutritionRepo().listCustomFoods()).filter((c) => !c.deletedAtMs);
  }

  /** After logging: in browse mode stay put (keep adding); otherwise return to the diary. */
  function afterAdd() {
    if (browse) {
      toast(`Added to ${mealLabels[meal]}`);
      selected = null;
      ui.query = "";
      results = [];
      void loadRecents();
    } else {
      back("/nutrition");
    }
  }

  async function logTemplate(t: MealTemplate) {
    const repo = getNutritionRepo();
    let day = (await repo.getDay(dateIso)) ?? createDiaryDay(dateIso);
    for (const item of mealTemplateToItems(t, meal)) day = addDiaryItem(day, item);
    await repo.saveDay(day);
    pushNutritionDay(day);
    afterAdd();
  }

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
    notFoundBarcode = null;
    labelDraft.open = false;
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
    notFoundBarcode = null;
    try {
      // A custom food you saved from a label scan wins — it carries this barcode.
      const mine = (await getNutritionRepo().listCustomFoods()).find(
        (c) => c.food.barcode === code,
      );
      const food = mine?.food ?? (await getFoodDbRepo().getFoodByBarcode(code));
      results = food ? [food] : [];
      if (food) select(food);
      else notFoundBarcode = code;
    } finally {
      ui.searching = false;
    }
  }

  function onScanned(code: string) {
    showScanner = false;
    void lookupBarcode(code);
  }

  async function openScanner() {
    if (!barcodeScanIsNative()) {
      showScanner = true;
      return;
    }
    try {
      const code = await scanBarcodeNative();
      if (code) void lookupBarcode(code);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[barcode] native scan failed", e);
      toast(
        msg === "scanner-preparing"
          ? "Preparing the scanner — try again in a moment."
          : "Couldn't open the barcode scanner.",
      );
    }
  }

  function onLabelScanned(r: LabelScanResult) {
    showLabelScanner = false;
    const m = r.per100g ?? r.perServing;
    labelDraft.open = true;
    labelDraft.name = "";
    labelDraft.brand = "";
    labelDraft.basis = r.per100g ? "100g" : "serving";
    labelDraft.servingG = r.servingSizeG ? String(Math.round(r.servingSizeG)) : "";
    labelDraft.kcal = m?.kcal ? String(Math.round(m.kcal)) : "";
    labelDraft.protein = m ? String(round1(m.proteinG)) : "";
    labelDraft.carbs = m ? String(round1(m.carbsG)) : "";
    labelDraft.fat = m ? String(round1(m.fatG)) : "";
    labelDraft.warnings = r.warnings;
    labelDraft.raw = r.raw;
    labelDraft.showRaw = false;
  }

  function round1(n: number): number {
    return Math.round(n * 10) / 10;
  }

  /** Save the scanned label as a custom food (tagged with the barcode) and select it. */
  async function saveLabelFood() {
    const kcal = Number(labelDraft.kcal);
    if (!labelDraft.name.trim() || !Number.isFinite(kcal) || kcal <= 0) return;

    let per100g = {
      kcal,
      proteinG: Number(labelDraft.protein) || 0,
      carbsG: Number(labelDraft.carbs) || 0,
      fatG: Number(labelDraft.fat) || 0,
    };
    const servingG = Number(labelDraft.servingG);
    const hasServing = Number.isFinite(servingG) && servingG > 0;
    if (labelDraft.basis === "serving" && !hasServing) return; // need the serving size to rebase

    // If the label only gave per-serving numbers, rebase them to per 100 g.
    if (labelDraft.basis === "serving" && hasServing) {
      const f = 100 / servingG;
      per100g = {
        kcal: Math.round(per100g.kcal * f),
        proteinG: round1(per100g.proteinG * f),
        carbsG: round1(per100g.carbsG * f),
        fatG: round1(per100g.fatG * f),
      };
    }

    const servings = [{ id: "g", label: "100 g", grams: 100 }];
    if (hasServing) {
      servings.push({ id: "serving", label: `serving (${Math.round(servingG)} g)`, grams: servingG });
    }

    const custom = createCustomFood({
      name: labelDraft.name,
      brand: labelDraft.brand.trim() || undefined,
      barcode: notFoundBarcode ?? undefined,
      per100g,
      servings,
    });
    await getNutritionRepo().saveCustomFood(custom);
    pushCustomFood(custom);

    labelDraft.open = false;
    notFoundBarcode = null;
    results = [custom.food];
    select(custom.food);
  }

  function select(food: FoodRef) {
    selected = food;
    // Default to the food's first real named serving (amount 1); otherwise raw grams.
    const named = food.servings.find((s) => s.id !== "g" && s.grams > 0);
    if (named) {
      pick.portionId = named.id;
      pick.amount = 1;
    } else {
      pick.portionId = "g";
      pick.amount = 100;
    }
  }

  const grams = $derived.by(() => {
    const amt = Number(pick.amount) || 0;
    if (amt <= 0) return 0;
    const o = activePortion;
    if (!o) return 0;
    if (o.grams === null) {
      return isMeasureUnit(o.id) ? unitToGrams(amt, o.id) : amt;
    }
    return amt * o.grams;
  });
  const preview = $derived(selected ? roundMacros(scaleMacros(selected.per100g, grams)) : null);

  async function addSelected() {
    if (!selected || grams <= 0) return;
    const repo = getNutritionRepo();
    const existing = (await repo.getDay(dateIso)) ?? createDiaryDay(dateIso);
    const next = addDiaryItem(existing, loggedItemFromFood(selected, meal, grams, portionLabel()));
    await repo.saveDay(next);
    pushNutritionDay(next);
    afterAdd();
  }

  /** One-tap re-log of a recent food, same portion as last time. */
  async function logRecent(r: RecentFood) {
    const repo = getNutritionRepo();
    const existing = (await repo.getDay(dateIso)) ?? createDiaryDay(dateIso);
    const next = addDiaryItem(existing, loggedItemFromRecent(r, meal));
    await repo.saveDay(next);
    pushNutritionDay(next);
    afterAdd();
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
    afterAdd();
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
{#if showLabelScanner}
  <LabelScanner onResult={onLabelScanned} onClose={() => (showLabelScanner = false)} />
{/if}

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <button type="button" class="h-8 w-8 flex items-center justify-center" onclick={() => back("/nutrition")}>
      <ArrowLeft class="h-4 w-4" />
    </button>
    <h1 class="text-sm font-semibold">
      {#if browse}Foods{:else}Add to <span class="capitalize">{meal}</span>{/if}
    </h1>
    {#if browse}
      <a href="/nutrition/foods" class="ml-auto text-xs text-muted-foreground">Manage</a>
    {/if}
  </div>

  {#if browse}
    <div class="flex items-center justify-between px-3 py-2 border-b border-border">
      <span class="text-xs text-muted-foreground">Adding to</span>
      <Select.Root type="single" bind:value={meal}>
        <Select.Trigger class="w-36">{mealLabels[meal]}</Select.Trigger>
        <Select.Content>
          {#each MEAL_SLOTS as m (m)}
            <Select.Item value={m} label={mealLabels[m]} />
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
  {/if}

  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <Search class="h-4 w-4 text-muted-foreground shrink-0" />
    <input
      class="flex-1 bg-transparent text-sm outline-none py-1"
      placeholder="Search foods or paste a barcode"
      bind:value={ui.query}
      oninput={onInput}
    />
    <button type="button" class="h-7 w-7 flex items-center justify-center text-muted-foreground" onclick={openScanner} aria-label="Scan barcode">
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

  {#if notFoundBarcode && !labelDraft.open && !selected}
    <div class="px-3 py-3 border-b border-border flex flex-col gap-2 bg-muted/30">
      <p class="text-sm">
        No match for barcode <span class="tabular-nums font-medium">{notFoundBarcode}</span>.
      </p>
      {#if ocrReady}
        <button
          type="button"
          class="self-start rounded bg-primary text-primary-foreground text-sm px-3 py-1.5 flex items-center gap-1.5"
          onclick={() => (showLabelScanner = true)}
        >
          <ScanText class="h-4 w-4" /> Scan the nutrition label
        </button>
        <p class="text-[11px] text-muted-foreground">
          Reads the panel from a photo and saves it as a custom food tagged with this barcode,
          so the next scan finds it.
        </p>
      {:else}
        <p class="text-[11px] text-muted-foreground">Add it with Quick add, or create a custom food.</p>
      {/if}
    </div>
  {/if}

  {#if labelDraft.open}
    <div class="px-3 py-3 border-b border-border flex flex-col gap-2 bg-muted/30">
      <div class="flex items-center gap-1.5 text-sm font-medium">
        <ScanText class="h-4 w-4" /> From the label — check and save
        <button
          type="button"
          class="ml-auto text-xs text-primary font-normal"
          onclick={() => (showLabelScanner = true)}
        >
          Rescan
        </button>
      </div>
      <input class="w-full bg-muted rounded px-2 py-1.5 text-sm outline-none" placeholder="Name" bind:value={labelDraft.name} />
      <input class="w-full bg-muted rounded px-2 py-1.5 text-sm outline-none" placeholder="Brand (optional)" bind:value={labelDraft.brand} />
      <div class="grid grid-cols-4 gap-2">
        <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none tabular-nums" inputmode="decimal" placeholder="kcal" bind:value={labelDraft.kcal} />
        <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none tabular-nums" inputmode="decimal" placeholder="P" bind:value={labelDraft.protein} />
        <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none tabular-nums" inputmode="decimal" placeholder="C" bind:value={labelDraft.carbs} />
        <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none tabular-nums" inputmode="decimal" placeholder="F" bind:value={labelDraft.fat} />
      </div>
      <div class="flex items-center gap-2 text-xs flex-wrap">
        <span class="text-muted-foreground">Values per</span>
        <button type="button" class="px-2 py-0.5 rounded {labelDraft.basis === '100g' ? 'bg-primary text-primary-foreground' : 'bg-muted'}" onclick={() => (labelDraft.basis = '100g')}>100 g</button>
        <button type="button" class="px-2 py-0.5 rounded {labelDraft.basis === 'serving' ? 'bg-primary text-primary-foreground' : 'bg-muted'}" onclick={() => (labelDraft.basis = 'serving')}>serving</button>
        {#if labelDraft.basis === 'serving'}
          <input class="w-24 bg-muted rounded px-2 py-1 outline-none tabular-nums" inputmode="decimal" placeholder="g in a serving" bind:value={labelDraft.servingG} />
        {/if}
      </div>
      {#each labelDraft.warnings as w (w)}
        <p class="text-[11px] text-amber-600 dark:text-amber-500">{w}</p>
      {/each}
      {#if labelDraft.raw}
        <button type="button" class="self-start text-[11px] text-muted-foreground underline" onclick={() => (labelDraft.showRaw = !labelDraft.showRaw)}>
          {labelDraft.showRaw ? "Hide" : "Show"} what the scan read
        </button>
        {#if labelDraft.showRaw}
          <pre class="text-[10px] leading-tight bg-muted rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap">{labelDraft.raw}</pre>
        {/if}
      {/if}
      <div class="flex gap-2">
        <Button size="sm" onclick={() => void saveLabelFood()}>Save &amp; choose portion</Button>
        <Button size="sm" variant="ghost" onclick={() => (labelDraft.open = false)}>Cancel</Button>
      </div>
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
        <input
          class="w-24 bg-muted rounded px-2 py-1.5 text-sm outline-none tabular-nums"
          inputmode="decimal"
          aria-label="Amount"
          bind:value={pick.amount}
        />
        <Select.Root type="single" bind:value={pick.portionId}>
          <Select.Trigger class="flex-1">
            {activePortion?.label ?? "Unit"}
          </Select.Trigger>
          <Select.Content>
            {#each portionOptions as o (o.id)}
              <Select.Item value={o.id} label={o.label} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      {#if preview}
        <div class="text-xs text-muted-foreground tabular-nums">
          {fmtKcal(preview.kcal)} kcal · P {Math.round(preview.proteinG)} · C {Math.round(preview.carbsG)} · F {Math.round(preview.fatG)}
          {#if activePortion && activePortion.id !== "g"}<span class="opacity-70"> · {Math.round(grams)} g</span>{/if}
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
        <Tabs.Trigger value="recent">Recent</Tabs.Trigger>
        <Tabs.Trigger value="favorites">Favourites</Tabs.Trigger>
        <Tabs.Trigger value="custom">Custom</Tabs.Trigger>
        <Tabs.Trigger value="meals">Meals</Tabs.Trigger>
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

      <Tabs.Content value="custom">
        <div class="flex items-center justify-between px-3 py-1.5 text-xs">
          <span class="text-muted-foreground">Your custom foods</span>
          <a href="/nutrition/foods" class="text-primary">Add / edit</a>
        </div>
        {#if customFoods.length === 0}
          <p class="px-3 py-6 text-sm text-muted-foreground text-center">
            No custom foods yet. Add one from Manage, or scan a label.
          </p>
        {:else}
          <ul class="divide-y divide-border">
            {#each customFoods as c (c.food.id)}
              <li class="flex items-center">
                <button type="button" class="flex-1 min-w-0 text-left px-3 py-2 flex items-center gap-2" onclick={() => select(c.food)}>
                  <span class="flex-1 min-w-0">
                    <span class="block text-sm truncate">{c.food.name}</span>
                    {#if c.food.brand}<span class="block text-[11px] text-muted-foreground truncate">{c.food.brand}</span>{/if}
                  </span>
                  <span class="text-xs text-muted-foreground tabular-nums shrink-0">{fmtKcal(c.food.per100g.kcal)}/100g</span>
                </button>
                <button type="button" class="px-3 py-2 shrink-0" aria-label="Toggle favourite" onclick={() => void toggleFavorite(c.food)}>
                  <Star class="h-4 w-4 {favIds.has(c.food.id) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/50'}" />
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </Tabs.Content>

      <Tabs.Content value="meals">
        {#if mealTemplates.length === 0}
          <p class="px-3 py-6 text-sm text-muted-foreground text-center">
            Save a meal from the diary to reuse it here.
          </p>
        {:else}
          <ul class="divide-y divide-border">
            {#each mealTemplates as t (t.id)}
              {@const totals = mealTemplateTotals(t)}
              <li>
                <button type="button" class="w-full text-left px-3 py-2.5" onclick={() => void logTemplate(t)}>
                  <span class="block text-sm font-medium">{t.name}</span>
                  <span class="block text-[11px] text-muted-foreground">
                    {fmtKcal(totals.kcal)} kcal · P {Math.round(totals.proteinG)} ·
                    {t.items.length} item{t.items.length === 1 ? "" : "s"}
                  </span>
                  <span class="block text-[11px] text-muted-foreground truncate mt-0.5">
                    {t.items.map((i) => i.name).join(", ")}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </Tabs.Content>
    </Tabs.Root>
  {/if}
</div>
