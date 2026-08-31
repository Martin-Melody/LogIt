<script lang="ts">
  import { onMount } from "svelte";
  import * as Card from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import {
    copyDiaryItems,
    createDiaryDay,
    dayTotals,
    localDateIso,
    loggedItemFromFood,
    loggedItemFromRecent,
    mealTotals,
    recentFoodsFromDays,
    removeDiaryItem,
    addDiaryItem,
    roundMacros,
    scaleMacros,
    MEAL_SLOTS,
    type DiaryDay,
    type FoodRef,
    type MacroTotals,
    type MealSlot,
    type RecentFood,
  } from "@logit/core/domain/nutrition";
  import { getNutritionTargets } from "@logit/core/usecases/nutrition/getNutritionTargets";
  import { getOwnNutritionDeps, getOwnProfile } from "$lib/deps";
  import MacroBars from "$lib/components/nutrition/MacroBars.svelte";
  import WeightTrendChart from "$lib/components/nutrition/WeightTrendChart.svelte";
  import { fmtKcal, fmtWeight, totalsFor, type NutritionState, type WeightUnit } from "$lib/nutrition";

  const deps = getOwnNutritionDeps();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let dateIso = $state(localDateIso());
  let day = $state<DiaryDay | null>(null);
  let nut = $state<NutritionState | null>(null);
  let unit = $state<WeightUnit>("kg");

  const isToday = $derived(dateIso === localDateIso());
  const consumed = $derived(totalsFor(day));

  const mealLabels: Record<MealSlot, string> = {
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snack: "Snacks",
  };

  const sourceBadge = $derived.by(() => {
    if (!nut?.targets) return null;
    const prominent = nut.targets.source === "coach" || nut.targets.sourceLabel === "Adaptive";
    return { label: nut.targets.sourceLabel, prominent };
  });

  async function loadTargets() {
    const profile = await getOwnProfile();
    unit = (profile?.weightUnit ?? "kg") as WeightUnit;
    const fallbackKg = profile?.weight != null && profile.weightUnit === "kg" ? profile.weight : null;
    nut = await getNutritionTargets(deps, { fallbackWeightKg: fallbackKg });
  }

  async function loadDay() {
    day = (await deps.nutritionRepo.getDay(dateIso)) ?? null;
  }

  let recents = $state<RecentFood[]>([]);
  async function loadRecents() {
    const end = localDateIso();
    const start = localDateIso(new Date(Date.now() - 45 * 86_400_000));
    const days = await deps.nutritionRepo.listDaysInRange(start, end);
    recents = recentFoodsFromDays(days, 30);
  }

  async function load() {
    loading = true;
    error = null;
    try {
      await Promise.all([loadTargets(), loadDay(), loadRecents()]);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load";
    } finally {
      loading = false;
    }
  }

  function shiftDate(deltaDays: number) {
    const d = new Date(`${dateIso}T12:00:00`);
    d.setDate(d.getDate() + deltaDays);
    dateIso = localDateIso(d);
    void loadDay();
  }

  // ── Copy a previous day ──
  let showCopy = $state(false);
  let copyFrom = $state("");
  let copyBusy = $state(false);
  let copyMsg = $state<string | null>(null);

  function dayBefore(iso: string): string {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return localDateIso(d);
  }

  function toggleCopy() {
    showCopy = !showCopy;
    copyMsg = null;
    if (showCopy && !copyFrom) copyFrom = dayBefore(dateIso);
  }

  async function doCopy() {
    if (!copyFrom || copyBusy) return;
    copyBusy = true;
    copyMsg = null;
    try {
      const src = await deps.nutritionRepo.getDay(copyFrom);
      const items = src?.items ?? [];
      if (items.length === 0) {
        copyMsg = "Nothing logged on that day.";
        return;
      }
      await persist(copyDiaryItems(day ?? createDiaryDay(dateIso), items));
      showCopy = false;
    } finally {
      copyBusy = false;
    }
  }

  async function persist(next: DiaryDay) {
    day = next;
    try {
      await deps.nutritionRepo.saveDay(next);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save — check your connection";
      await loadDay();
    }
  }

  async function deleteItem(itemId: string) {
    if (!day) return;
    await persist(removeDiaryItem(day, itemId));
  }

  // ── Add food ──────────────────────────────────────────────────────────────
  let addMeal = $state<MealSlot | null>(null);
  let query = $state("");
  let results = $state<FoodRef[]>([]);
  let searching = $state(false);
  let amount = $state("100");
  // quick-add (raw macros)
  let qa = $state({ open: false, name: "", kcal: "", p: "", c: "", f: "" });

  let timer: ReturnType<typeof setTimeout>;
  function onQuery() {
    clearTimeout(timer);
    timer = setTimeout(runSearch, 300);
  }
  async function runSearch() {
    if (!query.trim()) {
      results = [];
      return;
    }
    searching = true;
    try {
      results = await deps.foodDbRepo.searchFoods(query, { limit: 20 });
    } catch {
      results = [];
    } finally {
      searching = false;
    }
  }

  function openAdd(meal: MealSlot) {
    addMeal = meal;
    query = "";
    results = [];
    amount = "100";
    qa = { open: false, name: "", kcal: "", p: "", c: "", f: "" };
  }

  async function pickFood(f: FoodRef) {
    if (!addMeal) return;
    const grams = Number(amount) || 100;
    const base = day ?? createDiaryDay(dateIso);
    await persist(addDiaryItem(base, loggedItemFromFood(f, addMeal, grams, `${grams} g`)));
    addMeal = null;
  }

  async function logRecent(r: RecentFood) {
    if (!addMeal) return;
    await persist(addDiaryItem(day ?? createDiaryDay(dateIso), loggedItemFromRecent(r, addMeal)));
    addMeal = null;
  }

  async function addQuick() {
    if (!addMeal) return;
    const computed: MacroTotals = {
      kcal: Number(qa.kcal) || 0,
      proteinG: Number(qa.p) || 0,
      carbsG: Number(qa.c) || 0,
      fatG: Number(qa.f) || 0,
    };
    if (!qa.name.trim() || computed.kcal <= 0) return;
    const base = day ?? createDiaryDay(dateIso);
    await persist(
      addDiaryItem(base, {
        meal: addMeal,
        name: qa.name.trim(),
        grams: 0,
        computed: roundMacros(computed),
      }),
    );
    addMeal = null;
  }

  function per100Preview(f: FoodRef): MacroTotals {
    return roundMacros(scaleMacros(f.per100g, Number(amount) || 100));
  }

  onMount(load);
