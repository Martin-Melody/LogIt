<!-- Canvas MP4: add to a meal. Foods (the same search as the diary), your recipes, and recipe packs
     (when there are some). Pick one, set the amount, and add swaps for it. Also picks one swap
     for a food already in the meal. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { Button } from "$lib/components/ui/button";
  import { getWebFoodDbRepo } from "$lib/deps";
  import { plannedFoodFromRecipe, type PlannedFood } from "@logit/core/domain/CoachNutritionPlan";
  import { DIET_TAG_LABELS, roundMacros, scaleMacros, type DietTag, type Recipe } from "@logit/core/domain/nutrition";
  import { scaleNutrients } from "@logit/core/domain/nutrients";

  type NewFood = Omit<PlannedFood, "id">;
  let { open = $bindable(false), title, recipes, planTags, swapOnly = false, onadd }: {
    open?: boolean;
    /** "Add to Lunch", "A swap for Salmon fillet". */
    title: string;
    recipes: Recipe[];
    planTags: DietTag[];
    /** Picking a swap: one item, no swaps of its own. */
    swapOnly?: boolean;
    onadd: (food: NewFood, swaps: NewFood[]) => void;
  } = $props();

  type Food = Awaited<ReturnType<ReturnType<typeof getWebFoodDbRepo>["searchFoods"]>>[number];
  type Item = { kind: "food"; food: Food } | { kind: "recipe"; recipe: Recipe };
  let source = $state<"all" | "foods" | "recipes" | "packs">("all");
  let query = $state("");
  let foods = $state<Food[]>([]);
  let searching = $state(false);
  let tagFilter = $state<DietTag[]>([]);
  let picked = $state<Item | null>(null);
  let grams = $state(100);
  let servings = $state(1);
  let swaps = $state<NewFood[]>([]);
  /** Picking a swap for the picked item, inside this dialog. */
  let pickingSwap = $state(false);

  $effect(() => {
    if (!open) return;
    query = "";
    foods = [];
    picked = null;
    swaps = [];
    pickingSwap = false;
    tagFilter = [...planTags];
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  function onQuery() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = query.trim();
      if (!q || source === "recipes" || source === "packs") return void (foods = []);
      searching = true;
      const res = await getWebFoodDbRepo().searchFoods(q, { limit: 12 }).catch(() => []);
      if (q === query.trim()) foods = res;
      searching = false;
    }, 300);
  }
  const shownRecipes = $derived(
    source === "foods" || source === "packs" ? [] : recipes.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()) && tagFilter.every((t) => (r.tags ?? []).includes(t))).slice(0, 8),
  );
  const shownFoods = $derived(source === "recipes" || source === "packs" ? [] : foods);

  function asNew(item: Item): NewFood {
    if (item.kind === "recipe") return plannedFoodFromRecipe(item.recipe, servings);
    const f = item.food;
    return { name: f.name, ...(f.brand ? { brand: f.brand } : {}), grams, computed: roundMacros(scaleMacros(f.per100g, grams)), ...(f.nutrients ? { nutrients: scaleNutrients(f.nutrients, grams) } : {}) };
  }
  function choose(item: Item) {
    if (pickingSwap) {
      // A swap is the same amount of food by calories, roughly: start at the picked item's amount.
      swaps = [...swaps, item.kind === "recipe" ? plannedFoodFromRecipe(item.recipe, 1) : { name: item.food.name, ...(item.food.brand ? { brand: item.food.brand } : {}), grams: 100, computed: roundMacros(scaleMacros(item.food.per100g, 100)) }];
      pickingSwap = false;
      query = "";
      foods = [];
      return;
    }
    picked = item;
    grams = 100;
    servings = 1;
    query = "";
    foods = [];
  }
  const preview = $derived(picked ? asNew(picked) : null);
  function add() {
    if (!picked) return;
    onadd(asNew(picked), swaps);
    open = false;
  }
</script>

