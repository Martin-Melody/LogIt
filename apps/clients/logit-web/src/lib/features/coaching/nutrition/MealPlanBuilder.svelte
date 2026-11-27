<!-- Canvas MP2: the meal plan builder. How days work (one set, training and rest days, or your own
     day types), each day's targets and timed meals, foods and your recipes with swaps, and the day
     against its targets. Every change goes to `onchange`; the page saves. -->
<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import OptionSelect from "$lib/components/option-select.svelte";
  import ActionMenu from "$lib/features/commands/ActionMenu.svelte";
  import type { RowAction } from "$lib/features/commands/commands.svelte";
  import FoodPickerDialog from "./FoodPickerDialog.svelte";
  import MealTimeDialog from "./MealTimeDialog.svelte";
  import DayTypeDialog from "./DayTypeDialog.svelte";
  import NutrientTargetsDialog from "./NutrientTargetsDialog.svelte";
  import * as N from "@logit/core/domain/CoachNutritionPlan";
  import type { CoachNutritionPlan, PlannedFood, PlannedMeal } from "@logit/core/domain/CoachNutritionPlan";
  import { createId } from "@logit/core/domain/ids";
  import { DIET_TAG_LABELS, roundMacros, type Recipe } from "@logit/core/domain/nutrition";

  let { plan, recipes, onchange }: { plan: CoachNutritionPlan; recipes: Recipe[]; onchange: (next: CoachNutritionPlan) => void } = $props();

  const mode = $derived(plan.mode ?? "same");
  const types = $derived(mode === "same" ? [] : (plan.dayTypes ?? []));
  let dayId = $state<string | null>(null);
  const day = $derived(types.find((d) => d.id === dayId) ?? types[0] ?? null);
  const ref = $derived<N.DayRef>(day?.id ?? null);
  const meals = $derived(N.mealsOf(plan, ref));
  const target = $derived(day ?? plan);
  const totals = $derived(N.dayMealTotals(meals));
  const planTags = $derived(plan.tags ?? []);
  const up = (p: CoachNutritionPlan) => onchange(N.withPlanFallback(p));

  const MODES = [
    { value: "same", label: "Same every day" },
    { value: "training-rest", label: "Training and rest days" },
    { value: "own", label: "Your own day types" },
  ] as const;
  const MODE_HINT: Record<string, string> = {
    same: "One set of meals and targets.",
    "training-rest": "Training days follow their program's weekdays, and any day they train.",
    own: "Day types of your own (high carb, low carb…), each on the weekdays you pick.",
  };

  // ── Targets for the day ──
  const num = (v: string) => { const n = Number(v.replace(",", ".")); return v.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined; };
  function setTarget(key: "kcalTarget" | "proteinG" | "carbsG" | "fatG", v: number | undefined) {
    if (key === "kcalTarget" && !v) return;
    up(day ? N.updateDayType(plan, day.id, { [key]: v }) : N.updateCoachNutritionPlan(plan, { [key]: v }));
  }
  let moreTargets = $state(false);

  // ── Meals ──
  const editMeals = (fn: (ms: PlannedMeal[]) => PlannedMeal[]) => up(N.mapMeals(plan, ref, fn));
  const editMeal = (id: string, fn: (m: PlannedMeal) => PlannedMeal) => editMeals((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));
  function addMeal() {
    const names = ["Breakfast", "Lunch", "Dinner", "Snack"];
    const name = names.find((n) => !meals.some((m) => m.name === n)) ?? "Meal";
    editMeals((ms) => [...ms, N.createPlannedMeal(name)]);
  }
  function move<T>(xs: T[], i: number, d: number): T[] {
    const j = i + d;
    if (j < 0 || j >= xs.length) return xs;
    const next = [...xs];
    [next[i], next[j]] = [next[j]!, next[i]!];
    return next;
  }
  let renaming = $state<string | null>(null);
  const mealActions = (m: PlannedMeal, i: number): RowAction[] => [
    { id: "rename", label: "Rename", run: () => (renaming = m.id) },
    { id: "time", label: "When…", run: () => openTime(m) },
    { id: "dup", label: "Duplicate", run: () => editMeals((ms) => [...ms.slice(0, i + 1), { ...structuredClone($state.snapshot(m)) as PlannedMeal, id: createId("pmeal"), foods: m.foods.map((f) => ({ ...structuredClone($state.snapshot(f)) as PlannedFood, id: createId("pfood") })) }, ...ms.slice(i + 1)]) },
    { id: "up", label: "Move up", run: () => editMeals((ms) => move(ms, i, -1)), disabled: i === 0 ? "Already first" : undefined, separatorBefore: true },
    { id: "down", label: "Move down", run: () => editMeals((ms) => move(ms, i, 1)), disabled: i === meals.length - 1 ? "Already last" : undefined },
    { id: "remove", label: "Remove", danger: true, separatorBefore: true, run: () => editMeals((ms) => ms.filter((x) => x.id !== m.id)) },
  ];
  let timing = $state<PlannedMeal | null>(null);
  let timeOpen = $state(false);
  const openTime = (m: PlannedMeal) => { timing = m; timeOpen = true; };

  // ── Foods ──
  let picking = $state<{ mealId: string; foodId?: string } | null>(null);
  let pickerOpen = $state(false);
  const openPicker = (p: { mealId: string; foodId?: string }) => { picking = p; pickerOpen = true; };
  const pickTitle = $derived.by(() => {
    if (!picking) return "";
    const m = meals.find((x) => x.id === picking!.mealId);
    const f = picking.foodId ? m?.foods.find((x) => x.id === picking!.foodId) : null;
    return f ? `A swap for ${f.name}` : `Add to ${m?.name ?? "the meal"}`;
  });
  function onPicked(food: Omit<PlannedFood, "id">, swaps: Omit<PlannedFood, "id">[]) {
    const p = picking;
    if (!p) return;
    if (p.foodId) {
      editMeal(p.mealId, (m) => ({ ...m, foods: m.foods.map((f) => (f.id === p.foodId ? { ...f, swaps: [...(f.swaps ?? []), { ...food, id: createId("pfood") }] } : f)) }));
    } else {
      editMeal(p.mealId, (m) => ({ ...m, foods: [...m.foods, { ...food, id: createId("pfood"), ...(swaps.length ? { swaps: swaps.map((s) => ({ ...s, id: createId("pfood") })) } : {}) }] }));
    }
  }
  /** A new amount: grams for a food, servings for a recipe; macros scale with it. */
  function setAmount(mealId: string, f: PlannedFood, text: string) {
    const v = Number(text.replace(",", "."));
    if (!(v > 0)) return;
    const k = f.recipe ? v / (f.servingsUsed ?? 1) : v / f.grams;
    const scaled = { ...f, grams: Math.round(f.grams * k), computed: roundMacros({ kcal: f.computed.kcal * k, proteinG: f.computed.proteinG * k, carbsG: f.computed.carbsG * k, fatG: f.computed.fatG * k }), ...(f.recipe ? { servingsUsed: v, servingLabel: `${v === 1 ? "1 serving" : `${v} servings`}` } : {}) };
    editMeal(mealId, (m) => ({ ...m, foods: m.foods.map((x) => (x.id === f.id ? scaled : x)) }));
  }
  const foodActions = (m: PlannedMeal, f: PlannedFood, i: number): RowAction[] => [
    { id: "swap", label: "Add a swap…", run: () => openPicker({ mealId: m.id, foodId: f.id }) },
    ...planTags.filter(() => !f.recipe).map((t, k): RowAction => ({
      id: `not-${t}`,
      label: f.notFor?.includes(t) ? `It's ${DIET_TAG_LABELS[t].toLowerCase()}` : `Not ${DIET_TAG_LABELS[t].toLowerCase()}`,
      run: () => editMeal(m.id, (x) => ({ ...x, foods: x.foods.map((y) => (y.id === f.id ? { ...y, notFor: y.notFor?.includes(t) ? y.notFor.filter((z) => z !== t) : [...(y.notFor ?? []), t] } : y)) })),
      separatorBefore: k === 0,
    })),
    { id: "up", label: "Move up", run: () => editMeal(m.id, (x) => ({ ...x, foods: move(x.foods, i, -1) })), disabled: i === 0 ? "Already first" : undefined, separatorBefore: true },
    { id: "down", label: "Move down", run: () => editMeal(m.id, (x) => ({ ...x, foods: move(x.foods, i, 1) })), disabled: i === m.foods.length - 1 ? "Already last" : undefined },
    { id: "remove", label: "Remove", danger: true, separatorBefore: true, run: () => editMeal(m.id, (x) => ({ ...x, foods: x.foods.filter((y) => y.id !== f.id) })) },
  ];

  // ── Day types ──
  let addingType = $state(false);
  let renamingType = $state<string | null>(null);
  const typeActions = (d: N.PlanDayType): RowAction[] => [
    { id: "rename", label: "Rename", run: () => (renamingType = d.id) },
    { id: "remove", label: `Remove ${d.name}`, danger: true, separatorBefore: true, run: () => { up(N.removeDayType(plan, d.id)); dayId = null; }, disabled: types.length <= 1 || mode === "training-rest" ? "A plan needs these days" : undefined },
  ];

  // ── The day against its targets ──
  const bars = $derived([
    { label: "Calories", have: totals.kcal, want: target.kcalTarget, unit: "" },
    { label: "Protein", have: totals.proteinG, want: target.proteinG, unit: " g" },
    { label: "Carbs", have: totals.carbsG, want: target.carbsG, unit: " g" },
    { label: "Fat", have: totals.fatG, want: target.fatG, unit: " g" },
  ]);
  const breaking = $derived(meals.flatMap((m) => m.foods.map((f) => ({ f, tags: N.foodBreaks(f, planTags) })).filter((x) => x.tags.length)));
  let grocery = $state(false);
  const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap items-center gap-3">
    <Tabs.Root value={mode} onValueChange={(v) => { up(N.setPlanMode(plan, v as typeof mode)); dayId = null; }}>
      <Tabs.List aria-label="How days work">
        {#each MODES as m (m.value)}<Tabs.Trigger value={m.value}>{m.label}</Tabs.Trigger>{/each}
      </Tabs.List>
    </Tabs.Root>
    <span class="text-xs text-muted-foreground">{MODE_HINT[mode]}</span>
  </div>

  {#if types.length}
    <div class="flex flex-wrap items-center gap-1.5 border-b border-border" role="tablist" aria-label="Day types">
      {#each types as d (d.id)}
        <ActionMenu actions={typeActions(d)} label="More for {d.name}">
          {#snippet children({ props })}
            <span {...props} class="flex items-center">
              {#if renamingType === d.id}
                <!-- svelte-ignore a11y_autofocus -->
                <input autofocus value={d.name} aria-label="Day type name" class="h-8 w-36 rounded-[7px] border border-input bg-background px-2 text-[13px]"
                  onblur={(e) => { const v = e.currentTarget.value.trim(); if (v) up(N.updateDayType(plan, d.id, { name: v })); renamingType = null; }}
                  onkeydown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") renamingType = null; }} />
              {:else}
                <button type="button" role="tab" aria-selected={day?.id === d.id} onclick={() => (dayId = d.id)}
                  class="-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors {day?.id === d.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}">
                  {d.name}{#if mode === "own" && d.weekdays?.length}<span class="ml-1.5 text-xs font-normal text-muted-foreground">{d.weekdays.map((w) => WEEKDAY[w]).join(" ")}</span>{/if}
                </button>
              {/if}
            </span>
          {/snippet}
        </ActionMenu>
      {/each}
      {#if mode === "own"}<Button variant="ghost" size="sm" onclick={() => (addingType = true)}>+ Day type</Button>{/if}
    </div>
  {/if}

  <!-- Targets bar (canvas MP2) -->
  <section class="flex flex-wrap items-end gap-3 rounded-[12px] border border-border bg-card px-4 py-3" aria-label="Targets{day ? ` for ${day.name}` : ''}">
    <div class="flex flex-col gap-1">
      <span class="text-xs font-medium text-muted-foreground">Calories</span>
      <span class="flex items-center gap-2">
        <OptionSelect size="sm" value={plan.kcalMode ?? "fixed"} aria-label="How calories are set" class="w-44" options={[{ value: "fixed", label: "You set them" }, { value: "adaptive", label: "Adaptive targets" }]} onValueChange={(v) => up(N.updateCoachNutritionPlan(plan, { kcalMode: v as "fixed" | "adaptive" }))} />
        <input class="h-8 w-20 rounded-[7px] border border-input bg-background px-2 text-[13px]" inputmode="numeric" aria-label="Calories{day ? ` on ${day.name}` : ''}" value={target.kcalTarget} onchange={(e) => setTarget("kcalTarget", num(e.currentTarget.value))} />
      </span>
    </div>
    {#each [["proteinG", "Protein"], ["carbsG", "Carbs"], ["fatG", "Fat"]] as const as [key, name] (key)}
      <label class="flex flex-col gap-1 text-xs font-medium text-muted-foreground">{name} g
        <input class="h-8 w-20 rounded-[7px] border border-input bg-background px-2 text-[13px] text-foreground" inputmode="numeric" placeholder="Theirs" value={target[key] ?? ""} onchange={(e) => setTarget(key, num(e.currentTarget.value))} />
      </label>
    {/each}
    <Button variant="outline" size="sm" onclick={() => (moreTargets = true)}>More targets{(plan.nutrients ?? []).length ? ` (${plan.nutrients!.length})` : ""}…</Button>
    {#if plan.kcalMode === "adaptive"}<p class="w-full text-xs text-muted-foreground">Adaptive: calories follow each client's own targets (their goal pace); {types.length ? "each day keeps its difference from the others" : "this number is where it starts"}.</p>{/if}
  </section>

  <div class="grid items-start gap-4 lg:grid-cols-[1fr_18rem]">
    <div class="flex flex-col gap-3">
      {#each meals as m, i (m.id)}
        {@const mt = N.mealTotals(m)}
        <section class="flex flex-col rounded-[12px] border border-border bg-card" aria-label={m.name}>
          <ActionMenu actions={mealActions(m, i)} label="More for {m.name}">
            {#snippet children({ props, more })}
              <header {...props} class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 data-[state=open]:bg-muted/40">
                {#if renaming === m.id}
                  <!-- svelte-ignore a11y_autofocus -->
                  <input autofocus value={m.name} aria-label="Meal name" class="h-8 w-40 rounded-[7px] border border-input bg-background px-2 text-[13px] font-semibold"
                    onblur={(e) => { const v = e.currentTarget.value.trim(); if (v) editMeal(m.id, (x) => ({ ...x, name: v })); renaming = null; }}
                    onkeydown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") renaming = null; }} />
                {:else}
                  <h3 class="text-[14px] font-semibold">{m.name}</h3>
                {/if}
                <Button variant="ghost" size="sm" class="h-7 px-2 text-xs text-muted-foreground" onclick={() => openTime(m)}>{N.mealTimeLabel(m.time)}</Button>
                <span class="ml-auto text-xs tabular-nums text-muted-foreground">{Math.round(mt.kcal)} kcal · {Math.round(mt.proteinG)} P</span>
                {@render more()}
              </header>
            {/snippet}
          </ActionMenu>
          {#each m.foods as f, k (f.id)}
            {@const breaks = N.foodBreaks(f, planTags)}
            <ActionMenu actions={foodActions(m, f, k)} label="More for {f.name}">
              {#snippet children({ props, more })}
                <div {...props} class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2 text-[13px] data-[state=open]:bg-muted/40">
                  <span class="flex min-w-0 flex-[1_1_220px] flex-wrap items-center gap-1.5">
                    <span class="truncate font-medium">{f.name}</span>
                    {#if f.recipe}<span class="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">Your recipe</span>{/if}
                    {#each breaks as t (t)}<span class="rounded-md bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">Not {DIET_TAG_LABELS[t].toLowerCase()}</span>{/each}
                    {#each f.swaps ?? [] as s (s.id)}
                      <span class="inline-flex h-6 items-center gap-1 rounded-full bg-muted pl-2 pr-0.5 text-[11px] text-muted-foreground">Swap: {s.name}
                        <button type="button" aria-label="Remove the swap {s.name}" class="flex size-5 items-center justify-center rounded-full hover:bg-background" onclick={() => editMeal(m.id, (x) => ({ ...x, foods: x.foods.map((y) => (y.id === f.id ? { ...y, swaps: (y.swaps ?? []).filter((z) => z.id !== s.id) } : y)) }))}>×</button>
                      </span>
                    {/each}
                  </span>
                  <span class="flex items-center gap-1">
                    <input class="h-7 w-16 rounded-[7px] border border-input bg-background px-2" inputmode="decimal" aria-label="{f.name} amount" value={f.recipe ? (f.servingsUsed ?? 1) : f.grams} onchange={(e) => setAmount(m.id, f, e.currentTarget.value)} />
                    <span class="w-14 text-xs text-muted-foreground">{f.recipe ? ((f.servingsUsed ?? 1) === 1 ? "serving" : "servings") : "g"}</span>
                  </span>
                  <span class="w-12 text-right tabular-nums text-muted-foreground">{Math.round(f.computed.kcal)}</span>
                  {@render more()}
                </div>
              {/snippet}
            </ActionMenu>
          {/each}
          <div class="border-t border-border px-4 py-2"><Button variant="ghost" size="sm" onclick={() => openPicker({ mealId: m.id })}>+ Food or recipe</Button></div>
        </section>
      {:else}
        <p class="rounded-[12px] border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">No meals{day ? ` on ${day.name}` : ""}. A plan can be just targets; add meals to give them food too.</p>
      {/each}
      <Button variant="outline" size="sm" class="self-start" onclick={addMeal}>+ Meal</Button>
    </div>

    <aside class="flex flex-col gap-3 rounded-[12px] border border-border bg-card px-4 py-3.5" aria-label="{day?.name ?? 'Day'} total">
      <h3 class="text-sm font-semibold">{day?.name ?? "Day"} total</h3>
      {#each bars as b (b.label)}
        {@const pct = b.want ? Math.min(100, Math.round((b.have / b.want) * 100)) : 0}
        <div class="flex flex-col gap-1">
          <span class="flex justify-between text-[13px]"><span>{b.label}</span><span class="tabular-nums text-muted-foreground">{Math.round(b.have)}{b.unit}{b.want ? ` of ${b.want}${b.unit}` : ""}</span></span>
          {#if b.want}<span class="h-1.5 overflow-hidden rounded-full bg-muted"><span class="block h-full rounded-full bg-primary transition-[width] duration-300" style="width: {pct}%"></span></span>{/if}
        </div>
      {/each}
      {#if breaking.length}
        <div class="rounded-[10px] bg-warning/10 px-3 py-2.5 text-[13px]">
          <b class="font-medium">{breaking.length} {breaking.length === 1 ? "food doesn't" : "foods don't"} fit the plan</b>
          <p class="mt-0.5 text-xs text-muted-foreground">This plan is marked {planTags.map((t) => DIET_TAG_LABELS[t].toLowerCase()).join(" and ")}. {breaking.map((x) => `${x.f.name}${x.f.swaps?.length ? " has a swap" : " has no swap"}`).join("; ")}. Clients who said they don't eat it only see the swap.</p>
        </div>
      {/if}
      <Button variant="outline" size="sm" class="self-start" disabled={!N.allMeals(plan).some((m) => m.foods.length)} onclick={() => (grocery = true)}>Grocery list for a week</Button>
    </aside>
  </div>
</div>

<FoodPickerDialog bind:open={pickerOpen} title={pickTitle} {recipes} {planTags} swapOnly={!!picking?.foodId} onadd={onPicked} />
<MealTimeDialog bind:open={timeOpen} mealName={timing?.name ?? ""} time={timing?.time} restDayClock={plan.restDayClock}
  onsave={(t, rest) => { const id = timing!.id; up(N.updateCoachNutritionPlan(N.mapMeals(plan, ref, (ms) => ms.map((m) => (m.id === id ? { ...m, time: t } : m))), { restDayClock: rest })); }} />
<DayTypeDialog bind:open={addingType} dayTypes={types} onsave={(input) => { const next = N.addDayType(plan, input); up(next); dayId = next.dayTypes!.at(-1)!.id; }} />
<NutrientTargetsDialog bind:open={moreTargets} targets={plan.nutrients ?? []} onchange={(n) => up(N.updateCoachNutritionPlan(plan, { nutrients: n }))} />

<Dialog.Root bind:open={grocery}>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Grocery list for a week</Dialog.Title>
      <Dialog.Description>{mode === "training-rest" ? "With 4 training days; each client's own list follows their program." : mode === "own" ? "Each day type times its weekdays." : "Seven days of this plan."} Recipes are shopped as their ingredients.</Dialog.Description>
    </Dialog.Header>
    <ul class="flex flex-col text-[13px]">
      {#each N.weekGroceryList(plan) as g (g.name + (g.brand ?? ""))}
        <li class="flex justify-between gap-3 border-t border-border py-1.5"><span>{g.name}{#if g.brand}<span class="text-muted-foreground"> · {g.brand}</span>{/if}</span><span class="tabular-nums text-muted-foreground">{g.grams >= 1000 ? `${(g.grams / 1000).toFixed(1)} kg` : `${g.grams} g`}</span></li>
      {/each}
    </ul>
    <Dialog.Footer><Button onclick={() => (grocery = false)}>Done</Button></Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