</script>

<div class="flex flex-col gap-4 max-w-2xl">
  <div class="flex items-center justify-between">
    <h1 class="text-lg font-semibold">Nutrition</h1>
    <div class="flex items-center gap-2 text-sm">
      <a href="/nutrition/insights" class="text-muted-foreground hover:text-foreground">Insights</a>
      <a href="/nutrition/weight" class="text-muted-foreground hover:text-foreground">Weight</a>
      <a href="/nutrition/goal" class="text-muted-foreground hover:text-foreground">Goal</a>
    </div>
  </div>

  {#if error}<p class="text-sm text-destructive">{error}</p>{/if}

  {#if loading}
    <div class="flex items-center gap-2 text-sm text-muted-foreground"><Spinner class="size-4" /> Loading…</div>
  {:else}
    <!-- Date nav -->
    <div class="flex items-center gap-3">
      <Button size="sm" variant="outline" class="h-7 px-2" onclick={() => shiftDate(-1)}>‹</Button>
      <span class="text-sm font-medium tabular-nums">{isToday ? "Today" : dateIso}</span>
      <Button size="sm" variant="outline" class="h-7 px-2" disabled={isToday} onclick={() => shiftDate(1)}>›</Button>
      <button type="button" class="ml-auto text-xs text-muted-foreground hover:text-foreground" onclick={toggleCopy}>
        Copy a day
      </button>
    </div>

    {#if showCopy}
      <div class="flex flex-wrap items-end gap-2 rounded border border-border p-2">
        <label class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">Copy meals from</span>
          <input type="date" max={localDateIso()} class="h-8 rounded border border-border bg-background px-2 text-sm" bind:value={copyFrom} />
        </label>
        <button type="button" class="text-xs text-primary pb-2" onclick={() => (copyFrom = dayBefore(dateIso))}>Yesterday</button>
        <Button size="sm" class="h-8" disabled={copyBusy} onclick={doCopy}>{copyBusy ? "Copying…" : "Copy"}</Button>
        {#if copyMsg}<span class="text-xs text-muted-foreground pb-2">{copyMsg}</span>{/if}
      </div>
    {/if}

    <!-- Target -->
    <Card.Root>
      <Card.Header class="pb-2 flex-row items-start justify-between">
        <div>
          <Card.Title>Daily target</Card.Title>
          {#if !nut?.goal && !nut?.coachPlan}
            <Card.Description>
              <a href="/nutrition/goal" class="text-primary hover:underline">Set a goal</a> for calorie & macro targets.
            </Card.Description>
          {:else if !nut?.targets}
            <Card.Description>{nut?.targetsHint ?? "Add your height & birth date on the goal screen."}</Card.Description>
          {/if}
        </div>
        {#if sourceBadge}
          <Badge variant={sourceBadge.prominent ? "default" : "outline"} class="text-[10px] shrink-0">
            {sourceBadge.label}
          </Badge>
        {/if}
      </Card.Header>
      <Card.Content class="pt-0">
        <MacroBars consumed={consumed} target={nut?.targets?.macros ?? null} />
      </Card.Content>
    </Card.Root>

    <!-- Meals -->
    {#each MEAL_SLOTS as meal (meal)}
      {@const mt = day ? mealTotals(day, meal) : null}
      <Card.Root>
        <Card.Header class="pb-2 flex-row items-center justify-between">
          <Card.Title class="text-sm">
            {mealLabels[meal]}
            {#if mt && mt.kcal > 0}
              <span class="ml-2 text-xs font-normal text-muted-foreground tabular-nums">{fmtKcal(mt.kcal)} kcal</span>
            {/if}
          </Card.Title>
          <Button size="sm" variant="outline" class="h-7" onclick={() => openAdd(meal)}>Add food</Button>
        </Card.Header>
        <Card.Content class="pt-0">
          {#if !day || day.items.filter((i) => i.meal === meal).length === 0}
            <p class="text-sm text-muted-foreground py-1">Nothing logged.</p>
          {:else}
            <ul class="flex flex-col divide-y divide-border">
              {#each day.items.filter((i) => i.meal === meal) as it (it.id)}
                <li class="flex items-center gap-2 py-1.5 text-sm">
                  <span class="flex-1 truncate">
                    {it.name}
                    {#if it.servingLabel}<span class="text-muted-foreground"> · {it.servingLabel}</span>{/if}
                  </span>
                  <span class="tabular-nums text-muted-foreground">{fmtKcal(it.computed.kcal)}</span>
                  <button type="button" class="text-xs text-destructive" onclick={() => deleteItem(it.id)}>×</button>
                </li>
              {/each}
            </ul>
          {/if}
        </Card.Content>
      </Card.Root>
    {/each}

    <!-- Weight mini -->
    <Card.Root>
      <Card.Header class="pb-2 flex-row items-center justify-between">
        <Card.Title class="text-sm">Weight</Card.Title>
        <a href="/nutrition/weight" class="text-xs text-muted-foreground hover:text-foreground">Log / history</a>
      </Card.Header>
      <Card.Content class="pt-0">
        <div class="flex items-baseline justify-between mb-1 text-sm">
          <span class="tabular-nums font-medium">{fmtWeight(nut?.trend.currentKg ?? null, unit)}</span>
          {#if nut && Math.abs(nut.trend.weeklyRateKg) >= 0.05}
            <span class="text-xs text-muted-foreground tabular-nums">
              {nut.trend.weeklyRateKg > 0 ? "+" : ""}{(unit === "lbs" ? nut.trend.weeklyRateKg * 2.2046 : nut.trend.weeklyRateKg).toFixed(2)} {unit}/wk
            </span>
          {/if}
        </div>
        {#if nut}
          <WeightTrendChart trend={nut.trend} unit={unit} targetKg={nut.goal?.targetWeightKg ?? null} />
        {/if}
      </Card.Content>
    </Card.Root>
  {/if}
</div>

{#if addMeal}
  <div class="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-16 px-4" role="dialog" tabindex="-1">
    <div class="bg-background border border-border rounded-lg w-full max-w-md p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium">Add to {mealLabels[addMeal]}</span>
        <button type="button" class="text-xs text-muted-foreground" onclick={() => (addMeal = null)}>Close</button>
      </div>

      {#if !qa.open}
        <div class="flex gap-2">
          <input
            class="flex-1 h-8 rounded border border-border bg-background px-2 text-sm"
            placeholder="Search Open Food Facts"
            bind:value={query}
            oninput={onQuery}
          />
          <input class="w-16 h-8 rounded border border-border bg-background px-2 text-sm" bind:value={amount} />
          <span class="text-xs text-muted-foreground self-center">g</span>
        </div>

        {#if searching}
          <p class="text-xs text-muted-foreground">Searching…</p>
        {:else if results.length}
          <ul class="flex flex-col max-h-72 overflow-y-auto divide-y divide-border">
            {#each results as f (f.id)}
              {@const m = per100Preview(f)}
              <li>
                <button type="button" class="w-full text-left py-2 text-sm" onclick={() => pickFood(f)}>
                  {f.name}{#if f.brand}<span class="text-muted-foreground text-xs"> · {f.brand}</span>{/if}
                  <span class="block text-xs text-muted-foreground tabular-nums">
                    {m.kcal} kcal · P {m.proteinG} · C {m.carbsG} · F {m.fatG} <span class="opacity-70">(for {amount || 100} g)</span>
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {:else if !query.trim() && recents.length}
          <div class="flex flex-col">
            <span class="text-xs text-muted-foreground">Recent</span>
            <ul class="flex flex-col max-h-72 overflow-y-auto divide-y divide-border">
              {#each recents as r (r.key)}
                <li>
                  <button type="button" class="w-full text-left py-2 text-sm" onclick={() => logRecent(r)}>
                    {r.name}{#if r.brand}<span class="text-muted-foreground text-xs"> · {r.brand}</span>{/if}
                    <span class="block text-xs text-muted-foreground tabular-nums">
                      {fmtKcal(r.computed.kcal)} kcal{#if r.servingLabel} · {r.servingLabel}{/if}{#if r.count > 1} · ×{r.count}{/if}
                    </span>
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        <button type="button" class="text-xs text-primary self-start" onclick={() => (qa = { ...qa, open: true })}>
          Quick add raw macros
        </button>
      {:else}
        <div class="flex flex-col gap-2">
          <input class="h-8 rounded border border-border bg-background px-2 text-sm" placeholder="Name" bind:value={qa.name} />
          <div class="grid grid-cols-4 gap-2">
            <input class="h-8 rounded border border-border bg-background px-2 text-sm" placeholder="kcal" bind:value={qa.kcal} />
            <input class="h-8 rounded border border-border bg-background px-2 text-sm" placeholder="P" bind:value={qa.p} />
            <input class="h-8 rounded border border-border bg-background px-2 text-sm" placeholder="C" bind:value={qa.c} />
            <input class="h-8 rounded border border-border bg-background px-2 text-sm" placeholder="F" bind:value={qa.f} />
          </div>
          <div class="flex items-center gap-2">
            <Button size="sm" class="h-8" onclick={addQuick}>Add</Button>
            <button type="button" class="text-xs text-muted-foreground" onclick={() => (qa = { ...qa, open: false })}>Back to search</button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