{#snippet results()}
  <div class="flex flex-col gap-2">
    <input bind:value={query} oninput={onQuery} placeholder={pickingSwap ? "Search for a swap" : "Search foods and your recipes"} aria-label="Search" class="h-9 rounded-[9px] border border-input bg-background px-3 text-[13px]" />
    <div class="flex flex-wrap items-center gap-2">
      <Tabs.Root value={source} onValueChange={(v) => { source = v as typeof source; onQuery(); }}>
        <Tabs.List aria-label="Where from">
          <Tabs.Trigger value="all">All</Tabs.Trigger>
          <Tabs.Trigger value="foods">Foods</Tabs.Trigger>
          <Tabs.Trigger value="recipes">Your recipes</Tabs.Trigger>
          <Tabs.Trigger value="packs">Recipe packs</Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>
      {#each planTags as t (t)}
        {@const on = tagFilter.includes(t)}
        <Button size="sm" variant={on ? "default" : "outline"} aria-pressed={on} onclick={() => (tagFilter = on ? tagFilter.filter((x) => x !== t) : [...tagFilter, t])}>{DIET_TAG_LABELS[t]}</Button>
      {/each}
    </div>
    {#if planTags.length}<p class="text-xs text-muted-foreground">From the plan's tags; they filter your recipes (foods don't carry tags).</p>{/if}
    <ul class="flex max-h-72 flex-col overflow-y-auto" aria-label="Results">
      {#each shownRecipes as r (r.id)}
        <li><button type="button" class="flex w-full items-center justify-between gap-3 rounded-[8px] px-2.5 py-2 text-left text-[13px] hover:bg-muted" onclick={() => choose({ kind: "recipe", recipe: r })}>
          <span class="flex items-center gap-2"><span class="font-medium">{r.name}</span><span class="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">Your recipe</span></span>
          <span class="shrink-0 text-xs text-muted-foreground">{Math.round(r.perServing.kcal)} kcal / serving</span>
        </button></li>
      {/each}
      {#each shownFoods as f (f.id)}
        <li><button type="button" class="flex w-full items-center justify-between gap-3 rounded-[8px] px-2.5 py-2 text-left text-[13px] hover:bg-muted" onclick={() => choose({ kind: "food", food: f })}>
          <span class="truncate">{f.name}{#if f.brand}<span class="text-muted-foreground"> · {f.brand}</span>{/if}</span>
          <span class="shrink-0 text-xs text-muted-foreground">{Math.round(f.per100g.kcal)} kcal / 100 g</span>
        </button></li>
      {/each}
      {#if source === "packs"}
        <li class="px-2.5 py-3 text-[13px] text-muted-foreground">Recipe packs from the community show here once there are some. They're data, so clients don't have to allow anything.</li>
      {:else if searching}
        <li class="px-2.5 py-2 text-xs text-muted-foreground">Searching…</li>
      {:else if query.trim() && !shownRecipes.length && !shownFoods.length}
        <li class="px-2.5 py-2 text-xs text-muted-foreground">Nothing found.</li>
      {/if}
    </ul>
  </div>
{/snippet}

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
    </Dialog.Header>
    {#if !picked || pickingSwap}
      {@render results()}
      {#if pickingSwap}<Button variant="ghost" size="sm" class="self-start" onclick={() => (pickingSwap = false)}>Back</Button>{/if}
    {:else if preview}
      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2 rounded-[10px] bg-muted px-3.5 py-2.5 text-[13px]">
          <span class="font-medium">{preview.name}{#if picked.kind === "recipe"}<span class="ml-2 rounded-md bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">Your recipe</span>{/if}</span>
          <Button variant="ghost" size="sm" onclick={() => (picked = null)}>Change</Button>
        </div>
        <div class="flex items-center gap-3 text-[13px]">
          <span class="font-medium">Amount</span>
          {#if picked.kind === "recipe"}
            <Button variant="outline" size="icon" class="size-8" aria-label="Half a serving less" disabled={servings <= 0.5} onclick={() => (servings -= 0.5)}>−</Button>
            <span class="w-20 text-center tabular-nums">{servings} {servings === 1 ? "serving" : "servings"}</span>
            <Button variant="outline" size="icon" class="size-8" aria-label="Half a serving more" onclick={() => (servings += 0.5)}>+</Button>
          {:else}
            <input class="h-8 w-20 rounded-[7px] border border-input bg-background px-2" inputmode="decimal" aria-label="Grams" value={grams} onchange={(e) => { const g = Number(e.currentTarget.value.replace(",", ".")); if (g > 0) grams = Math.round(g); }} /><span class="text-xs text-muted-foreground">g</span>
          {/if}
        </div>
        <p class="text-[13px] tabular-nums">{Math.round(preview.computed.kcal)} kcal · {Math.round(preview.computed.proteinG)} P · {Math.round(preview.computed.carbsG)} C · {Math.round(preview.computed.fatG)} F</p>
        {#if !swapOnly}
          <div class="flex flex-col gap-1.5">
            <span class="text-xs font-medium text-muted-foreground">Swaps clients can have instead</span>
            <div class="flex flex-wrap items-center gap-1.5">
              {#each swaps as s, i (i)}
                <span class="inline-flex h-7 items-center gap-1 rounded-full bg-muted pl-2.5 pr-1 text-xs">{s.name}
                  <button type="button" aria-label="Remove {s.name}" class="flex size-5 items-center justify-center rounded-full hover:bg-background" onclick={() => (swaps = swaps.filter((_, j) => j !== i))}>×</button>
                </span>
              {/each}
              <Button variant="outline" size="sm" onclick={() => { pickingSwap = true; query = ""; }}>+ Swap</Button>
            </div>
          </div>
        {/if}
      </div>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={!picked || pickingSwap} onclick={add}>{swapOnly ? "Add swap" : title}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
