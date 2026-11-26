<script lang="ts">
  import { untrack, type Snippet } from "svelte";
  import { Minus, Plus, Star, Trash2 } from "lucide-svelte";
  import {
    MEAL_SLOTS,
    roundMacros,
    roundNutrients,
    scaleMacros,
    scaleNutrients,
    type FoodRef,
    type MacroTotals,
    type MealSlot,
    type Nutrients,
  } from "@logit/core/domain/nutrition";
  import FoodNutrients from "./FoodNutrients.svelte";
  import { chip, cn } from "./style";
  import BottomSheet from "./BottomSheet.svelte";
  import { MEAL_LABELS, fmtNum } from "./meals";
  import MealTimeRow from "./MealTimeRow.svelte";
  import {
    defaultPortion,
    fmtAmount,
    portionLabel,
    portionOptions,
    portionToGrams,
    stepFor,
  } from "../portion";

  // How much of a food: a big amount with − / +, the food's servings and units as chips,
  // what it adds, and (when logging) how the day looks afterwards. Used for logging, for
  // editing a diary entry and for recipe ingredients.
  export type AmountResult = {
    grams: number;
    label: string;
    amount: number;
    portionId: string;
    meal: MealSlot | null;
    computed: MacroTotals;
    /** Other nutrients for this amount; undefined when the food has none. */
    nutrients: Nutrients | undefined;
    /** "Time eaten", only when it was changed. */
    loggedAtMs?: number;
  };

  interface Props {
    food: FoodRef;
    subtitle?: string;
    /** False when the food has no real weight (a recipe that was never weighed). */
    rawUnits?: boolean;
    initial?: { amount?: number; portionId?: string; grams?: number };
    /** Eaten so far today (excluding this entry) and the target, for "your day after this". */
    day?: { eaten: MacroTotals; target: MacroTotals | null } | null;
    /** Show meal chips starting on this meal; null hides them (recipe ingredients). */
    meal?: MealSlot | null;
    confirmText?: (meal: MealSlot | null) => string;
    /** Looking a food up: the button first says "Add to diary…" and shows the meal chips
     * (starting on this meal); only the second tap logs. */
    askMeal?: MealSlot | null;
    /** The diary day, for "Time eaten" under the meal chips; none hides it. */
    dateIso?: string;
    /** The entry's time when editing one; null = saved without one. */
    loggedAtMs?: number | null;
    favourite?: { on: boolean; toggle: () => void } | null;
    ondelete?: (() => void) | null;
    extra?: Snippet<[{ grams: number }]>;
    /** Quick picks shown before the units, e.g. "Same as last time · 420 g". */
    presets?: { label: string; amount: number; portionId: string }[];
    onconfirm: (r: AmountResult) => void;
    onclose: () => void;
  }

  const {
    food,
    subtitle,
    rawUnits = true,
    initial,
    day = null,
    meal: initialMeal = null,
    confirmText = (m) => (m ? `Add to ${MEAL_LABELS[m]}` : "Add"),
    askMeal = null,
    dateIso,
    loggedAtMs,
    favourite = null,
    ondelete = null,
    extra,
    presets = [],
    onconfirm,
    onclose,
  }: Props = $props();

  // The sheet opens fresh for each food, so starting values are read once.
  const start = untrack(() => defaultPortion(food, initial, { rawUnits }));
  let amountText = $state(fmtAmount(start.amount));
  let portionId = $state(start.portionId);
  let meal = $state<MealSlot | null>(untrack(() => initialMeal));
  let showMore = $state(false);
  let pickedAt = $state<number | undefined>();

  const options = $derived(portionOptions(food.servings, { rawUnits }));
  const visible = $derived(options.filter((o) => !o.more || showMore || o.id === portionId));
  const hasMore = $derived(options.some((o) => o.more));
  const active = $derived(options.find((o) => o.id === portionId) ?? options[0]);
  const amount = $derived(Math.max(0, Number(amountText.replace(",", ".")) || 0));
  const grams = $derived(portionToGrams(amount, active));
  const adds = $derived(roundMacros(scaleMacros(food.per100g, grams)));
  const addsNutrients = $derived(roundNutrients(scaleNutrients(food.nutrients, grams)));

  const unitHint = $derived.by(() => {
    if (!active) return "";
    if (active.grams === null) {
      return active.id === "g" ? "grams" : `${active.id} · ${fmtNum(grams)} g`;
    }
    const name = active.label.replace(/\s*\([^)]*\)\s*$/, "");
    return `${name} · ${fmtNum(grams)} g`;
  });

  function setAmount(n: number) {
    amountText = fmtAmount(Math.max(0, Math.round(n * 100) / 100));
  }

  function step(dir: 1 | -1) {
    const s = stepFor(active, amount);
    // Snap to the step grid first, so 137 g + 10 goes to 140, not 147.
    const snapped = dir > 0 ? Math.floor(amount / s + 1e-9) * s + s : Math.ceil(amount / s - 1e-9) * s - s;
    setAmount(Math.max(s, snapped));
  }

  function pick(id: string) {
    if (id === portionId) return;
    const o = options.find((x) => x.id === id);
    portionId = id;
    if (!o) return;
    if (o.grams !== null) setAmount(1);
    else if (o.id === "g" || o.id === "ml") setAmount(grams > 0 ? Math.round(grams) : 100);
    else setAmount(1);
  }

  function confirm() {
    if (grams <= 0) return;
    if (askMeal && !meal) {
      meal = askMeal;
      return;
    }
    onconfirm({
      grams,
      label: portionLabel(amount, active, grams),
      amount,
      portionId,
      meal,
      computed: adds,
      nutrients: addsNutrients,
      ...(pickedAt !== undefined ? { loggedAtMs: pickedAt } : {}),
    });
  }

  // "Your day after this"
  const target = $derived(day?.target ?? null);
  const kcalAfter = $derived(day ? day.eaten.kcal + adds.kcal : 0);
  const protAfter = $derived(day ? day.eaten.proteinG + adds.proteinG : 0);
  function pct(n: number, of: number): number {
    return of > 0 ? Math.max(0, Math.min(100, (n / of) * 100)) : 0;
  }
