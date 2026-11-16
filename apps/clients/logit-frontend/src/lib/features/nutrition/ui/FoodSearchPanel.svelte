<script lang="ts">
  import { onMount } from "svelte";
  import { log } from "@logit/core/platform/log";
  import { LoaderCircle, ScanBarcode, ScanText, Search, X, Zap } from "lucide-svelte";
  import {
    localDateIso,
    loggedItemPer100g,
    mealTemplateTotals,
    recentFoodsFromDays,
    usualAtMeal,
    type CustomFood,
    type FavoriteFood,
    type FoodRef,
    type MealSlot,
    type MealTemplate,
    type RecentFood,
  } from "@logit/core/domain/nutrition";
  import { getNutritionRepo, getFoodDbRepo } from "$lib/data/repoProvider";
  import { toast } from "$lib/components/ui/sonner";
  import BarcodeScanner from "../BarcodeScanner.svelte";
  import { barcodeScanIsNative, scanBarcodeNative } from "../barcodeScan";
  import { labelOcrAvailable } from "../labelOcr";
  import { rowPortion } from "../portion";
  import {
    findByBarcode,
    loadMyFoods,
    looksLikeBarcode,
    recipeFound,
    SNAPSHOT_PREFIX,
    searchFoods,
    type FoodFilter,
    type FoodSearchResult,
    type FoundFood,
    type MyFoods,
  } from "../foodFinder";
  import FoodRow from "./FoodRow.svelte";
  import FoodEditor from "./FoodEditor.svelte";
  import { MEAL_LABELS, fmtNum } from "./meals";
  import { chip, cn } from "./style";

  // Search for a food, the same way everywhere: type (forgiving search), scan a barcode,
  // scan a label, or pick from recents / favourites / your own foods. Picking hands the
  // food to the page, which opens the amount sheet.
  //
  // mode "log": logging to the diary (quick add, saved meals, one-tap "+").
  // mode "ingredient": adding to a recipe (your foods and the database only).
  // mode "lookup": just looking a food up (macros, favourite); foods and recipes, no meals.
  export type Picked = {
    food: FoodRef;
    kind: FoundFood["kind"];
    realGrams?: boolean;
    /** Where the amount should start (a recent's last portion). */
    initial?: { amount?: number; portionId?: string; grams?: number };
  };

  interface Props {
    mode: "log" | "ingredient" | "lookup";
    /** The meal being logged to, for "Usually at lunch". */
    meal?: MealSlot | null;
    onpick: (p: Picked) => void;
    /** One-tap "+" on a recent (same portion as last time). Log mode only. */
    onaddrecent?: ((r: RecentFood) => void) | null;
    /** One-tap "+" on a search result / favourite (its default serving). */
    onaddfood?: ((p: Picked) => void) | null;
    onmeal?: ((t: MealTemplate) => void) | null;
    onquickadd?: (() => void) | null;
    /** Ids/keys added during this visit, shown with a tick. */
    added?: Set<string>;
    autofocus?: boolean;
  }
  const {
    mode,
    meal = null,
    onpick,
    onaddrecent = null,
    onaddfood = null,
    onmeal = null,
    onquickadd = null,
    added = new Set<string>(),
    autofocus = false,
  }: Props = $props();

  type Tab = "recent" | "favourites" | "mine" | "meals";
  let tab = $state<Tab>("recent");
  let query = $state("");
  let filter = $state<FoodFilter>("all");
  let busy = $state(false);
  let result = $state<FoodSearchResult | null>(null);
  let onlineAsked = $state(false);

  let recents = $state<RecentFood[]>([]);
  let usual = $state<Set<string>>(new Set());
  let favourites = $state<FavoriteFood[]>([]);
  let mine = $state<MyFoods>({ custom: [], recipes: [], meals: [] });

  let showWebScanner = $state(false);
  let editor = $state<null | { name?: string; barcode?: string; missing?: boolean; label?: boolean }>(null);
  const ocrReady = labelOcrAvailable();
  let input = $state<HTMLInputElement | null>(null);

  onMount(() => {
    void loadLists();
    if (autofocus) setTimeout(() => input?.focus(), 50);
  });

  async function loadLists() {
    const repo = getNutritionRepo();
    const end = localDateIso();
    const start = localDateIso(new Date(Date.now() - 45 * 86_400_000));
    const [days, favs, my] = await Promise.all([
      repo.listDaysInRange(start, end).catch(() => []),
      repo.listFavorites().catch(() => []),
      loadMyFoods(),
    ]);
    let rec = recentFoodsFromDays(days, 60);
    if (mode === "ingredient") rec = rec.filter((r) => r.sourceId && r.sourceKind !== "recipe" && r.grams > 0);
    recents = rec;
    usual = meal ? usualAtMeal(days, meal) : new Set();
    favourites = favs.filter((f) => !f.deletedAtMs);
    mine = my;
  }

  const searching = $derived(query.trim().length > 0);
  const usualRecents = $derived(recents.filter((r) => usual.has(r.key)));
  const otherRecents = $derived(recents.filter((r) => !usual.has(r.key)));

  // ── Search ──
  let timer: ReturnType<typeof setTimeout>;
  let seq = 0;
  function oninput() {
    clearTimeout(timer);
    onlineAsked = false;
    timer = setTimeout(() => void run(), 200);
  }

  async function run(online = false) {
    const q = query.trim();
    const my = ++seq;
    if (!q) {
      result = null;
      return;
    }
    if (looksLikeBarcode(q)) {
      await lookup(q);
      return;
    }
    busy = true;
    try {
      const r = await searchFoods(q, {
        filter,
        includeRecipes: mode !== "ingredient",
        includeMeals: mode === "log",
        online,
        mine,
      });
      if (my === seq) result = r;
    } finally {
      if (my === seq) busy = false;
    }
  }

  function setFilter(f: FoodFilter) {
    filter = f;
    void run(onlineAsked);
  }

  function askOnline() {
    onlineAsked = true;
    void run(true);
  }

  // ── Barcode ──
  async function scan() {
    if (!barcodeScanIsNative()) {
      showWebScanner = true;
      return;
    }
    try {
      const code = await scanBarcodeNative();
      if (code) await lookup(code);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn("scanner", "Native barcode scan failed", e);
      toast(msg === "scanner-preparing" ? "Preparing the scanner, try again in a moment." : "Couldn't open the barcode scanner.");
    }
  }

  async function lookup(code: string) {
    busy = true;
    try {
      const food = await findByBarcode(code);
      if (food) {
        query = "";
        result = null;
        onpick({ food, kind: food.source === "custom" ? "custom" : food.source === "off" ? "packaged" : "generic" });
      } else {
        editor = { barcode: code.replace(/\D/g, ""), missing: true, label: true };
      }
    } finally {
      busy = false;
    }
  }

  function onEditorSave(c: CustomFood) {
    editor = null;
    query = "";
    result = null;
    void loadLists();
    onpick({ food: c.food, kind: "custom" });
  }

  // ── Rows ──
  function foodDetail(f: FoodRef, kind: FoundFood["kind"]): string {
    const p = rowPortion(f);
    const kcal = (f.per100g.kcal * p.grams) / 100;
    const prot = (f.per100g.proteinG * p.grams) / 100;
    const brand = kind === "packaged" || kind === "custom" ? (f.brand ? `${f.brand} · ` : "") : "";
    return `${brand}${p.label} · ${fmtNum(kcal)} kcal · P ${Math.round(prot)}`;
  }

  function recentDetail(r: RecentFood): string {
    return `${r.servingLabel ?? `${Math.round(r.grams)} g`} · ${fmtNum(r.computed.kcal)} kcal · P ${Math.round(r.computed.proteinG)}`;
  }

  async function openRecent(r: RecentFood) {
    const { resolveFoodRef } = await import("../resolveFood");
    const food = r.sourceId ? await resolveFoodRef(r.sourceId) : null;
    if (!food) {
      // No source food (a quick add, or the food was deleted): rescale from what was
      // logged, when it had a weight.
      const per100 = loggedItemPer100g(r);
      if (!per100) {
        onquickadd?.();
        return;
      }
      onpick({
        food: { id: `${SNAPSHOT_PREFIX}${r.key}`, source: "custom", name: r.name, brand: r.brand, per100g: per100, servings: [] },
        kind: "custom",
        initial: { amount: r.amount, portionId: r.portionId, grams: r.grams },
      });
      return;
    }
    const recipe = r.sourceKind === "recipe" ? mine.recipes.find((x) => x.id === r.sourceId) : undefined;
    onpick({
      food,
      kind: recipe ? "recipe" : food.source === "custom" ? "custom" : food.source === "off" ? "packaged" : "generic",
      realGrams: recipe ? recipeFound(recipe).realGrams : true,
      initial: { amount: r.amount, portionId: r.portionId, grams: r.grams },
    });
  }

  function pickFound(f: FoundFood) {
    onpick({ food: f.food, kind: f.kind, realGrams: f.realGrams });
  }

  const TAG: Record<FoundFood["kind"], string | undefined> = {
    custom: "MY FOOD",
    recipe: "RECIPE",
    generic: undefined,
    packaged: undefined,
  };

  const tabs = $derived<[Tab, string][]>(
    mode === "log"
      ? [["recent", "Recent"], ["favourites", "Favourites"], ["mine", "My foods"], ["meals", "Meals"]]
      : [["recent", "Recent"], ["favourites", "Favourites"], ["mine", "My foods"]],
  );
  const myFoundList = $derived<FoundFood[]>([
    ...(mode !== "ingredient" ? mine.recipes.map(recipeFound) : []),
    ...mine.custom.map((c): FoundFood => ({ food: c.food, kind: "custom" })),
  ]);
