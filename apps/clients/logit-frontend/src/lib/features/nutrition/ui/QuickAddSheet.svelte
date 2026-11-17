<script lang="ts">
  import { untrack } from "svelte";
  import { MEAL_SLOTS, kcalFromMacros, type MacroTotals, type MealSlot } from "@logit/core/domain/nutrition";
  import BottomSheet from "./BottomSheet.svelte";
  import { MEAL_LABELS } from "./meals";
  import { chip } from "./style";

  // Calories (and optionally macros) without a food: a restaurant meal, a guess.
  interface Props {
    meal: MealSlot;
    onadd: (r: { name: string; computed: MacroTotals; meal: MealSlot }) => void;
    onclose: () => void;
  }
  const { meal: startMeal, onadd, onclose }: Props = $props();

  let meal = $state<MealSlot>(untrack(() => startMeal));
  const f = $state({ name: "", kcal: "", protein: "", carbs: "", fat: "" });
  const n = (s: string) => Number(s.replace(",", ".")) || 0;
  const kcal = $derived(n(f.kcal) || Math.round(kcalFromMacros(n(f.protein), n(f.carbs), n(f.fat))));

  function add() {
    if (kcal <= 0) return;
    onadd({
      name: f.name.trim() || "Quick add",
      computed: { kcal, proteinG: n(f.protein), carbsG: n(f.carbs), fatG: n(f.fat) },
      meal,
    });
  }
  const inputCls = "h-12 w-full min-w-0 rounded-xl bg-muted px-3 text-[15px] outline-none focus:ring-2 focus:ring-ring";
</script>

<BottomSheet label="Quick add" {onclose}>
  <div class="flex flex-col gap-3 px-4 pt-2">
    <h2 class="text-lg font-bold">Quick add</h2>
    <label class="flex flex-col gap-1.5">
      <span class="text-xs font-medium text-muted-foreground">What was it? <span class="font-normal">(optional)</span></span>
      <input class={inputCls} bind:value={f.name} placeholder="e.g. Burrito from the café" />
    </label>
    <div class="grid grid-cols-4 gap-2">
      {#each [["kcal", "kcal", ""], ["protein", "Protein", "text-macro-protein"], ["carbs", "Carbs", "text-macro-carbs"], ["fat", "Fat", "text-macro-fat"]] as [key, label, color] (key)}
        <label class="flex min-w-0 flex-col gap-1">
          <span class="text-center text-xs font-medium {color || 'text-muted-foreground'}">{label}</span>
          <input class="{inputCls} text-center font-semibold tabular-nums" inputmode="decimal" bind:value={f[key as "kcal" | "protein" | "carbs" | "fat"]} />
        </label>
      {/each}
    </div>
    {#if !f.kcal && kcal > 0}
      <p class="text-xs text-muted-foreground">{kcal} kcal from the macros.</p>
    {/if}
    <div class="grid grid-cols-4 gap-1.5 pt-1" role="group" aria-label="Meal">
      {#each MEAL_SLOTS as m (m)}
        <button type="button" class={chip(m === meal, "px-0")} aria-pressed={m === meal} onclick={() => (meal = m)}>{MEAL_LABELS[m]}</button>
      {/each}
    </div>
  </div>
  {#snippet footer()}
    <button type="button" class="h-13 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50" disabled={kcal <= 0} onclick={add}>
      Add to {MEAL_LABELS[meal]}
    </button>
  {/snippet}
</BottomSheet>
