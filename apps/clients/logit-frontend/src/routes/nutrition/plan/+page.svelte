<!-- Canvas MP7: today's food from the coach's meal plan, timed to training. The day's type
     (training or rest, switching by itself from the program), each meal at its time, logged or
     not, with Log as planned, Swap, Change amounts and the recipe's method. They see the swap in
     place of food they said they don't eat. ⋯: the other day's plan, the grocery list. -->
<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Check, MoreVertical } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { toast } from "$lib/components/ui/sonner/index";
  import { createDiaryDay, addDiaryItem, dayTotals, ZERO_MACROS, type DiaryDay } from "@logit/core/domain/nutrition";
  import { mealClock, mealTimeLabel, planDay, slotForMeal, type PlannedFood, type PlannedMeal } from "@logit/core/domain/CoachNutritionPlan";
  import { foodForThem, loggedFromPlan, loggedMeals } from "@logit/core/domain/mealPlanDay";
  import { getNutritionRepo } from "$lib/data/repoProvider";
  import { pushNutritionDay } from "$lib/sync/syncService";
  import { loadPlanToday, type PlanToday } from "$lib/features/nutrition/plan/planToday";
  import FoodSwapSheet from "$lib/features/nutrition/plan/FoodSwapSheet.svelte";
  import ChangeAmountsSheet from "$lib/features/nutrition/plan/ChangeAmountsSheet.svelte";
  import RecipeSheet from "$lib/features/nutrition/plan/RecipeSheet.svelte";

  let s = $state<PlanToday | null>(null);
  let loading = $state(true);
  /** "See training day plan": the other day type, to look at. */
  let showOther = $state(false);

  async function load() {
    s = await loadPlanToday().catch(() => null);
    loading = false;
  }
  onMount(load);

  const plan = $derived(s?.plan ?? null);
  const training = $derived(showOther ? !s?.training : !!s?.training);
  const day = $derived(plan && s ? planDay(plan, s.dateIso, training) : null);
  const dayName = $derived(plan?.mode === "training-rest" ? (training ? "Training day" : "Rest day") : (day?.name ?? ""));
  const logged = $derived(plan && s ? loggedMeals(s.day, plan.id) : new Set<string>());
  const eaten = $derived(s?.day ? dayTotals(s.day) : { ...ZERO_MACROS });
  const first = $derived((s?.coachName ?? "your coach").split(" ")[0]);
  const seen = (f: PlannedFood) => foodForThem(f, s?.avoid ?? []);
  const sessionTime = $derived(training && !showOther ? (s?.session?.time ?? null) : null);

  async function saveItems(items: ReturnType<typeof loggedFromPlan>[]) {
    if (!s) return;
    const repo = getNutritionRepo();
    let next: DiaryDay = (await repo.getDay(s.dateIso)) ?? createDiaryDay(s.dateIso);
    for (const it of items) next = addDiaryItem(next, it);
    await repo.saveDay(next);
    pushNutritionDay(next);
    s = { ...s, day: next };
  }
  async function logAsPlanned(meal: PlannedMeal) {
    if (!plan) return;
    await saveItems(meal.foods.map((f) => { const v = seen(f); return loggedFromPlan(plan.id, meal, f, v.food, v.swappedFor ? "swapped" : "planned"); }));
    toast.success(`${meal.name} logged`);
  }

  // Sheets
  let swapping = $state<{ meal: PlannedMeal; food: PlannedFood } | null>(null);
  let changing = $state<PlannedMeal | null>(null);
  let recipe = $state<{ meal: PlannedMeal; food: PlannedFood } | null>(null);
  async function onSwap(swap: PlannedFood) {
    const x = swapping;
    swapping = null;
    if (!x || !plan) return;
    await saveItems([loggedFromPlan(plan.id, x.meal, x.food, swap, "swapped")]);
    toast.success(`${swap.name} logged`);
  }
  async function onChanged(rows: { planned: PlannedFood; eaten: PlannedFood }[]) {
    const meal = changing;
    changing = null;
    if (!meal || !plan) return;
    await saveItems(rows.map((r) => loggedFromPlan(plan.id, meal, r.planned, r.eaten, r.eaten.grams === seen(r.planned).food.grams ? "planned" : "changed")));
    toast.success(`${meal.name} logged`);
  }
  async function onRecipeLog() {
    const x = recipe;
    recipe = null;
    if (!x || !plan) return;
    await saveItems([loggedFromPlan(plan.id, x.meal, x.food, seen(x.food).food, "planned")]);
    toast.success(`${x.food.name} logged`);
  }
  const fmt = (n: number) => Math.round(n).toLocaleString();
</script>