</script>

{#if showWebScanner}
  <BarcodeScanner
    onResult={(c: string) => {
      showWebScanner = false;
      void lookup(c);
    }}
    onClose={() => (showWebScanner = false)}
  />
{/if}
{#if editor}
  <FoodEditor
    name={editor.name}
    barcode={editor.barcode}
    fromMissingBarcode={editor.missing}
    startWithLabelScan={editor.label}
    onsave={onEditorSave}
    onclose={() => (editor = null)}
  />
{/if}

<div class="flex flex-col">
  <!-- Search: the barcode button is always here -->
  <div class="sticky top-0 z-10 bg-background px-3 pt-2 pb-0.5">
    <label class="flex h-12 items-center gap-2.5 rounded-xl bg-muted pl-3.5 pr-1 focus-within:ring-2 focus-within:ring-ring">
      <Search class="size-[18px] shrink-0 text-muted-foreground" />
      <input
        bind:this={input}
        bind:value={query}
        {oninput}
        type="search"
        enterkeyhint="search"
        autocomplete="off"
        placeholder={mode === "log" ? "Search foods, recipes, meals" : mode === "lookup" ? "Search or scan a food" : "Search for an ingredient"}
        class="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none [&::-webkit-search-cancel-button]:hidden"
        aria-label="Search foods"
      />
      {#if busy}<LoaderCircle class="size-4 shrink-0 animate-spin text-muted-foreground" />{/if}
      {#if query}
        <button type="button" class="flex size-10 shrink-0 items-center justify-center text-muted-foreground" aria-label="Clear search" onclick={() => { query = ""; result = null; input?.focus(); }}>
          <X class="size-[18px]" />
        </button>
      {/if}
      <button type="button" class="flex size-10 shrink-0 items-center justify-center rounded-lg text-foreground" aria-label="Scan barcode" onclick={() => void scan()}>
        <ScanBarcode class="size-5" />
      </button>
    </label>
  </div>

  {#if !searching}
    <!-- Other ways in -->
    <div class="flex gap-2 px-3 pt-2.5">
      <button type="button" class="flex h-[68px] flex-1 flex-col items-center justify-center gap-1.5 rounded-xl bg-muted/70 text-xs font-medium" onclick={() => void scan()}>
        <ScanBarcode class="size-[22px]" />Barcode
      </button>
      {#if ocrReady}
        <button type="button" class="flex h-[68px] flex-1 flex-col items-center justify-center gap-1.5 rounded-xl bg-muted/70 text-xs font-medium" onclick={() => (editor = { label: true })}>
          <ScanText class="size-[22px]" />Label
        </button>
      {/if}
      {#if onquickadd}
        <button type="button" class="flex h-[68px] flex-1 flex-col items-center justify-center gap-1.5 rounded-xl bg-muted/70 text-xs font-medium" onclick={onquickadd}>
          <Zap class="size-[22px]" />Quick add
        </button>
      {/if}
    </div>

    <div class="flex gap-1 overflow-x-auto px-3 pt-3 pb-1.5" role="tablist">
      {#each tabs as [id, label] (id)}
        <button
          type="button"
          role="tab"
          aria-selected={tab === id}
          class={cn("h-10 shrink-0 rounded-full px-3 text-[13px] font-medium", tab === id ? "bg-foreground text-background" : "text-muted-foreground")}
          onclick={() => (tab = id)}
        >{label}</button>
      {/each}
    </div>

    <div>
      {#if tab === "recent"}
        {#if recents.length === 0}
          <p class="px-4 py-8 text-center text-sm text-muted-foreground">Nothing logged yet. Search or scan to add your first food.</p>
        {:else}
          {#if usualRecents.length && meal}
            <p class="px-4 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Usually at {MEAL_LABELS[meal].toLowerCase()}</p>
            <ul>
              {#each usualRecents as r (r.key)}
                <FoodRow name={r.name} detail={recentDetail(r)} onopen={() => void openRecent(r)} onadd={onaddrecent ? () => onaddrecent(r) : null} added={added.has(r.key)} />
              {/each}
            </ul>
            <p class="px-4 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Other recents</p>
          {/if}
          <ul>
            {#each otherRecents as r (r.key)}
              <FoodRow name={r.name} detail={recentDetail(r)} onopen={() => void openRecent(r)} onadd={onaddrecent ? () => onaddrecent(r) : null} added={added.has(r.key)} />
            {/each}
          </ul>
        {/if}
      {:else if tab === "favourites"}
        {#if favourites.length === 0}
          <p class="px-4 py-8 text-center text-sm text-muted-foreground">Tap the star on any food to keep it here.</p>
        {:else}
          <ul>
            {#each favourites as f (f.food.id)}
              {@const kind = f.food.source === "custom" ? "custom" : f.food.source === "off" ? "packaged" : "generic"}
              <FoodRow
                name={f.food.name}
                detail={foodDetail(f.food, kind)}
                onopen={() => onpick({ food: f.food, kind })}
                onadd={onaddfood ? () => onaddfood({ food: f.food, kind }) : null}
                added={added.has(f.food.id)}
              />
            {/each}
          </ul>
        {/if}
      {:else if tab === "mine"}
        {#if myFoundList.length === 0}
          <p class="px-4 py-8 text-center text-sm text-muted-foreground">Foods and recipes you make show up here.</p>
        {:else}
          <ul>
            {#each myFoundList as f (f.food.id)}
              <FoodRow
                name={f.food.name}
                tag={TAG[f.kind]}
                detail={foodDetail(f.food, f.kind)}
                onopen={() => pickFound(f)}
                onadd={onaddfood ? () => onaddfood({ food: f.food, kind: f.kind, realGrams: f.realGrams }) : null}
                added={added.has(f.food.id)}
              />
            {/each}
          </ul>
        {/if}
        <div class="px-4 pt-3">
          <button type="button" class={chip(false)} onclick={() => (editor = {})}>New food</button>
        </div>
      {:else if tab === "meals"}
        {#if mine.meals.length === 0}
          <p class="px-4 py-8 text-center text-sm text-muted-foreground">Save a meal from the diary's meal menu to log it again in one tap.</p>
        {:else}
          <ul>
            {#each mine.meals as t (t.id)}
              {@const tot = mealTemplateTotals(t)}
              <FoodRow
                name={t.name}
                detail={`${t.items.length} item${t.items.length === 1 ? "" : "s"} · ${fmtNum(tot.kcal)} kcal · P ${Math.round(tot.proteinG)}`}
                onopen={() => onmeal?.(t)}
                onadd={onmeal ? () => onmeal(t) : null}
                added={added.has(t.id)}
              />
            {/each}
          </ul>
        {/if}
      {/if}
    </div>
  {:else}
    <div class="flex gap-1.5 overflow-x-auto px-3 pt-2.5 pb-1" role="group" aria-label="Show">
      {#each [["all", "All"], ["mine", "Mine"], ["generic", "Whole foods"], ["packaged", "Packaged"]] as [id, label] (id)}
        <button type="button" class={chip(filter === id)} aria-pressed={filter === id} onclick={() => setFilter(id as FoodFilter)}>{label}</button>
      {/each}
    </div>

    <div aria-live="polite">
      {#if result}
        {@const empty = !result.mine.length && !result.meals.length && !result.generic.length && !result.packaged.length}
        {#if result.mine.length || result.meals.length}
          <p class="px-4 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Yours</p>
          <ul>
            {#each result.meals as t (t.id)}
              {@const tot = mealTemplateTotals(t)}
              <FoodRow name={t.name} tag="MEAL" detail={`${t.items.length} items · ${fmtNum(tot.kcal)} kcal · P ${Math.round(tot.proteinG)}`} onopen={() => onmeal?.(t)} onadd={onmeal ? () => onmeal(t) : null} added={added.has(t.id)} />
            {/each}
            {#each result.mine as f (f.food.id)}
              <FoodRow name={f.food.name} tag={TAG[f.kind]} detail={foodDetail(f.food, f.kind)} onopen={() => pickFound(f)} onadd={onaddfood ? () => onaddfood(f) : null} added={added.has(f.food.id)} />
            {/each}
          </ul>
        {/if}
        {#if result.generic.length}
          <p class="px-4 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Whole foods</p>
          <ul>
            {#each result.generic as f (f.food.id)}
              <FoodRow name={f.food.name} detail={foodDetail(f.food, f.kind)} onopen={() => pickFound(f)} onadd={onaddfood ? () => onaddfood(f) : null} added={added.has(f.food.id)} />
            {/each}
          </ul>
        {/if}
        {#if result.packaged.length}
          <p class="px-4 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Packaged</p>
          <ul>
            {#each result.packaged as f (f.food.id)}
              <FoodRow name={f.food.name} detail={foodDetail(f.food, f.kind)} onopen={() => pickFound(f)} onadd={onaddfood ? () => onaddfood(f) : null} added={added.has(f.food.id)} />
            {/each}
          </ul>
        {/if}
        {#if empty && !busy}
          <p class="px-4 pt-6 text-center text-sm text-muted-foreground">Nothing matches "{query.trim()}".</p>
        {/if}
        {#if result.canAskOnline && !busy}
          <div class="px-4 pt-3">
            <button type="button" class={chip(false)} onclick={askOnline}>
              {getFoodDbRepo().isOfflineAvailable() ? "Search online for more products" : "Search online again"}
            </button>
          </div>
        {/if}
      {/if}
      <div class="mt-4 flex items-center gap-2 border-t border-border px-3 pt-3">
        <span class="flex-1 text-[13px] text-muted-foreground">Not here?</span>
        <button type="button" class="h-10 rounded-lg bg-muted px-3 text-[13px] font-medium" onclick={() => (editor = { name: query.trim() })}>Create food</button>
        {#if onquickadd}
          <button type="button" class="h-10 rounded-lg bg-muted px-3 text-[13px] font-medium" onclick={onquickadd}>Quick add</button>
        {/if}
      </div>
    </div>
  {/if}
</div>