</script>

<BottomSheet label={food.name} {onclose}>
  <div class="flex items-start gap-1 pl-5 pr-2 pt-1">
    <div class="min-w-0 flex-1 pt-1.5">
      <h2 class="text-lg font-bold leading-snug">{food.name}</h2>
      {#if subtitle || food.brand}
        <p class="text-xs text-muted-foreground">{subtitle ?? food.brand}</p>
      {/if}
    </div>
    {#if favourite}
      <button
        type="button"
        class="flex size-11 shrink-0 items-center justify-center rounded-lg"
        aria-label={favourite.on ? "Remove from favourites" : "Add to favourites"}
        aria-pressed={favourite.on}
        onclick={favourite.toggle}
      >
        <Star class={cn("size-5", favourite.on ? "fill-highlight-fill text-highlight-fill" : "text-muted-foreground")} />
      </button>
    {/if}
    {#if ondelete}
      <button
        type="button"
        class="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"
        aria-label="Remove"
        onclick={ondelete}
      >
        <Trash2 class="size-5" />
      </button>
    {/if}
  </div>

  <!-- Amount -->
  <div class="flex items-center justify-center gap-5 px-5 pt-4">
    <button
      type="button"
      class="flex size-13 shrink-0 items-center justify-center rounded-full bg-muted active:scale-95"
      aria-label="Less"
      onclick={() => step(-1)}
    >
      <Minus class="size-5" />
    </button>
    <label class="flex min-w-0 flex-col items-center">
      <span class="sr-only">Amount</span>
      <input
        class="w-40 bg-transparent text-center text-[44px] font-bold leading-none tracking-tight tabular-nums outline-none"
        inputmode="decimal"
        enterkeyhint="done"
        bind:value={amountText}
        onfocus={(e) => e.currentTarget.select()}
        onkeydown={(e) => e.key === "Enter" && confirm()}
        data-testid="amount-input"
      />
      <span class="mt-1 text-[13px] text-muted-foreground tabular-nums">{unitHint}</span>
    </label>
    <button
      type="button"
      class="flex size-13 shrink-0 items-center justify-center rounded-full bg-muted active:scale-95"
      aria-label="More"
      onclick={() => step(1)}
    >
      <Plus class="size-5" />
    </button>
  </div>

  <div class="flex flex-wrap justify-center gap-1.5 px-4 pt-3" role="group" aria-label="Unit">
    {#each presets as p (p.label)}
      <button
        type="button"
        class={chip(false)}
        onclick={() => {
          portionId = p.portionId;
          setAmount(p.amount);
        }}>{p.label}</button
      >
    {/each}
    {#each visible as o (o.id)}
      <button type="button" class={chip(o.id === portionId)} aria-pressed={o.id === portionId} onclick={() => pick(o.id)}>
        {o.label}
      </button>
    {/each}
    {#if hasMore && !showMore}
      <button type="button" class={chip(false, "border-dashed")} onclick={() => (showMore = true)}>More units</button>
    {/if}
  </div>

  <!-- What it adds -->
  <div class="mx-4 mt-4 rounded-2xl bg-muted/60 px-4 py-3.5 dark:bg-background">
    <div class="grid grid-cols-4 gap-2 text-center">
      <div>
        <div class="text-xl font-bold tabular-nums" data-testid="adds-kcal">{fmtNum(adds.kcal)}</div>
        <div class="text-[11px] text-muted-foreground">kcal</div>
      </div>
      <div>
        <div class="text-xl font-bold tabular-nums text-macro-protein">{Math.round(adds.proteinG)}</div>
        <div class="text-[11px] text-muted-foreground">protein g</div>
      </div>
      <div>
        <div class="text-xl font-bold tabular-nums text-macro-carbs">{Math.round(adds.carbsG)}</div>
        <div class="text-[11px] text-muted-foreground">carbs g</div>
      </div>
      <div>
        <div class="text-xl font-bold tabular-nums text-macro-fat">{Math.round(adds.fatG)}</div>
        <div class="text-[11px] text-muted-foreground">fat g</div>
      </div>
    </div>
    <FoodNutrients part="label" nutrients={addsNutrients} />

    {#if day && target}
      {@const left = target.kcal - kcalAfter}
      {@const pLeft = target.proteinG - protAfter}
      <div class="my-3 h-px bg-border"></div>
      <p class="mb-2 text-xs font-semibold">Your day after this</p>
      <div class="flex justify-between text-xs">
        <span class="text-muted-foreground">Calories</span>
        <span class="tabular-nums">{left >= 0 ? `${fmtNum(left)} kcal left` : `${fmtNum(-left)} kcal over`}</span>
      </div>
      <div class="mt-1.5 flex h-2 overflow-hidden rounded-full bg-muted">
        <div class="h-full bg-foreground" style="width: {pct(day.eaten.kcal, target.kcal)}%"></div>
        <div class="h-full bg-foreground/45" style="width: {Math.min(pct(adds.kcal, target.kcal), 100 - pct(day.eaten.kcal, target.kcal))}%"></div>
      </div>
      <div class="mt-2.5 flex justify-between text-xs">
        <span class="text-muted-foreground">Protein</span>
        <span class="tabular-nums">{pLeft > 0 ? `${Math.round(pLeft)} g to go` : "Target hit"}</span>
      </div>
      <div class="mt-1.5 flex h-2 overflow-hidden rounded-full bg-muted">
        <div class="h-full bg-macro-protein" style="width: {pct(day.eaten.proteinG, target.proteinG)}%"></div>
        <div class="h-full bg-macro-protein/45" style="width: {Math.min(pct(adds.proteinG, target.proteinG), 100 - pct(day.eaten.proteinG, target.proteinG))}%"></div>
      </div>
    {/if}

    {#if extra}
      <div class="my-3 h-px bg-border"></div>
      {@render extra({ grams })}
    {/if}
  </div>

  <FoodNutrients part="micros" nutrients={addsNutrients} packaged={food.source === "off"} />

  {#if meal}
    <div class="grid grid-cols-4 gap-1.5 px-4 pt-3.5" role="group" aria-label="Meal">
      {#each MEAL_SLOTS as m (m)}
        <button type="button" class={chip(m === meal, "px-0")} aria-pressed={m === meal} onclick={() => (meal = m)}>
          {MEAL_LABELS[m]}
        </button>
      {/each}
    </div>
    {#if dateIso}
      <MealTimeRow class="px-4 pt-3" {dateIso} startMs={loggedAtMs} onchange={(ms) => (pickedAt = ms)} />
    {/if}
  {/if}

  {#snippet footer()}
    <button
      type="button"
      class="h-13 w-full rounded-xl text-base font-semibold disabled:opacity-50 {askMeal && !meal ? 'bg-muted text-foreground' : 'bg-primary text-primary-foreground'}"
      disabled={grams <= 0}
      onclick={confirm}
    >
      {askMeal && !meal ? "Add to diary…" : confirmText(meal)}
    </button>
  {/snippet}
</BottomSheet>