<div class="flex flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/nutrition")} />
    <h1 class="page-title flex-1">{showOther ? `${dayName} plan` : "Today's food"}</h1>
    {#if plan}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}<Button {...props} variant="ghost" size="icon" class="size-11" aria-label="More"><MoreVertical class="size-5" /></Button>{/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end">
          {#if plan.mode === "training-rest"}<DropdownMenu.Item class="min-h-11" onSelect={() => (showOther = !showOther)}>{showOther ? "Back to today" : `See ${s?.training ? "rest" : "training"} day plan`}</DropdownMenu.Item>{/if}
          <DropdownMenu.Item class="min-h-11" onSelect={() => void goto("/nutrition/plan/grocery")}>Grocery list</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {/if}
  </PageHeader>

  {#if loading}
    <p class="px-4 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if !plan || !day}
    <p class="px-4 py-6 text-sm text-muted-foreground">{first === "your" ? "Your coach hasn't" : `${first} hasn't`} set a meal plan.</p>
  {:else}
    <section class="flex flex-col gap-2 border-b border-border px-4 py-3">
      <p class="text-sm text-muted-foreground">{[dayName, sessionTime && s?.session ? `${s.session.name} at ${sessionTime}` : null, `from ${first}`].filter(Boolean).join(" · ")}</p>
      {#if !showOther}
        {#each [["Calories", eaten.kcal, day.kcalTarget, ""], ["Protein", eaten.proteinG, day.proteinG, " g"]] as [label, have, want, unit] (label)}
          {@const pct = want ? Math.min(100, Math.round((Number(have) / Number(want)) * 100)) : 0}
          <div class="flex flex-col gap-1">
            <span class="flex justify-between text-[15px]"><span>{label}</span><span class="tabular-nums text-muted-foreground">{fmt(Number(have))}{want ? ` of ${fmt(Number(want))}${unit}` : unit}</span></span>
            {#if want}<span class="h-1.5 overflow-hidden rounded-full bg-muted"><span class="block h-full rounded-full bg-primary transition-[width] duration-300" style="width: {pct}%"></span></span>{/if}
          </div>
        {/each}
      {/if}
      {#if plan.note}<p class="whitespace-pre-line text-xs text-muted-foreground">{plan.note}</p>{/if}
    </section>

    {#each day.meals as meal (meal.id)}
      {@const done = logged.has(meal.id) && !showOther}
      {@const clock = mealClock(meal, sessionTime, plan.restDayClock)}
      <section class="border-b border-border px-4 py-3" aria-label={meal.name}>
        <div class="flex items-baseline justify-between gap-2">
          <h2 class="text-[15px] font-semibold">{meal.name}{#if clock}<span class="ml-2 font-normal text-muted-foreground">{meal.time?.kind === "after-training" ? `by ${clock}` : clock}</span>{/if}{#if meal.time && meal.time.kind !== "clock" && training}<span class="ml-1 text-xs font-normal text-muted-foreground">· {mealTimeLabel(meal.time).replace(" training", "")}</span>{/if}</h2>
          {#if done}<span class="flex items-center gap-1 text-sm font-medium text-success"><Check class="size-4" />Logged</span>{/if}
        </div>
        <ul class="mt-1.5 flex flex-col">
          {#each meal.foods as f (f.id)}
            {@const v = seen(f)}
            <li class="flex items-center justify-between gap-3 py-1 text-[15px]">
              {#if v.food.recipe}
                <button type="button" class="min-h-11 flex-1 text-left underline-offset-4 active:underline" onclick={() => (recipe = { meal, food: f })}>{v.food.name}{#if v.food.servingsUsed && v.food.servingsUsed !== 1}<span class="text-muted-foreground"> · {v.food.servingsUsed} servings</span>{/if}</button>
              {:else}
                <span class="flex-1">{v.food.name} <span class="text-muted-foreground">· {v.food.grams} g</span>{#if v.swappedFor}<span class="block text-xs text-muted-foreground">in place of {v.swappedFor.toLowerCase()}</span>{/if}</span>
              {/if}
              <span class="tabular-nums text-muted-foreground">{Math.round(v.food.computed.kcal)}</span>
              {#if !done && !showOther}<Button variant="ghost" size="sm" class="h-9 px-2" onclick={() => (swapping = { meal, food: f })}>Swap</Button>{/if}
            </li>
          {/each}
        </ul>
        {#if !done && !showOther && meal.foods.length}
          <div class="mt-2 flex gap-2">
            <Button class="h-11 flex-1" onclick={() => void logAsPlanned(meal)}>Log as planned</Button>
            <Button variant="outline" class="h-11" onclick={() => (changing = meal)}>Change amounts</Button>
          </div>
        {/if}
      </section>
    {/each}
    {#if !showOther}
      <div class="flex flex-wrap gap-2 px-4 py-3">
        <Button variant="outline" class="h-11" href="/nutrition/plan/grocery">Grocery list</Button>
        {#if plan.mode === "training-rest"}<Button variant="outline" class="h-11" onclick={() => (showOther = true)}>{s?.training ? "Rest" : "Training"} day plan</Button>{/if}
      </div>
    {/if}
  {/if}
</div>

<FoodSwapSheet open={!!swapping} onOpenChange={(o) => { if (!o) swapping = null; }} meal={swapping?.meal ?? null} food={swapping ? seen(swapping.food).food : null} coachName={s?.coachName ?? ""}
  onpick={(x) => void onSwap(x)} onelse={() => { const m = swapping?.meal; swapping = null; void goto(`/nutrition/log${m ? `?meal=${slotForMeal(m)}` : ""}`); }} />
<ChangeAmountsSheet open={!!changing} onOpenChange={(o) => { if (!o) changing = null; }} meal={changing} foods={(changing?.foods ?? []).map((f) => ({ planned: f, seen: seen(f).food }))} eatenSoFar={eaten} targetKcal={day?.kcalTarget ?? null} onlog={(r) => void onChanged(r)} />
<RecipeSheet open={!!recipe} onOpenChange={(o) => { if (!o) recipe = null; }} food={recipe ? seen(recipe.food).food : null} coachName={s?.coachName ?? ""} logged={!!recipe && logged.has(recipe.meal.id)} onlog={() => void onRecipeLog()} />
